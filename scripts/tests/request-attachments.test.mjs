import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';
const policy = loadService('src/utils/requestAttachments.ts', {});
const jpeg = new Uint8Array([255, 216, 255, 0]);
function photoService(picker = {}) {
  return loadService('src/services/requestAttachments.service.ts', {
    'expo-image-picker': picker, 'firebase/storage': {}, '@/src/firebase/config': {},
    './reviewPhotos.service': { readPhotoBytes: async (uri) => uri === 'large' ? new Uint8Array(2_000_000) : jpeg },
    '@/src/utils/requestAttachments': policy,
  });
}
test('strict actual-byte threshold, supported types, canonical ownership and two distinct slots', () => {
  const service = photoService();
  for (const n of [2_000_000, 2_000_001, 0]) assert.throws(() => service.validateRequestPhoto(new Uint8Array(n)), /under 2 MB/);
  const valid = new Uint8Array(1_999_999); valid.set(jpeg); assert.equal(service.validateRequestPhoto(valid), 'image/jpeg');
  assert.throws(() => service.validateRequestPhoto(new Uint8Array([1, 2, 3])), /JPEG/);
  for (const paths of [[], ['request_attachments/owner/job/0'], ['request_attachments/owner/job/0', 'request_attachments/owner/job/1']]) policy.validateRequestPaths(paths, 'owner', 'job');
  for (const paths of [['request_attachments/foreign/job/0'], ['https://example.test/x'], ['request_attachments/owner/job/2'], Array(3).fill('request_attachments/owner/job/0')]) assert.throws(() => policy.validateRequestPaths(paths, 'owner', 'job'));
});
test('gallery cancellation, permission denial, remaining limit and unreliable size metadata', async (t) => {
  t.mock.method(globalThis, 'fetch', async (uri) => ({ blob: async () => ({ size: uri === 'large' ? 2_000_000 : 4, bytes: jpeg }) }));
  const old = globalThis.FileReader;
  globalThis.FileReader = class { readAsArrayBuffer(blob) { this.result = blob.bytes.buffer; this.onload(); } };
  t.after(() => { globalThis.FileReader = old; });
  assert.deepEqual(await photoService({ launchImageLibraryAsync: async () => ({ canceled: true }) }).pickRequestPhotos(2), []);
  await assert.rejects(photoService({ launchImageLibraryAsync: async () => { throw Error('permission'); } }).pickRequestPhotos(2), /Allow access/);
  for (const assets of [[{ uri: 'large', fileSize: 1 }], Array(3).fill({ uri: 'image' })]) {
    await assert.rejects(photoService({ launchImageLibraryAsync: async () => ({ canceled: false, assets }) }).pickRequestPhotos(2));
  }
  let options;
  const selected = await photoService({ launchImageLibraryAsync: async (value) => { options = value; return { canceled: false, assets: [{ uri: 'image', fileSize: 99_000_000 }] }; } }).pickRequestPhotos(1);
  assert.equal(selected[0].size, 4); assert.equal(options.selectionLimit, 1); assert.equal(options.quality, 1);
});
function screen({ count = 0, duration = '60', failUpload = false, r2Failure = false, cleanupFails = false, confirmationFails = false, uncertain = false, hold = false, holdPicker = false } = {}) {
  const auth = { currentUser: { uid: 'owner' } }, uploaded = [], created = [], cleanup = [], routes = [];
  let release, confirmed = false, ids = 0;
  const initial = [{ uid: 'owner' }, { uid: 'tech', availability: 'available', serviceDivision: 'Kandy' }, 'Electrical', 'Repair', 'Description', 'Address', 'Kandy', new Date(2099, 9, 10), false, '10:00 AM', duration, 'normal', Array.from({ length: count }, (_, i) => ({ uri: `photo${i}`, size: 4, contentType: 'image/jpeg' })), false, false, ''];
  initial[20] = false;
  const h = renderHarness('app/(tabs)/create-request.tsx', { initial, dependencies: {
    'expo-router': { router: { replace: (route) => routes.push(route) }, useLocalSearchParams: () => ({ technicianId: 'tech' }) },
    'firebase/auth': {}, '@/src/firebase/config': { auth }, '@react-native-community/datetimepicker': {},
    '@/src/components/technicians/AvailabilityBadge': { AvailabilityBadge: 'Badge' },
    '@/src/components/technicians/TechnicianRating': { TechnicianRating: 'Rating' },
    '@/src/services/user.service': {}, '@/src/services/technician.service': {},
    '@/src/services/requestAttachments.service': {
      pickRequestPhotos: async () => { if (holdPicker) await new Promise((resolve) => { release = resolve; }); return [{ uri: 'replacement', size: 4 }]; },
      cleanupUnsubmittedPhotos: async (...args) => { cleanup.push(args); if (cleanupFails) throw Object.assign(Error('cleanup denied'), { code: 'storage/unauthorized' }); },
      uploadRequestPhoto: async (...args) => { uploaded.push(args); if (hold) await new Promise((resolve) => { release = resolve; }); if (r2Failure) throw Object.assign(Error('Photos temporarily unavailable'), { code: 'photos/unavailable', retainPhotoAttempt: true }); if (confirmationFails) { confirmationFails = false; throw Object.assign(Error('Confirmation failed'), { operation: 'photo-confirm', uploadAcknowledged: true, code: 'storage/unknown' }); } if (failUpload && (failUpload !== 'second' || args[2] === 1)) { failUpload = false; throw Error('Upload failed'); } return `request_attachments/owner/${args[1]}/${args[2]}`; },
    },
    '@/src/services/request.service': {
      createServiceRequestAttemptId: () => ids++ === 0 ? 'abcdefghijklmnopqrst' : 'abcdefghijklmnopqrsu', confirmServiceRequestAttempt: async () => confirmed,
      createServiceRequest: async (input) => { created.push(structuredClone(input)); if (hold && count === 0) await new Promise((resolve) => { release = resolve; }); if (uncertain) { uncertain = false; confirmed = true; throw Error('Uncertain booking result'); } return input.attemptId; },
    },
  } });
  const find = (name) => { h.render(); return h.elements().find((e) => e.props.accessibilityLabel === name); };
  const submit = () => { h.render(); return h.elements().find((e) => e.type === 'TouchableOpacity' && e.props.onPress?.name === 'handleSubmit'); };
  return { h, auth, uploaded, created, cleanup, routes, find, submit, release: () => release(), unhold: () => { hold = false; } };
}
for (const count of [0, 1, 2]) test(`submit with ${count} optional photos preserves duration and durable references`, async () => {
  const f = screen({ count }); assert.equal(f.submit().props.disabled, false); await f.submit().props.onPress();
  assert.equal(f.uploaded.length, count); assert.equal(f.created.length, 1); assert.equal(f.created[0].imageUrls.length, count); assert.equal(f.created[0].durationMinutes, 60); assert.equal(f.routes[0].params.id, 'abcdefghijklmnopqrst');
});
test('duration stays required independently of optional photos; removal/replacement and third-image prevention', async () => {
  assert.equal(screen({ duration: '' }).submit().props.disabled, true);
  const f = screen({ count: 2 }); assert.equal(f.find('Add Photo').props.disabled, true);
  f.find('Remove photo 1').props.onPress(); await f.find('Add Photo').props.onPress();
  assert.equal(f.h.slots[12].length, 2); assert.equal(f.h.slots[12][1].uri, 'replacement');
});
test('upload failure preserves photos/inputs, cleans only before booking, and retry succeeds', async () => {
  const f = screen({ count: 2, failUpload: 'second' }); await f.submit().props.onPress();
  assert.equal(f.uploaded.length, 2);
  assert.equal(f.created.length, 0); assert.equal(f.routes.length, 0); assert.equal(f.cleanup.length, 1); assert.equal(f.h.slots[12].length, 2); assert.equal(f.h.slots[3], 'Repair');
  await f.submit().props.onPress(); assert.equal(f.created.length, 1);
});
test('uncertain commit retry confirms same ID before reupload, never cleans committed files', async () => {
  const f = screen({ count: 2, uncertain: true }); await f.submit().props.onPress(); assert.equal(f.routes.length, 0);
  await f.submit().props.onPress(); assert.equal(f.created.length, 1); assert.equal(f.uploaded.length, 2); assert.equal(f.cleanup.length, 0); assert.equal(f.routes.length, 1);
});
test('acknowledged upload with failed confirmation retries same file identity without cleanup', async () => {
  const f = screen({ count: 1, confirmationFails: true });
  await f.submit().props.onPress(); assert.equal(f.created.length, 0); assert.equal(f.cleanup.length, 0);
  assert.equal(f.h.slots[14], false); assert.match(f.h.slots[22], /was uploaded/);
  await f.submit().props.onPress(); assert.equal(f.created.length, 1);
  assert.equal(f.uploaded[0][1], f.uploaded[1][1]);
});
test('removing an uploaded but unconfirmed photo bypasses Storage and does not reuse stale selection', async () => {
  const f = screen({ count: 1, confirmationFails: true }); await f.submit().props.onPress();
  f.find('Remove photo 1').props.onPress(); await f.submit().props.onPress();
  assert.equal(f.uploaded.length, 1); assert.equal(f.cleanup.length, 0); assert.deepEqual(f.created[0].imageUrls, []);
  assert.notEqual(f.created[0].attemptId, f.uploaded[0][1]);
});
test('unavailable R2 preserves a pending attempt; removing all selections books without the photo service', async () => {
  const f = screen({ count: 1, r2Failure: true }); await f.submit().props.onPress();
  assert.equal(f.cleanup.length, 0); assert.equal(f.h.slots[14], false); assert.equal(f.h.slots[3], 'Repair');
  f.find('Remove photo 1').props.onPress(); await f.submit().props.onPress();
  assert.equal(f.uploaded.length, 1); assert.equal(f.created.length, 1); assert.deepEqual(f.created[0].imageUrls, []);
  assert.notEqual(f.created[0].attemptId, f.uploaded[0][1]);
});
for (const cleanupFails of [false, true]) test(`failed upload then removal submits zero photos without Storage (cleanup fails: ${cleanupFails})`, async () => {
  const f = screen({ count: 1, failUpload: true, cleanupFails });
  await f.submit().props.onPress();
  assert.equal(f.h.slots[14], false, 'pre-booking failure must unlock even if cleanup fails');
  f.find('Remove photo 1').props.onPress();
  const uploads = f.uploaded.length, cleanups = f.cleanup.length;
  await f.submit().props.onPress();
  assert.equal(f.uploaded.length, uploads); assert.equal(f.cleanup.length, cleanups);
  assert.deepEqual(f.created[0].imageUrls, []); assert.equal(f.routes.length, 1);
  assert.notEqual(f.created[0].attemptId, f.cleanup[0][1], 'only an ID with no booking transaction can be abandoned');
});
test('duplicate taps and account changes during uploads or booking cannot submit/navigate as another account', async () => {
  for (const count of [0, 1]) {
    const f = screen({ count, hold: true }), handler = f.submit().props.onPress;
    const pending = handler(); await handler(); assert.equal(f.created.length + f.uploaded.length, 1);
    f.auth.currentUser = { uid: 'other' }; f.release(); await pending;
    assert.equal(f.routes.length, 0); if (count) assert.equal(f.created.length, 0);
  }
});
test('concurrent gallery actions are serialized and an account change discards late selections', async () => {
  const f = screen({ holdPicker: true }), add = f.find('Add Photo').props.onPress;
  const pending = add(); await add(); await f.submit().props.onPress(); assert.equal(f.created.length, 0);
  f.auth.currentUser = { uid: 'other' }; f.release(); await pending; assert.equal(f.h.slots[12].length, 0);
});
test('notification indexes exactly match ordered live/history queries, without duplicate definitions', () => {
  const indexes = JSON.parse(readFileSync('firestore.indexes.json')).indexes;
  for (const [collectionGroup, prefix] of [['notifications', [{ fieldPath: 'userId', order: 'ASCENDING' }]], ['system_messages', [{ fieldPath: 'audienceRoles', arrayConfig: 'CONTAINS' }, { fieldPath: 'status', order: 'ASCENDING' }]]]) {
    const fields = [...prefix, { fieldPath: 'createdAt', order: 'DESCENDING' }, { fieldPath: '__name__', order: 'DESCENDING' }];
    assert.equal(indexes.filter((i) => i.collectionGroup === collectionGroup && i.queryScope === 'COLLECTION' && JSON.stringify(i.fields) === JSON.stringify(fields)).length, 1);
  }
  const source = readFileSync('src/services/notificationHistory.ts', 'utf8');
  assert.match(source, /orderBy\("createdAt", "desc"\), orderBy\(documentId\(\), "desc"\)/); assert.match(source, /startAfter\(cursor\)/);
});
