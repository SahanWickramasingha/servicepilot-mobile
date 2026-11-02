import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateKeyPair, exportPKCS8, exportJWK, SignJWT } from 'jose';

test('actual workerd bundle uses WebCrypto, JWKS, OAuth, Auth REST and Firestore REST without gRPC/SMTP', async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(pair.publicKey), kid: 'runtime-test' };
  const bundle = await build({ entryPoints: ['src/index.ts'], bundle: true, write: false,
    format: 'esm', platform: 'neutral', conditions: ['workerd', 'worker', 'browser'], external: ['node:crypto'] });
  const script = bundle.outputFiles[0].text;
  assert.ok(!script.includes('@grpc/grpc-js')); assert.ok(!script.includes('nodemailer'));
  assert.ok(!script.includes('firebase-admin/lib'));
  const calls: string[] = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-10-30',
    bindings: { FIREBASE_PROJECT_ID: 'servicepilot-756d9', ADMIN_WEB_ORIGIN: 'https://admin.example.test',
      ADMIN_EMAIL_FROM: 'invites@example.test', ADMIN_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'local-test-only',
      ADMIN_SERVICE_ACCOUNT_EMAIL: 'servicepilot-admin@servicepilot-756d9.iam.gserviceaccount.com',
      ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY: await exportPKCS8(pair.privateKey) },
    outboundService: async request => {
      const url = new URL(request.url); calls.push(url.hostname);
      let body: unknown;
      if (url.hostname === 'www.googleapis.com') body = { keys: [jwk] };
      else if (url.hostname === 'oauth2.googleapis.com') body = { access_token: 'local-server-token', expires_in: 3600 };
      else if (url.hostname === 'identitytoolkit.googleapis.com') body = { users: [{ localId: 'admin', validSince: '1' }] };
      else if (url.hostname === 'firestore.googleapis.com') body = [{ found: {
        name: 'projects/servicepilot-756d9/databases/(default)/documents/users/admin',
        fields: { role: { stringValue: 'super_admin' }, accountStatus: { stringValue: 'active' } } } }];
      else throw new Error('Unexpected external request: ' + url.hostname);
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    } }));
  try {
    assert.equal((await mf.dispatchFetch('https://worker.example.test/healthz')).status, 200);
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ auth_time: now }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setIssuer('https://securetoken.google.com/servicepilot-756d9').setAudience('servicepilot-756d9')
      .setSubject('admin').setIssuedAt(now).setExpirationTime(now + 600).sign(pair.privateKey);
    const response = await mf.dispatchFetch('https://worker.example.test/v1/dispatchers', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 400, 'mock outbound hosts: ' + JSON.stringify(calls));
    assert.equal((await response.json() as { code: string }).code, 'invalid-argument');
    assert.ok(calls.includes('www.googleapis.com'));
    assert.ok(calls.includes('oauth2.googleapis.com'));
    assert.ok(calls.includes('identitytoolkit.googleapis.com'));
    assert.ok(calls.includes('firestore.googleapis.com'));
    assert.ok(!calls.includes('api.resend.com'));
  } finally { await mf.dispose(); }
});
