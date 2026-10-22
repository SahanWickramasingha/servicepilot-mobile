import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService, sessionFixture } from '../lib/subscription-reliability-workloads.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';

const tick = () => new Promise(setImmediate);
const confirmed = { fromCache: false, hasPendingWrites: false };
const network = () => Object.assign(new Error('Local network fixture'), { code: 'unavailable' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const session = sessionFixture(), listeners = [], values = [], errors = [];
  let total = 47, average = 4, failAggregate = false, heldAggregate, heldHead, reads = 0, aggregates = 0;
  const snapshot = (metadata = confirmed) => ({ metadata, docs: [{ id: 'review-a', data: () => ({ rating: 4, customerName: 'Bandara', createdAt: { toMillis: () => 1000 } }) }] });
  const sdk = {
    collection: (_, name) => name, query: (...args) => args, where: (...args) => args,
    orderBy: (...args) => args, documentId: () => '__name__', limit: (n) => n,
    count: () => 'count', average: () => 'average',
    getAggregateFromServer: async () => {
      aggregates++;
      if (heldAggregate) { const hold = heldAggregate; heldAggregate = undefined; return hold.promise; }
      if (failAggregate) throw network();
      return { data: () => ({ count: total, average }) };
    },
    getCountFromServer: async () => ({ data: () => ({ count: total }) }),
    getDocsFromServer: async () => { reads++; if (heldHead) { const hold = heldHead; heldHead = undefined; return hold.promise; } return snapshot(); },
    onSnapshot: (_, options, next, error) => {
      assert.equal(options.includeMetadataChanges, true);
      const listener = { next, error, stopped: false }; listeners.push(listener);
      return () => { listener.stopped = true; };
    },
  };
  const service = loadService(process.env.SERVICEPILOT_REVIEW_SERVICE_SOURCE || 'src/services/technician.service.ts', {
    'firebase/firestore': sdk, '@/src/firebase/config': { auth: session.auth, db: {} },
    '@/src/constants/serviceRequests': {}, '@/functions/src/domain/map': {}, '@/functions/src/domain/serviceAreas': {},
    '@/functions/src/domain/mapProjection': {}, '@/functions/src/domain/availability': {},
    '@/src/utils/technicianRating': loadService('src/utils/technicianRating.ts', {}),
  });
  const subscribe = (id = 'tech-a') => service.subscribeToTechnicianReviews(id,
    (reviews, metadata, summary, cursor, connection) => values.push({ reviews, metadata, summary, cursor, connection }), (e) => errors.push(e));
  return { service, session, values, errors, listeners, snapshot, subscribe,
    last: () => values.at(-1), live: () => listeners.filter((l) => !l.stopped).length,
    stats: () => ({ reads, aggregates }), fail: (value) => { failAggregate = value; },
    totals: (n, stars = 4) => { total = n; average = stars; },
    holdAggregate: () => (heldAggregate = deferred()), holdHead: () => (heldHead = deferred()) };
}

test('temporary aggregate failure retains full totals for existing and new subscribers, then retries without a new snapshot', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), stops = [f.subscribe(), f.subscribe()];
  try {
    f.listeners[0].next(f.snapshot()); await tick();
    f.fail(true); f.service.refreshTechnicianReviews('tech-a'); await tick();
    assert.deepEqual(f.last().summary, { count: 47, average: 4 });
    assert.equal(f.last().connection, 'saved'); assert.equal(f.last().metadata.fromCache, true);
    stops.push(f.subscribe()); assert.equal(f.last().connection, 'saved'); assert.equal(f.live(), 1);
    f.fail(false); t.mock.timers.tick(1000);
    assert.equal(f.listeners.length, 2); assert.equal(f.live(), 1);
    f.listeners[1].next(f.snapshot()); await tick();
    assert.equal(f.last().connection, 'confirmed'); assert.equal(f.last().metadata.fromCache, false);
    stops.push(f.subscribe()); assert.equal(f.last().connection, 'confirmed');
    assert.equal(f.errors.length, 0); assert.equal(f.stats().aggregates, 3);
  } finally { stops.forEach((stop) => stop()); }
  assert.equal(f.live(), 0);
});

test('automatic retry backoff stops after three attempts, Retry makes a fresh shared attempt, and disposal cancels timers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), stops = [f.subscribe(), f.subscribe()];
  try {
    for (const [index, delay] of [[0, 1000], [1, 3000], [2, 10000]]) {
      f.listeners[index].error(network());
      t.mock.timers.tick(delay - 1); assert.equal(f.listeners.length, index + 1);
      t.mock.timers.tick(1); assert.equal(f.listeners.length, index + 2); assert.equal(f.live(), 1);
    }
    f.listeners[3].error(network()); t.mock.timers.tick(120000); assert.equal(f.listeners.length, 4);
    for (let i = 0; i < 10; i++) f.service.retryTechnicianReviews('tech-a');
    assert.equal(f.listeners.length, 5); assert.equal(f.live(), 1);
    f.listeners[4].next(f.snapshot()); await tick(); assert.equal(f.last().connection, 'confirmed');
    f.listeners[4].error(network());
  } finally { stops.forEach((stop) => stop()); }
  t.mock.timers.tick(120000); assert.equal(f.listeners.length, 5); assert.equal(f.live(), 0);
});

test('a no-data aggregate failure recovers and new subscribers receive success rather than a retained shared error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), stops = [f.subscribe()];
  try {
    f.fail(true); f.listeners[0].next(f.snapshot()); await tick();
    assert.equal(f.last().summary, null); assert.equal(f.errors.length, 1);
    stops.push(f.subscribe()); assert.equal(f.errors.length, 2);
    f.fail(false); t.mock.timers.tick(1000); assert.equal(f.last().connection, 'updating');
    f.listeners[1].next(f.snapshot()); await tick();
    const errorCount = f.errors.length; stops.push(f.subscribe());
    assert.equal(f.errors.length, errorCount); assert.equal(f.last().metadata.fromCache, false);
    assert.deepEqual(f.last().summary, { count: 47, average: 4 });
    stops.push(f.subscribe('different-technician'));
    assert.equal(f.listeners.length, 3); assert.equal(f.live(), 2);
    assert.equal(f.values.filter((v) => v.summary).length, 3, 'A different query must not replay the saved result');
  } finally { stops.forEach((stop) => stop()); }
});

test('metadata-only cache-to-server transition recovers; pending writes invalidate an older aggregate confirmation', async () => {
  const f = fixture(), stop = f.subscribe();
  try {
    f.listeners[0].next(f.snapshot()); await tick();
    const old = f.holdAggregate(); f.listeners[0].next(f.snapshot());
    f.listeners[0].next(f.snapshot({ ...confirmed, hasPendingWrites: true }));
    old.resolve({ data: () => ({ count: 999, average: 1 }) }); await tick();
    assert.equal(f.last().metadata.fromCache, true); assert.equal(f.last().summary.count, 47);
    f.listeners[0].next(f.snapshot({ ...confirmed, fromCache: true }));
    f.listeners[0].next(f.snapshot()); await tick();
    assert.equal(f.last().connection, 'confirmed'); assert.equal(f.last().summary.count, 47);
  } finally { stop(); }
});

test('timeout and replaced listener callbacks cannot overwrite a newer successful attempt', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), stop = f.subscribe();
  try {
    const old = f.holdAggregate(); f.listeners[0].next(f.snapshot());
    t.mock.timers.tick(15000); f.service.retryTechnicianReviews('tech-a');
    f.totals(48, 4.5); f.listeners[1].next(f.snapshot()); await tick();
    old.resolve({ data: () => ({ count: 999, average: 1 }) });
    f.listeners[0].error(network()); f.listeners[0].next(f.snapshot()); await tick();
    assert.deepEqual(f.last().summary, { count: 48, average: 4.5 }); assert.equal(f.last().connection, 'confirmed');
    t.mock.timers.tick(120000); assert.equal(f.listeners.length, 2);
  } finally { stop(); }
});

test('an obsolete focus read error cannot replace a newer snapshot success', async () => {
  const f = fixture(), stop = f.subscribe();
  try {
    f.listeners[0].next(f.snapshot()); await tick();
    const old = f.holdHead(); f.service.refreshTechnicianReviews('tech-a');
    f.totals(48); f.listeners[0].next(f.snapshot()); await tick();
    old.reject(network()); await tick();
    assert.equal(f.last().summary.count, 48); assert.equal(f.last().connection, 'confirmed'); assert.equal(f.errors.length, 0);
  } finally { stop(); }
});

test('account switch clears saved ratings and pending retries, even when the same UID later signs in', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), stop = f.subscribe();
  f.listeners[0].next(f.snapshot()); await tick(); f.listeners[0].error(network());
  f.session.emit(null); assert.equal(f.last().summary, null); assert.equal(f.live(), 0);
  f.session.emit('customer-a'); const stopNew = f.subscribe();
  t.mock.timers.tick(1000); assert.equal(f.listeners.length, 2);
  f.listeners[0].next(f.snapshot()); assert.equal(f.last().summary, null);
  stop(); stopNew(); assert.equal(f.session.observers(), 0);
});

test('ten Dashboard → Jobs → History → Dashboard cycles and background/resume coalesce shared revalidation', async () => {
  const f = fixture(), appListeners = new Set(); let focus;
  const appState = { currentState: 'active', addEventListener: (_, next) => { appListeners.add(next); return { remove: () => appListeners.delete(next) }; } };
  const h = renderHarness('src/hooks/useTechnicianReviews.ts', { effects: true, exportName: 'useTechnicianReviews', dependencies: {
    'firebase/auth': { onAuthStateChanged: (_, next) => { next(f.session.auth.currentUser); return f.session.watch(next); } },
    '@/src/firebase/config': { auth: f.session.auth }, '@/src/services/technician.service': f.service,
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } }, 'react-native': { AppState: appState },
  } });
  try {
    h.render('tech-a'); let blur = focus(); f.listeners[0].next(f.snapshot()); await tick();
    for (let i = 0; i < 10; i++) {
      blur(); // Dashboard loses focus while Jobs/History are visited; tabs stay mounted.
      blur = focus(); f.service.refreshTechnicianReviews('tech-a'); await tick();
      const state = h.render('tech-a');
      assert.equal(state.status, 'ready'); assert.equal(state.errorMessage, '');
      assert.deepEqual(state.summary, { count: 47, average: 4 }); assert.equal(f.live(), 1);
    }
    f.listeners[0].next(f.snapshot({ ...confirmed, fromCache: true })); f.fail(true);
    for (const next of appListeners) next('background'); for (const next of appListeners) next('active'); await tick();
    assert.equal(h.render('tech-a').errorMessage, 'Showing saved ratings');
    f.fail(false); for (const next of appListeners) next('background'); for (const next of appListeners) next('active');
    f.listeners.at(-1).next(f.snapshot()); await tick();
    const recovered = h.render('tech-a'); assert.equal(recovered.status, 'ready'); assert.equal(recovered.updating, false); assert.equal(recovered.errorMessage, '');
    blur(); assert.equal(appListeners.size, 0);
  } finally { h.cleanup(); }
  assert.equal(f.live(), 0); assert.equal(f.session.observers(), 0);
});

test('rating strings contain only the rating/count; saved zero is never presented as No ratings yet', () => {
  const rating = loadService('src/utils/technicianRating.ts', {});
  for (const status of ['ready', 'stale']) for (const updating of [false, true]) {
    const display = rating.getTechnicianRatingDisplay({ status, updating, summary: { count: 1, average: 4 }, errorMessage: 'Technical diagnostic must never be in summary' });
    assert.equal(display.value, '4.0'); assert.equal(display.countLabel, '1 review'); assert.equal(display.label, '4.0 (1 review)');
  }
  assert.equal(rating.getTechnicianRatingDisplay({ status: 'stale', summary: { count: 0, average: 0 } }).value, 'Ratings unconfirmed');
});

test('dashboard badge stays numeric with one status, one Retry, and an accessible View Reviews action', () => {
  for (const updating of [false, true]) {
    let retries = 0; const routes = [];
    const ratings = { status: 'stale', updating, summary: { count: 1, average: 4 }, errorMessage: 'Private technical error', retry: () => retries++ };
    const h = renderHarness('app/technician/(tabs)/index.tsx', { dependencies: {
      'expo-router': { router: { push: (path) => routes.push(path) } },
      '@/src/firebase/config': { auth: { currentUser: { uid: 'tech-a' } } },
      '@/src/hooks/useTechnicianWorkspace': { useTechnicianWorkspace: () => ({ uid: 'tech-a', profile: { uid: 'tech-a', role: 'technician' }, requests: [], loading: false }) },
      '@/src/hooks/useTechnicianReviews': { useTechnicianReviews: () => ratings }, '@/src/services/notification.service': {},
      '@/src/components/technicians/TechnicianAvailabilityPanel': { TechnicianAvailabilityPanel: 'Availability' },
    } });
    h.render(); const feedback = h.elements().find((e) => e.type?.name === 'TechnicianRatingStatus'); feedback.type(feedback.props);
    const text = h.elements().filter((e) => e.type === 'Text').map((e) => e.props.children);
    assert.equal(text.filter((value) => value === '4.0').length, 1);
    assert.equal(text.filter((value) => value === '4.0 (1 review)').length, 1);
    assert.equal(text.filter((value) => value === (updating ? 'Updating ratings…' : 'Showing saved ratings')).length, 1);
    assert.ok(!text.some((value) => typeof value === 'string' && /out of date|Private technical/.test(value)));
    const retry = h.elements().filter((e) => e.props?.accessibilityLabel === 'Retry reviews');
    assert.equal(retry.length, updating ? 0 : 1); retry[0]?.props.onPress(); assert.equal(retries, updating ? 0 : 1);
    h.elements().find((e) => e.props?.accessibilityLabel === 'View reviews received by you').props.onPress();
    assert.deepEqual(routes, ['/technician/performance']); h.cleanup();
  }
});
