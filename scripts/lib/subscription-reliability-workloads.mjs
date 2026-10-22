// Deterministic adapters execute the actual screen/service code. No Firebase network access.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { renderHarness } from './performance-render-harness.mjs';
import { performanceTestDependency } from './performance-test-deps.mjs';
const tick = () => new Promise(setImmediate);
const require = createRequire(import.meta.url);

export function sessionFixture() {
  const callbacks = new Set(), auth = { currentUser: { uid: 'customer-a' } };
  const watch = (next) => { callbacks.add(next); return () => callbacks.delete(next); };
  auth.onAuthStateChanged = watch;
  return { auth, watch, sdk: { onAuthStateChanged: (_, next) => watch(next) },
    emit(uid) { auth.currentUser = uid ? { uid } : null; for (const next of [...callbacks]) next(auth.currentUser); },
    observers: () => callbacks.size };
}

export function loadService(path, dependencies, root = '.') {
  const output = {};
  const code = ts.transpileModule(readFileSync(resolve(root, path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', '__DEV__', code)(output, (id) => {
    const result = dependencies[id] ?? performanceTestDependency(id, dependencies);
    if (result === undefined) throw new Error(`Missing fixture dependency: ${id}`);
    return result;
  }, false);
  return output;
}

export function notificationScreen(path, root = '.') {
  const session = sessionFixture(), streams = [], profiles = [];
  let resolveProfile;
  const pending = new Promise((done) => { resolveProfile = done; });
  const subscribe = (_, next, error) => { const stream = { next, error, stopped: false }; streams.push(stream); return () => { stream.stopped = true; }; };
  const h = renderHarness(path, { root, effects: true, dependencies: {
    'expo-router': { router: {}, useFocusEffect() {} }, 'firebase/auth': session.sdk, '@/src/firebase/config': { auth: session.auth },
    '@/src/services/user.service': { getUserProfile: () => pending,
      subscribeToUserProfile: (_, next, error) => { const stream = { next, error, stopped: false }; profiles.push(stream); return () => { stream.stopped = true; }; } },
    '@/src/services/notification.service': { subscribeToNotificationCenter: subscribe, subscribeToCustomerNotifications: subscribe },
  } });
  h.render(); session.emit('customer-a');
  return { h, session, streams, profiles, async profile(role) {
    const value = { uid: session.auth.currentUser?.uid, role };
    resolveProfile(value); for (const profile of profiles) if (!profile.stopped) profile.next(value);
    await tick();
  } };
}

export function requestScreen(root = '.') {
  const session = sessionFixture(), streams = [];
  const h = renderHarness('app/(tabs)/request-details.tsx', { root, effects: true, dependencies: {
    'expo-router': { router: {}, useLocalSearchParams: () => ({ id: 'job-a' }), useFocusEffect() {} },
    'firebase/auth': session.sdk, '@/src/firebase/config': { auth: session.auth },
    '@/src/services/review.service': {}, '@/src/components/maps/JobTechnicianLocation': { JobTechnicianLocation: 'JobTechnicianLocation' },
    '@/src/services/request.service': { formatRequestDate: () => 'Local date',
      subscribeToServiceRequest: (_, next, error) => { const stream = { next, error, stopped: false }; streams.push(stream); return () => { stream.stopped = true; }; } },
  } });
  h.render(); session.emit('customer-a');
  const job = { id: 'job-a', customerId: 'customer-a', status: 'accepted', title: 'Private fixture A', priority: 'normal', imageUrls: [] };
  const visible = () => { h.render(); return h.elements().some((item) => item.type === 'JobTechnicianLocation' && item.props.request?.id === job.id); };
  return { h, session, streams, job, visible };
}

export function directoryFixture(root = '.') {
  const session = sessionFixture(), connections = [];
  let reads = 0, holdRead;
  const sdk = { collection: (_, name) => name, doc: (_, ...path) => path.join('/'), query: (...parts) => parts,
    where: (...parts) => parts, orderBy: (...parts) => parts, documentId: () => '__name__', limit: (value) => ['limit', value],
    getDocFromServer: async (ref) => { reads++; if (holdRead) await holdRead; return { id: 'tech-a', exists: () => true,
      data: () => ({ technicianId: 'tech-a', approved: true, fullName: 'Gihan', specialization: 'Electrical',
        serviceDistrictIds: ['kandy'], averageRating: 5, reviewCount: 1 }) }; },
    onSnapshot: (...args) => { const options = typeof args[1] === 'object';
      const connection = { query: args[0], next: args[options ? 2 : 1], error: args[options ? 3 : 2], stopped: false };
      connections.push(connection); return () => { connection.stopped = true; }; },
  };
  const deps = { 'firebase/firestore': sdk, '@/src/firebase/config': { auth: session.auth, db: {} },
    '@/src/constants/serviceRequests': { SERVICE_CATEGORIES: ['Electrical'] },
    '@/functions/src/domain/availability': require('../../functions/lib/domain/availability.js'),
    '@/functions/src/domain/map': require('../../functions/lib/domain/map.js'),
    '@/functions/src/domain/serviceAreas': require('../../functions/lib/domain/serviceAreas.js'),
    '@/functions/src/domain/mapProjection': { MAP_MAX_ITEMS: 24, MAP_PAGE_SIZE: 8 },
    '@/src/utils/technicianRating': {} };
  const service = loadService('src/services/technician.service.ts', deps, root);
  return { session, service, connections, reads: () => reads, hold: (pending) => { holdRead = pending; },
    snapshot: () => ({ docs: [{ id: 'tech-a', ref: 'technician_map_profiles/tech-a' }], size: 1,
      metadata: { fromCache: false, hasPendingWrites: false } }) };
}

export async function directoryWorkload(root = '.') {
  const f = directoryFixture(root), values = [], stops = [];
  for (let i = 0; i < 2; i++) stops.push(f.service.subscribeToApprovedTechnicians((rows) => values.push(rows), (error) => { throw error; }));
  const registrations = f.connections.length;
  for (const connection of f.connections) connection.next(f.snapshot());
  await tick();
  const reads = f.reads();
  stops.forEach((stop) => stop());
  return { identicalDirectoryConsumers: 2, directoryRegistrations: registrations, directoryApprovalReadsForOneDocument: reads,
    directoryConsumerEmissions: values.length, directoryListenersAfterCleanup: f.connections.filter((c) => !c.stopped).length };
}

export function reviewResumeWorkload(root = '.') {
  const session = sessionFixture(), appListeners = new Set();
  let focus, refreshes = 0;
  const appState = { currentState: 'active', addEventListener: (_, next) => {
    appListeners.add(next); return { remove: () => appListeners.delete(next) };
  } };
  const h = renderHarness('src/hooks/useTechnicianReviews.ts', { root, effects: true, exportName: 'useTechnicianReviews', dependencies: {
    'firebase/auth': session.sdk, '@/src/firebase/config': { auth: session.auth },
    'react-native': { AppState: appState }, 'expo-router': { useFocusEffect: (next) => { focus = next; } },
    '@/src/services/technician.service': { refreshTechnicianReviews: () => { refreshes++; },
      subscribeToTechnicianReviews: () => () => {}, retryTechnicianReviews() {} },
  } });
  h.render('tech-a'); session.emit('customer-a'); const blur = focus();
  const initial = refreshes;
  for (const state of ['background', 'active', 'active']) {
    appState.currentState = state; for (const next of appListeners) next(state);
  }
  const onResume = refreshes - initial; blur?.(); h.cleanup();
  return { reviewRefreshesOnForegroundTransition: onResume, reviewAppStateObserversAfterBlur: appListeners.size };
}

export async function lifecycleWorkload(root = '.') {
  const leaks = {};
  for (const [path, role] of [['app/(tabs)/notifications.tsx', 'customer'], ['app/technician/notifications.tsx', 'technician']]) {
    const f = notificationScreen(path, root);
    f.h.cleanup(); await f.profile(role);
    leaks[role] = f.streams.filter((stream) => !stream.stopped).length;
  }
  const request = requestScreen(root);
  const old = request.streams.at(-1); old.next(request.job);
  const before = request.visible(); request.session.emit(null);
  const retainedAfterLogout = request.visible(); old.next(request.job);
  const restoredByLateCallback = request.visible(); request.h.cleanup();
  return { notificationCentersStartedAfterUnmount: leaks, requestVisibleBeforeLogout: before,
    requestVisibleAfterLogout: retainedAfterLogout, requestRestoredByLateCallback: restoredByLateCallback };
}
