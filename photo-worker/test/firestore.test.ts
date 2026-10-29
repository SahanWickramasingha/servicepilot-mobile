import assert from "node:assert/strict";
import { test } from "node:test";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { firestoreStore } from "../src/firestore";
const pair = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(pair.privateKey), id = "a".repeat(64);
function fixture(t: any, { conflict = false } = {}) {
  const calls: { url: string; method: string; token: string | null; body: any }[] = [];
  const env = { FIREBASE_PROJECT_ID: "demo-servicepilot", FIREBASE_SERVICE_ACCOUNT_EMAIL: `test-${Math.random()}@demo.invalid`, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey } as any;
  t.mock.method(globalThis, "fetch", async (url: any, options: any = {}) => {
    const value = String(url), headers = new Headers(options.headers);
    calls.push({ url: value, method: options.method, token: headers.get("Authorization"), body: options.body });
    if (value === "https://oauth2.googleapis.com/token") {
      const form = new URLSearchParams(options.body);
      const { payload } = await jwtVerify(form.get("assertion")!, pair.publicKey, { algorithms: ["RS256"], audience: value, issuer: env.FIREBASE_SERVICE_ACCOUNT_EMAIL });
      assert.equal(payload.scope, "https://www.googleapis.com/auth/datastore");
      return Response.json({ access_token: "local-oauth-token", expires_in: 3600 });
    }
    assert.ok(value.startsWith("https://firestore.googleapis.com/v1/projects/demo-servicepilot/"));
    if (value.endsWith(":beginTransaction")) return Response.json({ transaction: "bG9jYWw=" });
    if (value.endsWith(":batchGet")) return Response.json([{ found: { name: `projects/demo-servicepilot/databases/(default)/documents/photo_objects/${id}`,
      fields: { id: { stringValue: id }, size: { integerValue: "4" }, expiresAt: { timestampValue: "2099-01-01T00:00:00Z" } } } }]);
    if (value.endsWith(":rollback")) return Response.json({});
    if (value.endsWith(":commit")) {
      if (conflict) { conflict = false; return Response.json({ error: { code: 409 } }, { status: 409 }); }
      return Response.json({});
    }
    if (value.endsWith(":runQuery")) return Response.json([]);
    return Response.json({ fields: { role: { stringValue: "customer" } } });
  });
  return { calls, store: firestoreStore(env) };
}
test("caller reads use Firebase token and trusted commits use cached scoped OAuth; aborted commits retry boundedly", async (t) => {
  const f = fixture(t, { conflict: true });
  assert.equal((await f.store.get("users/owner", "caller-id-token"))!.role, "customer");
  assert.equal(f.calls[0].token, "Bearer caller-id-token");
  const result = await f.store.atomic([`photo_objects/${id}`], (rows) => {
    const data = rows.get(`photo_objects/${id}`)!; assert.equal(data.size, 4); assert.ok(data.expiresAt instanceof Date);
    return { writes: { [`photo_objects/${id}`]: { ...data, state: "confirmed" } }, result: "saved" };
  });
  assert.equal(result, "saved"); assert.equal(f.calls.filter((c) => c.url.endsWith(":commit")).length, 2);
  assert.equal(f.calls.filter((c) => c.url === "https://oauth2.googleapis.com/token").length, 1);
  for (const call of f.calls.filter((c) => c.url.endsWith(":commit"))) {
    const body = JSON.parse(call.body); assert.equal(body.writes[0].update.fields.state.stringValue, "confirmed"); assert.equal(call.token, "Bearer local-oauth-token");
  }
});
test("trusted metadata adapter rejects arbitrary collection writes and bounds expiry queries", async (t) => {
  const f = fixture(t);
  await assert.rejects(f.store.atomic([`photo_objects/${id}`], () => ({ writes: { "users/owner": { role: "super_admin" } }, result: true })), (e: any) => e.code === "invalid-server-write");
  assert.equal(f.calls.filter((c) => c.url.endsWith(":commit")).length, 0);
  await f.store.expired!({ time: "2026-01-01T00:00:00Z", id });
  const query = JSON.parse(f.calls.find((c) => c.url.endsWith(":runQuery"))!.body).structuredQuery;
  assert.equal(query.limit, 3); assert.equal(query.from[0].collectionId, "photo_objects");
  assert.equal(query.where.fieldFilter.field.fieldPath, "expiresAt"); assert.equal(query.startAt.before, false);
});
