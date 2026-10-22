import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lifecycleWorkload, notificationScreen, requestScreen, directoryFixture, directoryWorkload, sessionFixture, loadService, reviewResumeWorkload } from '../lib/subscription-reliability-workloads.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), tick = () => new Promise(setImmediate);

test('a focused review screen revalidates full-history totals once on resume and removes its AppState observer on blur', () => {
  assert.deepEqual(reviewResumeWorkload(), { reviewRefreshesOnForegroundTransition: 1, reviewAppStateObserversAfterBlur: 0 });
});

test('delayed notification profile reads cannot start listeners after either screen unmounts', async () => {
  const result = await lifecycleWorkload();
  assert.deepEqual(result.notificationCentersStartedAfterUnmount, { customer: 0, technician: 0 });
});

for (const [path, role] of [['app/(tabs)/notifications.tsx', 'customer'], ['app/technician/notifications.tsx', 'technician']]) {
  test(`${role} notifications clear on logout and reject obsolete profile/snapshot callbacks`, async () => {
    const f = notificationScreen(path);
    await f.profile(role);
    const old = f.streams.at(-1);
    old.next([{ id: 'private-a', source: 'personal', title: 'Private notification A', priority: 'normal', read: false }]);
    f.h.render();
    const hasPrivate = () => { f.h.render(); return f.h.elements().some((e) => e.type === 'Text' && e.props.children === 'Private notification A'); };
    assert.equal(hasPrivate(), true);
    f.session.emit('customer-b'); assert.equal(old.stopped, true); assert.equal(hasPrivate(), false);
    old.next([{ id: 'private-a', source: 'personal', title: 'Private notification A', priority: 'normal', read: false }]);
    assert.equal(hasPrivate(), false);
    const profile = f.profiles.at(-1);
    // A profile/role failure must also invalidate callbacks in the same Auth session.
    profile.next({ role }); const replacement = f.streams.at(-1);
    profile.error(new Error('Profile unavailable'));
    replacement.next([{ title: 'Private notification A', priority: 'normal', source: 'personal' }]);
    assert.equal(hasPrivate(), false);
    f.session.emit(null); f.h.cleanup(); assert.equal(f.session.observers(), 0);
    assert.ok(f.streams.every((s) => s.stopped)); assert.ok(f.profiles.every((s) => s.stopped));
  });
}

test('customer request details releases private data/listeners at logout and rejects late callbacks', () => {
  const f = requestScreen(), old = f.streams.at(-1);
  old.next(f.job); assert.equal(f.visible(), true);
  f.session.emit(null); assert.equal(f.visible(), false); assert.equal(old.stopped, true);
  old.next(f.job); assert.equal(f.visible(), false);
  f.session.emit('customer-b'); const current = f.streams.at(-1);
  current.next(f.job); assert.equal(f.visible(), false);
  f.h.cleanup(); current.next({ ...f.job, customerId: 'customer-b' }); assert.equal(f.visible(), false);
  assert.equal(f.session.observers(), 0);
});

test('identical public directory consumers share verification work and release the final listener', async () => {
  assert.deepEqual(await directoryWorkload(), { identicalDirectoryConsumers: 2, directoryRegistrations: 1,
    directoryApprovalReadsForOneDocument: 1, directoryConsumerEmissions: 2, directoryListenersAfterCleanup: 0 });
});

test('public directory filter/page scopes stay separate; account switches reject pending verification', async () => {
  const f = directoryFixture(), values = [], errors = [], stops = [];
  for (const filters of [undefined, { category: 'Electrical' }, { division: 'Kandy' }, { pageCount: 2 }]) {
    stops.push(f.service.subscribeToApprovedTechnicians((rows) => values.push(rows), (error) => errors.push(error), filters));
  }
  assert.equal(f.connections.length, 4);
  let finish; f.hold(new Promise((done) => { finish = done; }));
  f.connections[0].next(f.snapshot()); f.session.emit('customer-b');
  assert.ok(f.connections.every((c) => c.stopped)); const count = values.length;
  finish(); await tick(); assert.equal(values.length, count); assert.deepEqual(errors, []);
  stops.forEach((stop) => stop()); assert.equal(f.session.observers(), 0);
});

test('public directory errors supersede pending verification instead of republishing its obsolete rows', async () => {
  const f = directoryFixture(), values = [], errors = [];
  const stop = f.service.subscribeToApprovedTechnicians((rows) => values.push(rows), (error) => errors.push(error));
  let finish; f.hold(new Promise((done) => { finish = done; }));
  f.connections[0].next(f.snapshot()); f.connections[0].error(new Error('Denied'));
  finish(); await tick(); assert.deepEqual(values, [[]]); assert.equal(errors.length, 1); stop();
});

test('public profile consumers share one server approval check and cached availability stays unconfirmed', async () => {
  const f = directoryFixture(), values = [];
  const stops = [0, 1].map(() => f.service.subscribeToApprovedTechnician('tech-a', (v) => values.push(v), assert.fail));
  assert.equal(f.connections.length, 1);
  f.connections[0].next({ exists: () => true, data: () => ({ technicianId: 'tech-a', approved: true, availability: 'available', serviceDistrictIds: ['kandy'] }),
    metadata: { fromCache: true } });
  assert.equal(f.reads(), 0); assert.equal(values.length, 2); assert.equal(values[0].availability, undefined);
  f.connections[0].next({ metadata: { fromCache: false } }); await tick();
  assert.equal(f.reads(), 1); assert.equal(values.length, 4); assert.equal(values[2], values[3]);
  stops[0](); assert.equal(f.connections[0].stopped, false);
  stops[1](); assert.equal(f.connections[0].stopped, true); assert.equal(f.session.observers(), 0);
});

test('multiple request-detail consumers share only the same document within one signed-in session', () => {
  const session = sessionFixture(), streams = [], values = [];
  const service = loadService('src/services/request.service.ts', {
    'firebase/firestore': { doc: (_, path, id) => `${path}/${id}`, onSnapshot: (path, next, error) => {
      const s = { path, next, error, stopped: false }; streams.push(s); return () => { s.stopped = true; }; } },
    '@/src/firebase/config': { auth: session.auth, db: {} }, '@/src/constants/serviceRequests': {},
    '@/src/services/notification.service': {}, '@/src/services/user.service': {}, '@/src/services/technician.service': {},
    '@/functions/src/domain/availability': {},
  });
  const stops = [service.subscribeToServiceRequest('a', (v) => values.push(v), assert.fail),
    service.subscribeToServiceRequest('a', (v) => values.push(v), assert.fail),
    service.subscribeToServiceRequest('b', () => {}, assert.fail)];
  assert.equal(streams.length, 2);
  streams[0].next({ id: 'a', exists: () => true, data: () => ({ customerId: 'customer-a' }) });
  assert.equal(values.length, 2); assert.equal(values[0], values[1]);
  session.emit(null); assert.deepEqual(values.slice(-2), [null, null]); assert.ok(streams.every((s) => s.stopped));
  stops.forEach((stop) => stop()); assert.equal(session.observers(), 0);
});

function locationFixture() {
  const session = sessionFixture(), writes = [];
  let pending;
  const stamp = { toMillis: () => Date.now() };
  const service = loadService('src/services/location.service.ts', {
    '@/src/firebase/config': { auth: session.auth, db: {} },
    '@/functions/src/domain/map': require('../../functions/lib/domain/map.js'), '@/functions/src/domain/mapProjection': {},
    '@/functions/src/domain/serviceAreas': {}, '@/functions/src/domain/availability': {},
    '@/src/utils/mapServiceError': { MapServiceError: class extends Error {}, classifyMapServiceError: async (e) => e },
    'firebase/firestore': { doc: (_, collection, id) => ({ collection, id }), serverTimestamp: () => stamp,
      getDocFromServer: async ({ collection, id }) => {
        if (collection === 'technician_locations' && pending) await pending;
        return { data: () => collection === 'service_requests' ? { customerId: session.auth.currentUser?.uid, status: 'accepted', technicianId: id }
          : collection === 'technician_map_locations' ? { sharingEnabled: true, updatedAt: stamp }
            : { latitude: 1, longitude: 1, updatedAt: stamp } };
      }, setDoc: async (ref) => { writes.push(ref); } },
  });
  return { session, service, writes, hold: (wait) => { pending = wait; } };
}

test('job access-reference cache is capped, preserves active hits, and clears on logout and same-UID re-login', async () => {
  const f = locationFixture();
  await f.service.getJobTechnicianLocation('job-0'); await f.service.getJobTechnicianLocation('job-0');
  assert.equal(f.writes.length, 1);
  for (let i = 1; i <= 32; i++) await f.service.getJobTechnicianLocation(`job-${i}`);
  await f.service.getJobTechnicianLocation('job-0'); assert.equal(f.writes.length, 34);
  f.session.emit(null); assert.equal(f.session.observers(), 0);
  f.session.emit('customer-a'); await f.service.getJobTechnicianLocation('job-0'); assert.equal(f.writes.length, 35);
  f.session.emit(null); assert.equal(f.session.observers(), 0);
});

test('precise GPS finishing after an account switch is rejected and cannot return the previous session coordinates', async () => {
  const f = locationFixture(); let finish;
  f.hold(new Promise((done) => { finish = done; }));
  const read = f.service.getJobTechnicianLocation('job-a');
  await tick(); f.session.emit('customer-b'); finish(); await assert.rejects(read);
  assert.equal(f.session.observers(), 0);
});
