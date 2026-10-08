// Actual component work with deterministic hook/native adapters; no device FPS claims.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { renderHarness } from './lib/performance-render-harness.mjs';
const require = createRequire(import.meta.url), root = process.argv[2] ?? '.';
const mapDomain = require('../functions/lib/domain/map.js');
const grouping = {};
new Function('exports', require('typescript').transpileModule(readFileSync(new URL('../src/utils/technicianMarkerGroups.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: require('typescript').ModuleKind.CommonJS } }).outputText)(grouping);
let groupCalls = 0;
const native = renderHarness('src/components/maps/TechnicianMap.native.tsx', { root, dependencies: {
  '@/src/utils/technicianMarkerGroups': { groupMarkerPoints: (...args) => { groupCalls++; return grouping.groupMarkerPoints(...args); } },
} });
const points = Array.from({ length: 24 }, (_, i) => ({ id: 'fixture-'+i, title: 'Technician '+i,
  latitude: 7.2+i/100, longitude: 80.6+i/100, stale: false }));
const props = { district: mapDomain.DISTRICTS.find((district) => district.id === 'kandy'), points, onSelect() {} };
const coordinates = new Set();
for (let i = 0; i < 20; i++) {
  native.render({ ...props, focusLocationStatus: 'Unrelated text '+i });
  coordinates.add(native.elements().find((item) => item.type === 'Polygon').props.coordinates);
}
const records = Array.from({ length: 1000 }, (_, i) => ({ id: 'fixture-'+i, status: 'completed', preferredDate: '2026-10-06', priority: 'normal' }));
const bookings = renderHarness('app/(tabs)/bookings.tsx', { root, initial: ['all', records, false, ''], dependencies: {
  '@/src/services/request.service': {}, '@/src/firebase/config': {}, 'expo-router': { router: {} },
} });
bookings.render();
const flat = bookings.elements().find((item) => item.type === 'FlatList');
let profile = { uid: 'gihan', role: 'technician', fullName: 'Gihan', availability: 'available' }, notificationStarts = 0;
const dashboard = renderHarness('app/technician/(tabs)/index.tsx', { root, effects: true, dependencies: {
  'expo-router': { router: {} }, '@/src/firebase/config': { auth: { currentUser: { uid: 'gihan' } } },
  '@/src/hooks/useTechnicianWorkspace': { useTechnicianWorkspace: () => ({ uid: 'gihan', profile, requests: [], loading: false, errorMessage: '' }) },
  '@/src/hooks/useTechnicianReviews': { useTechnicianReviews: () => ({ status: 'ready', summary: { count: 1, average: 5 }, reviews: [] }) },
  '@/src/components/technicians/TechnicianAvailabilityPanel': { TechnicianAvailabilityPanel: 'TechnicianAvailabilityPanel' },
  '@/src/services/notification.service': { subscribeToNotificationCenter: () => { notificationStarts++; return () => {}; } },
} });
dashboard.render();
for (let i = 0; i < 10; i++) { profile = { ...profile, availability: i % 2 ? 'busy' : 'offline' }; dashboard.render(); }
dashboard.cleanup();
const profileCustomer = { uid: 'customer' }, selected = { uid: 'gihan', availability: 'available', specialization: 'Electrical' };
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
let bookingCalls = 0; const finish = [];
const form = renderHarness('app/(tabs)/create-request.tsx', { root, initial: [profileCustomer, selected, 'Electrical', 'Repair', 'Description', 'Private', 'Kandy', tomorrow,
  false, '11:00 AM', 'normal', 0, false, false, '', ''], dependencies: {
  'expo-router': { useLocalSearchParams: () => ({ technicianId: 'gihan' }), router: { replace() {} } },
  '@/src/firebase/config': { auth: { currentUser: { uid: 'customer' } } },
  '@react-native-community/datetimepicker': { __esModule: true, default: 'DateTimePicker' },
  '@/src/services/user.service': {}, '@/src/services/technician.service': {},
  '@/src/services/request.service': { createServiceRequest: () => { bookingCalls++; return new Promise((resolve) => finish.push(resolve)); } },
  '@/src/components/technicians/AvailabilityBadge': { AvailabilityBadge: 'AvailabilityBadge' },
} });
form.render(); const submit = form.elements().find((e) => e.type === 'TouchableOpacity' && e.props.onPress?.name === 'handleSubmit').props.onPress;
const first = submit(), second = submit(); finish.forEach((resolve) => resolve('local-fixture')); await Promise.all([first, second]);
console.log(JSON.stringify({ source: root, nativeMapRenders: 20, markerGroupCalculations: groupCalls,
  distinctPolygonCoordinateArrays: coordinates.size, bookingParentRowElements: bookings.elements().filter((item) => item.type?.name === 'RequestCard').length,
  bookingFirstPage: flat?.props.data.length ?? records.length, flatListInitialBatch: flat?.props.initialNumToRender ?? null,
  notificationCenterStartsForTenProfileChanges: notificationStarts,
  notificationQueryRegistrationsForTenProfileChanges: notificationStarts * 4, bookingCallsForTwoImmediateSubmitTaps: bookingCalls }, null, 2));
