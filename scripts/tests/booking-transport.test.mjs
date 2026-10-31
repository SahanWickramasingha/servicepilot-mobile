import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';

function fixture(t, base = 'https://booking.example.test') {
  const previous = process.env.EXPO_PUBLIC_BOOKING_API_URL;
  if (base === undefined) delete process.env.EXPO_PUBLIC_BOOKING_API_URL;
  else process.env.EXPO_PUBLIC_BOOKING_API_URL = base;
  t.after(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_BOOKING_API_URL;
    else process.env.EXPO_PUBLIC_BOOKING_API_URL = previous;
  });
  const auth = { currentUser: { uid: 'technician-auth-uid', getIdToken: async () => 'local-test-token' } };
  const reads = { count: 0, data: undefined };
  const service = loadService('src/services/bookingSchedule.service.ts', {
    '@/src/firebase/config': { auth, db: {}, firebaseRuntimeTarget: { emulator: false, projectId: 'test-project' } },
    'firebase/firestore': { doc: (_, collection, id) => ({ collection, id }), getDocFromServer: async () => {
      reads.count++; return { exists: () => !!reads.data, data: () => reads.data };
    } },
  });
  return { auth, service, reads };
}
const input = { action: 'accept', requestId: 'pending-request' };

test('booking endpoint fails closed for missing/malformed configuration before token or network access', async t => {
  const { auth, service } = fixture(t, '');
  auth.currentUser.getIdToken = () => assert.fail('No token needed for missing configuration');
  t.mock.method(globalThis, 'fetch', () => assert.fail('Must not send a request'));
  await assert.rejects(service.callBookingSchedule(input), e => e.code === 'booking/configuration' && /Contact support/.test(e.message));
  for (const value of [undefined, '', ' ', 'not a URL', 'http://booking.example.test',
    'https://user:password@booking.example.test', 'https://booking.example.test?token=secret', 'https://booking.example.test#fragment']) {
    assert.throws(() => service.bookingScheduleEndpoint(value, false), e => e.code === 'booking/configuration');
  }
  for (const value of ['ftp://localhost:8789', 'file://localhost/path', 'http://untrusted.example.test']) {
    assert.throws(() => service.bookingScheduleEndpoint(value, true), e => e.code === 'booking/configuration');
  }
  for (const host of ['127.0.0.1', 'localhost', '10.0.2.2']) {
    assert.equal(service.bookingScheduleEndpoint(`http://${host}:8789`, true), `http://${host}:8789/v1/bookings/schedule`);
    assert.throws(() => service.bookingScheduleEndpoint(`http://${host}:8789`, false));
  }
});

test('acceptance sends the exact authenticated action to the configured scheduler and requires matching acknowledgement', async t => {
  const { service } = fixture(t);
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://booking.example.test/v1/bookings/schedule');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer local-test-token');
    assert.match(options.headers['X-Booking-Correlation-ID'], /^booking-[a-z0-9-]+$/);
    assert.deepEqual(JSON.parse(options.body), input);
    return { ok: true, json: async () => ({ requestId: input.requestId }) };
  });
  await service.callBookingSchedule(input);
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ requestId: 'wrong-request' }) }));
  await assert.rejects(service.callBookingSchedule(input), /do not assume it was saved/);
});

test('schedule rejection stays actionable; lost acknowledgement asks for the same retry; account switch cannot report success', async t => {
  const { auth, service } = fixture(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 409,
    json: async () => ({ code: 'booking/overlap', message: 'Choose another interval.' }) }));
  await assert.rejects(service.callBookingSchedule(input), e => e.code === 'booking/overlap' && e.message === 'Choose another interval.');
  fetch.mock.mockImplementation(async () => { throw new TypeError('Network unavailable'); });
  await assert.rejects(service.callBookingSchedule(input), /retry the same action; do not assume it was saved/);
  fetch.mock.mockImplementation(async () => {
    auth.currentUser = { uid: 'other-account' };
    return { ok: true, json: async () => ({ requestId: input.requestId }) };
  });
  await assert.rejects(service.callBookingSchedule(input), e => e.code === 'booking/session' && /Account changed/.test(e.message));
});

test('pending acceptance never falls back to a Firestore write when the scheduler is unconfigured or rejects', async t => {
  const { auth, service } = fixture(t, '');
  const requests = loadService('src/services/request.service.ts', {
    '@/src/firebase/config': { auth, db: {} },
    '@/functions/src/domain/availability': loadService('functions/src/domain/availability.ts', {}),
    'firebase/firestore': { runTransaction: () => assert.fail('Acceptance cannot bypass scheduler') },
    './bookingSchedule.service': service,
  });
  await assert.rejects(requests.updateTechnicianRequestStatus(input.requestId, 'accepted'), e => e.code === 'booking/configuration');
  process.env.EXPO_PUBLIC_BOOKING_API_URL = 'https://booking.example.test';
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 409, json: async () => ({ code: 'booking/overlap', message: 'Choose another interval.' }) }));
  await assert.rejects(requests.updateTechnicianRequestStatus(input.requestId, 'accepted'), e => e.code === 'booking/overlap');
});

test('lost response reconciles only a server-confirmed acceptance owned by the unchanged technician, without a second POST', async t => {
  const { service, reads } = fixture(t);
  reads.data = { technicianId: 'technician-auth-uid', status: 'accepted', schedulingVersion: 1 };
  const post = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network request failed'); });
  await service.callBookingSchedule(input);
  assert.equal(post.mock.callCount(), 1);
  assert.equal(reads.count, 1);
  for (const data of [undefined, { ...reads.data, technicianId: 'foreign-user' },
    { ...reads.data, assignedTechnicianId: 'foreign-user' }, { ...reads.data, status: 'pending' },
    { ...reads.data, schedulingVersion: undefined }]) {
    reads.data = data;
    await assert.rejects(service.callBookingSchedule(input), e => e.code === 'booking/unknown-outcome' && e.cause instanceof TypeError);
  }
});

test('HTML/invalid JSON and mismatched acknowledgements reconcile; authoritative overlap and session/token failures never report success', async t => {
  const { service, reads, auth } = fixture(t);
  const accepted = { technicianId: 'technician-auth-uid', status: 'accepted', schedulingVersion: 1 };
  reads.data = accepted;
  const post = t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 502,
    headers: { get: () => 'text/html' }, json: () => assert.fail('HTML must not be parsed as JSON') }));
  await service.callBookingSchedule(input);
  post.mock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('invalid JSON'); } }));
  await service.callBookingSchedule(input);
  post.mock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ requestId: 'wrong-id' }) }));
  await service.callBookingSchedule(input);
  post.mock.mockImplementation(async () => ({ ok: false, status: 409, json: async () => ({ code: 'booking/overlap', message: 'Overlap.' }) }));
  await assert.rejects(service.callBookingSchedule(input), e => e.code === 'booking/overlap');
  assert.equal(reads.count, 3, 'a definitive rejection must not be reconciled into success');
  auth.currentUser.getIdToken = async () => { throw Object.assign(new Error('token unavailable'), { code: 'auth/network-request-failed' }); };
  const previousPosts = post.mock.callCount();
  await assert.rejects(service.callBookingSchedule(input), e => e.code === 'auth/network-request-failed');
  assert.equal(post.mock.callCount(), previousPosts);
});

test('transport timeout aborts once and reconciles the committed result without sending another acceptance', async t => {
  const { service, reads } = fixture(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reads.data = { technicianId: 'technician-auth-uid', status: 'accepted', schedulingVersion: 1 };
  let signal;
  const post = t.mock.method(globalThis, 'fetch', (_, options) => {
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
  });
  const result = service.callBookingSchedule(input);
  await new Promise(setImmediate);
  t.mock.timers.tick(20001);
  await result;
  assert.equal(signal.aborted, true);
  assert.equal(post.mock.callCount(), 1);
  assert.equal(reads.count, 1);
});

test('safe trace captures failure stage and exception type without tokens or request payloads', async t => {
  const { service } = fixture(t);
  const logs = [];
  t.mock.method(console, 'info', (...args) => logs.push(args.join(' ')));
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network request failed'); });
  await assert.rejects(service.callBookingSchedule(input));
  const text = logs.join('\n');
  assert.match(text, /"stage":"transport"/);
  assert.match(text, /"errorName":"TypeError"/);
  assert.ok(!text.includes('local-test-token'));
  assert.ok(!text.includes(input.requestId));
  assert.ok(!text.includes('technician-auth-uid'));
});
