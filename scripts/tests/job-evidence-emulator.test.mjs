import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as fsdk from 'firebase/firestore';
import * as ssdk from 'firebase/storage';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const hosts = [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST, process.env.FIREBASE_STORAGE_EMULATOR_HOST];
if (!hosts.every((h) => /^(127\.0\.0\.1|localhost):\d+$/.test(h || ''))) throw new Error('Loopback Auth, Firestore and Storage emulators required.');
const projectId = 'demo-servicepilot-review-author', bucket = `${projectId}.appspot.com`;
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdminApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const trusted = adminApp({ projectId }, 'job-evidence-tests'), admin = getFirestore(trusted), clients = new Map();
const domain = loadService('functions/src/domain/jobEvidence.ts', {});
const attempt = 'abcdefghijklmnopqrst';
const objectPath = (job, stage = 'before', slot = 0) => `job_photos/jw-tech/${job}/${stage}/${attempt}/${slot}.jpg`;
const r2Path = (job, stage = 'before', slot = 0) => 'r2:v1:' + createHash('sha256').update(job + ':' + stage + ':' + slot).digest('hex');
async function confirm(id, stage = 'before', slot = 0) {
  const photoId = r2Path(id, stage, slot).slice(6);
  await admin.doc('photo_objects/' + photoId).set({ id: photoId, provider: 'r2', ownerId: 'jw-tech', requestId: id, purpose: stage, state: 'confirmed', size: 4, contentType: 'image/jpeg', expiresAt: new Date(Date.now() + 86400000) });
}
const notes = { diagnosis: 'Local diagnostic', workCompleted: 'Local repair', recommendation: '', parts: [{ name: 'Part', quantity: 1 }] };
const signature = { customerName: 'Local customer', path: 'M10.0,10.0 L40.0,50.0 L80.0,20.0 ', confirmed: true };
const denied = (promise) => assert.rejects(promise, (error) => ['permission-denied', 'storage/unauthorized'].includes(error.code));
const config = (client) => ({ auth: client.auth, db: client.db, storage: client.storage });
function evidenceService(client, firestore = fsdk) {
  return loadService('src/services/jobEvidence.service.ts', { '@/src/firebase/config': config(client),
    'firebase/firestore': firestore, 'firebase/storage': ssdk, 'expo-image-picker': {}, './reviewPhotos.service': {}, './privatePhotos.service': { confirmPrivatePhoto: async () => {} },
    '@/src/utils/reviewValidation': loadService('src/utils/reviewValidation.ts', {}), '@/functions/src/domain/jobEvidence': domain,
    '@/functions/src/domain/booking': loadService('functions/src/domain/booking.ts', {}) });
}
function requestService(client) {
  return loadService('src/services/request.service.ts', { '@/src/firebase/config': config(client), 'firebase/firestore': fsdk,
    '@/functions/src/domain/availability': loadService('functions/src/domain/availability.ts', {}),
    '@/src/constants/serviceRequests': loadService('src/constants/serviceRequests.ts', {}) });
}
async function job(id, status = 'in_progress') { await admin.doc(`service_requests/${id}`).set({ technicianId: 'jw-tech', customerId: 'jw-owner', status, title: 'Local service evidence test' }); }
function metadata(id, stage = 'before') { return { contentType: 'image/jpeg', customMetadata: { requestId: id, technicianId: 'jw-tech', stage, attemptId: attempt } }; }
async function upload(id, stage = 'before', client = clients.get('jw-tech'), bytes = new Uint8Array([255, 216, 255, 0]), meta = metadata(id, stage), path = objectPath(id, stage)) {
  return ssdk.uploadBytes(ssdk.ref(client.storage, path), bytes, meta);
}
async function download(id, client, stage = 'before') {
  const response = await fetch(`http://${hosts[2]}/v0/b/${bucket}/o/${encodeURIComponent(objectPath(id, stage))}?alt=media`,
    { headers: client ? { Authorization: `Bearer ${await client.auth.currentUser.getIdToken()}` } : {} });
  return response.status;
}
before(async () => {
  fsdk.setLogLevel('silent');
  for (const [uid, role, active = true] of [['jw-tech', 'technician'], ['jw-other-tech', 'technician'], ['jw-owner', 'customer'],
    ['jw-other', 'customer'], ['jw-dispatcher', 'dispatcher'], ['jw-admin', 'super_admin'], ['jw-disabled', 'technician', false]]) {
    const email = `${uid}@example.test`, credential = randomBytes(24).toString('base64url');
    await adminAuth(trusted).createUser({ uid, email, password: credential, emailVerified: true });
    await admin.doc(`users/${uid}`).set({ uid, role, fullName: 'Local fixture', accountStatus: active ? 'active' : 'disabled', emailVerified: true,
      ...(role === 'technician' ? { technicianApprovalStatus: 'approved', availability: 'offline' } : {}) });
    const app = initializeApp({ projectId, apiKey: 'emulator-only', storageBucket: bucket }, uid), auth = getAuth(app);
    connectAuthEmulator(auth, `http://${hosts[1]}`, { disableWarnings: true });
    const db = fsdk.getFirestore(app), storage = ssdk.getStorage(app);
    fsdk.connectFirestoreEmulator(db, hosts[0].split(':')[0], Number(hosts[0].split(':')[1]));
    ssdk.connectStorageEmulator(storage, hosts[2].split(':')[0], Number(hosts[2].split(':')[1]));
    storage.maxUploadRetryTime = 1000; storage.maxOperationRetryTime = 1000;
    await signInWithEmailAndPassword(auth, email, credential); clients.set(uid, { app, auth, db, storage });
  }
});
after(async () => { for (const client of clients.values()) { await fsdk.terminate(client.db); await deleteApp(client.app); } await admin.terminate(); await deleteAdminApp(trusted); });

test('job photos save/reopen for the assigned technician and owning customer; completion is atomic, idempotent and leaves availability unchanged', async () => {
  const id = 'jw-complete'; await job(id); const tech = clients.get('jw-tech'), service = evidenceService(tech), requests = requestService(tech);
  await assert.rejects(requests.updateTechnicianRequestStatus(id, 'completed'), /evidence/);
  for (const stage of ['before', 'after']) {
    await confirm(id, stage); await service.saveJobEvidence(id, stage === 'before' ? 0 : 1, stage === 'before' ? { beforePhotos: [r2Path(id)] } : { afterPhotos: [r2Path(id, 'after')] });
  }
  await service.saveJobEvidence(id, 2, { notes }); await service.saveJobEvidence(id, 3, { signature });
  const saved = (await fsdk.getDocFromServer(fsdk.doc(clients.get('jw-owner').db, 'job_evidence', id))).data();
  assert.equal(saved.notes.workCompleted, notes.workCompleted); assert.equal(saved.signature.path, signature.path); assert.equal(saved.beforePhotos[0], r2Path(id));
  await denied(upload(id)); // New legacy Firebase uploads are intentionally disabled.
  assert.equal(await download(id, clients.get('jw-other')), 403); assert.equal(await download(id, undefined), 403);
  await requests.updateTechnicianRequestStatus(id, 'completed'); await requests.updateTechnicianRequestStatus(id, 'completed');
  assert.equal((await admin.doc(`service_requests/${id}`).get()).data().status, 'completed');
  assert.equal((await admin.doc('users/jw-tech').get()).data().availability, 'offline');
  assert.equal((await admin.collection('notifications').where('requestId', '==', id).get()).size, 1);
  await assert.rejects(service.saveJobEvidence(id, 4, { notes: { ...notes, diagnosis: 'Changed' } }), /eligible job/);
  await denied(ssdk.deleteObject(ssdk.ref(tech.storage, objectPath(id))));
});
test('cross-account reads/writes, direct completion without evidence, spoofed ownership/stage and invalid signature/notes are denied', async () => {
  const id = 'jw-denied'; await job(id); const tech = clients.get('jw-tech');
  for (const uid of ['jw-other-tech', 'jw-other', 'jw-dispatcher', 'jw-disabled']) {
    await denied(fsdk.getDocFromServer(fsdk.doc(clients.get(uid).db, 'job_evidence', id)));
    await denied(upload(id, 'before', clients.get(uid)));
  }
  await denied(fsdk.updateDoc(fsdk.doc(tech.db, 'service_requests', id), { status: 'completed', completedAt: fsdk.serverTimestamp(), updatedAt: fsdk.serverTimestamp() }));
  const base = { requestId: id, technicianId: 'jw-tech', customerId: 'jw-owner', revision: 1, beforePhotos: [], afterPhotos: [], updatedAt: fsdk.serverTimestamp() };
  for (const change of [{ customerId: 'jw-other' }, { notes: { ...notes, workCompleted: '' }, notesUpdatedAt: fsdk.serverTimestamp() }, { signature: { ...signature, path: '<svg/>', signedAt: fsdk.serverTimestamp() } },
    { beforePhotos: [objectPath(id, 'after')] }, { beforePhotos: [objectPath(id).replace('jw-tech/', 'jw-other-tech/')] }]) {
    await denied(fsdk.setDoc(fsdk.doc(tech.db, 'job_evidence', id), { ...base, ...change }));
  }
  await denied(upload(id, 'before', tech, new Uint8Array([1]), { ...metadata(id), contentType: 'text/plain' }));
  await denied(upload(id, 'before', tech, new Uint8Array(5 * 1024 * 1024 + 1)));
  await denied(upload(id, 'before', tech, undefined, metadata(id), objectPath(id).replace('/0.jpg', '/3.jpg')));
});
test('persisted R2 evidence preserves stale-revision and disabled-owner protections', async () => {
  const id = 'jw-partial'; await job(id); const tech = clients.get('jw-tech'), service = evidenceService(tech);
  await confirm(id); await service.saveJobEvidence(id, 0, { beforePhotos: [r2Path(id)] });
  await assert.rejects(service.saveJobEvidence(id, 0, { notes }), /changed on another screen/);
  await admin.doc('users/jw-tech').update({ accountStatus: 'disabled' });
  try { await denied(fsdk.getDocFromServer(fsdk.doc(tech.db, 'job_evidence', id))); }
  finally { await admin.doc('users/jw-tech').update({ accountStatus: 'active' }); }
});

test('the supported maximum of three photos per stage and ten parts remains writable within Rules evaluation limits', async () => {
  const id = 'jw-maximum'; await job(id); const tech = clients.get('jw-tech'), service = evidenceService(tech);
  for (const stage of ['before', 'after']) {
    const paths = [];
    for (let index = 0; index < 3; index++) { paths.push(r2Path(id, stage, index)); await confirm(id, stage, index); }
    await service.saveJobEvidence(id, stage === 'before' ? 0 : 1, stage === 'before' ? { beforePhotos: paths } : { afterPhotos: paths });
  }
  const full = { ...notes, parts: Array.from({ length: 10 }, (_, i) => ({ name: `Local part ${i}`, quantity: 999 })) };
  await assert.doesNotReject(service.saveJobEvidence(id, 2, { notes: full }), 'Maximum notes must save within the Rules expression budget');
  await service.saveJobEvidence(id, 2, { notes: { parts: full.parts, recommendation: '', workCompleted: full.workCompleted, diagnosis: full.diagnosis } });
  await assert.doesNotReject(service.saveJobEvidence(id, 3, { signature }), 'Signature must save with maximum notes/photos retained');
  await requestService(tech).updateTechnicianRequestStatus(id, 'completed');
  assert.equal((await admin.doc(`job_evidence/${id}`).get()).data().revision, 4);
});

test('server timestamp timers survive reopen, race safely, finalize with completion and deny forged or foreign timer writes', async () => {
  const id = 'jw-timer'; await job(id, 'accepted');
  const tech = clients.get('jw-tech'), requests = requestService(tech), service = evidenceService(tech);
  const reference = fsdk.doc(tech.db, 'service_requests', id);
  await requests.updateTechnicianRequestStatus(id, 'in_progress');
  let saved = (await fsdk.getDocFromServer(reference)).data();
  assert.equal(saved.workTimer.elapsedMs, 0); assert.equal(saved.workTimer.pausedAt, null);
  await Promise.all([requests.setJobTimerPaused(id, true, 0), requests.setJobTimerPaused(id, true, 0)]);
  saved = (await fsdk.getDocFromServer(reference)).data();
  assert.equal(saved.workTimer.revision, 1); assert.ok(saved.workTimer.pausedAt.toMillis() >= saved.startedAt.toMillis());
  const pausedElapsed = Math.floor(saved.workTimer.pausedAt.toMillis()) - Math.floor(saved.workTimer.runningSince.toMillis());
  await requests.setJobTimerPaused(id, false, 1);
  saved = (await fsdk.getDocFromServer(reference)).data();
  assert.equal(saved.workTimer.revision, 2); assert.equal(saved.workTimer.elapsedMs, pausedElapsed);
  await assert.rejects(requests.setJobTimerPaused(id, true, 1), /another screen/);
  await denied(fsdk.updateDoc(reference, { workTimer: { ...saved.workTimer, elapsedMs: -10 }, updatedAt: fsdk.serverTimestamp() }));
  await denied(fsdk.updateDoc(reference, { workTimer: { ...saved.workTimer, elapsedMs: 999999999, revision: 3, pausedAt: fsdk.serverTimestamp() }, updatedAt: fsdk.serverTimestamp() }));
  for (const uid of ['jw-owner', 'jw-other-tech', 'jw-dispatcher', 'jw-disabled']) {
    await denied(fsdk.updateDoc(fsdk.doc(clients.get(uid).db, 'service_requests', id), {
      workTimer: { ...saved.workTimer, pausedAt: fsdk.serverTimestamp(), revision: 3 }, updatedAt: fsdk.serverTimestamp(),
    }));
  }
  for (const stage of ['before', 'after']) { await confirm(id, stage); await service.saveJobEvidence(id, stage === 'before' ? 0 : 1,
    stage === 'before' ? { beforePhotos: [r2Path(id)] } : { afterPhotos: [r2Path(id, 'after')] }); }
  await service.saveJobEvidence(id, 2, { notes }); await service.saveJobEvidence(id, 3, { signature });
  const evidence = (await admin.doc(`job_evidence/${id}`).get()).data(); assert.ok(evidence.notesUpdatedAt.toMillis() > 0);
  // A pause competing with completion can fail because completion wins; neither
  // outcome can leave a running finalized timer or a timer write after completion.
  const results = await Promise.allSettled([requests.setJobTimerPaused(id, true, 2), requests.updateTechnicianRequestStatus(id, 'completed')]);
  assert.equal(results[1].status, 'fulfilled');
  saved = (await fsdk.getDocFromServer(reference)).data(); assert.equal(saved.status, 'completed'); assert.ok(saved.workTimer.pausedAt);
  await requests.updateTechnicianRequestStatus(id, 'completed');
  await assert.rejects(requests.setJobTimerPaused(id, false, saved.workTimer.revision), /in-progress/);
  assert.equal((await admin.collection('notifications').where('requestId', '==', id).get()).size, 2);
});

test('legacy in-progress jobs initialize a timer from their saved start and missing start is never invented', async () => {
  const id = 'jw-legacy-timer'; await job(id);
  await admin.doc(`service_requests/${id}`).update({ startedAt: new Date(Date.now() - 60000) });
  const service = requestService(clients.get('jw-tech'));
  await service.setJobTimerPaused(id, true, 0); await service.setJobTimerPaused(id, false, 1);
  const timer = (await admin.doc(`service_requests/${id}`).get()).data().workTimer;
  assert.ok(timer.elapsedMs >= 60000); assert.equal(timer.revision, 2);
  await job('jw-no-start'); await assert.rejects(service.setJobTimerPaused('jw-no-start', true, 0), /no recorded start/);
});

test('authoritative evidence rules reject account and job changes after preflight without saving stale notes', async () => {
  const tech = clients.get('jw-tech');
  for (const variant of ['account', 'status']) {
    const id = `jw-preflight-${variant}`; await job(id);
    const service = evidenceService(tech, { ...fsdk, runTransaction: async (...args) => {
      if (variant === 'account') await admin.doc('users/jw-tech').update({ accountStatus: 'disabled' });
      else await admin.doc(`service_requests/${id}`).update({ status: 'completed' });
      return fsdk.runTransaction(...args);
    } });
    try { await denied(service.saveJobEvidence(id, 0, { notes })); }
    finally { await admin.doc('users/jw-tech').update({ accountStatus: 'active' }); }
    assert.equal((await admin.doc(`job_evidence/${id}`).get()).exists, false);
  }
});

test('optimized notes validation fails closed on malformed parts and forged audit timestamps; unchanged legacy notes stay usable', async () => {
  const id = 'jw-parts-types'; await job(id); const tech = clients.get('jw-tech');
  const base = { requestId: id, technicianId: 'jw-tech', customerId: 'jw-owner', revision: 1,
    beforePhotos: [], afterPhotos: [], updatedAt: fsdk.serverTimestamp(), notesUpdatedAt: fsdk.serverTimestamp() };
  for (const part of [null, {}, 42, { name: ['Part'], quantity: 1 }, { name: 1, quantity: 1 },
    { name: ' ', quantity: 1 }, { name: 'Part', quantity: 1.5 }, { name: 'Part', quantity: '1' },
    { name: 'Part', quantity: 0 }, { name: 'Part', quantity: 1000 }, { name: 'Part', quantity: 1, approved: true }]) {
    await denied(fsdk.setDoc(fsdk.doc(tech.db, 'job_evidence', id), { ...base, notes: { ...notes, parts: [part] } }));
  }
  await denied(fsdk.setDoc(fsdk.doc(tech.db, 'job_evidence', id), { ...base, notes, notesUpdatedAt: fsdk.Timestamp.fromMillis(1000) }));
  const legacy = 'jw-legacy-notes'; await job(legacy);
  await admin.doc(`job_evidence/${legacy}`).set({ requestId: legacy, technicianId: 'jw-tech', customerId: 'jw-owner', revision: 1,
    beforePhotos: [], afterPhotos: [], notes, updatedAt: new Date() });
  await evidenceService(tech).saveJobEvidence(legacy, 1, { signature });
  const saved = (await admin.doc(`job_evidence/${legacy}`).get()).data();
  assert.deepEqual(saved.notes, notes); assert.equal(saved.notesUpdatedAt, undefined);
});
