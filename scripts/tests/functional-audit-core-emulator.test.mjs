import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as fs from 'firebase/firestore';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const project = 'demo-servicepilot-review-author';
if (process.env.GCLOUD_PROJECT !== project || ![process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST].every(host => /^(127\.0\.0\.1|localhost):\d+$/.test(host ?? ''))) throw Error('Loopback demo emulators only.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const adminApp = require('firebase-admin/app'), adminAuth = require('firebase-admin/auth'), adminDb = require('firebase-admin/firestore');
const policy = require('./lib/domain/legalPolicy.js'), projection = require('./lib/domain/mapProjection.js');
const trusted = adminApp.initializeApp({ projectId: project }, 'audit-core-' + randomUUID()), db = adminDb.getFirestore(trusted), clients = [];
fs.setLogLevel('silent');
after(async () => { for (const client of clients) { await fs.terminate(client.db); await deleteApp(client.app); } await db.terminate(); await adminApp.deleteApp(trusted); });
async function account(role, patch = {}) {
  const uid = 'audit-core-' + randomUUID(), email = uid + '@example.test', password = randomUUID();
  const data = { uid, email, fullName: role === 'customer' ? 'Audit Reviewer' : 'Audit Technician', phone: '0712345678', address: 'Private test fixture',
    role, accountStatus: 'active', emailVerified: true, termsVersion: policy.TERMS_VERSION, privacyPolicyVersion: policy.PRIVACY_POLICY_VERSION, acceptedAt: new Date(),
    ...(role === 'technician' ? { technicianApprovalStatus: 'approved', availability: 'available', serviceCategoryId: 'electrical', specialization: 'Electrical',
      serviceDistrictIds: ['kandy'], averageRating: 0, reviewCount: 0 } : {}), ...patch };
  for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
  await adminAuth.getAuth(trusted).createUser({ uid, email, password, emailVerified: true }); await db.doc('users/' + uid).set(data);
  const app = initializeApp({ projectId: project, apiKey: 'emulator-only' }, uid), auth = getAuth(app), database = fs.getFirestore(app);
  connectAuthEmulator(auth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); fs.connectFirestoreEmulator(database, host, Number(port));
  await signInWithEmailAndPassword(auth, email, password);
  const config = { auth, db: database }, deps = { '@/src/firebase/config': config, 'firebase/firestore': fs,
    '@/functions/src/domain/map': require('./lib/domain/map.js'), '@/functions/src/domain/mapProjection': projection,
    '@/functions/src/domain/availability': require('./lib/domain/availability.js'), '@/functions/src/domain/serviceAreas': require('./lib/domain/serviceAreas.js'),
    '@/src/utils/mapServiceError': loadService('src/utils/mapServiceError.ts', {}) };
  const realPolicy = loadService('src/services/policy.service.ts', deps);
  const notifications = loadService('src/services/notification.service.ts', { ...deps, 'firebase/app': await import('firebase/app'), './notificationHistory': {} });
  const client = { app, auth, db: database, uid, data, location: loadService('src/services/location.service.ts', deps),
    requests: loadService('src/services/request.service.ts', { ...deps, './policy.service': realPolicy, '@/src/constants/serviceRequests': loadService('src/constants/serviceRequests.ts', {}) }),
    reviews: loadService('src/services/review.service.ts', { ...deps, '@/src/services/notification.service': notifications,
      '@/src/utils/reviewAuthor': loadService('src/utils/reviewAuthor.ts', {}), '@/src/utils/reviewValidation': loadService('src/utils/reviewValidation.ts', {}) }) };
  clients.push(client); return client;
}
async function published(technician) { await db.doc('technician_map_profiles/' + technician.uid).set({ ...projection.buildMapProfile(technician.uid, technician.data), updatedAt: new Date() }); }

test('fresh canonical approved technician can initialize the public projection without leaking private fields', async () => {
  const tech = await account('technician'); await tech.location.syncOwnMapProfile(tech.uid);
  const data = (await db.doc('technician_map_profiles/' + tech.uid).get()).data();
  assert.equal(data.approved, true); for (const field of ['address', 'phone', 'email', 'latitude', 'longitude']) assert.equal(field in data, false);
});
test('fresh legacy approved technician without canonical category/district IDs can initialize the public projection', async () => {
  const tech = await account('technician', { serviceCategoryId: undefined, serviceDistrictIds: undefined, serviceDivision: 'Colombo District' });
  // Remove absent values from the Admin fixture rather than writing undefined.
  await tech.location.syncOwnMapProfile(tech.uid);
  assert.equal((await db.doc('technician_map_profiles/' + tech.uid).get()).exists, true);
});
test('fresh current-policy GPS flow separates public/private, limits precise access to the owning active job and removes both on OFF', async () => {
  const tech = await account('technician'), owner = await account('customer'), foreign = await account('customer'); await published(tech);
  // Synthetic test coordinates; no town or device location is inferred.
  const point = { latitude: 1, longitude: 2, sampledAt: Date.now() };
  await tech.location.publishTechnicianLocation(tech.uid, point);
  const publicLocation = await owner.location.getLatestMapLocation(tech.uid); assert.ok(publicLocation.location);
  await assert.rejects(fs.getDocFromServer(fs.doc(owner.db, 'technician_locations', tech.uid)), error => error.code === 'permission-denied');
  const requestId = 'audit-gps-' + randomUUID();
  await db.doc('service_requests/' + requestId).set({ customerId: owner.uid, technicianId: tech.uid, status: 'accepted' });
  const precise = await owner.location.getJobTechnicianLocation(requestId); assert.equal(precise.status, 'available');
  await assert.rejects(foreign.location.getJobTechnicianLocation(requestId));
  await tech.location.publishTechnicianLocation(tech.uid);
  assert.equal((await owner.location.getLatestMapLocation(tech.uid)).location, null);
  assert.equal('latitude' in (await db.doc('technician_locations/' + tech.uid).get()).data(), false);
});
test('fresh unresolved legacy technician can initialize a projection without inventing a category or district', async () => {
  const tech = await account('technician', { serviceCategoryId: undefined, specialization: '', serviceDistrictIds: undefined, serviceAreas: 'Unlisted locality' });
  await tech.location.syncOwnMapProfile(tech.uid);
  const data = (await db.doc('technician_map_profiles/' + tech.uid).get()).data();
  assert.equal(data.serviceCategoryId, ''); assert.deepEqual(data.serviceDistrictIds, []);
});
test('fresh current-policy zero-photo booking serializes duplicate calls into one receipt/request/notification', async () => {
  const tech = await account('technician'), customer = await account('customer'); await published(tech);
  const attemptId = customer.requests.createServiceRequestAttemptId();
  const input = { attemptId, profile: customer.data, technician: { uid: tech.uid, serviceDivision: 'Kandy' }, serviceCategory: 'Electrical',
    title: 'Audit repair', description: 'Audit isolated booking', address: 'Private test fixture', division: 'Kandy', preferredDate: '2099-10-10', preferredTime: '10:00 AM',
    scheduledAt: new Date('2099-10-10T04:30:00Z'), durationMinutes: 60, priority: 'normal', imageUrls: [] };
  const results = await Promise.all([customer.requests.createServiceRequest(input), customer.requests.createServiceRequest(input)]);
  assert.deepEqual(results, [attemptId, attemptId]);
  assert.equal((await db.collection('service_requests').where('customerId', '==', customer.uid).get()).size, 1);
  assert.equal((await db.collection('notifications').where('requestId', '==', attemptId).get()).size, 1);
  assert.equal(await customer.requests.confirmServiceRequestAttempt(customer.uid, attemptId), true);
});
test('fresh current-policy completed-job review keeps the real reviewer name, prevents duplicate overwrite and preserves privacy', async () => {
  const tech = await account('technician'), author = await account('customer'), viewer = await account('customer'); await published(tech);
  const requestId = 'audit-review-' + randomUUID(); await db.doc('service_requests/' + requestId).set({ customerId: author.uid, technicianId: tech.uid, status: 'completed' });
  const { review } = await author.reviews.submitServiceReview({ requestId, customerId: author.uid, technicianId: tech.uid, rating: 5, comment: 'Audit review' });
  assert.equal(review.customerName, author.data.fullName);
  const publicReview = await fs.getDocFromServer(fs.doc(viewer.db, 'service_reviews', review.id)); assert.equal(publicReview.data().customerName, author.data.fullName);
  await assert.rejects(fs.getDocFromServer(fs.doc(viewer.db, 'users', author.uid)), error => error.code === 'permission-denied');
  await assert.rejects(author.reviews.submitServiceReview({ requestId, customerId: author.uid, technicianId: tech.uid, rating: 1, comment: 'Overwrite denied' }));
  assert.equal((await db.doc('service_reviews/' + review.id).get()).data().rating, 5);
  assert.equal((await db.collection('notifications').where('requestId', '==', requestId).get()).size, 1);
});
