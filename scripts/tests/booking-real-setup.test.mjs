import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { inspectBookingLocal, validateBookingCredential, validateBookingHttps } from '../lib/booking-real-config.mjs';

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const email = 'booking-runtime@servicepilot-756d9.iam.gserviceaccount.com';
const photoEmail = 'photo-runtime@servicepilot-756d9.iam.gserviceaccount.com';
const credential = { type: 'service_account', project_id: 'servicepilot-756d9', client_email: email, private_key: privateKey };

function removeFixture(root) {
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep + 'booking-')) throw Error('Fixture cleanup path is outside the test prefix.');
  rmSync(root, { recursive: true, force: true });
}

test('dedicated real credential rejects the photo principal, wrong identity/project, user ADC and invalid keys without exposing contents', () => {
  assert.equal(validateBookingCredential(credential, email, [photoEmail]), true);
  assert.throws(() => validateBookingCredential(credential, email, [email]), /photo Worker/);
  const documentedPhoto = 'servicepilot-photo-worker@servicepilot-756d9.iam.gserviceaccount.com';
  assert.throws(() => validateBookingCredential({ ...credential, client_email: documentedPhoto }, documentedPhoto), /photo Worker/);
  for (const patch of [{ project_id: 'demo-project' }, { client_email: photoEmail }, { type: 'authorized_user' }]) {
    assert.throws(() => validateBookingCredential({ ...credential, ...patch }, email, [photoEmail]), /service-account JSON/);
  }
  assert.throws(() => validateBookingCredential({ ...credential, private_key: 'DO-NOT-LOG-THIS-KEY' }, email), error =>
    /invalid RSA/.test(error.message) && !error.message.includes('DO-NOT-LOG'));
  assert.throws(() => validateBookingCredential(credential, undefined), /SERVICEPILOT_BOOKING_SERVICE_ACCOUNT/);
});

test('offline preflight never selects generic ADC/photo files and reports only safe facts', t => {
  const root = mkdtempSync(join(tmpdir(), 'booking-config-'));
  t.after(() => removeFixture(root));
  mkdirSync(join(root, 'photo-worker'));
  writeFileSync(join(root, 'photo-worker/.dev.vars'), `FIREBASE_SERVICE_ACCOUNT_EMAIL="${photoEmail}"\nFIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY="DO-NOT-LOG-PHOTO-KEY"`);
  writeFileSync(join(root, '.env.local'), 'EXPO_PUBLIC_PHOTO_API_URL=https://photo-value.example.test\n');
  writeFileSync(join(root, 'booking.json'), JSON.stringify(credential));
  const env = { SERVICEPILOT_BOOKING_CREDENTIALS: 'booking.json', SERVICEPILOT_BOOKING_SERVICE_ACCOUNT: email };
  const report = inspectBookingLocal(root, env);
  assert.equal(report.issues.length, 0);
  // An unknown photo identity is informational; explicit selection and independent
  // runtime permission checks allow an existing project credential to be reused.
  rmSync(join(root, 'photo-worker/.dev.vars'));
  assert.equal(inspectBookingLocal(root, env).issues.length, 0);
  assert.ok(inspectBookingLocal(root, { ...env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8187' }).issues.some(issue => /Remove FIRESTORE_EMULATOR_HOST/.test(issue)));
  assert.ok(!JSON.stringify(report).includes('PRIVATE KEY'));
  assert.ok(!JSON.stringify(report).includes('photo-value'));
  assert.ok(!JSON.stringify(report).includes('DO-NOT-LOG'));
  assert.ok(inspectBookingLocal(root, { GOOGLE_APPLICATION_CREDENTIALS: join(root, 'booking.json') }).issues.some(issue => /CREDENTIALS is missing/.test(issue)));
  writeFileSync(join(root, 'photo-worker/booking.json'), JSON.stringify(credential));
  assert.ok(inspectBookingLocal(root, { ...env, SERVICEPILOT_BOOKING_CREDENTIALS: 'photo-worker/booking.json' }).issues.some(issue => /Worker credential files/.test(issue)));
  writeFileSync(join(root, 'booking.json'), '{"private_key":"DO-NOT-LOG-BROKEN-JSON');
  const invalid = inspectBookingLocal(root, env);
  assert.ok(invalid.issues.some(issue => /invalid JSON/.test(issue)));
  assert.ok(!JSON.stringify(invalid).includes('DO-NOT-LOG'));
});

test('real endpoint configuration keeps HTTPS and rejects credentials, fragments and demo HTTP', () => {
  assert.equal(validateBookingHttps('https://booking.example.test'), 'https://booking.example.test');
  for (const value of [undefined, 'http://127.0.0.1:8790', 'http://10.0.2.2:8790', 'https://u:p@booking.example.test',
    'https://booking.example.test?key=hidden', 'https://booking.example.test#token', 'https://booking.example.test/v1/bookings/schedule']) {
    assert.throws(() => validateBookingHttps(value));
  }
});

async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

async function startStandalone(t, services, additional = {}) {
  const root = mkdtempSync(join(tmpdir(), 'booking-server-'));
  const file = join(root, 'credential.json');
  // Synthetic key and nonexistent project only; no real Firebase credential is read.
  writeFileSync(file, JSON.stringify({ ...credential, project_id: 'local-config-only', client_email: 'test@local-config-only.iam.gserviceaccount.com' }));
  const port = await freePort();
  const env = { ...process.env, DISPATCHER_MODE: 'production', GOOGLE_CLOUD_PROJECT: 'local-config-only',
    GOOGLE_APPLICATION_CREDENTIALS: file, DISPATCHER_BIND_ADDRESS: '127.0.0.1', PORT: String(port), ...additional };
  for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST',
    'DISPATCHER_ADMIN_ORIGIN', 'BOOKING_WEB_ORIGIN', 'DISPATCHER_SMTP_HOST', 'DISPATCHER_SMTP_USER', 'DISPATCHER_SMTP_PASSWORD',
    'DISPATCHER_SMTP_FROM', 'DISPATCHER_SMTP_PORT', 'DISPATCHER_SERVICES']) delete env[key];
  if (services !== undefined) env.DISPATCHER_SERVICES = services;
  Object.assign(env, additional);
  const child = spawn(process.execPath, [resolve('functions/lib/dispatcher-main.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
    removeFixture(root);
  });
  return { child, port, output: () => ({ stdout, stderr }) };
}

test('actual production-mode entry starts booking-only without SMTP and refuses every admin route before any provider access', async t => {
  const { child, port, output } = await startStandalone(t, 'booking');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('Standalone startup timed out')); }, 15000);
    child.stdout.on('data', () => { if (output().stdout.includes('server ready')) { clearTimeout(timer); resolve(); } });
    child.once('exit', () => { clearTimeout(timer); reject(Error('Standalone exited before ready')); });
  });
  for (const [path, expected] of [['/v1/bookings/schedule', 401], ['/v1/dispatchers', 404],
    ['/v1/dispatchers/resend-invitation', 404], ['/v1/accounts/lifecycle', 404]]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, expected);
  }
  const browser = await fetch(`http://127.0.0.1:${port}/v1/bookings/schedule`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example.test' }, body: '{}' });
  assert.equal(browser.status, 403);
  const correlationId = 'booking-safe-regression-1234';
  const correlated = await fetch(`http://127.0.0.1:${port}/v1/bookings/schedule`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Booking-Correlation-ID': correlationId },
    body: JSON.stringify({ requestId: 'private-request-do-not-log' }) });
  assert.equal(correlated.status, 401);
  assert.equal(correlated.headers.get('x-booking-correlation-id'), correlationId);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(output().stdout, /booking-safe-regression-1234/);
  assert.ok(!output().stdout.includes('private-request-do-not-log'));
  assert.ok(!output().stdout.includes('Authorization'));
  assert.ok(!output().stderr.includes('PRIVATE KEY'));
});

test('default combined service still requires SMTP; invalid service selection fails closed', async t => {
  const combined = await startStandalone(t, undefined, { DISPATCHER_ADMIN_ORIGIN: 'https://admin.example.test' });
  await once(combined.child, 'exit');
  assert.equal(combined.child.exitCode, 1);
  assert.match(combined.output().stderr, /Configure the dispatcher SMTP/);
  const invalid = await startStandalone(t, 'unknown');
  await once(invalid.child, 'exit');
  assert.equal(invalid.child.exitCode, 1);
  assert.match(invalid.output().stderr, /DISPATCHER_SERVICES must be/);
});
