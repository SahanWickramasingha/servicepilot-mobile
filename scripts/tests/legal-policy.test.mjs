import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const policy = require('../../functions/lib/domain/legalPolicy.js');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('newly authenticated registration waits for the server profile before starting private block reads', () => {
  let authChange; const listeners = [];
  const auth = { currentUser: null };
  const h = renderHarness('src/components/legal/Safety.tsx', { effects: true, exportName: 'SafetyProvider', dependencies: {
    '@/src/firebase/config': { auth, db: {} },
    'firebase/auth': { onAuthStateChanged: (_, next) => { authChange = next; return () => {}; } },
    'firebase/firestore': { doc: (_, ...parts) => ({ path: parts.join('/') }), collection: (_, ...parts) => ({ path: parts.join('/') }),
      limit: value => value, query: ref => ref, onSnapshot: (ref, ...args) => {
        const next = typeof args[0] === 'function' ? args[0] : args[1];
        const listener = { path: ref.path, next, stopped: false }; listeners.push(listener); return () => { listener.stopped = true; };
      } },
  } });
  h.render({ children: null }); auth.currentUser = { uid: 'new' }; authChange(auth.currentUser); h.render();
  assert.deepEqual(listeners.map(item => item.path), ['users/new']);
  listeners[0].next({ metadata: { fromCache: false }, exists: () => false }); h.render();
  assert.equal(listeners.length, 1);
  listeners[0].next({ metadata: { fromCache: false }, exists: () => true }); h.render();
  assert.deepEqual(listeners.map(item => item.path), ['users/new', 'user_blocks/new/blocked']);
  listeners[1].next({ docs: [{ id: 'blocked-tech' }] }); h.render();
  const state = h.elements().find(e => e.type === 'Context.Provider').props.value;
  assert.equal(state.ready, true); assert.equal(state.blocked.has('blocked-tech'), true);
  auth.currentUser = null; authChange(null); h.render();
  assert.equal(h.elements().find(e => e.type === 'Context.Provider').props.value.blocked.size, 0);
  assert.equal(listeners.every(item => item.stopped), true); h.cleanup();
});

test('shared policy versions agree with both Rules contracts and public HTML; private acceptance is not projected publicly', () => {
  const legal = policy.LEGAL_CONTENT;
  for (const path of ['firestore.rules', 'storage.rules']) {
    const rules = readFileSync(path, 'utf8');
    assert.ok(rules.includes(legal.termsVersion)); assert.ok(rules.includes(legal.privacyPolicyVersion));
  }
  for (const page of ['terms', 'privacy', 'deletion', 'about', 'support']) {
    const html = readFileSync(`public/legal/${page}.html`, 'utf8');
    assert.ok(html.includes(legal.termsVersion)); assert.ok(html.includes(legal.email)); assert.match(html, /<html lang="en">/);
  }
  const projected = require('../../functions/lib/domain/mapProjection.js').buildMapProfile('demo', {
    role: 'technician', fullName: 'Fixture', termsVersion: legal.termsVersion,
    privacyPolicyVersion: legal.privacyPolicyVersion, acceptedAt: new Date(), address: 'Private',
  });
  for (const key of ['termsVersion', 'privacyPolicyVersion', 'acceptedAt', 'address']) assert.equal(projected[key], undefined);
});

test('registration is unchecked, blocks Auth creation, and checked submission carries explicit acceptance', async () => {
  let authCalls = 0, payload;
  const h = renderHarness('app/(auth)/register.tsx', { dependencies: {
    'expo-router': { useLocalSearchParams: () => ({ role: 'customer' }), router: { replace() {} } },
    '@/src/services/registration.service': { registerAccount: async (_, __, data) => { authCalls++; payload = data; return { next: 'verify-email', role: data.role }; } },
    '@/src/services/user.service': { isPublicRegistrationRole: role => ['customer', 'technician'].includes(role), createUserProfile: async data => { payload = data; } },
  } });
  const render = () => h.render(); render();
  const terms = () => h.elements().find(e => e.type === 'TermsAcceptance');
  const submit = () => h.elements().find(e => e.props.onPress && e.type === 'TouchableOpacity' && h.elements().some(t => t.type === 'Text' && t.props.children === 'Create Account') && e.props.disabled === false && e.props.activeOpacity === 0.85);
  assert.equal(terms().props.checked, false);
  await submit().props.onPress(); render();
  assert.equal(authCalls, 0); assert.match(terms().props.error, /agree/);
  for (const [placeholder, value] of [['Enter your full name', 'Example Customer'], ['Enter your email', 'customer@example.test'],
    ['Enter your phone number', '0712345678'], ['Enter your address', 'Private fixture'], ['Create a password', 'fixture-password'], ['Confirm your password', 'fixture-password']]) {
    h.elements().find(e => e.type === 'TextInput' && e.props.placeholder === placeholder).props.onChangeText(value); render();
  }
  terms().props.onChange(true); render();
  await submit().props.onPress();
  assert.equal(authCalls, 1); assert.equal(payload.policyAccepted, true);
});

test('policy links open in a modal without toggling acceptance or navigating away from the form', () => {
  const changes = [];
  const h = renderHarness('src/components/legal/TermsAcceptance.tsx', { dependencies: { './PolicyDocument': { PolicyDocument: 'PolicyDocument' } }, exportName: 'TermsAcceptance' });
  const props = { checked: false, onChange: value => changes.push(value) };
  h.render(props);
  for (const page of ['terms', 'privacy']) {
    const links = h.elements().filter(e => e.props.accessibilityRole === 'link');
    links[page === 'terms' ? 0 : 1].props.onPress(); h.render(props);
    assert.equal(h.elements().find(e => e.type === 'Modal').props.visible, true);
    assert.equal(h.elements().find(e => e.type === 'PolicyDocument').props.page, page);
    h.elements().find(e => e.type === 'Modal').props.onRequestClose(); h.render(props);
    assert.equal(h.elements().find(e => e.props.accessibilityRole === 'checkbox').props.accessibilityState.checked, false);
  }
  assert.deepEqual(changes, []);
});

test('profile creation records current versions and server timestamp, never acceptance for unchecked input', async () => {
  const writes = [];
  const service = loadService('src/services/user.service.ts', {
    '@/src/firebase/config': { auth: { currentUser: { uid: 'new', email: 'fixture@example.test' } }, db: {} },
    '@/functions/src/domain/mapProjection': {}, '@/functions/src/domain/availability': {}, '@/functions/src/domain/serviceAreas': {},
    '@/src/utils/registrationDebug': { getSafeProfileDebugValues: () => ({}), logRegistrationDebug() {} },
    'firebase/firestore': { doc: () => ({}), getDoc: async () => ({ exists: () => false }), serverTimestamp: () => 'SERVER_TIMESTAMP',
      runTransaction: async (_, action) => action({ get: async () => ({ exists: () => false }), set: (_, data) => writes.push(data) }),
      getDocFromServer: async () => ({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => writes.length > 0,
        data: () => ({ ...writes.at(-1), acceptedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0) }) }) },
  });
  const input = { uid: 'new', fullName: 'Fixture', email: 'fixture@example.test', phone: '123', address: 'Private', role: 'customer' };
  await assert.rejects(service.createUserProfile(input)); assert.equal(writes.length, 0);
  await service.createUserProfile({ ...input, policyAccepted: true });
  assert.equal(writes[0].termsVersion, policy.TERMS_VERSION); assert.equal(writes[0].privacyPolicyVersion, policy.PRIVACY_POLICY_VERSION);
  assert.equal(writes[0].acceptedAt, 'SERVER_TIMESTAMP'); assert.equal(writes[0].policyAccepted, undefined);
});

test('registration never overwrites a concurrent profile and requires server confirmation before success', async () => {
  for (const scenario of ['concurrent-profile', 'missing-confirmation', 'read-failure', 'disabled-confirmation', 'switched-account']) {
    const writes = [], auth = { currentUser: { uid: 'new', email: 'fixture@example.test' } };
    const service = loadService('src/services/user.service.ts', {
      '@/src/firebase/config': { auth, db: {} },
      '@/functions/src/domain/mapProjection': {}, '@/functions/src/domain/availability': {}, '@/functions/src/domain/serviceAreas': {},
      '@/src/utils/registrationDebug': { getSafeProfileDebugValues: () => ({}), logRegistrationDebug() {}, logRegistrationError() {}, getFirebaseErrorCode: () => null, getFirebaseErrorMessage: () => null },
      'firebase/firestore': {
        doc: () => ({}), serverTimestamp: () => 'SERVER_TIME', getDoc: async () => ({ exists: () => false }),
        runTransaction: async (_, action) => action({
          get: async () => { if (scenario === 'switched-account') auth.currentUser = { uid: 'other' }; return { exists: () => scenario === 'concurrent-profile' }; },
          set: (_, data) => writes.push(data),
        }),
        getDocFromServer: async () => {
          if (writes.length === 0) return { metadata: { fromCache: false, hasPendingWrites: false }, exists: () => false };
          if (scenario === 'read-failure') throw new Error('Offline');
          return { metadata: { fromCache: false, hasPendingWrites: false }, exists: () => scenario !== 'missing-confirmation',
            data: () => ({ ...writes.at(-1), acceptedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), ...(scenario === 'disabled-confirmation' ? { accountStatus: 'disabled' } : {}) }) };
        },
      },
    });
    await assert.rejects(service.createUserProfile({ uid: 'new', fullName: 'Fixture', email: 'fixture@example.test', phone: '123', address: 'Private', role: 'customer', policyAccepted: true }));
    assert.equal(writes.length, ['concurrent-profile', 'switched-account'].includes(scenario) ? 0 : 1);
  }
});

test('existing accounts have no fabricated acceptance; cancel stops the operation and acceptance retries use authoritative state', async () => {
  const auth = { currentUser: { uid: 'old' } }, writes = [];
  let data = { role: 'customer' };
  const service = loadService('src/services/policy.service.ts', {
    '@/src/firebase/config': { auth, db: {} },
    'firebase/firestore': { doc: () => ({}), getDocFromServer: async () => ({ data: () => data }), serverTimestamp: () => 'SERVER',
      runTransaction: async (_, action) => action({ get: async () => ({ exists: () => true, data: () => data }), update: (_, change) => writes.push(change) }) },
  });
  const unsubscribe = service.subscribePolicyPrompt(prompt => prompt.reject());
  await assert.rejects(service.requirePolicyAcceptance(), /cancelled/); assert.deepEqual(writes, []); unsubscribe();
  await service.acceptCurrentPolicies(); assert.equal(writes.length, 1); assert.equal(writes[0].acceptedAt, 'SERVER');
  data = { ...data, termsVersion: policy.TERMS_VERSION, privacyPolicyVersion: policy.PRIVACY_POLICY_VERSION, acceptedAt: new Date() };
  await service.acceptCurrentPolicies(); await service.requirePolicyAcceptance(); assert.equal(writes.length, 1);
});

test('acceptance save fails if the account changes during the transaction', async () => {
  const auth = { currentUser: { uid: 'a' } }; let wrote = false;
  const service = loadService('src/services/policy.service.ts', {
    '@/src/firebase/config': { auth, db: {} }, 'firebase/firestore': { doc: () => ({}), runTransaction: async (_, action) => action({
      get: async () => { auth.currentUser = { uid: 'b' }; return { data: () => ({}), exists: () => true }; }, update: () => { wrote = true; },
    }) },
  });
  await assert.rejects(service.acceptCurrentPolicies(), /Account changed/); assert.equal(wrote, false);
});

test('contact links use confirmed values and opening mail never implies submission; failed links return a fallback state', async () => {
  const contact = loadService('src/utils/legalContact.ts', {});
  const url = contact.deletionEmailURL();
  assert.match(url, /^mailto:sahanwikrama29@gmail.com\?/);
  assert.equal(new URL(url).searchParams.get('subject'), 'ServicePilot Account Deletion Request');
  assert.equal(await contact.openContactLink(url, async () => {}), true);
  assert.equal(await contact.openContactLink(url, async () => { throw new Error('No mail app'); }), false);
  const links = renderHarness('src/components/legal/LegalLinks.tsx', { exportName: 'LegalLinks', dependencies: { 'expo-router': { router: { push() {} } } } });
  links.render(); assert.equal(links.elements().filter(e => e.props.accessibilityRole === 'button').length, 5);
  for (const path of ['app/(tabs)/profile.tsx', 'app/technician/(tabs)/profile.tsx', 'app/(auth)/settings.tsx']) assert.match(readFileSync(path, 'utf8'), /<LegalLinks/);
});

test('deletion screen exposes real copy-email fallback and reports composer failures truthfully', async () => {
  let copied;
  const h = renderHarness('app/legal/[page].tsx', { dependencies: {
    'expo-router': { useLocalSearchParams: () => ({ page: 'deletion' }), router: { canGoBack: () => false, replace() {} } },
    '@/src/firebase/config': { auth: { currentUser: null } }, '@/src/services/policy.service': {},
    '@/src/components/legal/PolicyDocument': { PolicyDocument: 'PolicyDocument' },
    'expo-clipboard': { setStringAsync: async text => { copied = text; } },
    'react-native': { StyleSheet: { create: value => value }, View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', Linking: { openURL: async () => { throw Error('no app'); } } },
  } });
  const button = label => h.elements().find(e => e.type === 'Pressable' && e.props.children?.props?.children === label);
  h.render(); button('Open deletion-request email').props.onPress(); await tick(); h.render();
  assert.ok(h.elements().some(e => e.type === 'Text' && /Unable to open/.test(String(e.props.children))));
  button('Copy email address').props.onPress(); await tick(); h.render();
  assert.equal(copied, 'sahanwikrama29@gmail.com');
  assert.ok(h.elements().some(e => e.type === 'Text' && /No request has been sent/.test(String(e.props.children))));
});
