import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';

const tick = () => new Promise(setImmediate);

test('authenticated setup never renders the previous account draft after logout or same-UID replacement', () => {
  const owner = { uid: 'fixture', email: 'fixture@example.test', emailVerified: true }, auth = { currentUser: owner };
  const h = renderHarness('app/(auth)/register.tsx', { dependencies: {
    'expo-router': { router: { replace() {} }, useLocalSearchParams: () => ({}) },
    '@/src/firebase/config': { auth }, '@/src/services/registration.service': {},
    '@/src/services/user.service': { isPublicRegistrationRole: role => ['customer', 'technician'].includes(role) },
    '@/src/services/onboarding-draft.service': { getOnboardingDraft: () => ({ fullName: 'Private fixture name', email: owner.email, phone: 'Private phone', address: 'Private fixture address', role: 'customer' }) },
    '@/src/utils/registrationDebug': {},
  } });
  h.render({ setup: true });
  assert.ok(h.elements().some(node => node.type === 'TextInput' && node.props.value === 'Private fixture address'));
  for (const user of [{ ...owner }, null, { uid: 'other', email: 'other@example.test' }]) {
    auth.currentUser = user; h.render({ setup: true });
    assert.ok(!h.elements().some(node => node.type === 'TextInput'));
    assert.ok(h.elements().some(node => node.props.children === 'Continue setup'));
  }
  h.cleanup();
});
test('a Technician restarting setup can re-enter professional fields without entering a password', () => {
  const owner = { uid: 'fixture', email: 'fixture@example.test', emailVerified: true };
  const h = renderHarness('app/(auth)/register.tsx', { dependencies: {
    'expo-router': { router: { replace() {} }, useLocalSearchParams: () => ({}) },
    '@/src/firebase/config': { auth: { currentUser: owner } }, '@/src/services/registration.service': {},
    '@/src/services/user.service': { isPublicRegistrationRole: role => ['customer', 'technician'].includes(role) },
    '@/src/services/onboarding-draft.service': { getOnboardingDraft: () => undefined }, '@/src/utils/registrationDebug': {},
  } });
  h.render({ setup: true, initialRole: 'technician' });
  const inputs = h.elements().filter(node => node.type === 'TextInput').map(node => node.props.placeholder);
  for (const label of ['Example: 3 years', 'Training, skills, qualifications', 'Cities or areas you cover']) assert.ok(inputs.includes(label));
  assert.ok(h.elements().some(node => node.type?.name === 'ServiceCategoryPicker'));
  assert.ok(!inputs.includes('Create a password')); assert.ok(!inputs.includes('Confirm your password'));
  h.cleanup();
});

function observer() {
  let nextAuth, nextProfile, errorProfile;
  const auth = { currentUser: null }, events = [];
  const drafts = loadService('src/services/onboarding-draft.service.ts', { '@/src/firebase/config': { auth } });
  const initialization = loadService('src/services/profile-initialization.service.ts', {});
  const api = loadService('src/services/account-session.service.ts', {
    '@/src/firebase/config': { auth, db: {} }, './onboarding-draft.service': drafts, './profile-initialization.service': initialization,
    'firebase/auth': { onAuthStateChanged: (_, next) => { nextAuth = next; return () => {}; } },
    'firebase/firestore': { doc: () => ({}), onSnapshot: (_, options, next, error) => {
      assert.equal(options.includeMetadataChanges, true); nextProfile = next; errorProfile = error; return () => {};
    } },
  });
  const stop = api.observeAccountSession({ pending: () => events.push('pending'), allowed: () => events.push('allowed'),
    denied: () => events.push('denied'), error: () => events.push('error'), setupRequired: (_, verified) => events.push(verified ? 'setup' : 'verify') });
  return { auth, events, stop, error: () => errorProfile(),
    user(verified = false, token = async () => ({ claims: { email_verified: verified } })) {
      const user = { uid: 'fixture', email: 'fixture@example.test', emailVerified: verified, reload: async () => {}, getIdTokenResult: token };
      auth.currentUser = user; nextAuth(user); return user;
    },
    snapshot(value, metadata = { fromCache: false, hasPendingWrites: false }) {
      return nextProfile({ exists: () => value !== null, data: () => value, metadata });
    } };
}

test('a server-confirmed missing profile leads to verification/setup while cache absence never denies or authorizes', async () => {
  for (const verified of [false, true]) {
    const h = observer(); h.user(verified);
    await h.snapshot(null, { fromCache: true, hasPendingWrites: false }); await tick();
    assert.equal(h.events.at(-1), 'pending'); assert.ok(!h.events.includes('denied'));
    await h.snapshot(null); assert.equal(h.events.at(-1), verified ? 'setup' : 'verify'); h.stop();
  }
});

test('cached and pending existing profiles stay blocked; a newer authoritative snapshot is required', async () => {
  const h = observer(); h.user(true);
  await h.snapshot({ accountStatus: 'active' }); assert.equal(h.events.at(-1), 'allowed');
  await h.snapshot({ accountStatus: 'active' }, { fromCache: true, hasPendingWrites: false }); assert.equal(h.events.at(-1), 'pending');
  await h.snapshot({ accountStatus: 'active' }, { fromCache: false, hasPendingWrites: true }); assert.equal(h.events.at(-1), 'pending');
  await h.snapshot({ accountStatus: 'disabled' }); assert.equal(h.events.at(-1), 'denied'); h.stop();
});

test('an access-check deadline cannot authorize a late token response; retry needs a new observer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  const h = observer(); h.user(true, () => new Promise(resolve => { finish = resolve; }));
  const running = h.snapshot({ accountStatus: 'active' }); await Promise.resolve();
  t.mock.timers.tick(20_001); assert.equal(h.events.at(-1), 'error');
  const newer = h.snapshot({ accountStatus: 'active' });
  assert.equal(h.events.at(-1), 'pending');
  t.mock.timers.tick(20_001); assert.equal(h.events.at(-1), 'error', 'a newer snapshot must also bound its pending Auth check');
  finish({ claims: { email_verified: true } }); await running;
  await newer;
  assert.equal(h.events.at(-1), 'error'); assert.ok(!h.events.includes('allowed')); assert.ok(h.auth.currentUser); h.stop();
});

test('terminal listener errors and account replacement invalidate pending verification for a missing profile', async () => {
  for (const scenario of ['listener', 'replacement']) {
    let finish;
    const h = observer(); h.user(true, () => new Promise(resolve => { finish = resolve; }));
    const running = h.snapshot(null); await Promise.resolve();
    if (scenario === 'listener') h.error(); else h.auth.currentUser = { ...h.auth.currentUser };
    finish({ claims: { email_verified: true } }); await running;
    assert.ok(!h.events.includes('setup')); assert.ok(!h.events.includes('allowed')); h.stop();
  }
});

test('same-UID identity replacement without an Auth event ends a pending check at its deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = observer(); h.user(true, () => new Promise(() => {}));
  void h.snapshot(null);
  h.auth.currentUser = { ...h.auth.currentUser };
  t.mock.timers.tick(20_001);
  assert.equal(h.events.at(-1), 'error');
  assert.ok(!h.events.includes('allowed')); assert.ok(!h.events.includes('setup'));
  h.stop();
});

test('root onboarding states keep missing, incomplete, unverified, pending and privileged accounts out of dashboards', () => {
  const callbacks = [];
  const h = renderHarness('src/components/auth/LiveAccountGate.tsx', { effects: true, exportName: 'LiveAccountGate', dependencies: {
    'expo-router': { router: { replace() {} } }, '@/src/services/auth.service': { logoutRevokedUser: async () => {} },
    '@/src/services/user.service': { getMobileAccessDecision: profile => ({ allowed: profile.role === 'customer' || profile.technicianApprovalStatus === 'approved' }) },
    '@/src/services/account-session.service': { observeAccountSession: value => { callbacks.push(value); return () => {}; } },
  } });
  const state = () => h.render({ children: 'routes' }).props.value.state;
  state(); const user = { uid: 'fixture', email: 'fixture@example.test' };
  const profile = { uid: user.uid, email: user.email, fullName: 'Fixture', phone: '0712345678', address: 'Private', role: 'customer', emailVerified: true };
  callbacks[0].setupRequired(user, false); assert.equal(state().phase, 'awaiting-verification');
  callbacks[0].setupRequired(user, true); assert.equal(state().phase, 'profile-setup');
  callbacks[0].allowed(profile, user, false); assert.equal(state().phase, 'awaiting-verification');
  callbacks[0].allowed(profile, user, true); assert.equal(state().phase, 'ready');
  callbacks[0].pending(user); assert.equal(state().phase, 'ready');
  assert.ok(h.elements().some(item => item.type?.name === 'AccountSetupLoading'));
  assert.ok(!h.elements().some(item => item.props.accessibilityRole === 'alert' || item.props.children === 'Retry access check'), 'loading must not present an error or a retry action');
  assert.equal(h.elements().find(item => item.type === 'Modal').props.visible, true, 'same-session checks retain the confirmed subtree behind the blocking overlay');
  callbacks[0].allowed(profile, user, true); state();
  callbacks[0].pending({ ...user }); assert.equal(state().phase, 'checking', 'same-UID replacements do not inherit the previous grant');
  callbacks[0].allowed(profile, user, true); state();
  callbacks[0].error('Access check interrupted'); state();
  assert.ok(!h.elements().some(item => item.type?.name === 'AccountSetupLoading'));
  assert.ok(h.elements().some(item => item.props.children === 'Retry access check'), 'recoverable errors retain their existing retry action');
  callbacks[0].signedOut(); assert.equal(state().phase, 'signed-out');
  assert.equal(h.elements().find(item => item.type === 'Modal').props.visible, false);
  for (const patch of [{ uid: 'other' }, { address: '' }, { email: 'other@example.test' }, { role: 'dispatcher' }, { emailVerified: undefined }]) {
    callbacks[0].allowed({ ...profile, ...patch }, user, true); assert.equal(state().phase, 'denied');
  }
  const technician = { ...profile, role: 'technician', specialization: 'Electrical', experience: 'Training', qualifications: 'Qualification', certifications: '', serviceAreas: 'Kandy', serviceDivision: '', technicianApprovalStatus: 'pending' };
  callbacks[0].allowed(technician, user, true); assert.equal(state().phase, 'approval-pending');
  callbacks[0].allowed({ ...technician, technicianApprovalStatus: 'approved' }, user, true); assert.equal(state().phase, 'ready');
  const legacy = { ...profile, role: 'technician', specialization: 'Electrical', technicianApprovalStatus: 'approved', serviceDistrictIds: ['kandy'] };
  callbacks[0].allowed(legacy, user, true); assert.equal(state().phase, 'ready', 'district-only legacy profiles retain access without a selected town or duplicate legacy fields');
  callbacks[0].allowed({ ...technician, technicianApprovalStatus: 'rejected' }, user, true); assert.equal(state().phase, 'denied');
  h.cleanup();
});
