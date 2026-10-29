import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const jpeg = new Uint8Array([255, 216, 255, 0]), ref = 'r2:v1:' + 'a'.repeat(64);
function fixture(t, { size = 4, bytes = jpeg, failure = false } = {}) {
  const calls = [], blob = { size, bytes, close() {} }, auth = { currentUser: { uid: 'owner' } };
  t.mock.method(globalThis, 'fetch', async () => ({ blob: async () => blob }));
  const old = globalThis.FileReader;
  globalThis.FileReader = class { readAsArrayBuffer(value) { this.result = value.bytes.buffer; this.onload(); } };
  t.after(() => { globalThis.FileReader = old; });
  const service = loadService('src/services/requestAttachments.service.ts', { 'expo-image-picker': {}, '@/src/firebase/config': { auth },
    './privatePhotos.service': { uploadPrivatePhoto: async (input, progress) => { calls.push(input); if (failure) throw Object.assign(Error('Photo unavailable'), { code: 'photos/unavailable' }); progress(1); return ref; } } });
  const run = () => service.uploadRequestPhoto('owner', 'abcdefghijklmnopqrst', 0, { uri: 'photo', size: 1, contentType: 'text/plain' }, () => {}, new AbortController().signal);
  return { calls, blob, service, run };
}
test('customer wrapper sends the exact actual native bytes/Blob and stable booking identity to R2', async (t) => {
  const f = fixture(t); assert.equal(await f.run(), ref); assert.equal(f.calls[0].blob, f.blob);
  assert.equal(f.calls[0].size, undefined); assert.equal(f.calls[0].bytes.length, 4); assert.equal(f.calls[0].purpose, 'request');
  assert.equal(f.calls[0].attemptId, f.calls[0].requestId); assert.equal(f.calls[0].contentType, 'image/jpeg');
});
test('actual size threshold and MIME signatures reject before photo service calls', async (t) => {
  const f = fixture(t, { size: 2_000_000 }); await assert.rejects(f.run(), /under 2 MB/); assert.equal(f.calls.length, 0);
  const g = fixture(t, { bytes: new Uint8Array([60, 115, 118, 103]) }); await assert.rejects(g.run(), /JPEG/); assert.equal(g.calls.length, 0);
});
test('lost/unavailable photo outcomes preserve the pre-booking attempt; cleanup hook does not contact any storage', async (t) => {
  const f = fixture(t, { failure: true }); await assert.rejects(f.run(), (error) => error.retainPhotoAttempt === true);
  await f.service.cleanupUnsubmittedPhotos('owner', 'abcdefghijklmnopqrst'); assert.equal(f.calls.length, 1);
});
