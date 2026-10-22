import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService, sessionFixture } from '../lib/subscription-reliability-workloads.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';
const network = () => Object.assign(new Error('Local network fixture'), { code: 'unavailable' });
const snapshot = (rows = []) => ({ docs: rows.map((row) => ({ id: row.id, data: () => row })) });
function fixture() {
  const session = sessionFixture(), listeners = [], values = [], errors = [];
  const service = loadService('src/services/notification.service.ts', {
    '@/src/firebase/config': { db: {}, auth: session.auth }, 'firebase/app': { FirebaseError: Error },
    'firebase/firestore': { collection: (_, name) => name, where: (...args) => args, query: (...args) => args,
      onSnapshot: (query, next, error) => { const listener = { query, next, error, stopped: false }; listeners.push(listener); return () => { listener.stopped = true; }; } },
  });
  const subscribe = () => service.subscribeToNotificationCenter({ userId: 'customer-a', role: 'customer' },
    (items, status) => values.push({ items, status }), (error) => errors.push(error));
  return { service, session, listeners, values, errors, subscribe, last: () => values.at(-1),
    settle: (offset) => listeners.slice(offset, offset + 4).forEach((l) => l.next(snapshot())) };
}
test('shared notification errors survive unrelated source updates and disappear only after recovery; Retry recreates one shared set', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), stops = [f.subscribe(), f.subscribe()];
  try {
    assert.equal(f.listeners.length, 4); f.settle(0); assert.equal(f.last().status.loading, false);
    f.listeners[0].error(network()); assert.deepEqual(f.last().status.errors, ['personal-notifications']);
    f.listeners[1].next(snapshot()); assert.deepEqual(f.last().status.errors, ['personal-notifications']);
    stops.push(f.subscribe()); assert.deepEqual(f.last().status.errors, ['personal-notifications']);
    t.mock.timers.tick(1000); assert.equal(f.listeners.length, 8); assert.ok(f.listeners.slice(0, 4).every((l) => l.stopped));
    f.settle(4); assert.deepEqual(f.last().status.errors, []);
    const errors = f.errors.length; stops.push(f.subscribe()); assert.equal(f.errors.length, errors); assert.deepEqual(f.last().status.errors, []);
    f.listeners[4].error(network()); for (let tap = 0; tap < 10; tap++) f.service.retryNotificationCenter('customer-a', 'customer');
    assert.equal(f.listeners.length, 12); assert.equal(f.listeners.filter((l) => !l.stopped).length, 4);
    f.settle(8); t.mock.timers.tick(120000); assert.equal(f.listeners.length, 12);
  } finally { stops.forEach((stop) => stop()); }
  assert.ok(f.listeners.every((l) => l.stopped)); assert.equal(f.session.observers(), 0);
});
test('notification retries have bounded backoff and account changes cancel pending work and reject late callbacks', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), stop = f.subscribe();
  for (const [attempt, delay] of [[0, 1000], [1, 3000], [2, 10000]]) {
    f.listeners[attempt * 4].error(network());
    f.listeners.slice(attempt * 4 + 1, attempt * 4 + 4).forEach((l) => l.next(snapshot()));
    t.mock.timers.tick(delay - 1); assert.equal(f.listeners.length, (attempt + 1) * 4);
    t.mock.timers.tick(1); assert.equal(f.listeners.length, (attempt + 2) * 4);
  }
  f.listeners[12].error(network()); t.mock.timers.tick(120000); assert.equal(f.listeners.length, 16);
  f.session.emit(null); const count = f.values.length; f.listeners[12].next(snapshot([{ id: 'old-private' }])); assert.equal(f.values.length, count);
  stop(); assert.ok(f.listeners.every((l) => l.stopped));
});
test('the notification hook clears recovered errors and removes resume observers on blur', () => {
  const session = sessionFixture(), appListeners = new Set(); let focus, next, error, profile; const retries = [];
  const h = renderHarness('src/hooks/useNotificationCenter.ts', { effects: true, exportName: 'useNotificationCenter', dependencies: {
    'firebase/auth': session.sdk, '@/src/firebase/config': { auth: session.auth },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, callback) => { appListeners.add(callback); return { remove: () => appListeners.delete(callback) }; } } },
    '@/src/services/user.service': { subscribeToUserProfile: (_, callback) => { profile = callback; return () => {}; } },
    '@/src/services/notification.service': { retryNotificationCenter: (...args) => retries.push(args), subscribeToNotificationCenter: (_, onNext, onError) => { next = onNext; error = onError; return () => {}; } },
  } });
  h.render('customer'); session.emit('customer-a'); profile({ uid: 'customer-a', role: 'customer', accountStatus: 'active' });
  const blur = focus(); error(network(), { queryType: 'personal-notifications' });
  assert.ok(h.render('customer').errorMessage); next([], { errors: [], loading: false }); assert.equal(h.render('customer').errorMessage, '');
  for (const state of ['background', 'active']) for (const callback of appListeners) callback(state);
  assert.equal(retries.length, 2); blur(); assert.equal(appListeners.size, 0);
  const previousNext = next; session.emit(null); previousNext([{ id: 'private-old' }]); assert.deepEqual(h.render('customer').items, []); h.cleanup();
});

for (const [screen, role, route] of [['app/(tabs)/notifications.tsx', 'customer', '/request-details'], ['app/technician/notifications.tsx', 'technician', '/technician/job-details']]) {
  test(`${role} notification taps open the intended job and cannot navigate after an account switch`, async () => {
    const auth = { currentUser: { uid: 'viewer-a' } }, routes = []; let resolve, reject;
    const item = { id: 'notice-a', userId: 'viewer-a', source: 'personal', requestId: 'job-a', relatedRequestId: 'job-a', title: 'Local notice', message: 'Local fixture', read: false, priority: 'normal', type: 'job_completed' };
    const h = renderHarness(screen, { effects: true, dependencies: {
      'expo-router': { router: { push: (route) => routes.push(route) } }, '@/src/firebase/config': { auth },
      '@/src/hooks/useNotificationCenter': { useNotificationCenter: () => ({ items: [item], loading: false, errorMessage: '', retry() {} }) },
      '@/src/services/notification.service': { markNotificationRead: () => new Promise((yes, no) => { resolve = yes; reject = no; }) },
    } });
    const open = () => { h.render(); return h.elements().find((e) => e.type === 'TouchableOpacity' && e.key === 'personal-notice-a').props.onPress(); };
    const old = open(); auth.currentUser = { uid: 'viewer-b' }; resolve(); await old; assert.deepEqual(routes, []);
    auth.currentUser = { uid: 'viewer-a' }; const current = open(); resolve(); await current;
    assert.deepEqual(routes, [{ pathname: route, params: { id: 'job-a' } }]);
    const failedRead = open(); reject(network()); await failedRead; assert.equal(routes.length, 2);
    h.cleanup();
  });
}
