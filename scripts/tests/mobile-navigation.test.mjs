import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHarness } from '../lib/performance-render-harness.mjs';
import { customerMountWorkload, jobsRenderWorkload, directoryPagingWorkload, directoryScreenFixture } from '../lib/mobile-navigation-workloads.mjs';

function customerFixture() {
  const auth = { currentUser: { uid: 'customer-a' } }, streams = [];
  let state = { phase: 'ready', user: auth.currentUser, profile: { uid: 'customer-a', role: 'customer', fullName: 'Private A' } };
  const subscribe = kind => (...args) => {
    const [next, error] = kind === 'technicians' ? args : args.slice(1);
    const entry = { kind, next, error, stopped: false }; streams.push(entry);
    return () => { entry.stopped = true; };
  };
  const dependencies = {
    'expo-router': { router: {} }, '@/src/firebase/config': { auth },
    '@/src/components/auth/AccountSessionContext': { useAccountSession: () => ({ state }) },
    '@/src/services/user.service': { getTechnicianDivision: () => '', getUserProfile: () => assert.fail('root profile must be reused') },
    '@/src/services/auth.service': {},
    '@/src/services/request.service': { subscribeToCustomerRequests: subscribe('requests'), formatRequestDate: () => '' },
    '@/src/services/notification.service': { subscribeToCustomerNotifications: subscribe('notifications') },
    '@/src/services/technician.service': { subscribeToApprovedTechnicians: subscribe('technicians') },
  };
  const home = renderHarness('app/(tabs)/index.tsx', { effects: true, dependencies });
  const profile = renderHarness('app/(tabs)/profile.tsx', { effects: true, dependencies });
  const render = () => { home.render(); profile.render(); };
  const has = value => [...home.elements(), ...profile.elements()].some(e =>
    typeof e.props?.children === 'string' && e.props.children.includes(value));
  return { auth, streams, home, profile, render, has, get state() { return state; }, set state(next) { state = next; },
    settle() { for (const entry of streams.filter(s => !s.stopped)) entry.next([]); render(); },
    cleanup() { home.cleanup(); profile.cleanup(); } };
}

test('customer mount starts independent data immediately using the authoritative live profile', () => {
  assert.deepEqual(customerMountWorkload(), { redundantCustomerProfileReads: 0, subscriptionsStartedWithoutExtraProfileResponse: 3,
    customerSubscriptionsAfterCleanup: 0, customerAuthObserversAfterCleanup: 0 });
});

test('same-session profile updates and 30 tab renders do not restart dashboard listeners or reload Profile', () => {
  const f = customerFixture(); f.render(); f.settle();
  assert.equal(f.has('Private A'), true);
  for (let i = 0; i < 30; i++) {
    f.state = { ...f.state, profile: { ...f.state.profile, fullName: 'Updated A '+i } };
    f.render();
    assert.equal(f.has('Updated A '+i), true);
    assert.equal(f.profile.elements().some(e => e.type === 'ActivityIndicator'), false);
  }
  assert.equal(f.streams.length, 3);
  f.cleanup(); assert.ok(f.streams.every(s => s.stopped));
});

test('customer account change masks old content immediately, drops listeners and ignores late data/errors', () => {
  const f = customerFixture(); f.render(); f.settle();
  const old = [...f.streams];
  f.auth.currentUser = { uid: 'customer-b' }; // Auth changes before root observer finishes.
  f.render(); assert.equal(f.has('Private A'), false);
  assert.ok(old.every(s => s.stopped));
  for (const s of old) { s.next([]); s.error(new Error('late'), { queryType: 'fixture' }); }
  f.state = { phase: 'ready', user: f.auth.currentUser, profile: { uid: 'customer-b', role: 'customer', fullName: 'Private B' } };
  f.render(); f.settle(); assert.equal(f.has('Private A'), false); assert.equal(f.has('Private B'), true);
  f.state = { phase: 'denied', message: 'Access revoked' }; f.render();
  assert.equal(f.has('Private B'), false); assert.ok(f.streams.every(s => s.stopped));
  f.auth.currentUser = null; f.state = { phase: 'signed-out' }; f.render(); f.cleanup();
});

test('technician Jobs virtualizes all matching jobs with a bounded initial batch and stable keys', () => {
  assert.deepEqual(jobsRenderWorkload(), { technicianJobs: 200, eagerlyCreatedJobRows: 0, virtualizedJobRows: 200, initialJobBatch: 6 });
});

test('directory paging retains loaded rows with progress, then clears on failed revalidation', () => {
  assert.deepEqual(directoryPagingWorkload(), { directoryVisibleWhilePaging: true, directoryRowsWhilePaging: 8 });
  const f = directoryScreenFixture();
  f.streams[0].next([{ uid: 'a', fullName: 'Tech A' }]); f.streams[0].filters.onHasMore(true); f.render();
  f.loadMore(); f.render();
  assert.equal(f.list().props.data[0].uid, 'a'); assert.equal(f.streams[0].stopped, true);
  assert.ok(f.h.elements().some(e => e.props.accessibilityLabel === 'Loading more technicians'));
  const quiet = console.error; console.error = () => {};
  try { f.streams[1].error(Object.assign(new Error('Denied'), { code: 'permission-denied' })); }
  finally { console.error = quiet; }
  f.render(); assert.deepEqual(f.list().props.data, []);
  assert.ok(f.h.elements().some(e => e.props.accessibilityLabel === 'Retry technicians'));
  f.h.cleanup(); assert.ok(f.streams.every(s => s.stopped)); assert.equal(f.session.observers(), 0);
});

test('directory filter/account changes never retain another scope or accept late page callbacks', () => {
  const f = directoryScreenFixture();
  f.streams[0].next([{ uid: 'a', fullName: 'Tech A' }]); f.render();
  f.h.elements().find(e => e.props.label === 'Plumbing').props.onPress(); f.render();
  assert.equal(f.list(), undefined); // Initial loading for a different filter.
  assert.equal(f.streams[0].stopped, true);
  f.streams[0].next([{ uid: 'old', fullName: 'Obsolete' }]); f.render(); assert.equal(f.list(), undefined);
  f.streams[1].next([{ uid: 'b', fullName: 'Tech B' }]); f.render(); assert.equal(f.list().props.data[0].uid, 'b');
  f.session.emit('customer-b'); f.render(); assert.equal(f.list(), undefined);
  f.streams[1].next([{ uid: 'old', fullName: 'Obsolete' }]); f.render(); assert.equal(f.list(), undefined);
  f.streams[2].next([]); f.render(); assert.deepEqual(f.list().props.data, []);
  f.h.cleanup(); assert.ok(f.streams.every(s => s.stopped)); assert.equal(f.session.observers(), 0);
});

test('virtualized job actions retain correct IDs, duplicate guards and live availability', async () => {
  const job = { id: 'actual-job', title: 'Repair', status: 'accepted', preferredDate: '', preferredTime: '', priority: 'normal' };
  let available = 'available', finish;
  const calls = [];
  const h = renderHarness('app/technician/(tabs)/jobs.tsx', { dependencies: {
    'expo-router': { router: {} },
    '@/src/hooks/useTechnicianWorkspace': { useTechnicianWorkspace: () => ({ profile: { availability: available }, requests: [job], loading: false, errorMessage: '' }) },
    '@/src/services/request.service': { updateTechnicianRequestStatus: (id, status) => {
      calls.push({ id, status }); return new Promise(resolve => { finish = resolve; });
    } },
  } });
  h.render();
  let list = h.elements().find(e => e.type === 'FlatList');
  assert.equal(list.props.keyExtractor(job), job.id);
  let row = list.props.renderItem({ item: job });
  assert.equal(row.props.canAccept, true);
  const first = row.props.onStart(), duplicate = row.props.onStart();
  assert.deepEqual(calls, [{ id: job.id, status: 'in_progress' }]);
  finish(); await Promise.all([first, duplicate]);
  available = 'offline'; h.render();
  list = h.elements().find(e => e.type === 'FlatList'); row = list.props.renderItem({ item: job });
  assert.equal(row.props.canAccept, false); assert.equal(row.props.job, job);
  h.cleanup();
});
