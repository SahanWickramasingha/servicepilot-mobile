// Real client service + real Rules, disposable loopback demo data only.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';

for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? '')) throw Error('Loopback demo emulators required.');
}
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const projection = require('./lib/domain/mapProjection.js');
const projectId = 'demo-servicepilot-categories', trusted = adminApp({ projectId }), db = getFirestore(trusted), clients = [];
const deployed = process.env.PROFILE_SAVE_RULES === 'deployed';
const userRef = client => firestore.doc(client.db, 'users', client.uid);
const mapRef = client => firestore.doc(client.db, 'technician_map_profiles', client.uid);
const denied = action => assert.rejects(action, e => e.code === 'permission-denied');
const input = { fullName: 'Updated Technician', phone: '0812345678', address: 'Private address',
  serviceCategoryId: 'plumbing', serviceDistrictIds: ['kandy'], serviceAreasByDistrict: {} };

async function session(patch = {}, { verified = true, projectionExists = true } = {}) {
  const uid = 'save-' + randomUUID(), email = uid + '@example.test', password = randomUUID();
  await adminAuth(trusted).createUser({ uid, email, password, emailVerified: verified });
  const source = { uid, email, fullName: 'Technician', phone: '0812345678', address: 'Private address',
    role: 'technician', emailVerified: verified, accountStatus: 'active', technicianApprovalStatus: 'approved',
    termsVersion: '2026-11-02.1', privacyPolicyVersion: '2026-11-02.1', acceptedAt: Timestamp.now(),
    specialization: 'Electrical', serviceDistrictIds: ['kandy'], ...patch };
  await db.doc('users/' + uid).set(source);
  if (projectionExists) await db.doc('technician_map_profiles/' + uid).set({ ...projection.buildMapProfile(uid, source), updatedAt: Timestamp.now() });
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, uid), auth = getAuth(app), clientDb = firestore.getFirestore(app);
  connectAuthEmulator(auth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  firestore.connectFirestoreEmulator(clientDb, host, Number(port));
  await signInWithEmailAndPassword(auth, email, password);
  const service = loadService('src/services/user.service.ts', {
    '@/src/firebase/config': { auth, db: clientDb }, 'firebase/firestore': firestore,
    '@/functions/src/domain/mapProjection': projection,
    '@/functions/src/domain/availability': require('./lib/domain/availability.js'),
    '@/functions/src/domain/serviceAreas': require('./lib/domain/serviceAreas.js'),
    '@/src/utils/registrationDebug': {},
  });
  const client = { uid, source, app, auth, db: clientDb, service }; clients.push(client); return client;
}
async function saved(client) {
  return { user: (await db.doc('users/' + client.uid).get()).data(), map: (await db.doc('technician_map_profiles/' + client.uid).get()).data() };
}
async function batchSave(client, userPatch = {}, mapPatch = {}) {
  const changes = { ...input, specialization: 'Plumbing', ...userPatch, updatedAt: firestore.serverTimestamp() };
  const batch = firestore.writeBatch(client.db);
  batch.update(userRef(client), changes);
  batch.set(mapRef(client), { ...projection.buildMapProfile(client.uid, { ...client.source, ...changes }), ...mapPatch, updatedAt: firestore.serverTimestamp() });
  return batch.commit();
}
after(async () => {
  for (const client of clients) { await firestore.terminate(client.db); await deleteApp(client.app); }
  await db.terminate(); await deleteAdmin(trusted);
});

test('deployed snapshot: isolate both category allowlist rejections and prove atomic rollback', { skip: !deployed }, async () => {
  const client = await session();
  // Same specialization/ID pairing: category validity is not the failing condition.
  await denied(firestore.updateDoc(userRef(client), { serviceCategoryId: 'electrical', updatedAt: firestore.serverTimestamp() }));
  const legacyMap = projection.buildMapProfile(client.uid, client.source);
  delete legacyMap.serviceCategoryId;
  await firestore.setDoc(mapRef(client), { ...legacyMap, updatedAt: firestore.serverTimestamp() });
  await denied(firestore.setDoc(mapRef(client), { ...legacyMap, serviceCategoryId: 'electrical', updatedAt: firestore.serverTimestamp() }));
  await denied(client.service.updateUserProfileSafe(client.uid, input));
  const result = await saved(client);
  assert.equal(result.user.fullName, 'Technician'); assert.equal(result.user.serviceCategoryId, undefined);
  assert.equal(result.map.specialization, 'Electrical'); assert.equal(result.map.serviceCategoryId, undefined);
});

test('actual profile service edits current category and preserves authoritative approval, ratings and totals', { skip: deployed }, async () => {
  const client = await session({ serviceCategoryId: 'electrical', averageRating: 4.75, reviewCount: 12, completedJobs: 19 });
  await client.service.updateUserProfileSafe(client.uid, input);
  const { user, map } = await saved(client);
  for (const data of [user, map]) {
    assert.equal(data.fullName, input.fullName); assert.equal(data.serviceCategoryId, 'plumbing');
    assert.equal(data.specialization, 'Plumbing'); assert.equal(data.averageRating, 4.75); assert.equal(data.reviewCount, 12);
  }
  assert.equal(user.technicianApprovalStatus, 'approved'); assert.equal(map.approved, true);
  assert.equal(user.completedJobs, 19); assert.equal(map.publicDetails.completedJobs, 19);
  assert.equal(map.address, undefined); assert.equal(map.phone, undefined);
  assert.equal(user.updatedAt.toMillis(), map.updatedAt.toMillis());
});

test('legacy profiles without category/totals/projection save without recreation or self-approval', { skip: deployed }, async () => {
  for (const status of ['approved', 'pending', 'rejected']) {
    const client = await session({ specialization: 'AC technician', technicianApprovalStatus: status }, { projectionExists: false });
    if (status === 'approved') {
      // October-era projections had no stable ID and did not recognize this alias.
      const legacy = projection.buildMapProfile(client.uid, client.source);
      delete legacy.serviceCategoryId;
      legacy.serviceCategory = '';
      await db.doc('technician_map_profiles/' + client.uid).set({ ...legacy, updatedAt: Timestamp.now() });
    }
    await client.service.updateUserProfileSafe(client.uid, input);
    const { user, map } = await saved(client);
    assert.equal(user.serviceCategoryId, 'plumbing'); assert.equal(map.serviceCategoryId, 'plumbing');
    assert.equal(user.technicianApprovalStatus, status); assert.equal(map.approved, status === 'approved');
    assert.equal(map.averageRating, 0); assert.equal(map.reviewCount, 0); assert.equal(map.publicDetails.completedJobs, 0);
    assert.equal(user.averageRating, undefined); assert.equal(user.completedJobs, undefined);
  }
});

test('malformed categories, mismatched projections and unpaired category edits fail atomically', { skip: deployed }, async () => {
  const client = await session();
  for (const patch of [{ serviceCategoryId: 'customer' }, { serviceCategoryId: 42 }, { specialization: 'Electrical' }]) {
    await denied(batchSave(client, patch));
  }
  await denied(batchSave(client, {}, { serviceCategoryId: 'electrical', serviceCategory: 'Electrical' }));
  await denied(firestore.updateDoc(userRef(client), { serviceCategoryId: 'plumbing', specialization: 'Plumbing', updatedAt: firestore.serverTimestamp() }));
  await denied(firestore.setDoc(mapRef(client), { ...projection.buildMapProfile(client.uid, { ...client.source, serviceCategoryId: 'plumbing', specialization: 'Plumbing' }), updatedAt: firestore.serverTimestamp() }));
  assert.equal((await saved(client)).user.specialization, 'Electrical');
});

test('profile editing cannot grant approval, fabricate ratings, or reset existing authoritative totals', { skip: deployed }, async () => {
  const client = await session({ technicianApprovalStatus: 'pending', averageRating: 4.5, reviewCount: 6, completedJobs: 9 });
  for (const patch of [{ technicianApprovalStatus: 'approved' }, { averageRating: 5 }, { reviewCount: 0 }, { completedJobs: 0 }]) {
    await denied(batchSave(client, patch));
  }
  await denied(firestore.updateDoc(userRef(client), { role: 'dispatcher' }));
  for (const patch of [{ approved: true }, { averageRating: 0 }, { reviewCount: 0 },
    { publicDetails: { ...projection.buildMapProfile(client.uid, client.source).publicDetails, completedJobs: 0 } }]) {
    await denied(batchSave(client, {}, patch));
  }
  const result = await saved(client);
  assert.equal(result.user.technicianApprovalStatus, 'pending'); assert.equal(result.map.approved, false);
  assert.equal(result.map.averageRating, 4.5); assert.equal(result.map.reviewCount, 6); assert.equal(result.map.publicDetails.completedJobs, 9);
});

test('foreign, disabled, unverified and customer category writes remain denied', { skip: deployed }, async () => {
  const owner = await session(), foreign = await session();
  await denied(firestore.updateDoc(firestore.doc(foreign.db, 'users', owner.uid), { serviceCategoryId: 'plumbing', specialization: 'Plumbing', updatedAt: firestore.serverTimestamp() }));
  await denied(firestore.setDoc(firestore.doc(foreign.db, 'technician_map_profiles', owner.uid), { ...projection.buildMapProfile(owner.uid, owner.source), updatedAt: firestore.serverTimestamp() }));
  for (const [patch, options] of [[{ accountStatus: 'disabled' }, {}], [{}, { verified: false }]]) {
    const client = await session(patch, options);
    await denied(client.service.updateUserProfileSafe(client.uid, input));
    assert.equal((await saved(client)).user.serviceCategoryId, undefined);
  }
  const customer = await session({ role: 'customer' }, { projectionExists: false });
  await denied(firestore.updateDoc(userRef(customer), { serviceCategoryId: 'plumbing', specialization: 'Plumbing', updatedAt: firestore.serverTimestamp() }));
});
