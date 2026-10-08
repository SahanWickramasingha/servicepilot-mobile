import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { performanceTestDependency } from '../lib/performance-test-deps.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';
const require = createRequire(import.meta.url), ts = require('typescript');
function pure(path) {
  const output = {};
  new Function('exports', ts.transpileModule(readFileSync(new URL('../../'+path, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(output);
  return output;
}
const { createSharedSubscription } = pure('src/utils/sharedSubscription.ts');
const { liveDocuments } = pure('src/utils/liveDocuments.ts');
function fixture() {
  let viewer = 'customer-a', watch, watchers = 0;
  const connections = [];
  const subscribe = createSharedSubscription({ current: () => viewer, watch: (callback) => {
    watchers++; watch = callback; return () => { watchers--; };
  } }, () => [null]);
  const connect = (next, error) => { const entry = { next, error, stopped: false }; connections.push(entry); return () => { entry.stopped = true; }; };
  return { subscribe, connect, connections, switch: (uid) => { viewer = uid; watch?.(); }, watchers: () => watchers };
}
test('multiple consumers share live data, replay only active snapshots and release at the final unsubscribe', () => {
  const f = fixture(), a = [], b = [];
  const stopA = f.subscribe('own-profile', f.connect, (value) => a.push(value), assert.fail);
  const record = { availability: 'available', address: 'Private A' };
  f.connections[0].next(record);
  const stopB = f.subscribe('own-profile', f.connect, (value) => b.push(value), assert.fail);
  assert.equal(f.connections.length, 1); assert.equal(b[0], record);
  stopA(); assert.equal(f.connections[0].stopped, false);
  f.connections[0].next({ availability: 'offline' }); assert.equal(b.at(-1).availability, 'offline');
  stopB(); assert.equal(f.connections[0].stopped, true); assert.equal(f.watchers(), 0);
  const c = [], stopC = f.subscribe('own-profile', f.connect, (value) => c.push(value), assert.fail);
  assert.deepEqual(c, []); assert.equal(f.connections.length, 2); stopC();
});
test('logout/account changes clear private state and block obsolete data/errors even with the same resource key', () => {
  const f = fixture(), a = [], b = [], errors = [];
  const stopA = f.subscribe('same-key', f.connect, (value) => a.push(value), (error) => errors.push(error));
  const old = f.connections[0]; old.next({ address: 'Private A' });
  f.switch('customer-b'); assert.equal(old.stopped, true); assert.equal(a.at(-1), null); assert.equal(f.watchers(), 0);
  const stopB = f.subscribe('same-key', f.connect, (value) => b.push(value), (error) => errors.push(error));
  old.next({ availability: 'available' }); old.error(new Error('Late denial'));
  assert.deepEqual(b, []); assert.deepEqual(errors, []);
  stopA(); assert.equal(f.connections[1].stopped, false);
  f.connections[1].next({ address: 'Private B' }); f.switch(null);
  assert.equal(b.at(-1), null); assert.equal(f.watchers(), 0); stopB();
});
test('query keys stay separate; errors clear replay data and reach late consumers without a loading dead end', () => {
  const f = fixture(), errors = [], a = [], b = [];
  const stopA = f.subscribe('a', f.connect, (value) => a.push(value), (error) => errors.push(error));
  const stopOther = f.subscribe('b', f.connect, () => {}, assert.fail);
  f.connections[0].next({ availability: 'available' });
  const error = Object.assign(new Error('Denied'), { code: 'permission-denied' });
  f.connections[0].error(error); assert.equal(a.at(-1), null);
  const stopB = f.subscribe('a', f.connect, (value) => b.push(value), (error) => errors.push(error));
  assert.deepEqual(b, [null]); assert.deepEqual(errors, [error, error]);
  stopA(); stopB(); stopOther(); assert.equal(f.watchers(), 0);
});
test('synchronous connection failures release the session observer and can be retried', () => {
  const f = fixture();
  assert.throws(() => f.subscribe('bad', () => { throw new Error('Invalid query'); }, () => {}, () => {}), /Invalid query/);
  assert.equal(f.watchers(), 0);
  const stop = f.subscribe('bad', f.connect, () => {}, () => {}); assert.equal(f.connections.length, 1); stop();
});
test('incremental snapshots preserve row identity, query order, removals and metadata-only confirmations', () => {
  let calls = 0;
  const rows = liveDocuments((id, data) => { calls++; return { id, ...data }; });
  const doc = (id, state) => ({ id, data: () => ({ state }) });
  const a = doc('a', 'accepted'), b = doc('b', 'in_progress');
  const first = rows({ docs: [a, b], docChanges: () => [a, b].map((doc) => ({ type: 'added', doc })) });
  const changed = doc('b', 'completed'), c = doc('c', 'requested');
  const second = rows({ docs: [c, a, changed], docChanges: () => [{ type: 'added', doc: c }, { type: 'modified', doc: changed }] });
  assert.equal(calls, 4); assert.equal(first[0], second[1]); assert.equal(second[2].state, 'completed');
  const confirmed = rows({ docs: [c, a, changed], docChanges: () => [] });
  assert.equal(calls, 4); assert.equal(confirmed[0], second[0]);
  const removed = rows({ docs: [a, changed], docChanges: () => [{ type: 'removed', doc: c }] });
  assert.deepEqual(removed.map((row) => row.id), ['a', 'b']); assert.equal(calls, 4);
});
test('lightweight metadata and lazily loaded geometry match every original district and its bounds', () => {
  const source = JSON.parse(readFileSync(new URL('../../functions/src/domain/district-boundaries.json', import.meta.url), 'utf8'));
  const map = require('../../functions/lib/domain/map.js');
  assert.equal(map.DISTRICTS.length, 25);
  for (const feature of source.features) {
    const district = map.DISTRICTS.find((d) => d.name === feature.name.replace(/ District$/, ''));
    assert.deepEqual(district.geometry, feature.geometry);
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const points = polygons.flatMap((polygon) => polygon.flat());
    assert.deepEqual(district.bounds, [Math.min(...points.map((p) => p[1])), Math.min(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0]))]);
    assert.equal(district.geometry, district.geometry);
  }
});

// Actual service integration uses the same pools/reducer rather than a passthrough mock.
test('service consumers share jobs/reviews and preserve real reviewer names and live status transitions', () => {
  const auth = { currentUser: { uid: 'gihan' } }, listeners = [], results = [];
  const sdk = { collection: (_, path) => path, where: () => ({}), query: (path) => path,
    onSnapshot: (...args) => { const options = typeof args[1] === 'object';
      const listener = { next: args[options ? 2 : 1], stopped: false }; listeners.push(listener); return () => { listener.stopped = true; }; } };
  function service(path) {
    const deps = { 'firebase/firestore': sdk, '@/src/firebase/config': { auth, db: {} },
      '@/src/constants/serviceRequests': {}, '@/src/services/notification.service': {}, '@/src/services/user.service': {},
      '@/src/services/technician.service': {}, '@/functions/src/domain/availability': require('../../functions/lib/domain/availability.js'),
      '@/functions/src/domain/map': require('../../functions/lib/domain/map.js'), '@/functions/src/domain/serviceAreas': require('../../functions/lib/domain/serviceAreas.js'),
      '@/functions/src/domain/mapProjection': {}, '@/src/utils/technicianRating': { isEligibleReviewRating: (value) => value === 5 } };
    const output = {}; new Function('exports', 'require', ts.transpileModule(readFileSync(new URL('../../'+path, import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(output,
      (id) => deps[id] ?? performanceTestDependency(id, deps)); return output;
  }
  const request = service('src/services/request.service.ts'), reviews = service('src/services/technician.service.ts');
  const stops = [];
  for (let i = 0; i < 4; i++) stops.push(request.subscribeToTechnicianRequests('gihan', (value) => results.push(value), assert.fail));
  assert.equal(listeners.length, 1);
  const doc = { id: 'job', data: () => ({ technicianId: 'gihan', status: 'in_progress' }) };
  listeners[0].next({ docs: [doc], docChanges: () => [{ type: 'added', doc }] });
  assert.equal(results.length, 4); assert.ok(results.every((rows) => rows[0].status === 'in_progress')); assert.equal(results[0], results[1]);
  const ratings = [];
  for (let i = 0; i < 3; i++) stops.push(reviews.subscribeToTechnicianReviews('gihan', (value, meta) => ratings.push({ value, meta }), assert.fail));
  assert.equal(listeners.length, 2);
  const review = { id: 'bandara', data: () => ({ rating: 5, customerName: 'Bandara', comment: 'Excellent service' }) };
  listeners[1].next({ docs: [review], docChanges: () => [{ type: 'added', doc: review }], metadata: { fromCache: false, hasPendingWrites: false } });
  assert.equal(ratings.length, 3); assert.ok(ratings.every((item) => item.value[0].customerName === 'Bandara'));
  stops.forEach((stop) => stop()); assert.ok(listeners.every((entry) => entry.stopped));
});

test('map controls reuse geometry/groups while actual GPS, freshness and district changes still update', () => {
  const grouping = pure('src/utils/technicianMarkerGroups.ts');
  let calculations = 0;
  const h = renderHarness('src/components/maps/TechnicianMap.native.tsx', { dependencies: {
    '@/src/utils/technicianMarkerGroups': { groupMarkerPoints: (...args) => { calculations++; return grouping.groupMarkerPoints(...args); } },
  } });
  const map = require('../../functions/lib/domain/map.js'), district = map.DISTRICTS.find((d) => d.id === 'kandy');
  const point = { id: 'gihan', title: 'Gihan', latitude: 7.29, longitude: 80.63, stale: false };
  const props = { district, points: [point], onSelect() {} };
  const coordinates = new Set();
  for (let i = 0; i < 20; i++) { h.render({ ...props, focusLocationStatus: String(i) }); coordinates.add(h.elements().find((e) => e.type === 'Polygon').props.coordinates); }
  assert.equal(calculations, 1); assert.equal(coordinates.size, 1);
  const compare = h.memoComponents.find((item) => item.component.name === 'WrenchPin').compare;
  const pin = { group: [point], selected: false, onSelect: props.onSelect };
  assert.equal(compare(pin, { ...pin, group: [{ ...point }] }), true);
  for (const change of [{ stale: true }, { latitude: 7.3 }, { longitude: 80.7 }, { title: 'New name' }, { id: 'other' }]) {
    assert.equal(compare(pin, { ...pin, group: [{ ...point, ...change }] }), false);
  }
  assert.equal(compare(pin, { ...pin, selected: true }), false);
  assert.equal(compare(pin, { ...pin, onSelect() {} }), false);
  h.render({ ...props, points: [{ ...point, latitude: 7.3, stale: true }] }); assert.equal(calculations, 2);
  assert.equal(h.elements().find((e) => e.type === 'Circle').props.center.latitude, 7.3);
  h.render({ ...props, district: map.DISTRICTS.find((d) => d.id === 'colombo') });
  assert.notEqual(h.elements().find((e) => e.type === 'Polygon').props.coordinates, [...coordinates][0]);
});

test('growing request lists page without changing totals, stable IDs or booking navigation', () => {
  const requests = Array.from({ length: 1000 }, (_, i) => ({ id: 'job-'+i, status: 'completed', priority: 'normal' }));
  const routes = [];
  const h = renderHarness('app/(tabs)/bookings.tsx', { initial: ['all', requests, false, ''], dependencies: {
    'expo-router': { router: { push: (route) => routes.push(route) } }, '@/src/services/request.service': { formatRequestDate: () => '' }, '@/src/firebase/config': {},
  } });
  h.render(); const list = () => h.elements().find((e) => e.type === 'FlatList').props;
  assert.equal(list().data.length, 20); assert.equal(list().keyExtractor(requests[0]), 'job-0');
  assert.equal(h.elements().find((e) => e.type?.name === 'SummaryCard' && e.props.label === 'Completed').props.value, '1000');
  list().ListFooterComponent.props.onPress(); h.render(); assert.equal(list().data.length, 40);
  const row = list().renderItem({ item: requests[25] }); const rendered = row.type(row.props);
  rendered.props.onPress(); assert.deepEqual(routes.at(-1), { pathname: '/request-details', params: { id: 'job-25' } });
});

test('two immediate Submit taps create only one request; a settled failure permits a retry', async () => {
  const auth = { currentUser: { uid: 'customer' } }, profile = { uid: 'customer' }, technician = { uid: 'gihan', availability: 'available', specialization: 'Electrical' };
  let creations = 0, finish;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const h = renderHarness('app/(tabs)/create-request.tsx', { initial: [profile, technician, 'Electrical', 'Repair', 'Description', 'Private', 'Kandy', tomorrow,
    false, '11:00 AM', 'normal', 0, false, false, '', ''], dependencies: {
    'expo-router': { useLocalSearchParams: () => ({ technicianId: 'gihan' }), router: { replace() {} } }, '@/src/firebase/config': { auth },
    '@react-native-community/datetimepicker': { __esModule: true, default: 'DateTimePicker' },
    '@/src/services/user.service': {}, '@/src/services/technician.service': {},
    '@/src/services/request.service': { createServiceRequest: () => { creations++; return new Promise((_, reject) => { finish = reject; }); } },
    '@/src/components/technicians/AvailabilityBadge': { AvailabilityBadge: 'AvailabilityBadge' },
  } });
  h.render();
  const submit = h.elements().find((element) => element.type === 'TouchableOpacity' && element.props.onPress?.name === 'handleSubmit').props.onPress;
  const first = submit(), duplicate = submit(); assert.equal(creations, 1);
  finish(new Error('Test failure'));
  const savedError = console.error; console.error = () => {};
  try { await Promise.all([first, duplicate]); const retry = submit(); assert.equal(creations, 2); finish(new Error('Test failure')); await retry; }
  finally { console.error = savedError; }
});
