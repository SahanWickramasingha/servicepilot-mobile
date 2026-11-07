// Execute actual mobile screens with deterministic adapters; no network or native timing claims.
import { renderHarness } from './performance-render-harness.mjs';
import { sessionFixture } from './subscription-reliability-workloads.mjs';

export function customerMountWorkload(root = '.') {
  const session = sessionFixture();
  const user = session.auth.currentUser;
  const profile = { uid: user.uid, role: 'customer', fullName: 'Fixture Customer' };
  let profileReads = 0, starts = 0, stops = 0;
  const subscribe = () => { starts++; return () => { stops++; }; };
  const dependencies = {
    'expo-router': { router: {} }, 'firebase/auth': session.sdk,
    '@/src/firebase/config': { auth: session.auth },
    '@/src/components/auth/AccountSessionContext': { useAccountSession: () => ({ state: { phase: 'ready', user, profile } }) },
    '@/src/services/user.service': { getUserProfile: () => { profileReads++; return new Promise(() => {}); }, getTechnicianDivision: () => '' },
    '@/src/services/auth.service': {},
    '@/src/services/request.service': { subscribeToCustomerRequests: subscribe },
    '@/src/services/notification.service': { subscribeToCustomerNotifications: subscribe },
    '@/src/services/technician.service': { subscribeToApprovedTechnicians: subscribe },
  };
  const home = renderHarness('app/(tabs)/index.tsx', { root, effects: true, dependencies });
  const account = renderHarness('app/(tabs)/profile.tsx', { root, effects: true, dependencies });
  home.render(); account.render(); session.emit(user.uid);
  const subscriptionsStartedWithoutExtraProfileResponse = starts;
  home.cleanup(); account.cleanup();
  return { redundantCustomerProfileReads: profileReads, subscriptionsStartedWithoutExtraProfileResponse,
    customerSubscriptionsAfterCleanup: starts - stops, customerAuthObserversAfterCleanup: session.observers() };
}

export function jobsRenderWorkload(root = '.', count = 200) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const requests = Array.from({ length: count }, (_, i) => ({ id: 'job-'+i, title: 'Fixture repair',
    status: 'accepted', preferredDate: date, preferredTime: '11:00 AM', priority: 'normal' }));
  const h = renderHarness('app/technician/(tabs)/jobs.tsx', { root, dependencies: {
    'expo-router': { router: {} },
    '@/src/hooks/useTechnicianWorkspace': { useTechnicianWorkspace: () => ({ profile: { availability: 'available' }, requests, loading: false, errorMessage: '' }) },
    '@/src/services/request.service': {},
  } });
  h.render();
  const list = h.elements().find(e => e.type === 'FlatList');
  const result = { technicianJobs: count, eagerlyCreatedJobRows: h.elements().filter(e => e.type?.name === 'JobCard').length,
    virtualizedJobRows: list?.props.data.length ?? 0, initialJobBatch: list?.props.initialNumToRender ?? null };
  h.cleanup();
  return result;
}

export function directoryScreenFixture(root = '.') {
  const session = sessionFixture(), streams = [];
  const h = renderHarness('app/(tabs)/technicians.tsx', { root, effects: true, dependencies: {
    'expo-router': { router: { setParams() {} }, useLocalSearchParams: () => ({}) },
    'firebase/auth': { onAuthStateChanged: (_, next) => { const stop = session.watch(next); next(session.auth.currentUser); return stop; } },
    '@/src/firebase/config': { auth: session.auth },
    '@/src/services/technician.service': { subscribeToApprovedTechnicians: (next, error, filters) => {
      const stream = { next, error, filters, stopped: false }; streams.push(stream); return () => { stream.stopped = true; };
    } },
  } });
  h.render();
  return { h, session, streams, render() { h.render(); h.render(); },
    list: () => h.elements().find(e => e.type === 'FlatList'),
    loadMore: () => h.elements().find(e => e.type === 'TouchableOpacity' && e.props.children?.props?.children === 'Load more Technicians').props.onPress() };
}

export function directoryPagingWorkload(root = '.') {
  const { h, streams, loadMore } = directoryScreenFixture(root);
  streams[0].next(Array.from({ length: 8 }, (_, i) => ({ uid: 'tech-'+i, fullName: 'Fixture '+i })));
  streams[0].filters.onHasMore(true); h.render();
  loadMore();
  h.render(); h.render();
  const list = h.elements().find(e => e.type === 'FlatList');
  const result = { directoryVisibleWhilePaging: !!list, directoryRowsWhilePaging: list?.props.data.length ?? 0 };
  h.cleanup();
  return result;
}
