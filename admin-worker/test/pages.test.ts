import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('Pages release guard rejects missing, insecure or credential-bearing URL and unapproved VITE names', () => {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')));
  const script = fileURLToPath(new URL('../../admin-web/scripts/check-pages-env.mjs', import.meta.url).href);
  const run = (extra: Record<string, string | undefined>) => spawnSync(process.execPath, [script], { env: { ...inherited, NODE_ENV: process.env.NODE_ENV, ...extra }, encoding: 'utf8' });
  const publicConfig = { VITE_DISPATCHER_API_URL: 'https://admin-worker.example.test', VITE_USE_FIREBASE_EMULATORS: '0' };
  assert.equal(run(publicConfig).status, 0);
  for (const patch of [{ VITE_DISPATCHER_API_URL: '' }, { VITE_DISPATCHER_API_URL: 'http://localhost:8793' },
    { VITE_DISPATCHER_API_URL: 'https://user:private@example.test' }, { VITE_USE_FIREBASE_EMULATORS: '1' },
    { VITE_SERVICE_ACCOUNT_PRIVATE_KEY: 'must-never-enter-the-browser' }]) {
    const result = run({ ...publicConfig, ...patch });
    assert.equal(result.status, 1); assert.ok(!result.stderr.includes('must-never-enter-the-browser'));
  }
});

test('separate Worker config defaults contain no credentials, paid limits or booking/photo bindings', () => {
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  assert.equal(config.name, 'servicepilot-admin'); assert.equal(config.limits, undefined);
  assert.equal(config.ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY, undefined);
  assert.deepEqual(Object.keys(config.vars).sort(), ['ADMIN_EMAIL_FROM', 'ADMIN_EMAIL_PROVIDER', 'ADMIN_WEB_ORIGIN', 'FIREBASE_PROJECT_ID', 'TECHNICIAN_EMAIL_PROVIDER']);
  assert.equal(config.vars.TECHNICIAN_EMAIL_PROVIDER, 'gmail');
  assert.equal(config.vars.ADMIN_EMAIL_PROVIDER, 'firebase');
  assert.equal(config.services, undefined); assert.equal(config.r2_buckets, undefined);
  assert.equal(config.observability.enabled, false);
});
