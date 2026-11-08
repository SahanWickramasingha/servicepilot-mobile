import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHarness } from '../lib/performance-render-harness.mjs';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';

const { onboardingFailureFeedback } = loadService('src/utils/onboardingFeedback.ts', {});
function screen({ complete = async () => ({ next: 'profile-setup' }), resend = async () => ({ alreadyVerified: false }), seconds = () => 0 } = {}) {
  const owner = { uid: 'fixture', email: 'fixture@example.test' }, auth = { currentUser: owner }, routes = [];
  let sends = 0, checks = 0;
  const h = renderHarness('app/(auth)/verify-email.tsx', { effects: true, dependencies: {
    'expo-router': { router: { replace: route => routes.push(route) }, useLocalSearchParams: () => ({}) },
    '@/src/firebase/config': { auth }, '@/src/services/auth.service': { logoutUser: async () => { auth.currentUser = null; } },
    '@/src/services/registration.service': {
      completeVerifiedRegistration: () => { checks++; return complete(); },
      requestOnboardingVerification: () => { sends++; return resend(); }, verificationResendSeconds: seconds,
    },
  } });
  h.render();
  const text = node => !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
  return { h, auth, owner, routes, sends: () => sends, checks: () => checks,
    labels: () => h.elements().filter(node => node.type === 'Text').map(node => text(node)),
    button: label => h.elements().find(node => node.type === 'TouchableOpacity' && text(node) === label),
  };
}

test('verified denied create keeps a continue action and removes resend, without mislabelling verification', async () => {
  const h = screen({ complete: async () => { throw { code: 'permission-denied', registrationStep: 'profile-create-transaction', emailVerificationConfirmed: true }; } });
  await h.button("I've Verified Email").props.onPress(); h.h.render();
  assert.ok(h.labels().includes('Email Verified'));
  assert.ok(h.labels().some(value => value.includes('profile setup was denied')));
  assert.ok(h.button('Continue profile setup')); assert.equal(h.button('Resend Email'), undefined);
  assert.ok(!h.labels().some(value => /verification.*failed|not verified yet/i.test(value)));
  h.h.cleanup();
});

test('already-verified resend offers continuation without a success countdown or another resend', async () => {
  const h = screen({ resend: async () => ({ alreadyVerified: true }) });
  await h.button('Resend Email').props.onPress(); h.h.render();
  assert.equal(h.sends(), 1); assert.ok(h.labels().includes('Email Verified'));
  assert.ok(h.labels().some(value => value.includes('already verified')));
  assert.ok(!h.labels().some(value => value.includes('Resend available in')));
  assert.equal(h.button('Resend Email'), undefined);
  await h.button('Continue profile setup').props.onPress();
  assert.equal(h.routes.at(-1).pathname, '/profile-setup'); h.h.cleanup();
});

test('resend acceptance and failures show outcome-specific feedback; only accepted or backed-off requests count down', async () => {
  for (const code of [undefined, 'auth/network-request-failed', 'auth/too-many-requests', 'auth/invalid-user-token', 'auth/operation-timeout']) {
    let wait = 0;
    const h = screen({ seconds: () => wait, resend: async () => {
      if (!code || ['auth/too-many-requests', 'auth/operation-timeout'].includes(code)) wait = 60;
      if (code) throw { code }; return { alreadyVerified: false };
    } });
    await h.button('Resend Email').props.onPress(); h.h.render();
    assert.equal(h.labels().some(value => value.includes('Resend available in')), wait > 0);
    assert.equal(h.labels().some(value => value.includes('request accepted')), !code);
    if (!code) assert.ok(h.labels().some(value => value.includes('Inbox delivery is not confirmed')));
    else assert.ok(h.h.elements().some(node => node.props.accessibilityRole === 'alert'));
    h.h.cleanup();
  }
});

test('screen separates unverified, refresh failure and verified-but-unconfirmed saved profiles', () => {
  assert.match(onboardingFailureFeedback({ code: 'registration/email-not-verified' }).message, /not verified yet/);
  assert.match(onboardingFailureFeedback({ code: 'auth/network-request-failed', registrationStep: 'verification-refresh' }).message, /Unable to refresh/);
  assert.match(onboardingFailureFeedback({ code: 'unavailable', emailVerificationConfirmed: true, profileWriteCommitted: true }).message, /profile was saved/);
  assert.match(onboardingFailureFeedback({ code: 'auth/network-request-failed', registrationStep: 'send-verification' }, true).message, /email request failed/);
});

test('repeated taps issue one request; account switches and unmount ignore old outcomes', async () => {
  for (const changed of ['switch', 'logout', 'unmount']) {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const h = screen({ resend: () => pending });
    const press = h.button('Resend Email').props.onPress;
    const first = press(); await press(); assert.equal(h.sends(), 1);
    if (changed === 'unmount') h.h.cleanup();
    else h.auth.currentUser = changed === 'logout' ? null : { ...h.owner };
    release({ alreadyVerified: true }); await first; h.h.render();
    assert.ok(!h.labels().includes('Email Verified'));
    assert.equal(h.routes.length, 0); h.h.cleanup();
  }
});

test('verified completion routes Customer to sign-in, Technician to pending and restarted onboarding to profile re-entry', async () => {
  for (const next of ['login', 'technician-pending', 'profile-setup']) {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const h = screen({ complete: () => pending });
    const press = h.button("I've Verified Email").props.onPress;
    const first = press(); await press(); assert.equal(h.checks(), 1);
    release({ next }); await first;
    assert.equal(h.routes.at(-1).pathname, '/' + next); h.h.cleanup();
  }
});
