// Real HTTP -> standalone dispatcher-main -> Auth emulator -> Firestore transaction.
// Unique disposable fixtures only; never accepts or edits the user's existing requests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';

const projectId = 'demo-servicepilot-review-author';
if (process.env.DISPATCHER_MODE !== 'emulator' || process.env.GOOGLE_CLOUD_PROJECT !== projectId ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9197' ||
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8187') {
  throw Error('Run start-booking-demo.ps1 -Mode Verify with the disposable demo emulators and backend running.');
}
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

test('running standalone backend authenticates, accepts atomically, retries idempotently and enforces booking boundaries', async () => {
  const prefix = `runtime-${randomUUID()}`, admin = adminApp({ projectId }, prefix);
  const db = getFirestore(admin), auth = adminAuth(admin), clients = [], users = [], refs = [];
  const technicianId = `${prefix}-tech`, customerId = `${prefix}-customer`, foreignId = `${prefix}-foreign`;
  const endpoint = 'http://127.0.0.1:8789/v1/bookings/schedule';
  const post = async (body, token) => {
    const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const put = async (path, data) => { const ref = db.doc(path); refs.push(ref); await ref.set(data); return ref; };
  try {
    const tokens = {};
    for (const [uid, role] of [[technicianId, 'technician'], [customerId, 'customer'], [foreignId, 'customer']]) {
      const email = `${uid}@example.test`, password = randomUUID();
      await auth.createUser({ uid, email, password, emailVerified: true }); users.push(uid);
      await put(`users/${uid}`, { uid, role, emailVerified: true, accountStatus: 'active',
        ...(role === 'technician' ? { technicianApprovalStatus: 'approved', availability: 'available' } : {}) });
      const app = initializeApp({ projectId, apiKey: 'emulator-only' }, uid); clients.push(app);
      const session = getAuth(app);
      connectAuthEmulator(session, 'http://127.0.0.1:9197', { disableWarnings: true });
      await signInWithEmailAndPassword(session, email, password);
      tokens[uid] = await session.currentUser.getIdToken();
    }
    await put(`technician_map_profiles/${technicianId}`, { technicianId, approved: true, availability: 'available' });
    refs.push(db.doc(`booking_schedule_locks/${technicianId}`));
    const requests = [];
    for (const [suffix, time] of [['first', '10:00 AM'], ['overlap', '10:30 AM'], ['adjacent', '11:00 AM']]) {
      const id = `${prefix}-${suffix}`;
      requests.push(await put(`service_requests/${id}`, { technicianId, customerId, status: 'requested',
        preferredDate: '2099-10-10', preferredTime: time, durationMinutes: 60, createdAt: Timestamp.now() }));
      refs.push(db.doc(`notifications/${id}_technician_accepted_request`));
    }
    const input = { action: 'accept', requestId: requests[0].id };
    assert.equal((await post(input)).status, 401, 'Missing token is denied by the HTTP boundary');
    assert.equal((await post(input, 'invalid')).status, 401);
    assert.equal((await post(input, tokens[foreignId])).status, 403, 'Foreign participant cannot accept');
    assert.equal((await requests[0].get()).data().status, 'requested');

    // Exercise the actual mobile transport, using an emulator-authenticated user.
    const previous = process.env.EXPO_PUBLIC_BOOKING_API_URL;
    process.env.EXPO_PUBLIC_BOOKING_API_URL = 'http://127.0.0.1:8789';
    try {
      const transport = loadService('src/services/bookingSchedule.service.ts', {
        '@/src/firebase/config': { auth: getAuth(clients[0]), firebaseRuntimeTarget: { emulator: true } },
        'firebase/firestore': { doc: () => { throw Error('Unexpected reconciliation on acknowledged acceptance'); } },
      });
      await transport.callBookingSchedule(input);
      const saved = (await requests[0].get()).data();
      assert.equal(saved.status, 'accepted');
      assert.equal(saved.scheduledEndAt.toMillis() - saved.scheduledAt.toMillis(), 3600000);
      const notice = db.doc(`notifications/${input.requestId}_technician_accepted_request`);
      const firstNotice = (await notice.get()).data();
      assert.equal(firstNotice.userId, customerId);
      await transport.callBookingSchedule(input);
      assert.deepEqual((await notice.get()).data(), firstNotice, 'Retry must not rewrite notification');
      assert.equal((await db.collection('notifications').where('requestId', '==', input.requestId).get()).size, 1);
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_BOOKING_API_URL;
      else process.env.EXPO_PUBLIC_BOOKING_API_URL = previous;
    }
    const overlap = await post({ action: 'accept', requestId: requests[1].id }, tokens[technicianId]);
    assert.equal(overlap.status, 409); assert.equal(overlap.body.code, 'booking/overlap');
    assert.equal((await requests[1].get()).data().status, 'requested');
    await db.doc(`users/${technicianId}`).update({ technicianApprovalStatus: 'revoked' });
    assert.equal((await post({ action: 'accept', requestId: requests[2].id }, tokens[technicianId])).status, 403);
    await db.doc(`users/${technicianId}`).update({ technicianApprovalStatus: 'approved' });
    await db.doc(`users/${customerId}`).update({ accountStatus: 'disabled' });
    assert.equal((await post({ action: 'accept', requestId: requests[2].id }, tokens[technicianId])).status, 403);
    await db.doc(`users/${customerId}`).update({ accountStatus: 'active' });
    assert.equal((await post({ action: 'accept', requestId: requests[2].id }, tokens[technicianId])).status, 200);
  } finally {
    // Delete only the unique fixtures this run created, never flush the emulator.
    for (const ref of refs) await ref.delete();
    for (const uid of users) await auth.deleteUser(uid);
    for (const app of clients) await deleteApp(app);
    await db.terminate(); await deleteAdmin(admin);
  }
});
