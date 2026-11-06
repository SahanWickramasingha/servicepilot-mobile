import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderHarness } from '../lib/performance-render-harness.mjs';
const require = createRequire(import.meta.url), ts = require('typescript');
function load(path, deps, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, id => {
    assert.ok(id in deps, `Unexpected dependency ${id}`); return deps[id];
  }, ...Object.values(globals));
  return exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness({ authFailure, verificationFailure, inspectFailure, existing } = {}) {
  const calls = [], diagnostics = [], contexts = [], auth = { currentUser: null, app: { options: { projectId: 'demo-servicepilot-registration' } } };
  const user = { uid: 'new', email: 'fixture@example.test', emailVerified: false,
    reload: async () => { calls.push('reload'); },
    getIdTokenResult: async force => { calls.push(['token', force]); return { claims: { email_verified: user.emailVerified, auth_time: 100 } }; } };
  const initialization = load('src/services/profile-initialization.service.ts', {});
  const drafts = load('src/services/onboarding-draft.service.ts', { '@/src/firebase/config': { auth } });
  const write = deferred(), inspection = { value: existing ?? null, failure: inspectFailure };
  const service = load('src/services/registration.service.ts', {
    'expo-constants': { default: { expoConfig: { version: '1.0.0' } } },
    '@/src/firebase/config': { auth }, './profile-initialization.service': initialization,
    './onboarding-draft.service': drafts,
    '@/src/utils/registrationDebug': { logRegistrationFailure: (error, stage, context) => {
      diagnostics.push({ code: error.code, stage: error.registrationStep ?? stage }); contexts.push(context);
    } },
    './auth.service': {
      registerUser: async (_, __, recover) => { calls.push(recover ? 'recover' : 'create'); if (authFailure) throw authFailure; auth.currentUser = user; return { user }; },
      sendVerificationEmail: async () => { calls.push('verification'); if (verificationFailure) throw verificationFailure; return { alreadyVerified: user.emailVerified }; },
    },
    './user.service': {
      validateRegistrationProfile: data => { if (data.policyAccepted !== true) throw new Error('Accept policy first'); },
      inspectRegistrationProfile: async () => { calls.push('inspect'); if (inspection.failure) throw inspection.failure; return inspection.value; },
      markUserEmailVerified: async () => { calls.push('mark-verified'); },
      createUserProfile: async data => { calls.push(['profile', data]); await write.promise;
        return { role: data.role, policyCurrent: true, created: true, emailVerified: true,
          ...(data.role === 'technician' ? { technicianApprovalStatus: 'pending' } : {}) }; },
    },
  });
  return { ...service, initialization, drafts, calls, diagnostics, contexts, auth, user, write, inspection,
    emit(value) { auth.currentUser = value; initialization.profileInitializationAccountChanged(value); drafts.clearOnboardingDraftUnless(value); } };
}
const payload = { fullName: 'Fixture', email: 'fixture@example.test', role: 'customer', policyAccepted: true };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('registration requests verification before any profile write and retains an allowlisted password-free memory draft', async () => {
  const h = harness();
  const result = await h.registerAccount(payload.email, 'private-password', { ...payload, password: 'never store', privileged: true });
  assert.equal(result.next, 'verify-email'); assert.equal(result.verificationRequested, true);
  assert.deepEqual(h.calls, ['create', 'inspect', 'verification']);
  assert.equal(h.drafts.getOnboardingDraft().password, undefined); assert.equal(h.drafts.getOnboardingDraft().privileged, undefined);
  assert.equal(h.initialization.isProfileInitializing(h.user), false);
});

test('verification must refresh Auth and token claims before writing; an unverified account never creates a profile', async () => {
  const h = harness(); await h.registerAccount(payload.email, 'password', payload);
  await assert.rejects(h.completeVerifiedRegistration(), error => error.code === 'registration/email-not-verified');
  assert.ok(h.calls.some(call => Array.isArray(call) && call[0] === 'token' && call[1] === true));
  assert.equal(h.calls.filter(call => Array.isArray(call) && call[0] === 'profile').length, 0);
  assert.equal(h.auth.currentUser, h.user);
});

test('completion awaits the forced token refresh before any setup read or transaction', async () => {
  const h = harness(); await h.registerAccount(payload.email, 'password', payload); h.user.emailVerified = true;
  const token = deferred(); h.user.getIdTokenResult = force => { assert.equal(force, true); return token.promise; };
  const pending = h.completeVerifiedRegistration(); await tick();
  assert.equal(h.calls.filter(call => call === 'inspect').length, 1);
  assert.equal(h.calls.filter(call => Array.isArray(call) && call[0] === 'profile').length, 0);
  token.resolve({ claims: { email_verified: true } }); h.write.resolve();
  assert.equal((await pending).next, 'login');
});

test('a stale false claim never authorizes setup; refresh errors retain the original code and distinct stage', async () => {
  const h = harness(); await h.registerAccount(payload.email, 'password', payload); h.user.emailVerified = true;
  h.user.getIdTokenResult = async () => ({ claims: { email_verified: false } });
  await assert.rejects(h.completeVerifiedRegistration(), error => error.code === 'registration/email-not-verified' && error.emailVerificationConfirmed !== true);
  h.user.reload = async () => { throw { code: 'auth/network-request-failed' }; };
  await assert.rejects(h.completeVerifiedRegistration(), error => error.code === 'auth/network-request-failed' && error.registrationStep === 'verification-refresh' && error.emailVerificationConfirmed !== true);
  assert.equal(h.calls.filter(call => call === 'inspect').length, 1);
});

for (const role of ['customer', 'technician']) {
  test(role + ': verified completion waits for profile confirmation and keeps technician approval pending', async () => {
    const h = harness(); await h.registerAccount(payload.email, 'password', { ...payload, role });
    h.user.emailVerified = true;
    const running = h.completeVerifiedRegistration(); await tick();
    assert.equal(h.initialization.isProfileInitializing(h.user), true);
    await assert.rejects(h.completeVerifiedRegistration(), error => error.code === 'registration/in-progress');
    h.write.resolve(); const result = await running;
    assert.equal(result.next, role === 'customer' ? 'login' : 'technician-pending');
    assert.equal(h.drafts.getOnboardingDraft(), undefined);
    assert.equal(h.initialization.isProfileInitializing(h.user), false);
  });
}

test('email request failure retains Auth/draft and offers resend without profile creation or recovery popup', async () => {
  const h = harness({ verificationFailure: { code: 'auth/network-request-failed' } });
  const result = await h.registerAccount(payload.email, 'password', payload);
  assert.equal(result.next, 'verify-email'); assert.equal(result.verificationRequested, false);
  assert.equal(h.auth.currentUser, h.user); assert.ok(h.drafts.getOnboardingDraft());
  assert.deepEqual(h.diagnostics, [{ stage: 'send-verification', code: 'auth/network-request-failed' }]);
});

test('failed/uncertain profile completion preserves original provider code, acknowledged-save flag and session for reconciliation', async () => {
  for (const code of ['permission-denied', 'unavailable']) {
    const h = harness(); await h.registerAccount(payload.email, 'password', payload); h.user.emailVerified = true;
    const running = h.completeVerifiedRegistration(); await tick();
    h.write.reject({ code, registrationStep: 'profile-server-confirmation', profileWriteCommitted: true });
    await assert.rejects(running, error => error.code === code && error.profileWriteCommitted === true);
    assert.equal(h.auth.currentUser, h.user); assert.ok(h.drafts.getOnboardingDraft());
    h.inspection.value = { role: 'customer', emailVerified: true, policyCurrent: true, created: false };
    assert.equal((await h.completeVerifiedRegistration()).next, 'login');
    assert.equal(h.calls.filter(call => Array.isArray(call) && call[0] === 'profile').length, 1);
    assert.ok(!h.calls.includes('mark-verified'));
  }
});

test('already saved verified profiles are read-only; missing draft after restart asks for field re-entry', async () => {
  const h = harness({ existing: { role: 'customer', emailVerified: true, policyCurrent: true, created: false } });
  h.auth.currentUser = h.user; h.user.emailVerified = true;
  assert.equal((await h.completeVerifiedRegistration()).next, 'login'); assert.ok(!h.calls.includes('mark-verified'));
  h.inspection.value = null;
  assert.equal((await h.completeVerifiedRegistration()).next, 'profile-setup');
});

test('legacy profile-first accounts update only verified email state and preserve review/policy routing', async () => {
  for (const [status, policyCurrent, destination] of [['pending', true, 'technician-pending'], ['rejected', true, 'login'], ['approved', false, 'login']]) {
    const h = harness({ existing: { role: 'technician', emailVerified: false, policyCurrent, technicianApprovalStatus: status, created: false } });
    h.auth.currentUser = h.user; h.user.emailVerified = true;
    assert.equal((await h.completeVerifiedRegistration()).next, destination);
    assert.equal(h.calls.filter(call => call === 'mark-verified').length, 1);
    assert.ok(!h.calls.some(call => Array.isArray(call) && call[0] === 'profile'));
  }
});

test('duplicate registration, logout, same-UID replacement and unverified stale claims cannot leak into another session', async () => {
  const h = harness(); const running = h.registerAccount(payload.email, 'password', payload);
  await assert.rejects(h.registerAccount(payload.email, 'password', payload), error => error.code === 'registration/in-progress');
  await running; h.user.emailVerified = true;
  h.user.reload = async () => { h.emit({ ...h.user }); };
  await assert.rejects(h.completeVerifiedRegistration(), error => error.code === 'auth/registration-account-changed');
  assert.equal(h.drafts.getOnboardingDraft(), undefined);
  assert.ok(!h.calls.some(call => Array.isArray(call) && call[0] === 'profile'));
  h.emit(null);
});

test('resend uses the same identity, enforces cooldown and never recreates Auth/profile data', async () => {
  const h = harness(); await h.registerAccount(payload.email, 'password', payload);
  await assert.rejects(h.requestOnboardingVerification(), error => error.code === 'registration/resend-cooldown');
  assert.equal(h.calls.filter(call => call === 'create').length, 1);
  assert.equal(h.calls.filter(call => call === 'verification').length, 1);
});

test('validation and recovery authentication errors keep their original stage and do not create profiles', async () => {
  const h = harness({ authFailure: { code: 'auth/invalid-credential', registrationStep: 'recovery-authentication' } });
  await assert.rejects(h.registerAccount(payload.email, 'password', { ...payload, policyAccepted: false }));
  assert.equal(h.calls.length, 0);
  await assert.rejects(h.registerAccount(payload.email, 'password', payload, true), error => error.code === 'auth/invalid-credential');
  assert.deepEqual(h.calls, ['recover']);
});

test('a pre-existing initialization window cannot strand the registration operation lock', async () => {
  const h = harness(), window = h.initialization.beginProfileInitialization(payload.email);
  await assert.rejects(h.registerAccount(payload.email, 'password', payload), /already in progress/);
  window.finish();
  assert.equal((await h.registerAccount(payload.email, 'password', payload)).next, 'verify-email');
});

test('recovery invalid credentials provide safe original-password and reset guidance', async () => {
  for (const code of ['auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/wrong-password', 'auth/user-not-found']) {
    const service = load('src/services/auth.service.ts', {
      '@/src/firebase/config': { auth: {} }, '@/src/utils/registrationDebug': { getFirebaseErrorCode: error => error.code },
      'firebase/auth': { signInWithEmailAndPassword: async () => { throw Object.assign(new Error('Raw Firebase error with private details'), { code }); } },
    });
    await assert.rejects(service.registerUser(payload.email, 'wrong-password', true), error =>
      error.code === code && error.registrationStep === 'recovery-authentication' && error.message.includes('Forgot Password') &&
      error.message.includes('original registration') && !error.message.includes(code) && !error.message.includes('private details'));
  }
});

test('release diagnostics are single-line allowlisted metadata without raw errors or personal data', t => {
  const warnings = []; t.mock.method(console, 'warn', (...args) => warnings.push(args));
  t.mock.method(console, 'log', (...args) => warnings.push(args));
  t.mock.method(console, 'error', (...args) => warnings.push(args));
  const debug = load('src/utils/registrationDebug.ts', {});
  debug.logRegistrationFailure(Object.assign(new Error('private address and token'), {
    code: 'permission-denied', registrationStep: 'profile-create-transaction', email: 'private@example.test', uid: 'private-uid',
  }), 'profile-create', { appVersion: '1.0.0', projectId: 'servicepilot-756d9', password: 'never serialize', profile: { email: 'private@example.test' } });
  const parse = args => { assert.equal(args.length, 1); return JSON.parse(args[0].slice('[registration-failure] '.length)); };
  assert.deepEqual(parse(warnings[0]), { stage: 'profile-create-transaction', code: 'permission-denied', appVersion: '1.0.0', projectId: 'servicepilot-756d9' });
  debug.logRegistrationFailure({ code: 'secret-token', registrationStep: 'private@example.test' }, 'private-fallback', { appVersion: 'private@example.test', projectId: 'secret token' });
  assert.deepEqual(parse(warnings.at(-1)), { stage: 'unknown', code: 'registration/unknown', appVersion: 'unknown', projectId: 'unknown' });
  debug.logRegistrationDebug({ step: 'private', password: 'never serialize' });
  debug.logRegistrationError({ step: 'private', firebaseErrorMessage: 'private profile' });
  assert.equal(warnings.length, 2);
});

test('registration recovery screen shows actionable authentication guidance rather than the raw Firebase error', async () => {
  const alerts = [], auth = { currentUser: null };
  const authService = load('src/services/auth.service.ts', {
    '@/src/firebase/config': { auth }, '@/src/utils/registrationDebug': { getFirebaseErrorCode: error => error.code },
    'firebase/auth': { signInWithEmailAndPassword: async () => { throw Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), { code: 'auth/invalid-credential' }); } },
  });
  let recoveryButton;
  const h = renderHarness('app/(auth)/register.tsx', { dependencies: {
    'expo-router': { useLocalSearchParams: () => ({ role: 'customer' }), router: { replace() {} } },
    'react-native': new Proxy({ Platform: { OS: 'android' }, StyleSheet: { create: value => value },
      Alert: { alert: (title, message, buttons) => { alerts.push({ title, message }); recoveryButton = buttons?.find(button => button.text === 'Recover incomplete registration'); } },
    }, { get: (object, key) => object[key] ?? key }),
    '@/src/services/registration.service': { registerAccount: async (_, __, ___, recover) => {
      if (!recover) throw Object.assign(new Error('Existing account'), { code: 'auth/email-already-in-use' });
      return authService.registerUser(payload.email, 'wrong-password', true);
    } },
    '@/src/firebase/config': { auth: { currentUser: null } },
    '@/src/services/onboarding-draft.service': { getOnboardingDraft: () => undefined },
    '@/src/services/user.service': { isPublicRegistrationRole: role => ['customer', 'technician'].includes(role) },
    '@/src/utils/registrationDebug': { getFirebaseErrorCode: error => error.code, getFirebaseErrorMessage: error => error.message, logRegistrationError() {} },
  } });
  h.render();
  for (const [placeholder, value] of [['Enter your full name', 'Fixture'], ['Enter your email', payload.email],
    ['Enter your phone number', '0712345678'], ['Enter your address', 'Private'], ['Create a password', 'wrong-password'], ['Confirm your password', 'wrong-password']]) {
    h.elements().find(element => element.type === 'TextInput' && element.props.placeholder === placeholder).props.onChangeText(value); h.render();
  }
  h.elements().find(element => element.type === 'TermsAcceptance').props.onChange(true); h.render();
  const submit = h.elements().find(element => element.type === 'TouchableOpacity' && element.props.activeOpacity === 0.85 && element.props.disabled === false);
  await submit.props.onPress(); assert.equal(alerts.at(-1).title, 'Account Already Exists');
  recoveryButton.onPress(); await tick();
  assert.equal(alerts.at(-1).title, 'Recovery Sign-In Failed');
  assert.match(alerts.at(-1).message, /Forgot Password/); assert.doesNotMatch(alerts.at(-1).message, /auth\/invalid-credential|Firebase:/);
});

test('the registration screen distinguishes an acknowledged save and follows the validated recovery destination', async () => {
  const alerts = [], destinations = [];
  const h = renderHarness('app/(auth)/register.tsx', { dependencies: {
    'expo-router': { useLocalSearchParams: () => ({ role: 'customer' }), router: { replace: route => destinations.push(route) } },
    'react-native': new Proxy({ Platform: { OS: 'android' }, StyleSheet: { create: value => value },
      Alert: { alert: (title, message, buttons) => alerts.push({ title, message, buttons }) },
    }, { get: (object, key) => object[key] ?? key }),
    '@/src/services/registration.service': { registerAccount: async (_, __, data, recover) => {
      if (!recover) throw Object.assign(new Error('Uncertain confirmation'), { code: 'unavailable', partialAuthAccount: true, profileWriteCommitted: true });
      return { next: 'login', role: data.role, accessMessage: 'Saved profile recovered' };
    } },
    '@/src/firebase/config': { auth: { currentUser: null } },
    '@/src/services/onboarding-draft.service': { getOnboardingDraft: () => undefined },
    '@/src/services/user.service': { isPublicRegistrationRole: role => ['customer', 'technician'].includes(role) },
    '@/src/utils/registrationDebug': { getFirebaseErrorCode: error => error.code, getFirebaseErrorMessage: error => error.message, logRegistrationError() {} },
  } });
  h.render();
  for (const [placeholder, value] of [['Enter your full name', 'Fixture'], ['Enter your email', payload.email],
    ['Enter your phone number', '0712345678'], ['Enter your address', 'Private'], ['Create a password', 'fixture-password'], ['Confirm your password', 'fixture-password']]) {
    h.elements().find(element => element.type === 'TextInput' && element.props.placeholder === placeholder).props.onChangeText(value); h.render();
  }
  h.elements().find(element => element.type === 'TermsAcceptance').props.onChange(true); h.render();
  await h.elements().find(element => element.type === 'TouchableOpacity' && element.props.activeOpacity === 0.85 && element.props.disabled === false).props.onPress();
  assert.equal(alerts.at(-1).title, 'Profile Saved, Confirmation Interrupted');
  alerts.at(-1).buttons.find(button => button.text === 'Recover incomplete registration').onPress(); await tick();
  assert.deepEqual(destinations.at(-1), { pathname: '/login', params: { email: payload.email, role: 'customer', accessMessage: 'Saved profile recovered' } });
  h.cleanup();
});
