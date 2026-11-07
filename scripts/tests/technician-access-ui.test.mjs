import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { renderHarness } from '../lib/performance-render-harness.mjs';
const tick = () => new Promise(setImmediate);
function fixture(home = false) {
  const streams = [], retries = [], auth = { currentUser: { uid: 'customer' } };
  const subscribeToApprovedTechnicians = (next, error, filters) => {
    const stream = { next, error, filters, stopped: false }; streams.push(stream); return () => { stream.stopped = true; };
  };
  const h = renderHarness(home ? 'app/(tabs)/index.tsx' : 'app/(tabs)/technicians.tsx', { effects: true, dependencies: {
    'expo-router': { router: { push() {}, setParams() {} }, useLocalSearchParams: () => ({}) },
    'firebase/auth': { onAuthStateChanged: (_, next) => { next(auth.currentUser); return () => {}; } },
    '@/src/firebase/config': { auth },
    '@/src/components/auth/AccountSessionContext': { useAccountSession: () => ({ state: { phase: 'ready', user: auth.currentUser,
      profile: { uid: 'customer', role: 'customer', fullName: 'Customer', serviceDivision: 'Kandy' } } }) },
    '@/src/services/technician.service': { subscribeToApprovedTechnicians, retryApprovedTechnicians: filters => retries.push(filters) },
    '@/src/services/user.service': { getUserProfile: async () => ({ uid: 'customer', role: 'customer', fullName: 'Customer', serviceDivision: 'Kandy' }), getTechnicianDivision: () => 'Kandy' },
    '@/src/services/request.service': { subscribeToCustomerRequests: (_, next) => { next([]); return () => {}; }, formatRequestDate: () => '' },
    '@/src/services/notification.service': { subscribeToCustomerNotifications: (_, next) => { next([]); return () => {}; } },
    '@/src/components/technicians/TechnicianRating': { TechnicianRating: 'TechnicianRating' },
  } });
  const render = () => { h.render(); return h.elements(); };
  const text = () => h.elements().filter(e => e.type === 'Text').map(e => [e.props.children].flat(Infinity).join('')).join(' | ');
  return { ...h, render, streams, retries, text };
}
test('customer directory distinguishes loading, permission failure and confirmed empty, and Retry preserves filters', async () => {
  const quiet = mock.method(console, 'error', () => {});
  const f = fixture(); f.render();
  assert.ok(f.elements().some(e => e.type === 'ActivityIndicator'));
  f.streams[0].error(new Error('permission-denied')); f.render();
  assert.ok(f.text().includes('Unable to load technicians.'));
  assert.equal(f.elements().find(e => e.type === 'FlatList').props.ListEmptyComponent, null);
  f.elements().find(e => e.props.accessibilityLabel === 'Retry technicians').props.onPress(); f.render();
  assert.deepEqual(f.retries, [{ category: 'All', division: 'All', pageCount: 1 }]);
  f.streams[0].next([]); f.render();
  assert.ok(!f.text().includes('Unable to load technicians.'));
  assert.ok(f.elements().find(e => e.type === 'FlatList').props.ListEmptyComponent);
  f.cleanup(); assert.equal(f.streams[0].stopped, true); quiet.mock.restore(); await tick();
});
test('Dashboard reports technician failure independently and Retry targets its shared directory', async () => {
  const quiet = mock.method(console, 'error', () => {});
  const f = fixture(true); f.render(); await tick(); f.render();
  assert.ok(f.elements().some(e => e.props.accessibilityLabel === 'Loading technicians'));
  f.streams[0].error(new Error('Denied')); f.render();
  assert.ok(f.text().includes('Unable to load technicians.'));
  assert.ok(!f.elements().some(e => e.props.title === 'Top Rated Technicians'));
  f.elements().find(e => e.props.accessibilityLabel === 'Retry technicians').props.onPress(); f.render();
  assert.equal(f.retries.length, 1); assert.ok(f.elements().some(e => e.props.accessibilityLabel === 'Loading technicians'));
  f.streams[0].next([]); f.render(); assert.ok(f.elements().some(e => e.props.title === 'Top Rated Technicians'));
  f.cleanup(); assert.equal(f.streams[0].stopped, true); quiet.mock.restore();
});
