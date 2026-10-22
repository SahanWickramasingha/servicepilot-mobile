import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService, sessionFixture } from '../lib/subscription-reliability-workloads.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';
const domain = loadService('functions/src/domain/jobEvidence.ts', {}), booking = loadService('functions/src/domain/booking.ts', {});
const attempt = 'abcdefghijklmnopqrst', path = (stage = 'before', uid = 'tech-a') => `job_photos/${uid}/job-a/${stage}/${attempt}/0.jpg`;
const notes = { diagnosis: 'Motor fault', workCompleted: 'Replaced bearing', recommendation: '', parts: [{ name: 'Bearing', quantity: 1 }] };
const signature = { customerName: 'Customer fixture', path: 'M10.0,10.0 L40.0,50.0 L80.0,20.0 ', confirmed: true };
const complete = () => ({ requestId: 'job-a', technicianId: 'tech-a', customerId: 'customer-a', revision: 4,
  beforePhotos: [path()], afterPhotos: [path('after')], notes, signature });
const tick = () => new Promise(setImmediate);
function fixture({ picker = {}, photos = {} } = {}) {
  const session = sessionFixture(); session.emit('tech-a'); session.auth.currentUser.emailVerified = true;
  const data = new Map([['users/tech-a', { role: 'technician', technicianApprovalStatus: 'approved', accountStatus: 'active' }],
    ['service_requests/job-a', { technicianId: 'tech-a', customerId: 'customer-a', status: 'in_progress' }]]);
  const metadata = new Map(), deleted = [], listeners = []; let writes = 0;
  const snapshot = (key) => ({ exists: () => data.has(key), data: () => data.get(key) });
  const service = loadService('src/services/jobEvidence.service.ts', {
    '@/src/firebase/config': { auth: session.auth, db: {}, storage: {} }, '@/functions/src/domain/booking': booking, '@/functions/src/domain/jobEvidence': domain,
    './reviewPhotos.service': { readPhotoBytes: async () => new Uint8Array([255, 216, 255, 0]), pickReviewPhotos() {}, prepareSelectedPhotos() {}, ...photos },
    '@/src/utils/reviewValidation': loadService('src/utils/reviewValidation.ts', {}), 'expo-image-picker': picker,
    'firebase/firestore': { collection: (_, name) => name, doc: (_, collection, id) => ({ path: id ? `${collection}/${id}` : collection, id: attempt }),
      serverTimestamp: () => 'server-time', getDocFromServer: async (ref) => snapshot(ref.path),
      runTransaction: async (_, callback) => callback({ get: async (ref) => snapshot(ref.path), set: (ref, value) => { data.set(ref.path, value); writes++; } }),
      onSnapshot: (_, __, next, error) => { const listener = { next, error, stopped: false }; listeners.push(listener); return () => { listener.stopped = true; }; } },
    'firebase/storage': { ref: (_, path) => path, getMetadata: async (key) => {
      if (!metadata.has(key)) throw Object.assign(new Error('Missing'), { code: 'storage/object-not-found' }); return metadata.get(key);
    }, deleteObject: async (key) => { deleted.push(key); metadata.delete(key); },
    uploadBytesResumable: (key, blob, meta) => ({ cancel() {}, on: (_, next, error, done) => {
      metadata.set(key, { ...meta, size: blob.size }); next({ bytesTransferred: blob.size, totalBytes: blob.size }); done();
    } }) },
  });
  const media = (key) => metadata.set(key, { size: 4, contentType: 'image/jpeg', customMetadata: { technicianId: 'tech-a', requestId: 'job-a', stage: key.includes('/before/') ? 'before' : 'after' } });
  return { service, session, data, metadata, deleted, listeners, media, writes: () => writes };
}
test('completion requires every existing UI requirement and validates notes, signature, ownership, count and stage', () => {
  const evidence = complete(); domain.requireCompletionEvidence(evidence, 'job-a', 'tech-a', 'customer-a');
  for (const field of ['beforePhotos', 'afterPhotos', 'notes', 'signature']) {
    const partial = { ...evidence }; delete partial[field]; assert.throws(() => domain.requireCompletionEvidence(partial, 'job-a', 'tech-a', 'customer-a'));
  }
  for (const paths of [[], [path('after')], [path('before', 'other')], [path(), path()], Array(4).fill(path())]) assert.throws(() => domain.validateJobPhotoPaths(paths, 'tech-a', 'job-a', 'before'));
  for (const invalid of [{ ...notes, diagnosis: ' ' }, { ...notes, parts: [{ name: 'Part', quantity: 0 }] }, { ...notes, workCompleted: 'x'.repeat(3001) }]) assert.throws(() => domain.validateServiceNotes(invalid));
  for (const invalid of [{ ...signature, path: '' }, { ...signature, confirmed: false }, { ...signature, path: '<script>alert()</script>' }]) assert.throws(() => domain.validateJobSignature(invalid));
});
test('saved photos and notes restore from the correct job, exact retries are idempotent and stale revisions cannot erase newer work', async () => {
  const f = fixture(); f.media(path()); await f.service.saveJobEvidence('job-a', 0, { beforePhotos: [path()] });
  await f.service.saveJobEvidence('job-a', 0, { beforePhotos: [path()] }); assert.equal(f.writes(), 1);
  await f.service.saveJobEvidence('job-a', 1, { notes }); assert.deepEqual(f.data.get('job_evidence/job-a').notes, notes);
  await assert.rejects(f.service.saveJobEvidence('job-a', 1, { signature }), /changed on another screen/);
  await f.service.saveJobEvidence('job-a', 2, { signature });
  await f.service.saveJobEvidence('job-a', 2, { signature }); assert.equal(f.writes(), 3);
  assert.equal(f.data.get('job_evidence/job-a').beforePhotos[0], path());
});
test('missing upload, disabled account, different assigned technician and completed job never acknowledge a save', async () => {
  const f = fixture(); await assert.rejects(f.service.saveJobEvidence('job-a', 0, { beforePhotos: [path()] })); assert.equal(f.writes(), 0);
  f.media(path()); f.data.get('users/tech-a').accountStatus = 'disabled'; await assert.rejects(f.service.saveJobEvidence('job-a', 0, { notes }));
  f.data.get('users/tech-a').accountStatus = 'active'; f.data.get('service_requests/job-a').technicianId = 'other'; await assert.rejects(f.service.saveJobEvidence('job-a', 0, { notes }));
  f.data.get('service_requests/job-a').technicianId = 'tech-a'; f.data.get('service_requests/job-a').status = 'completed'; await assert.rejects(f.service.saveJobEvidence('job-a', 0, { notes })); assert.equal(f.writes(), 0);
});
test('orphan cleanup retains committed references, never deletes another owner path and stops on an account switch', async () => {
  const f = fixture(); f.data.set('job_evidence/job-a', complete());
  const orphan = path().replace('/0.jpg', '/1.jpg'); f.media(orphan);
  await f.service.cleanupJobUploads('job-a', 'tech-a', [path(), orphan, path('before', 'other')]); assert.deepEqual(f.deleted, [orphan]);
  f.session.emit('other'); await assert.rejects(f.service.cleanupJobUploads('job-a', 'tech-a', [path()])); assert.deepEqual(f.deleted, [orphan]);
});
test('photo retry reuses one immutable path and reports upload progress', async (t) => {
  const f = fixture(); t.mock.method(globalThis, 'fetch', async () => ({ blob: async () => new Blob([new Uint8Array([255, 216, 255, 0])]) }));
  const values = []; const first = await f.service.uploadJobPhoto('job-a', 'before', attempt, 0, { uri: 'local-fixture', size: 4 }, (v) => values.push(v));
  assert.equal(first, path()); assert.deepEqual(values, [1]);
  assert.equal(await f.service.uploadJobPhoto('job-a', 'before', attempt, 0, { uri: 'local-fixture', size: 4 }, (v) => values.push(v)), first); assert.deepEqual(values, [1]);
});
test('camera permission denial and cancellation never create photos; library choice stays available', async () => {
  let granted = false, canceled = true;
  const f = fixture({ picker: { requestCameraPermissionsAsync: async () => ({ granted }), launchCameraAsync: async () => ({ canceled, assets: [{ uri: 'camera-local' }] }) },
    photos: { pickReviewPhotos: async () => [{ uri: 'library-local', size: 4 }], prepareSelectedPhotos: async (assets) => assets.map((a) => ({ uri: a.uri, size: 4 })) } });
  await assert.rejects(f.service.pickJobPhotos(3, true), /permission was denied/);
  assert.equal((await f.service.pickJobPhotos(3))[0].uri, 'library-local'); granted = true;
  assert.deepEqual(await f.service.pickJobPhotos(3, true), []); canceled = false;
  assert.equal((await f.service.pickJobPhotos(3, true))[0].uri, 'camera-local'); assert.equal(f.writes(), 0);
});
test('pooled evidence subscriptions share one listener, reject old callbacks and clear on logout/final disposal', () => {
  const f = fixture(), values = []; const stops = [f.service.subscribeToJobEvidence('job-a', (data) => values.push(data), assert.fail), f.service.subscribeToJobEvidence('job-a', (data) => values.push(data), assert.fail)];
  assert.equal(f.listeners.length, 1); f.listeners[0].next({ exists: () => true, data: complete, metadata: { fromCache: false, hasPendingWrites: false } }); assert.equal(values.length, 2);
  f.session.emit(null); assert.ok(values.slice(-2).every((v) => v === null)); const length = values.length;
  f.listeners[0].next({ exists: () => true, data: complete, metadata: {} }); assert.equal(values.length, length); stops.forEach((stop) => stop()); assert.equal(f.listeners[0].stopped, true);
});
test('photo screen preserves selections after failure, retries a real save and restores saved paths on reopen', async () => {
  let data = null, fail = true, saves = 0; const routes = [], attempts = [];
  const deps = {
    'expo-router': { router: { back: () => routes.push('back') } }, '@/src/firebase/config': { auth: { currentUser: { uid: 'tech-a' } } },
    '@/src/hooks/useTechnicianRequest': { useTechnicianRequest: () => ({ requestId: 'job-a', request: { id: 'job-a', customerName: 'Fixture', status: 'in_progress' }, loading: false }) },
    '@/src/hooks/useJobEvidence': { useJobEvidence: () => ({ evidence: data, confirmed: true, loading: false, error: '' }) },
    '@/src/components/jobs/JobEvidenceView': {}, './JobEvidenceView': { JobPhoto: 'JobPhoto', SignaturePreview: 'SignaturePreview' },
    '@/src/services/jobEvidence.service': { pickJobPhotos: async () => [{ uri: 'selected-local', size: 4 }], newJobPhotoAttempt: () => attempt,
      cleanupJobUploads: async () => {}, uploadJobPhoto: async (_, __, id) => { attempts.push(id); return path(); },
      saveJobEvidence: async (id, rev, change) => { saves++; assert.equal(id, 'job-a'); if (fail) throw new Error('Save failed'); data = { ...complete(), ...change }; } },
  };
  const h = renderHarness('src/components/jobs/JobEvidenceScreen.tsx', { effects: true, exportName: 'JobEvidenceScreen', dependencies: deps });
  const render = () => { h.render({ mode: 'before' }); h.render({ mode: 'before' }); };
  const button = (label) => { const e = h.elements().find((e) => e.type?.name === 'Button' && e.props.label === label); return e.props; };
  render(); await button('Choose photos').onPress(); await tick(); render();
  await button('Save').onPress(); await tick(); render(); assert.equal(routes.length, 0); assert.ok(h.elements().some((e) => e.type === 'Image' && e.props.source.uri === 'selected-local'));
  fail = false; await button('Retry save').onPress(); await tick(); assert.equal(saves, 2); assert.deepEqual(attempts, [attempt, attempt]); assert.deepEqual(routes, ['back']); h.cleanup();
  const reopened = renderHarness('src/components/jobs/JobEvidenceScreen.tsx', { effects: true, exportName: 'JobEvidenceScreen', dependencies: deps }); reopened.render({ mode: 'before' }); reopened.render({ mode: 'before' });
  assert.ok(reopened.elements().some((e) => e.type === 'JobPhoto' && e.props.path === path())); reopened.cleanup();
});
