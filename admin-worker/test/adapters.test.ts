import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { firebaseAuth, verifyToken } from '../src/auth';
import { firestoreStore, serverTime } from '../src/firestore';
import { configuration, requestFetch, type Env } from '../src/runtime';
import { setupEmail } from '../src/email';
import { handleRequest } from '../src/index';

const project = 'servicepilot-756d9';
// Intentionally nonfunctional test credentials; never written to runtime config.
const env: Env = { FIREBASE_PROJECT_ID: project, ADMIN_WEB_ORIGIN: 'https://admin.example.test',
  ADMIN_EMAIL_FROM: 'invites@example.test', ADMIN_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-only',
  ADMIN_SERVICE_ACCOUNT_EMAIL: `servicepilot-admin@${project}.iam.gserviceaccount.com`,
  ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY: ['-----BEGIN', 'PRIVATE KEY-----'].join(' ') };
const pair = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(pair.publicKey), kid: 'test-signing-key' };
const keys = createLocalJWKSet({ keys: [jwk] });
async function jwt(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ auth_time: now - 10, ...overrides }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(`https://securetoken.google.com/${project}`).setAudience(project).setSubject('admin')
    .setIssuedAt(now).setExpirationTime(now + 600).sign(pair.privateKey);
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test('signed Firebase token validates issuer/audience, expiry, signature and auth_time', async () => {
  assert.equal((await verifyToken(await jwt(), project, keys)).uid, 'admin');
  await assert.rejects(verifyToken(await jwt(), 'wrong-project', keys));
  await assert.rejects(verifyToken(await jwt({ auth_time: 0 }), project, keys));
  await assert.rejects(verifyToken(await jwt({ auth_time: Math.floor(Date.now() / 1000) + 500 }), project, keys));
  const expired = await new SignJWT({ auth_time: 1 }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(`https://securetoken.google.com/${project}`).setAudience(project).setSubject('admin').setIssuedAt(1).setExpirationTime(2).sign(pair.privateKey);
  await assert.rejects(verifyToken(expired, project, keys));
  await assert.rejects(verifyToken((await jwt()).replace(/.$/, '!'), project, keys));
});

test('revocation lookup is authoritative and rejects disabled/deleted/revoked/malformed accounts', async () => {
  let account: unknown = { localId: 'admin', validSince: '1' };
  let calls = 0;
  const auth = firebaseAuth(project, async () => 'server-token', async (url, init) => {
    calls++;
    assert.equal(String(url), `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`);
    assert.deepEqual(JSON.parse(String(init?.body)), { localId: ['admin'] });
    return json({ users: account ? [account] : [] });
  }, keys);
  const token = await jwt();
  await auth.verifyIdToken(token, true);
  for (const invalid of [undefined, { localId: 'admin', disabled: true }, { localId: 'admin', validSince: 'not-a-number' },
    { localId: 'admin', validSince: String(Math.floor(Date.now() / 1000)) }]) {
    account = invalid;
    await assert.rejects(auth.verifyIdToken(token, true));
  }
  await assert.rejects(auth.verifyIdToken(token, false));
  assert.equal(calls, 5);
});

test('Auth REST uses Admin create, update, revoke, delete and link-only endpoints; definite failures only', async () => {
  const bodies: { url: string; body: any }[] = [];
  let failure = '';
  const auth = firebaseAuth(project, async () => 'server-token', async (url, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push({ url: String(url), body });
    return failure ? json({ error: { message: failure } }, 400) : json({ localId: 'created', oobLink: 'https://example.test/reset?test=1' });
  }, keys);
  await auth.createUser({ uid: 'created', email: 'new@example.test', displayName: 'New Dispatcher', password: 'test-only', emailVerified: false, disabled: false });
  assert.ok(bodies[0].url.endsWith('/accounts'));
  assert.equal(bodies[0].body.localId, 'created');
  await auth.updateUser('created', { disabled: true });
  assert.deepEqual(bodies[1].body, { localId: 'created', disableUser: true });
  await auth.revokeRefreshTokens('created');
  assert.ok(Number(bodies[2].body.validSince) > 0);
  await auth.generatePasswordResetLink('new@example.test', { url: env.ADMIN_WEB_ORIGIN + '/login', handleCodeInApp: false });
  assert.equal(bodies[3].body.returnOobLink, true);
  assert.equal(bodies[3].body.continueUrl, env.ADMIN_WEB_ORIGIN + '/login');
  await auth.deleteUser('created');
  assert.ok(bodies[4].url.endsWith(':delete'));
  failure = 'EMAIL_EXISTS';
  await assert.rejects(auth.createUser({ uid: 'created', email: 'new@example.test', displayName: 'New', password: 'test-only', emailVerified: false, disabled: false }), { code: 'auth/email-already-exists' });
  failure = 'upstream text must stay private';
  await assert.rejects(auth.deleteUser('created'), { message: 'admin/auth-unavailable' });
});

test('Firestore wire preserves create/update preconditions, merge masks, timestamps and snapshot order', async () => {
  const root = `projects/${project}/databases/(default)/documents`;
  let writes: any[] = [];
  const store = firestoreStore(project, async () => 'token', async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith(':beginTransaction')) return json({ transaction: 'tx' });
    if (String(url).endsWith(':batchGet')) return json(body.documents.slice().reverse().map((name: string) => ({ found: { name,
      fields: { marker: { stringValue: name.split('/').pop() } } } })));
    if (String(url).endsWith(':commit')) { writes = body.writes; return json({}); }
    return json({});
  });
  await store.runTransaction(async tx => {
    const [a, b] = await tx.getAll(store.doc('users/a'), store.doc('users/b'));
    assert.equal(a.data()?.marker, 'a'); assert.equal(b.data()?.marker, 'b');
    tx.create(store.doc('users/new'), { name: 'New', updatedAt: serverTime });
    tx.update(store.doc('users/a'), { disabled: true, updatedAt: serverTime });
    tx.set(store.doc('audit_logs/audit'), { outcome: 'complete' }, { merge: true });
    tx.delete(store.doc('dispatcher_provisioning_emails/email'));
  });
  assert.deepEqual(writes[0].currentDocument, { exists: false });
  assert.deepEqual(writes[1].currentDocument, { exists: true });
  assert.deepEqual(writes[1].updateMask.fieldPaths, ['disabled']);
  assert.deepEqual(writes[0].updateTransforms, [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]);
  assert.equal(writes[2].currentDocument, undefined);
  assert.deepEqual(writes[2].updateMask.fieldPaths, ['outcome']);
  assert.equal(writes[3].delete, `${root}/dispatcher_provisioning_emails/email`);
  assert.throws(() => store.doc('private_addresses/forbidden'));
  assert.throws(() => store.doc('users/../other'));
});

test('Firestore retries only definite ABORTED; uncertain commit is never replayed', async () => {
  for (const mode of ['aborted', 'network'] as const) {
    let attempts = 0, commits = 0, rollbacks = 0;
    const store = firestoreStore(project, async () => 'token', async (url) => {
      if (String(url).endsWith(':beginTransaction')) return json({ transaction: 'tx' + attempts });
      if (String(url).endsWith(':commit')) {
        if (++commits === 1) {
          if (mode === 'network') throw new Error('network');
          return json({ error: { status: 'ABORTED' } }, 409);
        }
      }
      if (String(url).endsWith(':rollback')) rollbacks++;
      return json({});
    });
    const result = store.runTransaction(async tx => { attempts++; tx.create(store.doc('users/new'), { okay: true }); });
    if (mode === 'network') await assert.rejects(result);
    else await result;
    assert.equal(attempts, mode === 'network' ? 1 : 2);
    assert.equal(rollbacks, 1);
  }
});

test('email uses HTTPS provider, rejects quota/provider errors, and never silently succeeds', async () => {
  let okay = true;
  const send = setupEmail(env, async (url, init) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    assert.deepEqual(JSON.parse(String(init?.body)).to, ['recipient@example.test']);
    return okay ? json({ id: 'receipt' }) : json({ message: 'provider details' }, 429);
  });
  assert.equal(await send('recipient@example.test', 'https://example.test/reset'), 'sent');
  okay = false;
  await assert.rejects(send('recipient@example.test', 'https://example.test/reset'), { message: 'admin/email-unavailable' });
});

test('separate identity, fail-closed configuration, HTTP routing/CORS/body limits and safe errors', async () => {
  configuration(env);
  for (const patch of [{ ADMIN_SERVICE_ACCOUNT_EMAIL: `servicepilot-booking@${project}.iam.gserviceaccount.com` },
    { ADMIN_WEB_ORIGIN: 'http://admin.example.test' }, { ADMIN_EMAIL_PROVIDER: 'smtp' }, { RESEND_API_KEY: '' }]) assert.throws(() => configuration({ ...env, ...patch }));
  const request = (path: string, headers: Record<string, string> = {}, body = '{}', method = 'POST') => new Request('https://worker.example.test' + path, {
    method, headers: { Authorization: 'Bearer signed.token.value', 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body } : {}) });
  const noServices = () => { throw new Error('PRIVATE_PROVIDER_DETAILS'); };
  assert.equal((await handleRequest(request('/v1/bookings/schedule'), env, noServices)).status, 404);
  assert.equal((await handleRequest(request('/v1/dispatchers', { Origin: 'https://evil.example.test' }), env, noServices)).status, 403);
  assert.equal((await handleRequest(request('/v1/dispatchers', { Authorization: '' }), env, noServices)).status, 401);
  assert.equal((await handleRequest(request('/v1/dispatchers', {}, 'x'.repeat(4097)), env, noServices)).status, 413);
  assert.equal((await handleRequest(request('/v1/dispatchers', {}, '{bad'), env, noServices)).status, 400);
  const preflight = await handleRequest(request('/v1/dispatchers', { Origin: env.ADMIN_WEB_ORIGIN }, '', 'OPTIONS'), env, noServices);
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), env.ADMIN_WEB_ORIGIN);
  const safe = await handleRequest(request('/v1/dispatchers'), env, noServices);
  assert.equal(safe.status, 503); assert.ok(!(await safe.text()).includes('PRIVATE_PROVIDER_DETAILS'));
});

test('request subrequest budget stops at 45 without following redirects', async () => {
  let calls = 0;
  const transport = requestFetch(async (_url, init) => { calls++; assert.equal(init?.redirect, 'manual'); return json({}); });
  for (let i = 0; i < 45; i++) await transport('https://example.test');
  await assert.rejects(transport('https://example.test')); assert.equal(calls, 45);
  const redirected = requestFetch(async () => new Response(null, { status: 302, headers: { Location: 'https://untrusted.example.test' } }));
  await assert.rejects(redirected('https://example.test'), { code: 'admin/upstream-redirect' });
});
