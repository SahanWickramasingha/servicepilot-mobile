import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firebaseSetupEmail } from '../src/email';
import { configuration, type Env } from '../src/runtime';

const env: Env = { FIREBASE_PROJECT_ID: 'servicepilot-756d9', ADMIN_WEB_ORIGIN: 'https://servicepilot-admin-web.pages.dev',
  ADMIN_EMAIL_PROVIDER: 'firebase', FIREBASE_WEB_API_KEY: 'public-project-key-fixture-only',
  ADMIN_SERVICE_ACCOUNT_EMAIL: 'servicepilot-admin-runtime@servicepilot-756d9.iam.gserviceaccount.com',
  ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY: ['-----BEGIN', 'PRIVATE KEY-----'].join(' ') };

test('Firebase mode requires its public project API key, not a sending domain, From address or Resend key', () => {
  configuration(env);
  assert.throws(() => configuration({ ...env, FIREBASE_WEB_API_KEY: '' }));
  assert.throws(() => configuration({ ...env, ADMIN_EMAIL_PROVIDER: 'resend' }));
});

test('built-in password-reset request asks Firebase to send email, never generate links or set verification', async () => {
  let calls = 0;
  const request = firebaseSetupEmail(env, async (url, init) => {
    calls++;
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, 'https://identitytoolkit.googleapis.com');
    assert.equal(parsed.pathname, '/v1/accounts:sendOobCode');
    assert.equal(parsed.searchParams.get('key'), env.FIREBASE_WEB_API_KEY);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' }); // no service credentials
    assert.deepEqual(JSON.parse(String(init?.body)), { requestType: 'PASSWORD_RESET', email: 'dispatcher@example.test',
      continueUrl: env.ADMIN_WEB_ORIGIN + '/login' });
    // No response payload, including unexpected link fields, crosses the adapter.
    return new Response(JSON.stringify({ email: 'dispatcher@example.test', oobLink: 'PRIVATE_TEST_LINK' }));
  });
  assert.equal(await request('dispatcher@example.test'), 'accepted');
  assert.equal(calls, 1);
});

test('enumeration-protected empty success is request acceptance only', async () => {
  assert.equal(await firebaseSetupEmail(env, async () => new Response('{}'))('dispatcher@example.test'), 'accepted');
});

test('Firebase quotas, API/configuration failures and abuse checks are sanitized without retries', async () => {
  const cases = [
    [429, 'QUOTA_EXCEEDED', 'email/quota-exceeded'],
    [400, 'TOO_MANY_ATTEMPTS_TRY_LATER', 'email/quota-exceeded'],
    [400, 'RESET_PASSWORD_EXCEED_LIMIT', 'email/quota-exceeded'],
    [400, 'CAPTCHA_CHECK_FAILED', 'email/abuse-protection'],
    [400, 'MISSING_RECAPTCHA_TOKEN', 'email/abuse-protection'],
    [400, 'EMAIL_NOT_FOUND', 'email/request-failed'],
    [403, 'API_KEY_INVALID', 'email/request-failed'],
    [400, 'INVALID_CONTINUE_URI', 'email/request-failed'],
    [503, 'UPSTREAM_PRIVATE_DETAILS', 'email/outcome-unknown'],
  ] as const;
  for (const [status, message, code] of cases) {
    let attempts = 0;
    const send = firebaseSetupEmail(env, async () => { attempts++; return new Response(JSON.stringify({ error: { message } }), { status }); });
    await assert.rejects(send('dispatcher@example.test'), { code, message: code });
    assert.equal(attempts, 1);
  }
});

test('network failures are unknown, not proof an email request failed', async () => {
  const send = firebaseSetupEmail(env, async () => { throw new Error('PRIVATE_TEST_LINK'); });
  await assert.rejects(send('dispatcher@example.test'), { code: 'email/outcome-unknown', message: 'email/outcome-unknown' });
});
