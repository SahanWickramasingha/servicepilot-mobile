import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createPhotoHandler, cleanupExpired, removeUnreferenced } from "../src/index";
import { PhotoError, objectKey, type Data, type Env, type Identity, type PhotoRecord, type Store } from "../src/types";

// Host stream adapter only. A separate workerd test exercises FixedLengthStream.
(globalThis as any).FixedLengthStream = class extends TransformStream { constructor(_size: number) { super(); } };
(globalThis.crypto as any).DigestStream = class extends WritableStream {
  digest: Promise<ArrayBuffer>;
  constructor() {
    const hash = sha256.create(); let resolve: (value: ArrayBuffer) => void, reject: (cause: unknown) => void;
    const result = new Promise<ArrayBuffer>((yes, no) => { resolve = yes; reject = no; });
    super({ write(chunk) { hash.update(chunk); }, close() { resolve(hash.digest().buffer as ArrayBuffer); }, abort(cause) { reject(cause); } }); this.digest = result;
  }
};
const requestId = "abcdefghijklmnopqrst", attemptId = "ABCDEFGHIJKLMNOPQRST";
const jpeg = new Uint8Array([255, 216, 255, 0]);
class MemoryStore implements Store {
  rows = new Map<string, Data>(); failConfirmation = false; beforeAtomic?: () => void;
  async get(path: string) { return this.rows.has(path) ? structuredClone(this.rows.get(path)!) : null; }
  async atomic<T>(paths: string[], change: (rows: Map<string, Data | null>) => { writes: Record<string, Data>; result: T }) {
    this.beforeAtomic?.(); this.beforeAtomic = undefined;
    const rows = new Map(paths.map((path) => [path, structuredClone(this.rows.get(path) ?? null)]));
    const result = change(rows);
    if (this.failConfirmation && Object.values(result.writes).some((value) => value.state === "confirmed")) { this.failConfirmation = false; throw new PhotoError(503, "temporarily-unavailable"); }
    for (const [path, value] of Object.entries(result.writes)) this.rows.set(path, structuredClone(value));
    return result.result;
  }
}
class MemoryBucket {
  objects = new Map<string, any>(); deletes: string[] = [];
  async head(key: string) { const object = this.objects.get(key); return object ? { ...object, key } : null; }
  async put(key: string, stream: any, options: any = {}) {
    const bytes = typeof stream === "string" ? new TextEncoder().encode(stream) : new Uint8Array(await new Response(stream).arrayBuffer());
    if (options.onlyIf && this.objects.has(key)) return null;
    this.objects.set(key, { size: bytes.length, bytes, httpMetadata: options.httpMetadata, customMetadata: options.customMetadata }); return this.head(key);
  }
  async get(key: string) { const object = await this.head(key); return object ? { ...object, body: new Response(object.bytes).body, text: async () => new TextDecoder().decode(object.bytes) } : null; }
  async delete(key: string) { this.deletes.push(key); this.objects.delete(key); }
  async list({ prefix, limit }: any) { return { objects: [...this.objects.keys()].filter((key) => key.startsWith(prefix)).slice(0, limit).map((key) => ({ key })), truncated: false }; }
}
function fixture() {
  const store = new MemoryStore(), bucket = new MemoryBucket(); let currentUser = "owner", authAvailable = true, rate = true;
  store.rows.set("users/owner", { role: "customer", accountStatus: "active" });
  store.rows.set("users/other", { role: "customer", accountStatus: "active" });
  store.rows.set("users/tech", { role: "technician", accountStatus: "active", technicianApprovalStatus: "approved" });
  store.rows.set("users/foreign-tech", { role: "technician", accountStatus: "active", technicianApprovalStatus: "approved" });
  store.rows.set("users/admin", { role: "super_admin", accountStatus: "active" });
  const identity = (): Identity => ({ uid: currentUser, authTime: 1000, verified: true, token: "test-only" });
  const env = { PHOTOS: bucket, PHOTO_RATE_LIMITER: { limit: async () => ({ success: rate }) }, FIREBASE_PROJECT_ID: "demo-servicepilot", ALLOWED_ORIGINS: "https://app.example.test" } as unknown as Env;
  const handle = createPhotoHandler({ store: () => store, authenticate: async () => { if (!authAvailable) throw new PhotoError(401, "invalid-session"); return identity(); } });
  const call = (path: string, method = "GET", body?: any, headers: any = {}) => handle(new Request("https://photos.example.test/v1/photos" + path,
    { method, ...(body === undefined ? {} : { body: body instanceof Uint8Array || body instanceof ReadableStream ? body : JSON.stringify(body), duplex: "half" }), headers } as any), env);
  const reserve = async (purpose = "request", slot = 0, bytes = jpeg, overrides = {}) => {
    const response = await call("", "POST", { requestId, purpose, attemptId: purpose === "request" ? requestId : attemptId, slot, size: bytes.length, contentType: "image/jpeg", sha256: bytesToHex(sha256(bytes)), ...overrides });
    return { response, body: await response.json() as any };
  };
  const upload = async (id: string, bytes = jpeg, headers: any = {}) => call("/" + id, "PUT", bytes, { "Content-Type": "image/jpeg", ...headers });
  const booking = (status = "in_progress") => store.rows.set(`service_requests/${requestId}`, { customerId: "owner", technicianId: "tech", status, imageUrls: [] });
  return { store, bucket, env, call, reserve, upload, booking, identity, user: (uid: string) => { currentUser = uid; }, auth: (value: boolean) => { authAvailable = value; }, rate: (value: boolean) => { rate = value; } };
}
test("one/two customer photos have server-generated stable IDs, confirmed metadata and private authenticated reads", async () => {
  const f = fixture(); const refs: string[] = [];
  for (const slot of [0, 1]) {
    const first = await f.reserve("request", slot), retry = await f.reserve("request", slot);
    assert.equal(first.response.status, 200); assert.equal(first.body.id, retry.body.id); assert.match(first.body.reference, /^r2:v1:[a-f0-9]{64}$/);
    assert.equal((await f.upload(first.body.id)).status, 200); assert.equal((await f.upload(first.body.id)).status, 200);
    assert.equal(f.store.rows.get(`photo_objects/${first.body.id}`)?.state, "confirmed"); refs.push(first.body.reference);
    const view = await f.call("/" + first.body.id); assert.equal(view.status, 200); assert.equal(view.headers.get("Cache-Control"), "private, no-store"); assert.deepEqual(new Uint8Array(await view.arrayBuffer()), jpeg);
  }
  assert.equal(f.bucket.objects.size, 2); f.booking(); f.store.rows.get(`service_requests/${requestId}`)!.imageUrls = refs;
  f.user("tech"); assert.equal((await f.call("/" + refs[0].slice(6))).status, 200);
  for (const uid of ["other", "foreign-tech", "admin"]) { f.user(uid); assert.equal((await f.call("/" + refs[0].slice(6))).status, 403); }
});
test("third customer image, equal/oversized byte limits, invalid purposes and forged metadata fields reject", async () => {
  const f = fixture();
  assert.equal((await f.reserve("request", 2)).response.status, 400);
  assert.equal((await f.reserve("request", 0, jpeg, { attemptId })).response.status, 400);
  for (const size of [2_000_000, 2_000_001]) assert.equal((await f.reserve("request", 0, jpeg, { size })).response.status, 413);
  assert.equal((await f.reserve("request", 0, jpeg, { ownerId: "other" })).response.status, 400);
  assert.equal((await f.reserve("signature")).response.status, 400);
  assert.equal((await f.reserve("request", 0, jpeg, { contentType: "text/html" })).response.status, 415);
});
test("actual streaming limits and signatures hold with missing or forged Content-Length", async () => {
  for (const header of [{}, { "Content-Length": "4" }]) {
    const f = fixture(), reserved = await f.reserve();
    assert.equal((await f.upload(reserved.body.id, new Uint8Array(2_000_001), header)).status, 413);
    assert.equal(f.bucket.objects.size, 0); assert.equal(f.store.rows.get(`photo_objects/${reserved.body.id}`)?.state, "pending");
  }
  const f = fixture(), reserved = await f.reserve();
  assert.equal((await f.upload(reserved.body.id, new Uint8Array([60, 115, 118, 103]))).status, 415); assert.equal(f.bucket.objects.size, 0);
  assert.equal((await f.upload(reserved.body.id, jpeg, { "Content-Length": "3" })).status, 400);
});
test("interrupted streams and a hash mismatch never confirm a partially uploaded object", async () => {
  const f = fixture(), reserved = await f.reserve();
  const broken = new ReadableStream({ start(controller) { controller.enqueue(jpeg.subarray(0, 3)); controller.error(Error("interrupted")); } });
  assert.equal((await f.call("/" + reserved.body.id, "PUT", broken, { "Content-Type": "image/jpeg" })).status, 503);
  assert.equal(f.bucket.objects.size, 0);
  assert.equal((await f.upload(reserved.body.id, new Uint8Array([255, 216, 255, 1]))).status, 400);
  assert.equal(f.store.rows.get(`photo_objects/${reserved.body.id}`)?.state, "pending");
});
test("object success with metadata failure and lost finalize response reconcile without duplicate objects", async () => {
  const f = fixture(), reserved = await f.reserve(); f.store.failConfirmation = true;
  assert.equal((await f.upload(reserved.body.id)).status, 503); assert.equal(f.bucket.objects.size, 1);
  assert.equal(f.store.rows.get(`photo_objects/${reserved.body.id}`)?.state, "pending");
  assert.equal((await f.call("/" + reserved.body.id + "/finalize", "POST")).status, 200);
  assert.equal((await f.call("/" + reserved.body.id + "/finalize", "POST")).status, 200);
  assert.equal((await f.upload(reserved.body.id)).status, 200); assert.equal(f.bucket.objects.size, 1);
});
test("technician stages preserve three-photo limit and completed historical reads while blocking mutations", async () => {
  const f = fixture(); f.booking(); f.user("tech"); const evidence: any = { beforePhotos: [], afterPhotos: [] };
  for (const stage of ["before", "after"]) for (const slot of [0, 1, 2]) {
    const reserved = await f.reserve(stage, slot); assert.equal(reserved.response.status, 200);
    assert.equal((await f.upload(reserved.body.id)).status, 200); evidence[stage === "before" ? "beforePhotos" : "afterPhotos"].push(reserved.body.reference);
  }
  assert.equal((await f.reserve("before", 3)).response.status, 400);
  f.store.rows.set(`job_evidence/${requestId}`, evidence); f.store.rows.get(`service_requests/${requestId}`)!.status = "completed";
  const id = evidence.beforePhotos[0].slice(6);
  for (const uid of ["owner", "tech", "admin"]) { f.user(uid); assert.equal((await f.call("/" + id)).status, 200); }
  f.user("tech"); assert.equal((await f.call("/" + id + "/finalize", "POST")).status, 403); assert.equal((await f.call("/" + id, "DELETE")).status, 403);
  assert.equal((await f.upload(id)).status, 403); assert.equal(f.bucket.objects.size, 6);
});
test("unassigned, revoked approval, disabled/deleted/lifecycle and revoked sessions fail closed", async () => {
  for (const patch of [{ accountStatus: "disabled" }, { accountStatus: "deleted" }, { lifecyclePending: true }, { sessionRevokedAt: 1000 }]) {
    const f = fixture(); Object.assign(f.store.rows.get("users/owner")!, patch); assert.equal((await f.reserve()).response.status, 403);
  }
  const f = fixture(); f.booking(); f.user("foreign-tech"); assert.equal((await f.reserve("before")).response.status, 403);
  f.user("tech"); f.store.rows.get("users/tech")!.technicianApprovalStatus = "pending"; assert.equal((await f.reserve("after")).response.status, 403);
  f.user("owner"); assert.equal((await f.reserve("before")).response.status, 403);
  f.auth(false); assert.equal((await f.reserve()).response.status, 401);
});
test("authorization is rechecked after streaming and on every view/finalize/delete", async () => {
  const f = fixture(), reserved = await f.reserve();
  const originalPut = f.bucket.put.bind(f.bucket);
  f.bucket.put = async (...args: any[]) => { const result = await originalPut(args[0], args[1], args[2]); f.store.rows.get("users/owner")!.accountStatus = "disabled"; return result; };
  assert.equal((await f.upload(reserved.body.id)).status, 403);
  assert.equal(f.store.rows.get(`photo_objects/${reserved.body.id}`)?.state, "pending");
  for (const method of ["GET", "DELETE"]) assert.equal((await f.call("/" + reserved.body.id, method)).status, 403);
});
test("safe expiry cleanup preserves referenced/complete evidence and tombstones unreferenced uploads", async () => {
  const f = fixture(), reserved = await f.reserve(); await f.upload(reserved.body.id);
  const meta = f.store.rows.get(`photo_objects/${reserved.body.id}`) as PhotoRecord; meta.expiresAt = new Date(0);
  await cleanupExpired(f.env, f.store); assert.equal(f.store.rows.get(`photo_objects/${meta.id}`)?.state, "deleted"); assert.ok(!f.bucket.objects.has(objectKey(meta)));
  const g = fixture(), pending = await g.reserve(); await g.upload(pending.body.id);
  const saved = g.store.rows.get(`photo_objects/${pending.body.id}`) as PhotoRecord; saved.expiresAt = new Date(0);
  g.store.beforeAtomic = () => { g.booking("completed"); g.store.rows.get(`service_requests/${requestId}`)!.imageUrls = [pending.body.reference]; };
  assert.equal(await removeUnreferenced(g.store, g.env, saved), false); assert.equal(g.bucket.deletes.length, 0);
});
test("rate limits, CORS, query-token/arbitrary-key requests and unavailable authoritative state deny", async () => {
  const f = fixture(); f.rate(false); assert.equal((await f.reserve()).response.status, 429);
  assert.equal((await f.call("", "OPTIONS", undefined, { Origin: "https://evil.example.test" })).status, 403);
  assert.equal((await f.call("?token=forbidden")).status, 400); f.rate(true);
  assert.equal((await f.call("/arbitrary-private-object")).status, 404);
  f.store.get = async () => { throw Error("offline"); }; assert.equal((await f.reserve()).response.status, 503);
});
test("expired reservations with no object are tombstoned using a bounded metadata page", async () => {
  const f = fixture(), reserved = await f.reserve();
  const meta = f.store.rows.get(`photo_objects/${reserved.body.id}`) as PhotoRecord; meta.expiresAt = new Date(0);
  f.store.expired = async () => ({ records: [meta] });
  await cleanupExpired(f.env, f.store);
  assert.equal(f.store.rows.get(`photo_objects/${meta.id}`)?.state, "deleted"); assert.equal(f.bucket.objects.has(objectKey(meta)), false);
});
test("explicit unreferenced deletion safely replays after a lost response without deleting referenced files", async () => {
  const f = fixture(), reserved = await f.reserve(); await f.upload(reserved.body.id);
  assert.equal((await f.call("/" + reserved.body.id, "DELETE")).status, 200);
  assert.equal((await f.call("/" + reserved.body.id, "DELETE")).status, 200);
  assert.equal(f.bucket.deletes.length, 1);
});
test("upload pause preserves authenticated viewing and reconciliation of already stored photos", async () => {
  const f = fixture(), reserved = await f.reserve(); await f.upload(reserved.body.id); f.env.PHOTO_UPLOADS_ENABLED = "false";
  assert.equal((await f.reserve()).response.status, 503); assert.equal((await f.upload(reserved.body.id)).status, 503);
  assert.equal((await f.call("/" + reserved.body.id)).status, 200);
  assert.equal((await f.call("/" + reserved.body.id + "/finalize", "POST")).status, 200);
});
test("authorized new request/before/after photos occupy separate prefixes without exposing keys", async () => {
  const f = fixture();
  for (const [purpose, prefix] of [["request", "customer-requests"], ["before", "technician-before"], ["after", "technician-after"]]) {
    if (purpose !== "request") { f.booking(); f.user("tech"); }
    const reserved = await f.reserve(purpose), meta = f.store.rows.get(`photo_objects/${reserved.body.id}`) as PhotoRecord;
    assert.equal(reserved.response.status, 200); assert.equal(meta.objectKeyVersion, 2);
    assert.equal(reserved.body.reference, `r2:v1:${meta.id}`);
    assert.equal(reserved.body.objectKeyVersion, undefined); assert.equal(reserved.body.key, undefined);
    assert.equal((await f.upload(meta.id)).status, 200);
    assert.equal(objectKey(meta), `photos/v1/${prefix}/${meta.id}`);
    assert.ok(f.bucket.objects.has(`photos/v1/${prefix}/${meta.id}`));
    assert.equal(f.bucket.objects.has(`photos/v1/${meta.id}`), false);
  }
  assert.equal(f.bucket.objects.size, 3);
});
test("legacy shared-prefix records preserve references across retry, finalize, viewing and cleanup", async () => {
  const f = fixture(), reserved = await f.reserve();
  const meta = f.store.rows.get(`photo_objects/${reserved.body.id}`) as PhotoRecord;
  delete meta.objectKeyVersion; // Metadata written by the original Worker.
  f.store.failConfirmation = true;
  assert.equal((await f.upload(meta.id)).status, 503);
  assert.ok(f.bucket.objects.has(`photos/v1/${meta.id}`));
  assert.equal((await f.reserve()).body.reference, reserved.body.reference);
  assert.equal(meta.objectKeyVersion, undefined);
  assert.equal((await f.call("/" + meta.id + "/finalize", "POST")).status, 200);
  assert.equal((await f.upload(meta.id)).status, 200); assert.equal(f.bucket.objects.size, 1);
  assert.equal((await f.call("/" + meta.id)).status, 200);
  const saved = f.store.rows.get(`photo_objects/${meta.id}`) as PhotoRecord;
  assert.equal(saved.objectKeyVersion, undefined); saved.expiresAt = new Date(0);
  f.booking(); f.store.rows.get(`service_requests/${requestId}`)!.imageUrls = [reserved.body.reference];
  f.user("tech"); assert.equal((await f.call("/" + meta.id)).status, 200);
  await cleanupExpired(f.env, f.store); assert.equal(f.bucket.deletes.length, 0);
  const g = fixture(), pending = await g.reserve();
  delete g.store.rows.get(`photo_objects/${pending.body.id}`)!.objectKeyVersion;
  assert.equal((await g.upload(pending.body.id)).status, 200);
  assert.equal((await g.call("/" + pending.body.id, "DELETE")).status, 200);
  assert.deepEqual(g.bucket.deletes, [`photos/v1/${pending.body.id}`]);
});
test("key layout is server-owned and no reservation is persisted after authorization changes", async () => {
  const f = fixture();
  f.store.beforeAtomic = () => { f.store.rows.get("users/owner")!.accountStatus = "disabled"; };
  assert.equal((await f.reserve()).response.status, 403);
  f.store.rows.get("users/owner")!.accountStatus = "active";
  assert.equal((await f.reserve("request", 0, jpeg, { objectKeyVersion: 2 })).response.status, 400);
  assert.equal((await f.reserve("request", 0, jpeg, { key: "photos/v1/technician-before/forged" })).response.status, 400);
  assert.equal([...f.store.rows.keys()].some((path) => path.startsWith("photo_objects/")), false);
  assert.equal(f.bucket.objects.size, 0);
});
