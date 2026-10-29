// Historical Firebase provider regression tests. New R2 booking/evidence security
// is covered by r2-photo-security-emulator.test.mjs and the Worker runtime tests.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as sdk from 'firebase/firestore';
import * as storage from 'firebase/storage';
const hosts = [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST, process.env.FIREBASE_STORAGE_EMULATOR_HOST];
if (!hosts.every((host) => /^(127\.0\.0\.1|localhost):\d+$/.test(host || ''))) throw Error('Loopback demo emulators required.');
const projectId = 'demo-servicepilot-review-author', bucket = projectId + '.appspot.com';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdminApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore'), { getAuth: adminAuth } = require('firebase-admin/auth');
const trusted = adminApp({ projectId }, 'legacy-request-photos'), admin = getFirestore(trusted), clients = new Map();
const job = 'legacy-private-photos', jpeg = new Uint8Array([255, 216, 255, 0]);
const paths = { request: `request_attachments/rf-owner/${job}/0`, before: `job_photos/rf-tech/${job}/before/ABCDEFGHIJKLMNOPQRST/0.jpg` };
before(async () => {
  sdk.setLogLevel('silent');
  for (const [uid, role] of [['rf-owner', 'customer'], ['rf-other', 'customer'], ['rf-tech', 'technician']]) {
    const email = `${uid}@example.test`, password = randomBytes(24).toString('base64url');
    await adminAuth(trusted).createUser({ uid, email, password, emailVerified: true });
    await admin.doc(`users/${uid}`).set({ uid, role, fullName: 'Local legacy fixture', accountStatus: 'active', ...(role === 'technician' ? { technicianApprovalStatus: 'approved' } : {}) });
    const app = initializeApp({ projectId, apiKey: 'emulator-only', storageBucket: bucket }, uid), auth = getAuth(app), db = sdk.getFirestore(app), store = storage.getStorage(app);
    connectAuthEmulator(auth, `http://${hosts[1]}`, { disableWarnings: true }); sdk.connectFirestoreEmulator(db, hosts[0].split(':')[0], Number(hosts[0].split(':')[1])); storage.connectStorageEmulator(store, hosts[2].split(':')[0], Number(hosts[2].split(':')[1]));
    await signInWithEmailAndPassword(auth, email, password); clients.set(uid, { app, auth, db, store });
  }
  await admin.doc(`service_requests/${job}`).set({ customerId: 'rf-owner', technicianId: 'rf-tech', status: 'completed', imageUrls: [paths.request] });
  await admin.doc(`job_evidence/${job}`).set({ requestId: job, customerId: 'rf-owner', technicianId: 'rf-tech', beforePhotos: [paths.before], afterPhotos: [], revision: 1 });
  // Storage emulator's documented owner bypass seeds historical files only.
  for (const path of Object.values(paths)) {
    const response = await fetch(`http://${hosts[2]}/v0/b/${bucket}/o?name=${encodeURIComponent(path)}&uploadType=media`, {
      method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'image/jpeg' }, body: jpeg,
    });
    assert.equal(response.status, 200);
  }
});
after(async () => { for (const client of clients.values()) { await sdk.terminate(client.db); await deleteApp(client.app); } await admin.terminate(); await deleteAdminApp(trusted); });
async function download(path, uid) {
  const headers = uid ? { Authorization: `Bearer ${await clients.get(uid).auth.currentUser.getIdToken()}` } : {};
  return (await fetch(`http://${hosts[2]}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`, { headers })).status;
}
test('historical private Firebase request/evidence photos remain viewable by participants and deny foreign/anonymous reads', async () => {
  for (const path of Object.values(paths)) {
    assert.equal(await download(path, 'rf-owner'), 200); assert.equal(await download(path, 'rf-tech'), 200);
    assert.equal(await download(path, 'rf-other'), 403); assert.equal(await download(path), 403);
  }
});
test('new Firebase scoped uploads and deletion of historical photos are disabled, without touching review policy', async () => {
  for (const [uid, path] of [['rf-owner', paths.request], ['rf-tech', paths.before]]) {
    const client = clients.get(uid);
    await assert.rejects(storage.uploadBytes(storage.ref(client.store, path + '-new'), jpeg, { contentType: 'image/jpeg' }), (e) => e.code === 'storage/unauthorized');
    await assert.rejects(storage.deleteObject(storage.ref(client.store, path)), (e) => e.code === 'storage/unauthorized');
  }
});
