import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as fs from 'firebase/firestore';
fs.setLogLevel('silent');
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? '')) throw Error('Loopback demo emulators required.');
}
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const admin = require('firebase-admin/app'), adminAuth = require('firebase-admin/auth'), adminDb = require('firebase-admin/firestore');
const policy = require('./lib/domain/legalPolicy.js');
const trusted = admin.initializeApp({ projectId: 'demo-servicepilot-categories' }, 'legal-tests');
const db = adminDb.getFirestore(trusted), clients = [];
const accepted = () => ({ termsVersion: policy.TERMS_VERSION, privacyPolicyVersion: policy.PRIVACY_POLICY_VERSION, acceptedAt: fs.Timestamp.fromMillis(Date.now() - 60000) });
async function session(role = 'customer', seed = true) {
  const uid = 'legal-' + randomUUID(), email = uid + '@example.test', password = randomUUID();
  await adminAuth.getAuth(trusted).createUser({ uid, email, password, emailVerified: true });
  const source = { uid, email, fullName: 'Demo person', phone: '123', address: 'Private fixture', role, accountStatus: 'active', emailVerified: false };
  if (seed) await db.doc('users/' + uid).set(source);
  const app = initializeApp({ projectId: 'demo-servicepilot-categories', apiKey: 'emulator-only' }, uid), auth = getAuth(app), clientDb = fs.getFirestore(app);
  connectAuthEmulator(auth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); fs.connectFirestoreEmulator(clientDb, host, Number(port));
  await signInWithEmailAndPassword(auth, email, password);
  const client = { uid, source, app, auth, db: clientDb }; clients.push(client); return client;
}
const user = client => fs.doc(client.db, 'users', client.uid);
const deny = promise => assert.rejects(promise, error => error.code === 'permission-denied');
after(async () => { for (const client of clients) { await fs.terminate(client.db); await deleteApp(client.app); } await db.terminate(); await admin.deleteApp(trusted); });

test('new registration requires current versions and request-time timestamp; no privileged or arbitrary fields', async () => {
  for (const role of ['customer', 'technician']) {
    const client = await session(role, false);
    const data = { ...client.source, ...(role === 'technician' ? { specialization: 'Electrical', serviceCategoryId: 'electrical', experience: '1 year', qualifications: 'Training', certifications: '', serviceAreas: '', serviceDivision: 'Kandy', technicianApprovalStatus: 'pending', availability: 'offline' } : {}), createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() };
    await deny(fs.setDoc(user(client), data));
    await deny(fs.setDoc(user(client), { ...data, ...accepted() }));
    await deny(fs.setDoc(user(client), { ...data, ...accepted(), acceptedAt: fs.serverTimestamp(), termsVersion: 'wrong' }));
    await fs.setDoc(user(client), { ...data, ...accepted(), acceptedAt: fs.serverTimestamp() });
    assert.ok((await db.doc('users/' + client.uid).get()).data().acceptedAt instanceof adminDb.Timestamp);
    await deny(fs.updateDoc(user(client), { acceptedAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() }));
    await deny(fs.updateDoc(user(client), { role: 'super_admin' }));
  }
});

test('legacy accounts remain readable without fabricated acceptance; only explicit narrow acceptance is permitted', async () => {
  const client = await session(), foreign = await session();
  assert.equal((await fs.getDoc(user(client))).data().acceptedAt, undefined);
  await deny(fs.updateDoc(user(client), { fullName: 'New content', updatedAt: fs.serverTimestamp() }));
  await deny(fs.updateDoc(user(client), { ...accepted(), acceptedAt: fs.serverTimestamp(), fullName: 'Extra mutation', updatedAt: fs.serverTimestamp() }));
  await deny(fs.updateDoc(fs.doc(foreign.db, 'users', client.uid), { ...accepted(), acceptedAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() }));
  await fs.updateDoc(user(client), { ...accepted(), acceptedAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
  await fs.updateDoc(user(client), { fullName: 'Accepted user', updatedAt: fs.serverTimestamp() });
  await deny(fs.getDoc(fs.doc(foreign.db, 'users', client.uid)));
});

test('reports are actionable and private, cannot forge reporter or privileged decisions; only super admin moderates', async () => {
  const client = await session(), foreign = await session(), moderator = await session('super_admin');
  const id = randomUUID(), data = { reporterId: client.uid, targetUserId: foreign.uid, contentKind: 'profile', contentId: foreign.uid, reason: 'Demo objectionable content concern', status: 'open', createdAt: fs.serverTimestamp() };
  const ref = fs.doc(client.db, 'content_reports', id);
  await deny(fs.setDoc(ref, { ...data, reporterId: foreign.uid }));
  await deny(fs.setDoc(ref, { ...data, status: 'resolved' }));
  await fs.setDoc(ref, data);
  await fs.setDoc(fs.doc(client.db, 'content_reports', randomUUID()), { ...data, contentKind: 'review', contentId: 'legacy-review', targetUserId: '' });
  await deny(fs.getDoc(fs.doc(foreign.db, 'content_reports', id)));
  await deny(fs.getDocs(fs.query(fs.collection(client.db, 'content_reports'), fs.limit(50))));
  const queue = await fs.getDocs(fs.query(fs.collection(moderator.db, 'content_reports'), fs.where('status', 'in', ['open', 'reviewing']), fs.limit(50)));
  assert.ok(queue.docs.some(item => item.id === id));
  const decision = { status: 'resolved', resolution: 'Reviewed demo context and recorded action', reviewedBy: moderator.uid, reviewedAt: fs.serverTimestamp() };
  await deny(fs.updateDoc(ref, decision));
  await fs.updateDoc(fs.doc(moderator.db, 'content_reports', id), decision);
  const restriction = fs.doc(moderator.db, 'content_restrictions', `profile_${foreign.uid}`);
  await fs.setDoc(restriction, { kind: 'profile', contentId: foreign.uid, hidden: true, updatedAt: fs.serverTimestamp() });
  await deny(fs.setDoc(fs.doc(client.db, 'content_restrictions', `profile_${foreign.uid}`), { kind: 'profile', contentId: foreign.uid, hidden: false, updatedAt: fs.serverTimestamp() }));
});

test('blocks are private and owner controlled; blocking does not destroy existing job history', async () => {
  const client = await session(), foreign = await session();
  const ref = fs.doc(client.db, 'user_blocks', client.uid, 'blocked', foreign.uid);
  await fs.setDoc(ref, { createdAt: fs.serverTimestamp() });
  await deny(fs.getDoc(fs.doc(foreign.db, 'user_blocks', client.uid, 'blocked', foreign.uid)));
  await deny(fs.deleteDoc(fs.doc(foreign.db, 'user_blocks', client.uid, 'blocked', foreign.uid)));
  const id = randomUUID(); await db.doc('service_requests/' + id).set({ customerId: client.uid, technicianId: foreign.uid, status: 'completed' });
  assert.equal((await fs.getDoc(fs.doc(client.db, 'service_requests', id))).data().status, 'completed');
  await deny(fs.deleteDoc(fs.doc(client.db, 'service_requests', id)));
  await fs.deleteDoc(ref);
});

test('real booking service works for an accepted account and both block directions prevent new bookings', async () => {
  const customer = await session(), technician = await session('technician');
  const profile = { ...customer.source, emailVerified: true, ...accepted(), acceptedAt: adminDb.FieldValue.serverTimestamp() };
  const tech = { ...technician.source, emailVerified: true, ...accepted(), acceptedAt: adminDb.FieldValue.serverTimestamp(),
    technicianApprovalStatus: 'approved', specialization: 'Electrical', serviceCategoryId: 'electrical', availability: 'available', serviceDistrictIds: ['kandy'] };
  await db.doc('users/' + customer.uid).set(profile);
  await db.doc('users/' + technician.uid).set(tech);
  const projection = require('./lib/domain/mapProjection.js').buildMapProfile(technician.uid, tech);
  await db.doc('technician_map_profiles/' + technician.uid).set({ ...projection, updatedAt: adminDb.FieldValue.serverTimestamp() });
  const service = loadService('src/services/request.service.ts', {
    '@/src/firebase/config': { auth: customer.auth, db: customer.db }, 'firebase/firestore': fs,
    '@/functions/src/domain/availability': require('./lib/domain/availability.js'), './bookingSchedule.service': {},
  });
  const input = { profile: { ...customer.source, emailVerified: true }, technician: { uid: technician.uid, fullName: tech.fullName, serviceDivision: 'Kandy' },
    serviceCategory: 'Electrical', title: 'Demo service request', description: 'Local fixture service', address: 'Private fixture', division: 'Kandy',
    preferredDate: '2099-10-10', preferredTime: '10:00 AM', scheduledAt: new Date('2099-10-10T04:30:00Z'), durationMinutes: 60, priority: 'normal', imageUrls: [] };
  const first = await service.createServiceRequest(input);
  assert.equal((await db.doc('service_requests/' + first).get()).data().customerId, customer.uid);
  await fs.setDoc(fs.doc(customer.db, 'user_blocks', customer.uid, 'blocked', technician.uid), { createdAt: fs.serverTimestamp() });
  await assert.rejects(service.createServiceRequest(input));
  await fs.deleteDoc(fs.doc(customer.db, 'user_blocks', customer.uid, 'blocked', technician.uid));
  await fs.setDoc(fs.doc(technician.db, 'user_blocks', technician.uid, 'blocked', customer.uid), { createdAt: fs.serverTimestamp() });
  await assert.rejects(service.createServiceRequest(input));
  assert.equal((await fs.getDoc(fs.doc(customer.db, 'service_requests', first))).exists(), true);
});
