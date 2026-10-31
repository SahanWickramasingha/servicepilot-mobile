import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as firestore from 'firebase/firestore';
for (const value of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(value ?? '')) throw Error('Loopback demo emulators required; no production writes.');
}
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { buildMapProfile } = require('./lib/domain/mapProjection.js');
const projectId = 'demo-servicepilot-categories', app = adminApp({ projectId }), db = getFirestore(app), clients = [];
const prefix = 'category-' + randomUUID().slice(0, 8);
async function session(suffix, role = 'technician') {
  const uid = prefix + suffix, email = uid + '@example.test', password = randomUUID();
  await adminAuth(app).createUser({ uid, email, password, emailVerified: true });
  const source = { uid, fullName: uid, email, phone: '0812345678', address: 'Private fixture', role, accountStatus: 'active', emailVerified: true,
    ...(role === 'technician' ? { specialization: 'Electrical', technicianApprovalStatus: 'approved', availability: 'available', serviceDistrictIds: ['kandy'] } : {}) };
  await db.doc('users/' + uid).set(source);
  if (role === 'technician') await db.doc('technician_map_profiles/' + uid).set({ ...buildMapProfile(uid, source), updatedAt: Timestamp.now() });
  const client = initializeApp({ projectId, apiKey: 'emulator-only' }, uid), auth = getAuth(client), clientDb = firestore.getFirestore(client);
  connectAuthEmulator(auth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); firestore.connectFirestoreEmulator(clientDb, host, Number(port));
  await signInWithEmailAndPassword(auth, email, password);
  const value = { app: client, db: clientDb, auth, uid, source }; clients.push(value); return value;
}
const userRef = client => firestore.doc(client.db, 'users', client.uid);
const projectionRef = (client, uid = client.uid) => firestore.doc(client.db, 'technician_map_profiles', uid);
function changeCategory(client, source, id, label) {
  const batch = firestore.writeBatch(client.db), updated = { ...source, serviceCategoryId: id, specialization: label };
  batch.update(userRef(client), { serviceCategoryId: id, specialization: label, updatedAt: firestore.serverTimestamp() });
  batch.set(projectionRef(client), { ...buildMapProfile(client.uid, updated), updatedAt: firestore.serverTimestamp() }); return batch.commit();
}
after(async () => { for (const client of clients) { await firestore.terminate(client.db); await deleteApp(client.app); } await db.terminate(); await deleteAdmin(app); });
test('owner category correction is canonical and atomic; role/approval/rating and foreign-account boundaries remain protected', async () => {
  const tech = await session('-owner'), foreign = await session('-foreign');
  await changeCategory(tech, tech.source, 'plumbing', 'Plumbing');
  assert.equal((await db.doc('users/' + tech.uid).get()).data().role, 'technician');
  assert.equal((await db.doc('technician_map_profiles/' + tech.uid).get()).data().serviceCategoryId, 'plumbing');
  await assert.rejects(firestore.updateDoc(userRef(tech), { serviceCategoryId: 'electrical', specialization: 'Electrical', updatedAt: firestore.serverTimestamp() }), e => e.code === 'permission-denied');
  await assert.rejects(changeCategory(tech, tech.source, 'customer', 'Customer'), e => e.code === 'permission-denied');
  await assert.rejects(firestore.updateDoc(firestore.doc(foreign.db, 'users', tech.uid), { serviceCategoryId: 'other', specialization: 'Other' }), e => e.code === 'permission-denied');
  for (const patch of [{ role: 'dispatcher' }, { technicianApprovalStatus: 'pending' }, { averageRating: 5 }]) {
    await assert.rejects(firestore.updateDoc(userRef(tech), patch), e => e.code === 'permission-denied');
  }
  await assert.rejects(firestore.updateDoc(projectionRef(tech), { averageRating: 5, updatedAt: firestore.serverTimestamp() }), e => e.code === 'permission-denied');
});
test('dispatcher approval can normalize a confirmed legacy category but cannot substitute a different specialty', async () => {
  const tech = await session('-pending'), dispatcher = await session('-dispatcher', 'dispatcher');
  const source = { ...tech.source, specialization: '  AC  technician ', technicianApprovalStatus: 'pending' };
  await db.doc('users/' + tech.uid).set(source);
  for (const [id, label, allowed] of [['electrical', 'Electrical', false], ['air-conditioning', 'Air Conditioning', true]]) {
    const batch = firestore.writeBatch(dispatcher.db), updated = { ...source, serviceCategoryId: id, specialization: label, technicianApprovalStatus: 'approved' };
    batch.update(firestore.doc(dispatcher.db, 'users', tech.uid), { technicianApprovalStatus: 'approved', serviceCategoryId: id, specialization: label,
      reviewedBy: dispatcher.uid, reviewedAt: firestore.serverTimestamp(), updatedAt: firestore.serverTimestamp() });
    batch.set(projectionRef(dispatcher, tech.uid), { ...buildMapProfile(tech.uid, updated), updatedAt: firestore.serverTimestamp() });
    if (allowed) await batch.commit(); else await assert.rejects(batch.commit(), e => e.code === 'permission-denied');
  }
  assert.equal((await db.doc('technician_map_profiles/' + tech.uid).get()).data().serviceCategory, 'Air Conditioning');
});
test('category-compatible directory queries retain customer verification and current disabled-account visibility checks', async () => {
  const tech = await session('-visible'), customer = await session('-customer', 'customer');
  const query = firestore.query(firestore.collection(customer.db, 'technician_map_profiles'), firestore.where('approved', '==', true),
    firestore.where('serviceCategory', 'in', ['Electrical', '']), firestore.where('serviceDistrictIds', 'array-contains', 'kandy'), firestore.limit(8));
  assert.ok((await firestore.getDocsFromServer(query)).size > 0);
  assert.equal((await firestore.getDocFromServer(projectionRef(customer, tech.uid))).exists(), true);
  await db.doc('users/' + tech.uid).update({ accountStatus: 'disabled' });
  await assert.rejects(firestore.getDocFromServer(projectionRef(customer, tech.uid)), e => e.code === 'permission-denied');
  await assert.rejects(firestore.getDocFromServer(firestore.doc(customer.db, 'users', tech.uid)), e => e.code === 'permission-denied');
});
