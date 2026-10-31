import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createBookingSchedule } from '../../functions/src/domain/bookingSchedule';
import { firestoreStore, values } from '../src/firestore';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? '')) throw Error('Loopback Firestore emulator required.');
const project = 'demo-servicepilot-review-author', require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app'), { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: project }, 'worker-' + randomUUID()), db = getFirestore(app);
const prefix = 'worker-' + randomUUID().slice(0, 8), customer = prefix + '-customer';
const make = () => createBookingSchedule({ auth: { verifyIdToken: async uid => ({ uid, auth_time: Math.floor(Date.now() / 1000), email_verified: true }) },
  db: firestoreStore({ project, endpoint: `http://${host}/v1`, token: async () => 'owner', deadline: Date.now() + 16_000 }), values });
const call = (uid: string, input: object) => make().change('Bearer ' + uid, input);
async function tech(suffix: string) { const uid = prefix + suffix;
  await db.doc('users/' + uid).set({ role: 'technician', technicianApprovalStatus: 'approved', emailVerified: true, availability: 'available', accountStatus: 'active' });
  await db.doc('technician_map_profiles/' + uid).set({ approved: true, availability: 'available' }); return uid; }
async function seed(id: string, uid: string, time = '10:00 AM', extra = {}) {
  await db.doc('service_requests/' + id).set({ customerId: customer, technicianId: uid, status: 'requested', preferredDate: '2099-10-10', preferredTime: time,
    durationMinutes: 60, scheduleRevision: 0, privateUnrelatedField: 'preserved', ...extra }); }
before(async () => { await db.doc('users/' + customer).set({ role: 'customer', accountStatus: 'active', emailVerified: true }); });
after(async () => { await db.terminate(); await deleteApp(app); });
test('independent REST adapters serialize overlapping accepts; adjacent accepts and exact retries create one notice', async () => {
  const uid = await tech('-race.தமிழ்'), a = prefix + '-a', b = prefix + '-b'; await seed(a, uid); await seed(b, uid);
  const result = await Promise.allSettled([a, b].map(requestId => call(uid, { action: 'accept', requestId })));
  assert.equal(result.filter(row => row.status === 'fulfilled').length, 1);
  assert.ok(result.some(row => row.status === 'rejected' && row.reason.code === 'booking/overlap'));
  const id = result[0].status === 'fulfilled' ? a : b; await call(uid, { action: 'accept', requestId: id });
  assert.equal((await db.collection('notifications').where('requestId', '==', id).get()).size, 1);
  const saved = (await db.doc('service_requests/' + id).get()).data();
  assert.equal(saved.status, 'accepted'); assert.equal(saved.privateUnrelatedField, 'preserved'); assert.ok(saved.updatedAt.toMillis() > 0);
  const adjacent = prefix + '-adjacent'; await seed(adjacent, uid, '11:00 AM'); await call(uid, { action: 'accept', requestId: adjacent });
  assert.equal((await db.doc('booking_schedule_locks/' + uid).get()).data().revision, 2);
});
test('proposal/approval revisions, delete transforms and legacy review remain idempotent', async () => {
  const uid = await tech('-proposal'), id = prefix + '-proposal'; await seed(id, uid);
  const proposal = { action: 'propose', requestId: id, date: '2099-10-10', time: '12:00 PM', durationMinutes: 90 };
  await call(customer, proposal); await call(customer, proposal);
  await assert.rejects(call(uid, { action: 'approve', requestId: id, proposalRevision: 2 }), (e: any) => e.code === 'booking/conflict');
  await call(uid, { action: 'approve', requestId: id, proposalRevision: 1 }); await call(uid, { action: 'approve', requestId: id, proposalRevision: 1 }); await call(customer, proposal);
  const saved = (await db.doc('service_requests/' + id).get()).data(); assert.equal(saved.scheduleProposal, undefined); assert.equal(saved.scheduleRevision, 1); assert.equal(saved.durationMinutes, 90);
  assert.equal((await db.collection('notifications').where('requestId', '==', id).get()).size, 2);
  const legacy = prefix + '-legacy', blocked = prefix + '-blocked'; await seed(legacy, uid, '03:00 PM', { status: 'assigned' }); await seed(blocked, uid);
  await assert.rejects(call(uid, { action: 'accept', requestId: blocked }), (e: any) => e.code === 'booking/schedule-review');
  const review = { action: 'review-legacy', requestId: legacy, date: '2099-10-10', time: '03:00 PM', durationMinutes: 60 };
  await call(uid, review); const reviewed = (await db.doc('service_requests/' + legacy).get()).data(); await call(uid, review);
  assert.deepEqual((await db.doc('service_requests/' + legacy).get()).data(), reviewed); await call(uid, { action: 'accept', requestId: blocked });
});
test('ownership, account/session, approval and availability fail without mutations', async () => {
  const uid = await tech('-boundary'), id = prefix + '-boundary'; await seed(id, uid);
  await assert.rejects(call(customer, { action: 'accept', requestId: id }));
  for (const patch of [{ technicianApprovalStatus: 'revoked' }, { accountStatus: 'disabled' }, { lifecyclePending: true }, { availability: 'busy' }, { sessionRevokedAt: Math.floor(Date.now() / 1000) + 100 }]) {
    await db.doc('users/' + uid).update(patch); await assert.rejects(call(uid, { action: 'accept', requestId: id }));
    await db.doc('users/' + uid).set({ role: 'technician', technicianApprovalStatus: 'approved', accountStatus: 'active', emailVerified: true, availability: 'available' });
  }
  await db.doc('technician_map_profiles/' + uid).update({ approved: false }); await assert.rejects(call(uid, { action: 'accept', requestId: id }));
  assert.equal((await db.doc('service_requests/' + id).get()).data().status, 'requested'); assert.equal((await db.collection('notifications').where('requestId', '==', id).get()).size, 0);
});
test('lost acknowledgement after actual local commit is ambiguous; retry has one notification and one lock increment', async t => {
  const uid = await tech('-ack'), id = prefix + '-ack'; await seed(id, uid);
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; }); let commits = 0, lose = true;
  globalThis.fetch = async (url, options) => { const response = await original(url, options);
    if (String(url).endsWith(':commit')) { commits++; if (lose && response.ok) { await response.text(); throw new TypeError('Synthetic lost acknowledgement'); } } return response; };
  await assert.rejects(call(uid, { action: 'accept', requestId: id }), (e: any) => e.code === 'booking/commit-outcome-unknown');
  assert.equal(commits, 1); assert.equal((await db.doc('service_requests/' + id).get()).data().status, 'accepted'); lose = false;
  await call(uid, { action: 'accept', requestId: id }); assert.equal((await db.collection('notifications').where('requestId', '==', id).get()).size, 1);
  assert.equal((await db.doc('booking_schedule_locks/' + uid).get()).data().revision, 1);
});
