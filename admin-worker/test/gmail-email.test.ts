import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisionEmail, decisionEmailConfigured, technicianEmailProvider, firebaseSetupEmail, setupEmail } from '../src/email';
import { decisionEmailMessage } from '../../functions/src/domain/technicianDecisionEmail';
import { configuration, requestFetch, type Env } from '../src/runtime';

const env: Env = { FIREBASE_PROJECT_ID: 'servicepilot-756d9', ADMIN_WEB_ORIGIN: 'https://admin.example.test',
  ADMIN_EMAIL_PROVIDER: 'firebase', FIREBASE_WEB_API_KEY: 'public-fixture-key-not-functional', TECHNICIAN_EMAIL_PROVIDER: 'gmail',
  ADMIN_EMAIL_FROM: 'sender@gmail.com', GMAIL_CLIENT_ID: 'fixture-client', GMAIL_CLIENT_SECRET: 'fixture-secret&+=',
  GMAIL_REFRESH_TOKEN: 'fixture-refresh&+=', ADMIN_SERVICE_ACCOUNT_EMAIL: 'servicepilot-admin@servicepilot-756d9.iam.gserviceaccount.com',
  ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY: ['-----BEGIN', 'PRIVATE KEY-----'].join(' ') };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const token = () => json({ access_token: 'fixture-access-only', token_type: 'Bearer', expires_in: 3600 });
const message = () => decisionEmailMessage(env.ADMIN_EMAIL_FROM!, 'tech@example.test', 'සිංහල தமிழ் A&B 😀', 'rejected', 'Certificate required\n<script>private reason</script>');

test('Gmail decision selection requires all credentials/sender and never falls back to Resend or affects Firebase invitations', async () => {
  assert.equal(technicianEmailProvider(env), 'gmail'); assert.equal(decisionEmailConfigured(env), true); configuration(env);
  assert.equal(technicianEmailProvider({ ...env, TECHNICIAN_EMAIL_PROVIDER: undefined }), 'resend');
  for (const patch of [{ GMAIL_CLIENT_ID: '' }, { GMAIL_CLIENT_SECRET: ' ' }, { GMAIL_REFRESH_TOKEN: '' },
    { ADMIN_EMAIL_FROM: '' }, { ADMIN_EMAIL_FROM: 'sender@gmail.com\r\nBcc: victim@example.test' }, { TECHNICIAN_EMAIL_PROVIDER: 'unsupported' }]) {
    const config = { ...env, ...patch, RESEND_API_KEY: 'must-not-fall-back' };
    assert.equal(decisionEmailConfigured(config), false);
    await assert.rejects(decisionEmail(config, async () => { assert.fail('missing settings must not contact any provider'); })(message(), 'key'), { code: 'email/not-configured' });
    configuration(config); // Optional decision settings cannot disable invitation/lifecycle routes.
  }
  assert.equal(await firebaseSetupEmail(env, async url => {
    assert.equal(new URL(String(url)).hostname, 'identitytoolkit.googleapis.com'); return json({});
  })('dispatcher@example.test'), 'accepted');
  assert.equal(await setupEmail({ ...env, ADMIN_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'fixture-resend' }, async url => {
    assert.equal(String(url), 'https://api.resend.com/emails'); return json({ id: 'invite-only' });
  })('dispatcher@example.test', 'https://action.example.test'), 'sent');
});

test('Gmail exchanges refresh token server-side and sends stable UTF-8 multipart MIME for both decisions', async () => {
  for (const status of ['approved', 'rejected'] as const) {
    const value = decisionEmailMessage(env.ADMIN_EMAIL_FROM!, 'tech@example.test', 'සිංහල தமிழ் 😀', status, 'Line one\n<script>Reason & evidence</script>');
    const rawValues: string[] = [], hosts: string[] = [];
    const send = decisionEmail(env, async (url, init) => {
      const parsed = new URL(String(url)); hosts.push(parsed.hostname);
      assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'manual');
      if (parsed.hostname === 'oauth2.googleapis.com') {
        assert.equal(parsed.pathname, '/token');
        assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/x-www-form-urlencoded');
        assert.equal(new Headers(init?.headers).has('Authorization'), false);
        assert.deepEqual(Object.fromEntries(new URLSearchParams(String(init?.body))), { grant_type: 'refresh_token',
          client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN });
        return token();
      }
      assert.equal(parsed.hostname, 'gmail.googleapis.com');
      assert.equal(decodeURIComponent(parsed.pathname), '/gmail/v1/users/sender@gmail.com/messages/send');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-access-only');
      assert.equal(new Headers(init?.headers).has('Idempotency-Key'), false);
      const { raw } = JSON.parse(String(init?.body)); assert.match(raw, /^[A-Za-z0-9_-]+$/); rawValues.push(raw);
      const mime = Buffer.from(raw, 'base64url').toString('utf8');
      assert.ok(mime.startsWith('From: sender@gmail.com\r\nTo: tech@example.test\r\nSubject: '));
      const boundary = mime.match(/boundary="([^"]+)"/)![1];
      assert.ok(boundary.length <= 70);
      assert.ok(mime.endsWith(`--${boundary}--\r\n`));
      assert.ok(mime.split('\r\n').filter(line => line.startsWith('Subject: ') || line.startsWith(' =?UTF-8?')).every(line => line.length <= 78));
      const subject = mime.match(/^Subject: (.*(?:\r\n .*)*)/m)![1].replace(/\r\n /g, '');
      assert.equal([...subject.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(m => Buffer.from(m[1], 'base64').toString('utf8')).join(''), value.subject);
      const parts = [...mime.matchAll(/Content-Type: text\/(plain|html); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]*?)\r\n--/g)];
      assert.equal(parts.length, 2);
      assert.equal(Buffer.from(parts[0][2], 'base64').toString('utf8'), value.text);
      assert.equal(Buffer.from(parts[1][2], 'base64').toString('utf8'), value.html);
      assert.ok(!value.html.includes('<script>'));
      for (const credential of [env.GMAIL_CLIENT_ID!, env.GMAIL_CLIENT_SECRET!, env.GMAIL_REFRESH_TOKEN!, 'fixture-access-only']) assert.ok(!mime.includes(credential));
      assert.ok(mime.split('\r\n').every(line => line.length <= 998));
      return json({ id: 'gmail-accepted-only' });
    });
    assert.deepEqual(await send(value, 'technician-decision/revision'), { id: 'gmail-accepted-only' });
    await send(Object.fromEntries(Object.entries(value).reverse()) as typeof value, 'technician-decision/revision');
    assert.equal(rawValues[0], rawValues[1]); assert.deepEqual(hosts, ['oauth2.googleapis.com', 'gmail.googleapis.com', 'oauth2.googleapis.com', 'gmail.googleapis.com']);
  }
});

test('OAuth rejection, malformed response and timeout are sanitized definitive failures without attempting email', async () => {
  const responses = [() => json({ error: 'invalid_grant', error_description: env.GMAIL_REFRESH_TOKEN }, 400),
    () => json({}, 503), () => json({ access_token: 'bad\r\ntoken', token_type: 'Bearer' }), () => json(null),
    () => json({ access_token: 'fixture', token_type: 'unsupported' }), () => new Response('invalid json'),
    () => { throw Error(env.GMAIL_CLIENT_SECRET); }];
  for (const respond of responses) {
    let attempts = 0;
    await assert.rejects(decisionEmail(env, async url => { attempts++; assert.equal(String(url), 'https://oauth2.googleapis.com/token'); return respond(); })(message(), 'key'),
      { code: 'email/request-failed', message: 'email/request-failed' });
    assert.equal(attempts, 1);
  }
});

test('Gmail send errors distinguish definitive rejections from uncertain results without any transport retry', async () => {
  for (const status of [400, 401, 403, 404, 429, 200, 409, 500, 503]) {
    let attempts = 0;
    const send = decisionEmail(env, async () => ++attempts === 1 ? token() : json({ error: { message: env.GMAIL_REFRESH_TOKEN } }, status));
    const code = [400, 401, 403, 404, 429].includes(status) ? 'email/request-failed' : 'email/outcome-unknown';
    await assert.rejects(send(message(), 'key'), { code, message: code }); assert.equal(attempts, 2);
  }
  for (const response of [() => { throw Error('private provider details'); }, () => json(null), () => new Response('invalid json')]) {
    let attempts = 0;
    await assert.rejects(decisionEmail(env, async () => ++attempts === 1 ? token() : response())(message(), 'key'), { code: 'email/outcome-unknown' });
    assert.equal(attempts, 2);
  }
});

test('MIME headers reject injected recipients, subject and changed frozen sender before OAuth', async () => {
  const send = decisionEmail(env, async () => { assert.fail('invalid message cannot start OAuth'); });
  for (const patch of [{ from: 'other@gmail.com' }, { to: ['tech@example.test\r\nBcc: victim@example.test'] },
    { to: ['tech@example.test', 'victim@example.test'] }, { subject: 'Decision\r\nBcc: victim@example.test' }]) {
    await assert.rejects(send({ ...message(), ...patch }, 'key'), { code: 'email/request-failed' });
  }
});

test('shared request budget rejects redirects without forwarding Gmail credentials', async () => {
  for (const redirectAt of ['oauth', 'gmail']) {
    let attempts = 0;
    const transport = requestFetch(async () => { attempts++; return attempts === 1 && redirectAt === 'gmail' ? token() : new Response(null, { status: 302, headers: { Location: 'https://foreign.example.test' } }); });
    await assert.rejects(decisionEmail(env, transport)(message(), 'key'), { code: redirectAt === 'oauth' ? 'email/request-failed' : 'email/outcome-unknown' });
    assert.equal(attempts, redirectAt === 'oauth' ? 1 : 2);
  }
});
