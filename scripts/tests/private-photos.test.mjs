import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const id = 'a'.repeat(64), ref = `r2:v1:${id}`;
function fixture(t, { configured = true, uploadFailure = false, alreadyConfirmed = false, finalizeFailure = false, hold = false } = {}) {
  const oldURL = process.env.EXPO_PUBLIC_PHOTO_API_URL, oldXHR = globalThis.XMLHttpRequest, oldReader = globalThis.FileReader;
  if (configured) process.env.EXPO_PUBLIC_PHOTO_API_URL = 'https://photos.example.test'; else delete process.env.EXPO_PUBLIC_PHOTO_API_URL;
  t.after(() => { if (oldURL === undefined) delete process.env.EXPO_PUBLIC_PHOTO_API_URL; else process.env.EXPO_PUBLIC_PHOTO_API_URL = oldURL; globalThis.XMLHttpRequest = oldXHR; globalThis.FileReader = oldReader; });
  const watchers = new Set(), requests = [], uploads = [], legacy = [], progress = [];
  const user = { uid: 'owner', emailVerified: true, getIdToken: async () => 'PRIVATE_FIREBASE_TOKEN' };
  const auth = { currentUser: user, onAuthStateChanged: (callback) => { watchers.add(callback); return () => watchers.delete(callback); } };
  const response = { id, reference: ref, state: 'confirmed' };
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push({ url, ...options });
    if (url.endsWith('/finalize')) return { ok: !finalizeFailure, status: finalizeFailure ? 503 : 200, json: async () => response };
    if (url.endsWith('/status')) return { ok: true, status: 200, json: async () => response };
    if (options.method === 'POST') return { ok: true, status: 200, json: async () => ({ ...response, state: alreadyConfirmed ? 'confirmed' : 'pending' }) };
    return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([255, 216, 255, 0])]) };
  });
  globalThis.XMLHttpRequest = class {
    upload = {}; status = 200; headers = {}; responseText = JSON.stringify(response);
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(blob) { uploads.push({ xhr: this, blob }); if (!hold) queueMicrotask(() => { this.upload.onprogress?.({ lengthComputable: true, loaded: blob.size, total: blob.size }); if (uploadFailure) this.onerror(); else this.onload(); }); }
    abort() { this.onabort?.(); }
  };
  globalThis.FileReader = class { readAsDataURL() { this.result = 'data:image/jpeg;base64,/9j/AA=='; this.onload(); } };
  const service = loadService('src/services/privatePhotos.service.ts', {
    '@/src/firebase/config': { auth }, './reviewPhotos.service': { loadReviewPhoto: async (path) => { legacy.push(path); return 'legacy-authenticated-bytes'; } },
  });
  const input = { uid: 'owner', requestId: 'abcdefghijklmnopqrst', purpose: 'request', attemptId: 'abcdefghijklmnopqrst', slot: 0,
    blob: new Blob([new Uint8Array([255, 216, 255, 0])]), bytes: new Uint8Array([255, 216, 255, 0]), contentType: 'image/jpeg' };
  return { service, input, requests, uploads, legacy, progress, auth, watchers,
    upload: (signal) => service.uploadPrivatePhoto(input, (n) => progress.push(n), signal),
    switch: (uid) => { auth.currentUser = { ...user, uid }; for (const next of watchers) next(auth.currentUser); } };
}
test('unconfigured selected-photo upload fails recoverably before network or Firebase Storage fallback', async (t) => {
  const f = fixture(t, { configured: false }); await assert.rejects(f.upload(), /temporarily unavailable/);
  assert.equal(f.requests.length, 0); assert.equal(f.uploads.length, 0);
});
test('Firebase token connectivity failures stay separate from photo-service failures', async (t) => {
  const f = fixture(t); f.auth.currentUser.getIdToken = async () => { throw Error('Auth connection unavailable'); };
  await assert.rejects(f.upload(), (error) => error.code === 'photos/auth-unavailable' && /sign-in/.test(error.message));
  assert.equal(f.requests.length, 0); assert.equal(f.uploads.length, 0);
});
test('native Blob upload uses header auth, SHA-256 reservation and stable reference without tokens in URLs', async (t) => {
  const f = fixture(t); assert.equal(await f.upload(), ref);
  assert.equal(f.uploads[0].blob, f.input.blob); assert.equal(f.uploads[0].xhr.headers.Authorization, 'Bearer PRIVATE_FIREBASE_TOKEN');
  const init = JSON.parse(f.requests[0].body); assert.equal(init.size, 4); assert.match(init.sha256, /^[a-f0-9]{64}$/); assert.equal(init.ownerId, undefined);
  assert.ok(!JSON.stringify(f.requests.map((r) => r.url)).includes('PRIVATE_FIREBASE_TOKEN')); assert.ok(!f.uploads[0].xhr.url.includes('PRIVATE_FIREBASE_TOKEN'));
  assert.equal(f.progress.at(-1), 1); assert.equal(f.watchers.size, 0);
});
test('lost PUT response finalizes exactly the original object; reservation confirmation avoids another upload', async (t) => {
  const f = fixture(t, { uploadFailure: true }); assert.equal(await f.upload(), ref);
  assert.equal(f.uploads.length, 1); assert.equal(f.requests.filter((r) => r.url.endsWith('/finalize')).length, 1);
  const g = fixture(t, { alreadyConfirmed: true }); assert.equal(await g.upload(), ref); assert.equal(g.uploads.length, 0);
  assert.ok(g.requests.some((r) => r.url.endsWith('/status')));
});
test('failed finalize never acknowledges an attachment or creates another reservation', async (t) => {
  const f = fixture(t, { uploadFailure: true, finalizeFailure: true }); await assert.rejects(f.upload());
  assert.equal(f.uploads.length, 1); assert.equal(f.requests.filter((r) => r.method === 'POST' && !r.url.endsWith('/finalize')).length, 1);
});
test('direct account replacement cancels upload and prevents finalize with a new identity', async (t) => {
  const f = fixture(t, { hold: true }), pending = f.upload(); await new Promise(setImmediate); f.switch('other');
  await assert.rejects(pending, /account changed/); assert.equal(f.requests.filter((r) => r.url.endsWith('/finalize')).length, 0);
});
test('private image loading authenticates in headers, restores stable references and retains legacy Firebase viewing', async (t) => {
  const f = fixture(t); assert.match(await f.service.loadPrivatePhoto(ref), /^data:image/);
  assert.equal(f.requests[0].headers.Authorization, 'Bearer PRIVATE_FIREBASE_TOKEN'); assert.ok(!f.requests[0].url.includes('PRIVATE_FIREBASE_TOKEN'));
  assert.equal(await f.service.loadPrivatePhoto('job_photos/owner/job/before/ABCDEFGHIJKLMNOPQRST/0.jpg'), 'legacy-authenticated-bytes');
  assert.equal(f.legacy.length, 1); assert.equal(f.watchers.size, 0);
});
