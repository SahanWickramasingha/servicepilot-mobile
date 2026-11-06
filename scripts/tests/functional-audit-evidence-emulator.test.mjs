// Fresh current-policy fixtures distinguish application Rules failures from old fixtures.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as fs from 'firebase/firestore';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const projectId = 'demo-servicepilot-review-author';
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? '')) throw Error('Loopback demo emulators only.');
}
if (process.env.GCLOUD_PROJECT !== projectId) throw Error('Exact demo project required.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const adminApp = require('firebase-admin/app'), adminAuth = require('firebase-admin/auth'), adminDb = require('firebase-admin/firestore');
const policy = require('./lib/domain/legalPolicy.js');
const trusted = adminApp.initializeApp({ projectId }, 'audit-evidence-' + randomUUID()), db = adminDb.getFirestore(trusted), apps = [];
fs.setLogLevel('silent');
after(async () => { for (const client of apps) { await fs.terminate(client.db); await deleteApp(client.app); } await db.terminate(); await adminApp.deleteApp(trusted); });
async function fixture() {
  const uid = 'audit-evidence-' + randomUUID(), email = uid + '@example.test', password = randomUUID(), requestId = 'audit-job-' + randomUUID(), customerId = 'audit-customer-' + randomUUID();
  await adminAuth.getAuth(trusted).createUser({ uid, email, password, emailVerified: true });
  await db.doc('users/' + uid).set({ uid, email, role: 'technician', accountStatus: 'active', technicianApprovalStatus: 'approved', emailVerified: true,
    termsVersion: policy.TERMS_VERSION, privacyPolicyVersion: policy.PRIVACY_POLICY_VERSION, acceptedAt: new Date() });
  await db.doc('users/' + customerId).set({ uid: customerId, role: 'customer', accountStatus: 'active', fullName: 'Audit Customer' });
  await db.doc('service_requests/' + requestId).set({ technicianId: uid, customerId, status: 'in_progress', title: 'Audit fixture' });
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, uid), auth = getAuth(app), database = fs.getFirestore(app);
  connectAuthEmulator(auth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); fs.connectFirestoreEmulator(database, host, Number(port));
  await signInWithEmailAndPassword(auth, email, password); apps.push({ app, db: database });
  const config = { auth, db: database };
  const policyService = loadService('src/services/policy.service.ts', { '@/src/firebase/config': config, 'firebase/firestore': fs });
  const service = loadService('src/services/jobEvidence.service.ts', {
    '@/src/firebase/config': config, 'firebase/firestore': fs, './policy.service': policyService,
    'expo-image-picker': {}, './reviewPhotos.service': {}, './privatePhotos.service': { confirmPrivatePhoto: async () => {} },
    '@/src/utils/reviewValidation': loadService('src/utils/reviewValidation.ts', {}),
    '@/functions/src/domain/jobEvidence': loadService('functions/src/domain/jobEvidence.ts', {}),
    '@/functions/src/domain/booking': loadService('functions/src/domain/booking.ts', {}),
  });
  const photo = async (stage, slot) => {
    const id = createHash('sha256').update(requestId + stage + slot).digest('hex');
    await db.doc('photo_objects/' + id).set({ id, provider: 'r2', ownerId: uid, requestId, purpose: stage, state: 'confirmed',
      size: 4, contentType: 'image/jpeg', expiresAt: new Date(Date.now() + 86400000) });
    return 'r2:v1:' + id;
  };
  const requests = loadService('src/services/request.service.ts', { '@/src/firebase/config': config, 'firebase/firestore': fs,
    '@/functions/src/domain/availability': require('./lib/domain/availability.js'),
    './policy.service': policyService, '@/src/constants/serviceRequests': loadService('src/constants/serviceRequests.ts', {}) });
  return { uid, customerId, requestId, service, requests, photo, database };
}
test('current-policy accepted technician can save valid notes through the actual policy, service, transaction and Rules', async () => {
  const f = await fixture();
  await f.service.saveJobEvidence(f.requestId, 0, { notes: { diagnosis: 'Valid diagnosis', workCompleted: 'Valid completed work', recommendation: '', parts: [] } });
  assert.equal((await fs.getDocFromServer(fs.doc(f.database, 'job_evidence', f.requestId))).data().revision, 1);
});
test('current-policy accepted technician can save three confirmed photos per stage and ten parts without exhausting Rules', async () => {
  const f = await fixture();
  await f.service.saveJobEvidence(f.requestId, 0, { beforePhotos: await Promise.all([0, 1, 2].map(slot => f.photo('before', slot))) });
  console.log('[audit-evidence-stage] beforePhotos-three: saved');
  await f.service.saveJobEvidence(f.requestId, 1, { afterPhotos: await Promise.all([0, 1, 2].map(slot => f.photo('after', slot))) });
  console.log('[audit-evidence-stage] afterPhotos-three: saved');
  await f.service.saveJobEvidence(f.requestId, 2, { notes: { diagnosis: 'Valid diagnosis', workCompleted: 'Valid completed work', recommendation: '',
    parts: Array.from({ length: 10 }, (_, index) => ({ name: 'Part ' + index, quantity: 1 })) } });
  assert.equal((await fs.getDocFromServer(fs.doc(f.database, 'job_evidence', f.requestId))).data().revision, 3);
});

test('maximum notes/parts/signature persist, incomplete completion fails atomically, complete replay has one notice', async () => {
  const f = await fixture();
  await assert.rejects(f.requests.updateTechnicianRequestStatus(f.requestId, 'completed'));
  assert.equal((await db.doc('service_requests/' + f.requestId).get()).data().status, 'in_progress');
  assert.equal((await db.collection('notifications').where('requestId', '==', f.requestId).get()).size, 0);
  await f.service.saveJobEvidence(f.requestId, 0, { beforePhotos: await Promise.all([0, 1, 2].map(slot => f.photo('before', slot))) });
  await f.service.saveJobEvidence(f.requestId, 1, { afterPhotos: await Promise.all([0, 1, 2].map(slot => f.photo('after', slot))) });
  const notes = { diagnosis: 'd'.repeat(3000), workCompleted: 'w'.repeat(3000), recommendation: 'r'.repeat(3000),
    parts: Array.from({ length: 10 }, () => ({ name: 'p'.repeat(100), quantity: 999 })) };
  await f.service.saveJobEvidence(f.requestId, 2, { notes });
  await f.service.saveJobEvidence(f.requestId, 3, { signature: { customerName: 'c'.repeat(100), path: 'M0,0 ' + 'L1,1 '.repeat(2998), confirmed: true } });
  const saved = (await fs.getDocFromServer(fs.doc(f.database, 'job_evidence', f.requestId))).data();
  assert.deepEqual(saved.notes, notes); assert.equal(saved.revision, 4); assert.ok(saved.signature.signedAt instanceof fs.Timestamp);
  await f.requests.updateTechnicianRequestStatus(f.requestId, 'completed');
  await f.requests.updateTechnicianRequestStatus(f.requestId, 'completed');
  assert.equal((await db.doc('service_requests/' + f.requestId).get()).data().status, 'completed');
  assert.equal((await db.collection('notifications').where('requestId', '==', f.requestId).get()).size, 1);
  await assert.rejects(fs.updateDoc(fs.doc(f.database, 'job_evidence', f.requestId), { revision: 5, updatedAt: fs.serverTimestamp() }), error => error.code === 'permission-denied');
});

test('every part including the tenth remains validated; invalid writes roll back without changing the revision', async () => {
  const f = await fixture(), reference = fs.doc(f.database, 'job_evidence', f.requestId);
  const notes = { diagnosis: 'Valid diagnosis', workCompleted: 'Valid completed work', recommendation: '', parts: [] };
  await f.service.saveJobEvidence(f.requestId, 0, { notes });
  for (const part of [{ name: '', quantity: 1 }, { name: '   ', quantity: 1 }, { name: 'x'.repeat(101), quantity: 1 },
    { name: 'Valid', quantity: 0 }, { name: 'Valid', quantity: 1000 }, { name: 'Valid', quantity: 1.5 }, { name: 'Valid', quantity: '1' },
    { name: [], quantity: 1 }, { name: 'Valid', quantity: 1, trusted: true }, null]) {
    const parts = [...Array.from({ length: 9 }, () => ({ name: 'Valid', quantity: 1 })), part];
    await assert.rejects(fs.updateDoc(reference, { notes: { ...notes, parts }, notesUpdatedAt: fs.serverTimestamp(), revision: 2, updatedAt: fs.serverTimestamp() }), error => error.code === 'permission-denied');
  }
  for (const parts of [{}, Array.from({ length: 11 }, () => ({ name: 'Valid', quantity: 1 }))]) {
    await assert.rejects(fs.updateDoc(reference, { notes: { ...notes, parts }, notesUpdatedAt: fs.serverTimestamp(), revision: 2, updatedAt: fs.serverTimestamp() }), error => error.code === 'permission-denied');
  }
  const saved = (await fs.getDocFromServer(reference)).data(); assert.equal(saved.revision, 1); assert.deepEqual(saved.notes, notes);
});

test('ownership, confirmed photo references, author status and revision concurrency remain authoritative', async () => {
  const f = await fixture(), other = await fixture(), reference = fs.doc(f.database, 'job_evidence', f.requestId);
  const before = [await f.photo('before', 0)]; await f.service.saveJobEvidence(f.requestId, 0, { beforePhotos: before });
  await assert.rejects(fs.getDocFromServer(fs.doc(other.database, 'job_evidence', f.requestId)), error => error.code === 'permission-denied');
  const update = patch => fs.updateDoc(reference, { ...patch, revision: 2, updatedAt: fs.serverTimestamp() });
  for (const patch of [{ customerId: other.customerId }, { technicianId: other.uid },
    { beforePhotos: ['r2:v1:' + 'f'.repeat(64)] }, { afterPhotos: before }, { beforePhotos: [await other.photo('before', 0)] }]) {
    await assert.rejects(update(patch), error => error.code === 'permission-denied');
  }
  for (const status of [{ accountStatus: 'disabled' }, { accountStatus: 'deleted' }, { lifecyclePending: true }, { sessionRevokedAt: 9999999999 }]) {
    await db.doc('users/' + f.uid).update(status);
    await assert.rejects(update({ beforePhotos: before }), error => error.code === 'permission-denied');
    await db.doc('users/' + f.uid).update({ accountStatus: 'active', lifecyclePending: false, sessionRevokedAt: adminDb.FieldValue.delete() });
  }
  const a = { diagnosis: 'Valid diagnosis A', workCompleted: 'Valid completed work', recommendation: '', parts: [] };
  const b = { ...a, diagnosis: 'Valid diagnosis B' };
  const results = await Promise.allSettled([a, b].map(notes => f.service.saveJobEvidence(f.requestId, 1, { notes })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await fs.getDocFromServer(reference)).data().revision, 2);
});
