import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as sdk from 'firebase/firestore';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const hosts = [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST];
if (!hosts.every((host) => /^(127\.0\.0\.1|localhost):\d+$/.test(host || ''))) throw Error('Loopback demo Auth/Firestore emulators required.');
const projectId = 'demo-servicepilot-review-author', require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdminApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore'), { getAuth: adminAuth } = require('firebase-admin/auth');
const trusted = adminApp({ projectId }, 'r2-photo-security'), admin = getFirestore(trusted), clients = new Map();
const domain = loadService('functions/src/domain/jobEvidence.ts', {});
const denied = (promise) => assert.rejects(promise, (e) => e.code === 'permission-denied');
const newId = () => sdk.doc(sdk.collection(clients.get('r2-owner').db, 'service_requests')).id;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const photoId = (job, stage, slot = 0) => hash(`${job}:${stage}:${slot}`);
const ref = (job, stage, slot = 0) => `r2:v1:${photoId(job, stage, slot)}`;
const notes = { diagnosis: 'Local diagnosis', workCompleted: 'Local repair', recommendation: '', parts: [] };
const signature = { customerName: 'Local Customer', path: 'M10.0,10.0 L40.0,50.0 L80.0,20.0 ', confirmed: true };
function requests(client) { return loadService('src/services/request.service.ts', { '@/src/firebase/config': client, 'firebase/firestore': sdk,
  '@/functions/src/domain/availability': loadService('functions/src/domain/availability.ts', {}), '@/src/constants/serviceRequests': loadService('src/constants/serviceRequests.ts', {}) }); }
function evidence(client) { return loadService('src/services/jobEvidence.service.ts', { '@/src/firebase/config': client, 'firebase/firestore': sdk, 'expo-image-picker': {}, './reviewPhotos.service': {},
  '@/functions/src/domain/jobEvidence': domain, '@/functions/src/domain/booking': loadService('functions/src/domain/booking.ts', {}), '@/src/utils/reviewValidation': loadService('src/utils/reviewValidation.ts', {}),
  // Worker cryptography/R2 existence are independently tested in photo-worker.
  // This fixture lets real Firestore Rules independently authorize each write.
  './privatePhotos.service': { confirmPrivatePhoto: async () => {}, deleteUnreferencedPrivatePhoto: async () => {} } }); }
function input(id, images = []) { return { attemptId: id, profile: { uid: 'r2-owner' }, technician: { uid: 'r2-tech', serviceDivision: 'Kandy' }, serviceCategory: 'Electrical', title: 'R2 local test', description: 'Local emulator', address: 'Private', division: 'Kandy', preferredDate: '2099-10-10', preferredTime: '10:00 AM', scheduledAt: new Date('2099-10-10T04:30:00Z'), durationMinutes: 60, priority: 'normal', imageUrls: images }; }
async function metadata(job, stage, slot = 0, extra = {}) {
  const id = photoId(job, stage, slot);
  await admin.doc(`photo_objects/${id}`).set({ id, provider: 'r2', ownerId: stage === 'request' ? 'r2-owner' : 'r2-tech', requestId: job, purpose: stage,
    state: 'confirmed', size: 4, contentType: 'image/jpeg', sha256: hash('fixture'), attemptId: 'ABCDEFGHIJKLMNOPQRST', slot,
    createdAt: new Date(), expiresAt: new Date(Date.now() + 86400000), ...extra });
  return ref(job, stage, slot);
}
async function job(id, status = 'in_progress') { await admin.doc(`service_requests/${id}`).set({ customerId: 'r2-owner', technicianId: 'r2-tech', status, title: 'Local R2 evidence', imageUrls: [] }); }
before(async () => {
  sdk.setLogLevel('silent');
  for (const [uid, role] of [['r2-owner', 'customer'], ['r2-other', 'customer'], ['r2-tech', 'technician'], ['r2-foreign-tech', 'technician'], ['r2-dispatcher', 'dispatcher']]) {
    const email = `${uid}@example.test`, password = randomBytes(24).toString('base64url');
    await adminAuth(trusted).createUser({ uid, email, password, emailVerified: true });
    await admin.doc(`users/${uid}`).set({ uid, role, fullName: 'Local fixture', email, phone: 'Private', accountStatus: 'active', emailVerified: true,
      ...(role === 'technician' ? { technicianApprovalStatus: 'approved', availability: 'available' } : {}) });
    if (role === 'technician') await admin.doc(`technician_map_profiles/${uid}`).set({ technicianId: uid, fullName: 'Local fixture', approved: true, availability: 'available' });
    const app = initializeApp({ projectId, apiKey: 'emulator-only' }, uid), auth = getAuth(app), db = sdk.getFirestore(app);
    connectAuthEmulator(auth, `http://${hosts[1]}`, { disableWarnings: true }); sdk.connectFirestoreEmulator(db, hosts[0].split(':')[0], Number(hosts[0].split(':')[1]));
    await signInWithEmailAndPassword(auth, email, password); clients.set(uid, { app, auth, db });
  }
});
after(async () => { for (const client of clients.values()) { await sdk.terminate(client.db); await deleteApp(client.app); } await admin.terminate(); await deleteAdminApp(trusted); });
test('zero photos with no receipt or R2 configuration and one/two confirmed attachments persist atomically and retry once', async () => {
  const owner = clients.get('r2-owner'), service = requests(owner);
  for (const count of [0, 1, 2]) {
    const id = newId(), images = [];
    const receipt = sdk.doc(owner.db, 'booking_attempts', 'r2-owner', 'requests', id);
    assert.equal((await sdk.getDocFromServer(receipt)).exists(), false);
    await denied(sdk.getDocFromServer(sdk.doc(clients.get('r2-other').db, 'booking_attempts', 'r2-owner', 'requests', id)));
    for (let slot = 0; slot < count; slot++) images.push(await metadata(id, 'request', slot));
    await Promise.all([service.createServiceRequest(input(id, images)), service.createServiceRequest(input(id, images))]);
    assert.equal(await service.confirmServiceRequestAttempt('r2-owner', id), true); assert.deepEqual((await service.getServiceRequest(id)).imageUrls, images);
    assert.equal((await admin.collection('notifications').where('requestId', '==', id).get()).size, 1);
    await denied(sdk.getDocFromServer(sdk.doc(clients.get('r2-other').db, 'booking_attempts', 'r2-owner', 'requests', id)));
  }
});
test('clients cannot write/forge/read confirmation records, foreign/pending/expired/deleting/oversized/wrong-purpose attachments reject', async () => {
  const owner = clients.get('r2-owner'), service = requests(owner);
  const document = sdk.doc(owner.db, 'photo_objects', 'a'.repeat(64));
  await denied(sdk.setDoc(document, { provider: 'r2', state: 'confirmed' })); await denied(sdk.getDocFromServer(document));
  for (const extra of [{ ownerId: 'r2-other' }, { state: 'pending' }, { state: 'deleting' }, { expiresAt: new Date(0) }, { size: 2_000_000 }, { contentType: 'image/svg+xml' }, { purpose: 'before' }, { requestId: 'foreign-request' }]) {
    const id = newId(), image = await metadata(id, 'request', 0, extra);
    await assert.rejects(service.createServiceRequest(input(id, [image]))); assert.equal((await admin.doc(`service_requests/${id}`).get()).exists, false);
  }
  const id = newId(); await assert.rejects(service.createServiceRequest(input(id, [`r2:v1:${'f'.repeat(64)}`])));
  const own = await metadata(id, 'request'); await assert.rejects(service.createServiceRequest(input(id, [own, own])));
  await assert.rejects(service.createServiceRequest(input(id, [own, await metadata(id, 'request', 1), await metadata(id, 'request', 2)])));
  await assert.rejects(service.createServiceRequest(input(newId(), ['request_attachments/r2-owner/abcdefghijklmnopqrst/0'])));
});
test('three before/after photos, notes/signature/timer completion persist and completed evidence is immutable', async () => {
  const id = 'r2-completion', tech = clients.get('r2-tech'), service = evidence(tech); await job(id);
  await assert.rejects(requests(tech).updateTechnicianRequestStatus(id, 'completed'), /evidence/);
  for (const stage of ['before', 'after']) {
    const photos = []; for (let slot = 0; slot < 3; slot++) photos.push(await metadata(id, stage, slot));
    await service.saveJobEvidence(id, stage === 'before' ? 0 : 1, stage === 'before' ? { beforePhotos: photos } : { afterPhotos: photos });
  }
  await service.saveJobEvidence(id, 2, { notes: { ...notes, parts: Array.from({ length: 10 }, (_, i) => ({ name: `Part ${i}`, quantity: 1 })) } });
  await service.saveJobEvidence(id, 3, { signature });
  const saved = (await sdk.getDocFromServer(sdk.doc(clients.get('r2-owner').db, 'job_evidence', id))).data(); assert.equal(saved.beforePhotos.length, 3); assert.equal(saved.afterPhotos.length, 3);
  await requests(tech).updateTechnicianRequestStatus(id, 'completed'); await requests(tech).updateTechnicianRequestStatus(id, 'completed');
  assert.equal((await admin.doc(`service_requests/${id}`).get()).data().status, 'completed');
  assert.equal((await admin.doc(`job_evidence/${id}`).get()).data().signature.path, signature.path);
  await assert.rejects(service.saveJobEvidence(id, 4, { notes }));
  await denied(sdk.updateDoc(sdk.doc(tech.db, 'job_evidence', id), { beforePhotos: [], revision: 5, updatedAt: sdk.serverTimestamp() }));
});
test('unconfirmed/foreign/stage-forged and new legacy evidence cannot bypass completion; approved assignment and account gates remain', async () => {
  const id = 'r2-denied', tech = clients.get('r2-tech'); await job(id);
  const before = await metadata(id, 'before', 0, { state: 'pending' });
  await assert.rejects(evidence(tech).saveJobEvidence(id, 0, { beforePhotos: [before] }));
  await metadata(id, 'before');
  for (const uid of ['r2-foreign-tech', 'r2-other', 'r2-dispatcher']) await assert.rejects(evidence(clients.get(uid)).saveJobEvidence(id, 0, { beforePhotos: [before] }));
  await assert.rejects(evidence(tech).saveJobEvidence(id, 0, { afterPhotos: [before] }));
  await assert.rejects(evidence(tech).saveJobEvidence(id, 0, { beforePhotos: ['job_photos/r2-tech/r2-denied/before/ABCDEFGHIJKLMNOPQRST/0.jpg'] }));
  for (const change of [{ accountStatus: 'disabled' }, { accountStatus: 'deleted' }, { sessionRevokedAt: Math.floor(Date.now() / 1000) + 1 }, { technicianApprovalStatus: 'pending' }]) {
    await admin.doc('users/r2-tech').update(change);
    await assert.rejects(evidence(tech).saveJobEvidence(id, 0, { beforePhotos: [before] }));
    await admin.doc('users/r2-tech').set({ uid: 'r2-tech', role: 'technician', fullName: 'Local fixture', email: 'r2-tech@example.test', phone: 'Private', accountStatus: 'active', technicianApprovalStatus: 'approved', availability: 'available' });
  }
});
test('historical Firebase evidence can be retained alongside new R2 photos without changing signature policy', async () => {
  const id = 'r2-legacy', tech = clients.get('r2-tech'); await job(id);
  const legacy = `job_photos/r2-tech/${id}/before/ABCDEFGHIJKLMNOPQRST/0.jpg`;
  await admin.doc(`job_evidence/${id}`).set({ requestId: id, technicianId: 'r2-tech', customerId: 'r2-owner', revision: 1, beforePhotos: [legacy], afterPhotos: [], updatedAt: new Date() });
  const fresh = await metadata(id, 'before'); await evidence(tech).saveJobEvidence(id, 1, { beforePhotos: [legacy, fresh] });
  await evidence(tech).saveJobEvidence(id, 2, { signature });
  assert.deepEqual((await admin.doc(`job_evidence/${id}`).get()).data().beforePhotos, [legacy, fresh]);
});
