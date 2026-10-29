import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { authenticate } from "./auth";
import { firestoreStore } from "./firestore";
import { active, authorizeView, authorizeWrite, referenced, writable } from "./policy";
import { boundedPut } from "./stream";
import { check, objectKey, photoPath, PhotoError, reference, type Data, type Env, type Identity, type PhotoRecord, type Store } from "./types";

const digest = (text: string) => bytesToHex(sha256(new TextEncoder().encode(text)));
const jobPath = (id: string) => `service_requests/${id}`;
const evidencePath = (id: string) => `job_evidence/${id}`;
const rowPaths = (meta: PhotoRecord) => [photoPath(meta.id), jobPath(meta.requestId), evidencePath(meta.requestId), `users/${meta.ownerId}`];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
const publicRecord = (meta: PhotoRecord) => ({ id: meta.id, reference: reference(meta.id), state: meta.state, expiresAt: meta.expiresAt.toISOString() });
async function smallJSON(request: Request) {
  check(request.body, 400, "invalid-input");
  const reader = request.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  const timeout = setTimeout(() => { void reader.cancel().catch(() => {}); }, 10_000);
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; check(size <= 2048, 413, "invalid-input"); parts.push(part.value); } }
  finally { clearTimeout(timeout); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try { const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; } return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new PhotoError(400, "invalid-input"); }
}
function reservation(input: Data, actor: Identity, ttl: number): PhotoRecord {
  check(input && Object.keys(input).sort().join(",") === "attemptId,contentType,purpose,requestId,sha256,size,slot", 400, "invalid-input");
  check(["request", "before", "after"].includes(input.purpose) && typeof input.requestId === "string" &&
    (input.purpose === "request" ? /^[A-Za-z0-9]{20}$/ : /^[A-Za-z0-9_-]{1,128}$/).test(input.requestId) &&
    typeof input.attemptId === "string" && /^[A-Za-z0-9]{20}$/.test(input.attemptId) && Number.isInteger(input.slot) && input.slot >= 0 && input.slot < (input.purpose === "request" ? 2 : 3), 400, "invalid-input");
  check(input.purpose !== "request" || input.attemptId === input.requestId, 400, "invalid-input");
  check(Number.isInteger(input.size) && input.size > 0 && (input.purpose === "request" ? input.size < 2_000_000 : input.size <= 5 * 1024 * 1024), 413, "image-too-large");
  check((input.purpose === "request" ? ["image/jpeg", "image/png", "image/webp"] : ["image/jpeg"]).includes(input.contentType) && typeof input.sha256 === "string" && /^[a-f0-9]{64}$/.test(input.sha256), 415, "unsupported-image");
  // Generated exclusively server-side, deterministic for one actor/attempt/slot.
  const id = digest(JSON.stringify([actor.uid, input.requestId, input.purpose, input.attemptId, input.slot]));
  return { ...input, id, ownerId: actor.uid, provider: "r2", state: "pending", createdAt: new Date(), expiresAt: new Date(Date.now() + ttl * 1000) } as PhotoRecord;
}
async function getRecord(store: Store, id: string) {
  const meta = await store.get(photoPath(id)) as PhotoRecord | null;
  check(meta && meta.provider === "r2" && meta.id === id, 404, "photo-not-found"); return meta;
}
async function confirmHead(env: Env, meta: PhotoRecord) {
  const object = await env.PHOTOS.head(objectKey(meta));
  check(object && object.size === meta.size && object.httpMetadata?.contentType === meta.contentType &&
    object.customMetadata?.photoId === meta.id && object.customMetadata?.sha256 === meta.sha256, 409, "upload-unconfirmed");
}
async function finalize(store: Store, env: Env, actor: Identity, meta: PhotoRecord) {
  await authorizeWrite(store, actor, meta.requestId, meta.purpose); await confirmHead(env, meta);
  return store.atomic(rowPaths(meta), (rows) => {
    const saved = rows.get(photoPath(meta.id)) as PhotoRecord;
    const profile = active(rows.get(`users/${actor.uid}`) ?? null, actor);
    writable(profile, actor, rows.get(jobPath(meta.requestId)) ?? null, meta.purpose);
    check(saved && saved.ownerId === actor.uid && ["pending", "confirmed"].includes(saved.state) && saved.expiresAt > new Date(), 409, "upload-unconfirmed");
    const next = { ...saved, state: "confirmed" as const };
    return { writes: { [photoPath(meta.id)]: next }, result: next };
  });
}
/** Transactional tombstoning serializes cleanup with booking/evidence writes.
 * Rules require a confirmed record; once deleting, new references are rejected.
 * A concurrent reference changes a transaction-read document, forcing a retry. */
export async function removeUnreferenced(store: Store, env: Env, meta: PhotoRecord, actor?: Identity) {
  if (actor) { check(actor.uid === meta.ownerId); await authorizeWrite(store, actor, meta.requestId, meta.purpose); }
  const allowed = await store.atomic<boolean | "deleted">(rowPaths(meta), (rows) => {
    const saved = rows.get(photoPath(meta.id)) as PhotoRecord | null;
    const job = rows.get(jobPath(meta.requestId)) ?? null, evidence = rows.get(evidencePath(meta.requestId)) ?? null;
    if (!saved) return { writes: {}, result: false };
    if (saved.state === "deleted") return { writes: {}, result: actor ? "deleted" : false };
    if (actor) writable(active(rows.get(`users/${actor.uid}`) ?? null, actor), actor, job, saved.purpose);
    else if (saved.expiresAt > new Date()) return { writes: {}, result: false };
    if (referenced(saved, job, evidence) || job?.status === "completed" || saved.purpose === "request" && job) return { writes: {}, result: false };
    return { writes: { [photoPath(saved.id)]: { ...saved, state: "deleting" } }, result: true };
  });
  if (!allowed) return false;
  if (allowed === "deleted") return true;
  await env.PHOTOS.delete(objectKey(meta));
  await store.atomic([photoPath(meta.id)], (rows) => ({ writes: { [photoPath(meta.id)]: { ...rows.get(photoPath(meta.id))!, state: "deleted" } }, result: true }));
  return true;
}
export async function cleanupExpired(env: Env, store = firestoreStore(env)) {
  // Bounded cursor stored privately in R2; no full collection scans or bulk deletes.
  const marker = await env.PHOTOS.get("control/gc-cursor");
  const cursor = marker ? await marker.text() : undefined;
  if (store.expired) {
    // Includes failed reservations with no R2 object. Only three authoritative
    // records per run; tombstones and cursor prevent unsafe intent resurrection.
    const page = await store.expired(cursor ? JSON.parse(cursor) ?? undefined : undefined);
    for (const meta of page.records) if (meta.state !== "deleted") await removeUnreferenced(store, env, meta);
    await env.PHOTOS.put("control/gc-cursor", JSON.stringify(page.cursor ?? null));
    return;
  }
  const list = await env.PHOTOS.list({ prefix: "photos/v1/", limit: 3, ...(cursor ? { cursor } : {}) });
  for (const object of list.objects) {
    const id = object.key.split("/").at(-1)!; if (!/^[a-f0-9]{64}$/.test(id)) continue;
    const meta = await store.get(photoPath(id)) as PhotoRecord | null;
    if (meta && object.key === objectKey(meta) && meta.expiresAt <= new Date()) await removeUnreferenced(store, env, meta);
  }
  await env.PHOTOS.put("control/gc-cursor", list.truncated ? list.cursor : "");
}
export function createPhotoHandler(dependencies: { authenticate?: typeof authenticate; store?: (env: Env) => Store } = {}) {
  return async function handle(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin"), origins = (env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    let response: Response;
    try {
      check(!origin || origins.includes(origin));
      if (request.method === "OPTIONS") response = new Response(null, { status: 204 });
      else {
        const url = new URL(request.url); check(!url.search, 400, "invalid-input");
        check(env.PHOTOS && env.PHOTO_RATE_LIMITER && /^[a-z0-9-]+$/.test(env.FIREBASE_PROJECT_ID), 503, "temporarily-unavailable");
        const sourceIP = request.headers.get("CF-Connecting-IP");
        if (sourceIP) check((await env.PHOTO_RATE_LIMITER.limit({ key: digest(`ip:${sourceIP}`) })).success, 429, "rate-limited");
        const actor = await (dependencies.authenticate ?? authenticate)(request, env);
        check((await env.PHOTO_RATE_LIMITER.limit({ key: digest(actor.uid) })).success, 429, "rate-limited");
        const store = (dependencies.store ?? firestoreStore)(env);
        if (request.method === "POST" && url.pathname === "/v1/photos") {
          check(env.PHOTO_UPLOADS_ENABLED !== "false", 503, "temporarily-unavailable");
          const ttl = Math.max(300, Math.min(86400, Number(env.PENDING_TTL_SECONDS) || 86400));
          const meta = reservation(await smallJSON(request), actor, ttl);
          await authorizeWrite(store, actor, meta.requestId, meta.purpose);
          const saved = await store.atomic(rowPaths(meta), (rows) => {
            writable(active(rows.get(`users/${actor.uid}`) ?? null, actor), actor, rows.get(jobPath(meta.requestId)) ?? null, meta.purpose);
            const existing = rows.get(photoPath(meta.id)) as PhotoRecord | null;
            if (existing) {
              check(existing.ownerId === actor.uid && existing.sha256 === meta.sha256 && existing.size === meta.size && existing.contentType === meta.contentType &&
                ["pending", "confirmed"].includes(existing.state) && existing.expiresAt > new Date(), 409, "conflict");
              return { writes: {}, result: existing };
            }
            // Only new, authorized reservations select the separated key layout.
            // Existing records above keep their layout and stable references.
            const next: PhotoRecord = { ...meta, objectKeyVersion: 2 };
            return { writes: { [photoPath(meta.id)]: next }, result: next };
          });
          response = json(publicRecord(saved));
        } else {
          const route = url.pathname.match(/^\/v1\/photos\/([a-f0-9]{64})(\/(finalize|status))?$/);
          check(route, 404, "photo-not-found"); const meta = await getRecord(store, route[1]);
          if (request.method === "GET" && !route[2]) {
            await authorizeView(store, actor, meta);
            const object = await env.PHOTOS.get(objectKey(meta)); check(object, 404, "photo-not-found");
            check(object.size === meta.size && object.httpMetadata?.contentType === meta.contentType && object.customMetadata?.photoId === meta.id && object.customMetadata?.sha256 === meta.sha256, 409, "upload-unconfirmed");
            response = new Response(object.body, { headers: { "Content-Type": meta.contentType, "Content-Length": String(meta.size),
              "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
          } else {
            check(actor.uid === meta.ownerId);
            if (request.method === "PUT" && !route[2]) {
              check(env.PHOTO_UPLOADS_ENABLED !== "false", 503, "temporarily-unavailable");
              await authorizeWrite(store, actor, meta.requestId, meta.purpose);
              check(["pending", "confirmed"].includes(meta.state) && meta.expiresAt > new Date(), 409, "upload-unconfirmed");
              const prior = await env.PHOTOS.head(objectKey(meta));
              if (!prior) await boundedPut(request, env.PHOTOS, meta);
              else await request.body?.cancel();
              // A fresh authorization pass after streaming catches assignment,
              // approval, session or account changes while bytes were arriving.
              const freshActor = await (dependencies.authenticate ?? authenticate)(request, env);
              check(freshActor.uid === actor.uid);
              response = json(publicRecord(await finalize(store, env, freshActor, meta)));
            } else if (request.method === "POST" && route[3] === "finalize") response = json(publicRecord(await finalize(store, env, actor, meta)));
            else if (request.method === "GET" && route[3] === "status") {
              await authorizeView(store, actor, meta); await confirmHead(env, meta); response = json(publicRecord(meta));
            } else if (request.method === "DELETE" && !route[2]) {
              check(await removeUnreferenced(store, env, meta, actor), 409, "photo-in-use"); response = json({ deleted: true });
            } else throw new PhotoError(405, "method-not-allowed");
          }
        }
      }
    } catch (cause) {
      const error = cause instanceof PhotoError ? cause : new PhotoError(503, "temporarily-unavailable");
      // Never log raw requests, URLs, identity, keys, token or exception text.
      console.warn("Photo operation denied or unavailable", { status: error.status, code: error.code });
      response = json({ code: error.code }, error.status);
    }
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    if (origin && origins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin); response.headers.set("Vary", "Origin");
      response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }
    return response;
  };
}
export default { fetch: createPhotoHandler(), scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
  ctx.waitUntil(cleanupExpired(env).catch(() => { console.warn("Photo cleanup unavailable", { code: "temporarily-unavailable" }); }));
} };
