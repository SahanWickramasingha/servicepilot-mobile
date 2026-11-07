import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisionEmail, decisionEmailConfigured } from '../src/email';
import { decisionEmailMessage } from '../../functions/src/domain/technicianDecisionEmail';
import worker, { handleRequest } from '../src/index';
import type { Env } from '../src/runtime';

const env = { FIREBASE_PROJECT_ID: 'servicepilot-756d9', ADMIN_WEB_ORIGIN: 'https://admin.example.test',
  ADMIN_EMAIL_PROVIDER: 'firebase', FIREBASE_WEB_API_KEY: 'a'.repeat(30), RESEND_API_KEY: 'test-only', ADMIN_EMAIL_FROM: 'servicepilot@example.test',
  ADMIN_SERVICE_ACCOUNT_EMAIL: 'servicepilot-admin@servicepilot-756d9.iam.gserviceaccount.com',
  ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY: ['-----BEGIN', 'PRIVATE KEY-----'].join(' ') } as Env;

test('approval uses the requested copy, first name, hidden preview and no unverified app link', () => {
  const approved = decisionEmailMessage(env.ADMIN_EMAIL_FROM!, 'tech@example.test', '  Gihan Perera  ', 'approved', 'not approval content');
  assert.equal(approved.subject, 'Your ServicePilot technician application is approved');
  assert.equal(approved.text, `APPLICATION APPROVED

Welcome to ServicePilot, Gihan!

Your technician application has been approved. You can now sign in to the ServicePilot app using the email address you registered with.

What to do next
1. Open the ServicePilot app and sign in.
2. Review your technician profile and service area.
3. Set your availability when you're ready to receive service requests.

See you in the app,
The ServicePilot Team

You received this email because you applied to become a technician on ServicePilot. This is an automated email.`);
  assert.deepEqual(approved.to, ['tech@example.test']); assert.equal(approved.from, env.ADMIN_EMAIL_FROM);
  assert.match(approved.html, /<html lang="en">/);
  assert.match(approved.html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(approved.html, /<div style="[^"]*display:none!important;[^"]*mso-hide:all;[^"]*">Sign in to ServicePilot to complete your technician profile\.<\/div>/);
  assert.ok(approved.html.indexOf('Sign in to ServicePilot') < approved.html.indexOf('APPLICATION APPROVED'));
  assert.match(approved.html, /role="presentation"/);
  assert.match(approved.html, /max-width:600px/);
  assert.match(approved.html, /<!--\[if mso\]>/);
  assert.match(approved.html, /<h1[^>]*>Welcome to ServicePilot, Gihan!<\/h1>/);
  assert.match(approved.html, /<h2[^>]*>What to do next<\/h2>/);
  const items = [...approved.html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(match => match[1].replace(/&#39;/g, "'"));
  assert.deepEqual(items, approved.text.split('What to do next\n')[1].split('\n\n')[0].split('\n').map(line => line.slice(3)));
  assert.ok(approved.html.includes('Your technician application has been approved. You can now sign in to the ServicePilot app using the email address you registered with.'));
  assert.ok(approved.html.includes('See you in the app,<br><strong>The ServicePilot Team</strong>'));
  assert.ok(approved.html.includes('You received this email because you applied to become a technician on ServicePilot. This is an automated email.'));
  assert.doesNotMatch(approved.html, /<a\b|href=|<script\b|<link\b|<style\b|not approval content/i);
  const header = approved.html.match(/<td bgcolor="#10243a"[^>]*>([\s\S]*?)<\/table>\s*<\/td>/)![1];
  assert.equal((header.match(/<td\b/g) ?? []).length, 2, 'logo and brand use two cells');
  assert.equal((header.match(/<img\b/g) ?? []).length, 1);
  assert.match(header, /<td width="40" valign="middle"[^>]*padding:0 12px 0 0;vertical-align:middle;/);
  assert.match(header, /<img src="https:\/\/servicepilot-756d9\.web\.app\/assets\/images\/servicepilot-logo\.png" alt="" width="40" height="40" border="0" style="display:block;width:40px;height:40px;/);
  assert.match(header, /<td valign="middle"[^>]*color:#ffffff;[^>]*>ServicePilot<\/td>/);
  assert.equal((approved.html.match(/<img\b/g) ?? []).length, 1, 'only the approval header has an image');
});

test('approval handles blank names, whitespace, Unicode and HTML injection safely', () => {
  for (const name of ['', ' \t\n ']) {
    const approved = decisionEmailMessage(env.ADMIN_EMAIL_FROM!, 'tech@example.test', name, 'approved', '');
    assert.ok(approved.text.includes('Welcome to ServicePilot!'));
    assert.match(approved.html, />Welcome to ServicePilot!<\/h1>/);
    assert.ok(!approved.text.includes('Welcome to ServicePilot,'));
  }
  const unicode = decisionEmailMessage(env.ADMIN_EMAIL_FROM!, 'tech@example.test', '  ගිහාන්\tPerera ', 'approved', '');
  assert.ok(unicode.text.includes('Welcome to ServicePilot, ගිහාන්!'));
  assert.ok(unicode.html.includes('Welcome to ServicePilot, ගිහාන්!'));
  const name = `<script>alert("&'")</script>`;
  const approved = decisionEmailMessage(env.ADMIN_EMAIL_FROM!, 'tech@example.test', `${name} Last`, 'approved', '');
  assert.ok(approved.text.includes(`Welcome to ServicePilot, ${name}!`));
  assert.ok(approved.html.includes('&lt;script&gt;alert(&quot;&amp;&#39;&quot;)&lt;/script&gt;'));
  assert.doesNotMatch(approved.html, /<script\b|Last/);
});

test('rejection subject, plain text and escaped HTML remain unchanged', () => {
  const rejected = decisionEmailMessage(env.ADMIN_EMAIL_FROM!, 'tech@example.test', 'A&B', 'rejected', '<script>alert("x")</script>\nEvidence needed');
  assert.equal(rejected.subject, 'Update on your ServicePilot technician application');
  assert.equal(rejected.text, 'Hello A&B,\n\nYour technician application was not approved. The reason for this decision is:\n\n<script>alert("x")</script>\nEvidence needed\n\nThe ServicePilot team');
  assert.equal(rejected.html, '<p>Hello A&amp;B,</p><p>Your technician application was not approved. The reason for this decision is:</p><blockquote style="white-space:pre-wrap">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;\nEvidence needed</blockquote><p>The ServicePilot team</p>');
});
test('decision adapter reuses Resend with stable key/payload and never treats acceptance as delivery', async () => {
  const message = decisionEmailMessage(env.ADMIN_EMAIL_FROM!, 'tech@example.test', 'Test', 'approved', '');
  const bodies: string[] = [];
  const send = decisionEmail(env, async (url, init) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'technician-decision/test');
    assert.deepEqual(JSON.parse(String(init?.body)), message);
    bodies.push(String(init?.body));
    return new Response(JSON.stringify({ id: 'provider-accepted' }));
  });
  assert.deepEqual(await send(message, 'technician-decision/test'), { id: 'provider-accepted' });
  await send(Object.fromEntries(Object.entries(message).reverse()) as typeof message, 'technician-decision/test');
  assert.equal(bodies[0], bodies[1], 'stored map key ordering cannot change retry bytes');
  for (const status of [200, 409, 503]) await assert.rejects(decisionEmail(env, async () => new Response('{}', { status }))(message, 'key'), { code: 'email/outcome-unknown' });
  await assert.rejects(decisionEmail(env, async () => { throw Error('private provider details'); })(message, 'key'), { message: 'email/outcome-unknown' });
  for (const status of [400, 401, 429]) await assert.rejects(decisionEmail(env, async () => new Response('{}', { status }))(message, 'key'), { code: 'email/request-failed' });
});
test('Firebase invitation mode does not pretend to support custom emails; missing optional Resend configuration makes zero requests', async () => {
  const message = decisionEmailMessage(env.ADMIN_EMAIL_FROM!, 'tech@example.test', 'Test', 'rejected', 'Evidence needed');
  assert.equal(decisionEmailConfigured(env), true, 'existing Resend may coexist with Firebase invitations');
  for (const patch of [{ RESEND_API_KEY: '' }, { ADMIN_EMAIL_FROM: '' }, { ADMIN_EMAIL_FROM: 'bad\nheader@example.test' }]) {
    const config = { ...env, ...patch };
    assert.equal(decisionEmailConfigured(config), false);
    await assert.rejects(decisionEmail(config, async () => { assert.fail('no provider request without configuration'); })(message, 'key'), { code: 'email/not-configured' });
  }
});
test('Worker decision routes preserve CORS/auth/body gates and expose only the safe result', async () => {
  let calls = 0;
  const result = { technicianUid: 'tech', revision: 'a'.repeat(64), status: 'submitted', retryable: false };
  const service = { request: async (auth: string, body: unknown) => { assert.equal(auth, 'Bearer test.token.value'); assert.deepEqual(body, { technicianUid: 'tech' }); calls++; return result; }, status: async () => result };
  const factory = (() => ({ decisionEmails: service })) as any;
  const request = (path: string, headers: Record<string, string> = {}) => new Request('https://worker.example.test' + path, { method: 'POST',
    headers: { Authorization: 'Bearer test.token.value', 'Content-Type': 'application/json', Origin: env.ADMIN_WEB_ORIGIN, ...headers }, body: JSON.stringify({ technicianUid: 'tech' }) });
  for (const path of ['/v1/technicians/decision-email', '/v1/technicians/decision-email/status']) {
    const response = await handleRequest(request(path), env, factory);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
    assert.equal((await handleRequest(request(path, { Origin: 'https://untrusted.example.test' }), env, factory)).status, 403);
    assert.equal((await handleRequest(request(path, { Authorization: '' }), env, factory)).status, 401);
  }
  assert.equal(calls, 1);
});
test('decision requests retain bounded Worker execution after a client disconnect without bypassing auth', async () => {
  const tasks: Promise<unknown>[] = [];
  const response = await worker.fetch(new Request('https://worker.example.test/v1/technicians/decision-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  }), env, { waitUntil: (task: Promise<unknown>) => tasks.push(task) } as unknown as ExecutionContext);
  assert.equal(response.status, 401); assert.equal(tasks.length, 1); await Promise.all(tasks);
});
