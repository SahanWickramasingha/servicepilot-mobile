import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
import release from '../lib/release-config.cjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { createDispatcherServer } = require('./lib/dispatcher-server.js');
const { createBookingReadiness } = loadService('functions/src/services/booking-readiness.ts', { 'node:timers': require('node:timers') });
const valid = { EXPO_PUBLIC_BOOKING_API_URL: 'https://booking.release-fixture.dev', EXPO_PUBLIC_PHOTO_API_URL: 'https://photos.release-fixture.dev',
  EXPO_PUBLIC_USE_FIREBASE_EMULATORS: '0', EXPO_ANDROID_PACKAGE: 'lk.servicepilot.releasecheck',
  EXPO_EAS_PROJECT_ID: '12345678-1234-4123-8123-123456789abc', EXPO_OWNER: 'release-fixture', GOOGLE_MAPS_ANDROID_API_KEY: 'synthetic-test-key' };

test('release rejects local/demo/temporary origins, missing identity/maps and server secrets without exposing values', () => {
  assert.deepEqual(release.releaseProblems(valid), []);
  assert.deepEqual(release.releaseProblems({ ...valid, EXPO_PUBLIC_BOOKING_API_URL: 'https://servicepilot-booking.release-fixture.workers.dev' }), []);
  for (const name of ['BOOKING_SERVICE_ACCOUNT_EMAIL', 'BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY']) {
    assert.ok(release.releaseProblems({ ...valid, [name]: 'SYNTHETIC-DO-NOT-BUNDLE' }).some(issue => issue.includes(name)));
  }
  for (const url of ['http://localhost:8790', 'https://localhost', 'https://127.0.0.1', 'https://10.0.2.2',
    'https://[::1]', 'https://kate.trycloudflare.com', 'https://KATE.TRYCLOUDFLARE.COM.',
    'https://demo.example.com', 'https://booking.example.com', 'https://test.ngrok-free.app', 'https://user:password@api.release-fixture.dev',
    'https://api.release-fixture.dev/v1/bookings/schedule', 'https://api.release-fixture.dev?token=hidden']) {
    for (const name of ['EXPO_PUBLIC_BOOKING_API_URL', 'EXPO_PUBLIC_PHOTO_API_URL']) assert.ok(release.releaseProblems({ ...valid, [name]: url }).length);
  }
  for (const name of ['EXPO_ANDROID_PACKAGE', 'EXPO_EAS_PROJECT_ID', 'EXPO_OWNER', 'GOOGLE_MAPS_ANDROID_API_KEY']) assert.ok(release.releaseProblems({ ...valid, [name]: '' }).length);
  assert.ok(release.releaseProblems({ ...valid, EXPO_PUBLIC_USE_FIREBASE_EMULATORS: '1' }).length);
  assert.ok(release.releaseProblems({ ...valid, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8187' }).length);
  const issues = release.releaseProblems({ ...valid, EXPO_PUBLIC_PRIVATE_KEY: 'DO-NOT-PRINT-PRIVATE', GOOGLE_APPLICATION_CREDENTIALS: 'DO-NOT-PRINT-PATH' });
  assert.equal(issues.length, 2); assert.ok(!issues.join().includes('DO-NOT-PRINT'));
});

test('readiness is cached and single-flight, fails closed and recovers after the cache expires', async () => {
  let time = 0, calls = 0, finish;
  const check = createBookingReadiness(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, { now: () => time });
  const first = check(), second = check();
  await new Promise(setImmediate); assert.equal(calls, 1); finish();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(await check(), true); assert.equal(calls, 1);
  let healthy = false;
  const changing = createBookingReadiness(async () => { if (!healthy) throw Error('private provider details'); }, { now: () => time });
  assert.equal(await changing(), false); healthy = true;
  assert.equal(await changing(), false); time = 60001; assert.equal(await changing(), true);
});

test('actual Expo config enforces production guards while retaining normal local development', t => {
  const previous = { ...process.env };
  t.after(() => {
    for (const name of Object.keys(process.env)) if (!(name in previous)) delete process.env[name];
    Object.assign(process.env, previous);
  });
  for (const name of ['GOOGLE_APPLICATION_CREDENTIALS', 'SERVICEPILOT_BOOKING_CREDENTIALS', 'FIREBASE_AUTH_EMULATOR_HOST',
    'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST', 'EXPO_PUBLIC_FIREBASE_EMULATOR_HOST']) delete process.env[name];
  Object.assign(process.env, valid, { NODE_ENV: 'production' });
  const configuration = loadService('app.config.ts', { './scripts/lib/release-config.cjs': release }).default;
  const configured = configuration({ config: { name: 'ServicePilot', slug: 'servicepilot-mobile', android: {}, extra: {} } });
  assert.equal(configured.android.package, valid.EXPO_ANDROID_PACKAGE);
  assert.equal(configured.extra.eas.projectId, valid.EXPO_EAS_PROJECT_ID);
  process.env.EXPO_PUBLIC_BOOKING_API_URL = 'https://temporary.trycloudflare.com';
  assert.throws(() => configuration({ config: {} }), /Release configuration rejected/);
  process.env.EXPO_PUBLIC_BOOKING_API_URL = valid.EXPO_PUBLIC_BOOKING_API_URL;
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1';
  assert.throws(() => configuration({ config: {} }), /must explicitly be 0/);
  process.env.NODE_ENV = 'development'; delete process.env.EAS_BUILD; delete process.env.EAS_BUILD_PROFILE; delete process.env.SERVICEPILOT_RELEASE;
  assert.doesNotThrow(() => configuration({ config: {} }));
});

test('readiness timeouts do not spawn overlapping provider operations', async () => {
  let time = 0, calls = 0, finish;
  const check = createBookingReadiness(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, { now: () => time, timeoutMs: 15 });
  assert.equal(await check(), false); time = 60001;
  assert.equal(await check(), false); assert.equal(calls, 1);
  finish(); await new Promise(setImmediate);
  assert.equal(await check(), true);
});

test('host exposes safe health/readiness while scheduling remains authenticated and admin routes remain absent', async t => {
  let ready = false;
  const server = createDispatcherServer(null, undefined, undefined, { change: async () => { throw Error('must not bypass scheduling'); } }, undefined, async () => ready);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(base + '/healthz')).json(), { status: 'ok' });
  const failing = await fetch(base + '/readyz'); assert.equal(failing.status, 503);
  assert.deepEqual(await failing.json(), { status: 'unavailable' });
  ready = true; assert.equal((await fetch(base + '/readyz')).status, 200);
  assert.equal((await fetch(base + '/v1/dispatchers', { method: 'POST' })).status, 404);
  assert.equal((await fetch(base + '/v1/bookings/schedule')).status, 404);
});
