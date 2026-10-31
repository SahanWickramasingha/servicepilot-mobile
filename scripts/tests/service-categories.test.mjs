import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { loadService, sessionFixture } from '../lib/subscription-reliability-workloads.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';
const require = createRequire(import.meta.url);
const categories = loadService('functions/src/domain/serviceCategories.ts', {});
const projection = require('../../functions/lib/domain/mapProjection.js');
const geo = require('../../functions/lib/domain/map.js');
const constants = loadService('src/constants/serviceRequests.ts', {});
const tick = () => new Promise(setImmediate);

test('one catalogue supplies stable IDs/labels; confirmed aliases normalize exactly and ambiguous values stay unresolved', () => {
  const defs = categories.SERVICE_CATEGORY_DEFINITIONS;
  assert.equal(new Set(defs.map(item => item.id)).size, 7);
  assert.deepEqual(constants.SERVICE_CATEGORIES, defs.map(item => item.label));
  for (const category of defs) for (const value of [category.id, category.label, ...category.aliases]) {
    assert.equal(categories.resolveServiceCategory('  ' + value.toUpperCase().replaceAll(' ', '  ') + '  ')?.id, category.id);
  }
  assert.equal(categories.resolveServiceCategory('AC technician')?.id, 'air-conditioning');
  for (const value of ['Electric Item', 'Electrical / Plumbing', 'Motherboard repair', 'customer', 'technician', 'Other unknown specialty', '', null]) {
    assert.equal(categories.resolveServiceCategory(value), undefined);
    assert.equal(categories.technicianCategory({ specialization: value }), undefined);
  }
  assert.equal(categories.technicianCategory({ specialization: 'Electric Item', serviceCategory: 'Electrical' }), undefined, 'A guessed old projection cannot establish a category');
  assert.equal(categories.technicianCategory({ serviceCategoryId: 'invalid', specialization: 'Electrical' }), undefined);
  assert.equal(categories.technicianCategory({ specialization: 'Electrical', serviceCategory: 'Plumbing' }), undefined);
  assert.equal(categories.technicianCategoryLabel({ specialization: 'Electric Item' }), 'Category needs review');
  assert.deepEqual(categories.selectedTechnicianCategory('electrical'), { serviceCategoryId: 'electrical', specialization: 'Electrical' });
  assert.throws(() => categories.selectedTechnicianCategory('technician'));
});

test('public projection keeps category separate from role and retains visibility/rating allowlists', () => {
  const profile = { role: 'technician', fullName: 'Fixture', technicianApprovalStatus: 'approved', accountStatus: 'active',
    specialization: 'AC technician', serviceDistrictIds: ['kandy'], averageRating: 4, reviewCount: 2, address: 'private' };
  const result = projection.buildMapProfile('tech', profile);
  assert.equal(result.serviceCategoryId, 'air-conditioning'); assert.equal(result.serviceCategory, 'Air Conditioning');
  assert.equal(result.specialization, 'AC technician', 'Historical data is not silently overwritten by a projection');
  assert.equal(result.role, undefined); assert.equal(result.address, undefined);
  assert.equal(result.averageRating, 4); assert.equal(result.reviewCount, 2);
  assert.equal(projection.buildMapProfile('tech', { ...profile, accountStatus: 'disabled' }).approved, false);
  assert.equal(projection.buildMapProfile('tech', { ...profile, technicianApprovalStatus: 'pending' }).approved, false);
  assert.equal(projection.buildMapProfile('tech', { ...profile, specialization: 'Electric Item' }).serviceCategoryId, '');
});

function directoryFixture() {
  const session = sessionFixture(); let next, error, constraints, docs = [], emitted, rejected;
  const service = loadService('src/services/technician.service.ts', {
    '@/src/firebase/config': { auth: session.auth, db: {} }, '@/functions/src/domain/map': geo,
    '@/src/constants/serviceRequests': constants,
    '@/functions/src/domain/availability': require('../../functions/lib/domain/availability.js'),
    '@/functions/src/domain/serviceAreas': require('../../functions/lib/domain/serviceAreas.js'),
    '@/functions/src/domain/mapProjection': projection,
    '@/src/utils/technicianRating': {},
    'firebase/firestore': { collection: (_, path) => path, where: (...args) => ({ where: args }), documentId: () => '__name__', orderBy: (...args) => ({ order: args }),
      limit: value => ({ limit: value }), query: (...args) => { constraints = args; return args; },
      onSnapshot: (_, success, fail) => { next = success; error = fail; return () => {}; },
      getDocFromServer: async ref => { const value = docs.find(item => item.id === ref.id); if (value.denied) throw Object.assign(Error('denied'), { code: 'permission-denied' }); return value; } },
  });
  const row = (id, specialization, district, extra = {}) => ({ id, ref: { id }, data: () => ({ technicianId: id, fullName: id, specialization, serviceCategory: '', approved: true, serviceDistrictIds: [district], averageRating: 0, reviewCount: 0, ...extra }) });
  return { row, subscribe: filter => service.subscribeToApprovedTechnicians(value => { emitted = value; }, cause => { rejected = cause; }, filter),
    emit: async value => { docs = value; next({ docs, size: docs.length }); await tick(); },
    constraints: () => constraints, items: () => emitted, failure: () => rejected, error: value => error(value) };
}
test('directory combines category and district, includes normalized legacy candidates, excludes unresolved/hidden records and remains bounded', async () => {
  const f = directoryFixture(); const stop = f.subscribe({ category: 'air-conditioning', division: 'Kandy' });
  assert.ok(f.constraints().some(item => item?.limit === 8));
  assert.ok(f.constraints().some(item => JSON.stringify(item?.where) === JSON.stringify(['serviceCategory', 'in', ['Air Conditioning', '']])));
  await f.emit([f.row('legacy', 'AC technician', 'kandy'), f.row('unknown', 'Electric Item', 'kandy'), f.row('outside', 'AC technician', 'colombo'),
    f.row('hidden', 'AC technician', 'kandy', { approved: false })]);
  assert.deepEqual(f.items().map(item => item.uid), ['legacy']);
  assert.equal(f.items()[0].specialization, 'Air Conditioning');
  assert.equal(f.items()[0].serviceCategoryId, 'air-conditioning');
  stop();
  const stopElectrical = f.subscribe({ category: 'Electrical' });
  await f.emit([f.row('wire', 'Electrical', 'kandy'), f.row('ambiguous', 'Electric Item', 'kandy')]);
  assert.deepEqual(f.items().map(item => item.uid), ['wire']);
  await f.emit([{ ...f.row('revoked', 'Electrical', 'kandy'), denied: true }]);
  assert.equal(f.failure().code, 'permission-denied'); stopElectrical();
});

test('Home category cards navigate with stable IDs; directory combines navigation, search and division and responds to later category links', async () => {
  const routes = [], auth = { currentUser: { uid: 'customer' } };
  const authSdk = { onAuthStateChanged: (_, next) => { next(auth.currentUser); return () => {}; } };
  const home = renderHarness('app/(tabs)/index.tsx', { effects: true, dependencies: {
    'expo-router': { router: { push: route => routes.push(route) } }, 'firebase/auth': authSdk,
    '@/src/firebase/config': { auth }, '@/src/constants/serviceRequests': constants,
    '@/src/components/technicians/AvailabilityBadge': { AvailabilityBadge: 'AvailabilityBadge' }, '@/src/components/technicians/TechnicianRating': { TechnicianRating: 'TechnicianRating' },
    '@/src/services/user.service': { getUserProfile: async () => ({ uid: 'customer', fullName: 'Customer', role: 'customer' }), getTechnicianDivision: () => 'Kandy' },
    '@/src/services/request.service': { subscribeToCustomerRequests: (_, next) => { next([]); return () => {}; } },
    '@/src/services/notification.service': { subscribeToCustomerNotifications: (_, next) => { next([]); return () => {}; } },
    '@/src/services/technician.service': { subscribeToApprovedTechnicians: next => { next([]); return () => {}; } },
  } });
  home.render(); await tick(); home.render();
  for (const element of [...home.elements()].filter(item => item.type === 'TouchableOpacity' && item.key && categories.SERVICE_CATEGORY_DEFINITIONS.some(category => category.id === item.key))) element.props.onPress();
  assert.deepEqual(routes, categories.SERVICE_CATEGORY_DEFINITIONS.map(item => categories.categoryDirectoryRoute(item.id))); home.cleanup();
  let params = { category: 'electrical', division: 'Kandy' }, filter;
  const directory = renderHarness('app/(tabs)/technicians.tsx', { effects: true, dependencies: {
    'expo-router': { router: { setParams: update => { params = { ...params, ...update }; } }, useLocalSearchParams: () => params }, 'firebase/auth': authSdk, '@/src/firebase/config': { auth },
    '@/src/components/technicians/AvailabilityBadge': { AvailabilityBadge: 'AvailabilityBadge' }, '@/src/components/technicians/TechnicianRating': { TechnicianRating: 'TechnicianRating' },
    '@/src/services/technician.service': { subscribeToApprovedTechnicians: (next, fail, input) => { filter = input; next([
      { uid: 'a', fullName: 'Wire Expert', specialization: 'Electrical', serviceDivision: 'Kandy' },
      { uid: 'b', fullName: 'Another Expert', specialization: 'Electrical', serviceDivision: 'Kandy' },
    ]); return () => {}; } },
  } });
  const render = () => { directory.render(); directory.render(); };
  render(); assert.equal(filter.category, 'electrical'); assert.equal(filter.division, 'Kandy');
  directory.elements().find(item => item.type === 'TextInput').props.onChangeText('wire'); render();
  assert.deepEqual(directory.elements().find(item => item.type === 'FlatList').props.data.map(item => item.uid), ['a']);
  params = { category: 'Air Conditioning', division: 'Colombo' }; render(); render();
  assert.equal(filter.category, 'air-conditioning'); assert.equal(filter.division, 'Colombo');
  assert.equal(directory.elements().find(item => item.type === 'TextInput').props.value, '', 'A new category link clears stale search'); directory.cleanup();
});

test('profile save atomically persists canonical specialty and projection while preserving account role and approval', async () => {
  const writes = [], source = { role: 'technician', fullName: 'Tech', specialization: 'Electric Item', technicianApprovalStatus: 'approved', serviceDistrictIds: ['kandy'] };
  const service = loadService('src/services/user.service.ts', {
    '@/src/firebase/config': { auth: { currentUser: { uid: 'tech' } }, db: {} }, '@/functions/src/domain/mapProjection': projection,
    '@/functions/src/domain/availability': require('../../functions/lib/domain/availability.js'), '@/functions/src/domain/serviceAreas': require('../../functions/lib/domain/serviceAreas.js'),
    '@/src/utils/registrationDebug': {}, 'firebase/firestore': { doc: (_, collection, id) => ({ path: collection + '/' + id }), serverTimestamp: () => 'server-time',
      runTransaction: async (_, action) => action({ get: async () => ({ data: () => source }), update: (ref, data) => writes.push({ ref, data }), set: (ref, data) => writes.push({ ref, data }) }) },
  });
  await service.updateUserProfileSafe('tech', { fullName: 'Tech', phone: '123', address: 'Private', serviceCategoryId: 'electrical' });
  assert.equal(writes[0].data.serviceCategoryId, 'electrical'); assert.equal(writes[0].data.specialization, 'Electrical');
  assert.equal(writes[0].data.role, undefined); assert.equal(writes[0].data.technicianApprovalStatus, undefined);
  assert.equal(writes[1].data.serviceCategory, 'Electrical'); assert.equal(writes[1].data.serviceCategoryId, 'electrical'); assert.equal(writes[1].data.approved, true);
  assert.equal(writes[1].data.address, undefined);
  await assert.rejects(service.updateUserProfileSafe('tech', { fullName: 'Tech', phone: '123', address: 'Private', serviceCategoryId: 'customer' }));
});
