import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { configuration } from '../src/auth';
import { readFileSync } from 'node:fs';

test('zero-budget Worker config contains no custom CPU/paid usage settings', () => {
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  assert.equal(config.limits, undefined);
  assert.equal(config.usage_model, undefined);
  assert.equal(config.workers_dev, true);
  assert.equal(config.observability.enabled, false);
});

test('workerd verifies RSA signatures, audience, expiry, current Auth state; HTTP and readiness boundaries', async () => {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'synthetic-firebase', use: 'sig', alg: 'RS256' };
  const bundle = await build({ entryPoints: ['src/index.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true });
  assert.ok(!Object.keys(bundle.metafile!.inputs).some(path => /firebase-admin|google-gax|grpc-js|photo-worker/.test(path)));
  let disabled = false, missing = false, validSince = 0, oauth = 0, lookups = 0, firestore = 0;
  const committed: any[] = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-30',
    bindings: { FIREBASE_PROJECT_ID: 'servicepilot-756d9', BOOKING_SERVICE_ACCOUNT_EMAIL: 'servicepilot-booking-worker@servicepilot-756d9.iam.gserviceaccount.com', BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY: await exportPKCS8(keys.privateKey) },
    outboundService: async (request: Request) => {
      const url = new URL(request.url);
      if (url.hostname === 'www.googleapis.com') return Response.json({ keys: [jwk] });
      if (url.hostname === 'oauth2.googleapis.com') { oauth++; return Response.json({ access_token: 'synthetic-oauth', expires_in: 3600 }); }
      if (url.hostname === 'identitytoolkit.googleapis.com') { lookups++; const body = await request.json() as any;
        return Response.json({ users: missing || body.localId[0].startsWith('__servicepilot') ? [] : [{ localId: 'synthetic-tech', disabled, validSince: String(validSince) }] }); }
      if (url.hostname === 'firestore.googleapis.com') { firestore++;
        if (url.pathname.endsWith(':beginTransaction')) return Response.json({ transaction: 'synthetic-transaction' });
        if (url.pathname.endsWith(':batchGet')) { const body = await request.json() as any;
          const documents: Record<string, any> = {
            'service_requests/fixture': { customerId: { stringValue: 'synthetic-customer' }, technicianId: { stringValue: 'synthetic-tech' }, status: { stringValue: 'requested' }, preferredDate: { stringValue: '2099-10-10' }, preferredTime: { stringValue: '10:00 AM' }, durationMinutes: { integerValue: '60' } },
            'users/synthetic-tech': { role: { stringValue: 'technician' }, emailVerified: { booleanValue: true }, technicianApprovalStatus: { stringValue: 'approved' }, availability: { stringValue: 'available' } },
            'users/synthetic-customer': { role: { stringValue: 'customer' }, emailVerified: { booleanValue: true } },
            'technician_map_profiles/synthetic-tech': { approved: { booleanValue: true }, availability: { stringValue: 'available' } },
          };
          return Response.json(body.documents.map((name: string) => {
            const fields = documents[name.split('/documents/')[1]];
            return fields ? { found: { name, fields } } : { missing: name };
          })); }
        if (url.pathname.endsWith(':runQuery')) { const body = await request.json() as any; assert.equal(body.transaction, 'synthetic-transaction'); assert.equal(body.structuredQuery.limit, 501); return Response.json([]); }
        if (url.pathname.endsWith(':commit')) { committed.push(await request.json()); return Response.json({}); }
        if (url.pathname.endsWith(':rollback')) return Response.json({});
      }
      throw Error('Unexpected outbound request');
    } }));
  const mint = (overrides: Record<string, unknown> = {}, signing = keys.privateKey) => new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 60, email_verified: true, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-firebase' }).setSubject('synthetic-tech')
    .setIssuer('https://securetoken.google.com/servicepilot-756d9').setAudience((overrides.aud ?? 'servicepilot-756d9') as string | string[])
    .setIssuedAt().setExpirationTime((overrides.exp as number) ?? '1h').sign(signing);
  const post = (token?: string, body = '{}', headers: Record<string, string> = {}) => runtime.dispatchFetch('https://local.test/v1/bookings/schedule', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body });
  try {
    assert.equal((await runtime.dispatchFetch('https://local.test/healthz')).status, 200);
    assert.equal((await runtime.dispatchFetch('https://local.test/v1/dispatchers', { method: 'POST' })).status, 404);
    assert.equal((await post()).status, 401);
    assert.equal((await post(undefined, '{}', { Origin: 'https://untrusted.test' })).status, 403);
    assert.equal((await post(undefined, 'bad')).status, 400);
    assert.equal((await post(undefined, JSON.stringify({ large: 'x'.repeat(4100) }))).status, 413);
    assert.equal((await post(await mint({ aud: 'wrong-project' }))).status, 401);
    assert.equal((await post(await mint({ aud: ['servicepilot-756d9', 'other-project'] }))).status, 401);
    assert.equal((await post(await mint({ exp: Math.floor(Date.now() / 1000) - 1 }))).status, 401);
    const other = await generateKeyPair('RS256'); assert.equal((await post(await mint({}, other.privateKey))).status, 401);
    const token = await mint();
    disabled = true; assert.equal((await post(token)).status, 401); disabled = false;
    validSince = Math.floor(Date.now() / 1000); assert.equal((await post(token)).status, 401); validSince = 0;
    missing = true; assert.equal((await post(token)).status, 401); missing = false;
    assert.equal((await post(await mint({ email_verified: false }))).status, 403);
    assert.equal((await post(token)).status, 400);
    const response = await post(token, JSON.stringify({ action: 'accept', requestId: 'missing' }), { 'X-Booking-Correlation-ID': 'booking-synthetic-correlation' });
    assert.equal(response.status, 404); assert.equal(response.headers.get('X-Booking-Correlation-ID'), 'booking-synthetic-correlation');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const accepted = await post(token, JSON.stringify({ action: 'accept', requestId: 'fixture' }));
    assert.equal(accepted.status, 200); assert.deepEqual(await accepted.json(), { requestId: 'fixture' });
    assert.equal(committed.length, 1); assert.equal(committed[0].transaction, 'synthetic-transaction');
    assert.equal(committed[0].writes.length, 3);
    assert.ok(committed[0].writes.some((write: any) => write.update.name.endsWith('/booking_schedule_locks/synthetic-tech')));
    assert.ok(committed[0].writes.some((write: any) => write.update.name.endsWith('/notifications/fixture_technician_accepted_request')));
    assert.equal((await runtime.dispatchFetch('https://local.test/readyz')).status, 200);
    const reads = lookups + firestore;
    assert.equal((await runtime.dispatchFetch('https://local.test/readyz')).status, 200); assert.equal(lookups + firestore, reads); assert.equal(oauth, 1);
  } finally { await runtime.dispose(); }
  const unconfigured = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-30', outboundService: () => { throw Error('Unexpected network'); } }));
  try { assert.equal((await unconfigured.dispatchFetch('https://local.test/readyz')).status, 503); }
  finally { await unconfigured.dispose(); }
});

test('booking configuration rejects a foreign project or photo principal', () => {
  for (const env of [
    { FIREBASE_PROJECT_ID: 'other-project' },
    { FIREBASE_PROJECT_ID: 'servicepilot-756d9', BOOKING_SERVICE_ACCOUNT_EMAIL: 'servicepilot-photos@servicepilot-756d9.iam.gserviceaccount.com' },
  ]) assert.throws(() => configuration(env as any), (error: any) => error.code === 'booking/configuration');
});

test('installed workerd exposes HTTP/2 connect as a nonfunctional stub even with Node compatibility', async () => {
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'],
    script: `import { connect } from 'node:http2'; export default { fetch() { try { connect('https://not-used.test'); return new Response('unexpected-success', {status: 500}); } catch(error) { return Response.json({message: error.message}); } } }`,
    outboundService: () => { throw Error('No external network permitted'); } }));
  try { const response = await runtime.dispatchFetch('http://local.test/'); assert.equal(response.status, 200); assert.match((await response.json() as any).message, /not implemented|unimplemented|unenv/i); }
  finally { await runtime.dispose(); }
});
