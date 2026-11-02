import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { evaluatePreviewConfig } from '../lib/preview-config-check.mjs';

const profile = JSON.parse(readFileSync('eas.json', 'utf8')).build.preview;
const env = { EXPO_PUBLIC_BOOKING_API_URL: 'https://booking.release-fixture.dev',
  EXPO_PUBLIC_PHOTO_API_URL: 'https://photos.release-fixture.dev', GOOGLE_MAPS_ANDROID_API_KEY: 'test-only-not-a-real-key' };
const exp = { owner: profile.env.EXPO_OWNER, extra: { eas: { projectId: profile.env.EXPO_EAS_PROJECT_ID } },
  android: { package: profile.env.EXPO_ANDROID_PACKAGE, config: { googleMaps: { apiKey: env.GOOGLE_MAPS_ANDROID_API_KEY } } } };
const success = () => ({ status: 0, stdout: JSON.stringify(exp) });

test('preview check uses actual CLI, profile env and EAS dotenv exclusion without mutating the caller', () => {
  let calls = 0;
  const result = evaluatePreviewConfig({ env, run: (binary, args, options) => {
    calls++;
    assert.equal(binary, process.execPath);
    assert.deepEqual(args.slice(1), ['config', '--json']);
    assert.equal(options.env.EXPO_NO_DOTENV, '1');
    assert.equal(options.env.SERVICEPILOT_RELEASE, '1');
    assert.equal(options.env.EXPO_OWNER, profile.env.EXPO_OWNER);
    assert.equal(options.env.EXPO_EAS_PROJECT_ID, profile.env.EXPO_EAS_PROJECT_ID);
    return success();
  } });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(env.EXPO_NO_DOTENV, undefined);
});

test('CLI failure can never become PASS even when release prerequisites are present', () => {
  const calls = [];
  const result = evaluatePreviewConfig({ env, run: (_binary, args) => {
    calls.push(args.slice(1));
    return { status: 1, stdout: '', stderr: `Cannot find module ${env.GOOGLE_MAPS_ANDROID_API_KEY}` };
  } });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, [['config', '--json'], ['config']]);
  assert.ok(result.diagnostics.includes('FAIL EXPO_CONFIG_MODULE_RESOLUTION'));
  assert.ok(!JSON.stringify(result).includes(env.GOOGLE_MAPS_ANDROID_API_KEY));
});

test('missing process Maps key is rejected, rather than rescued by .env.local or a successful mocked CLI', () => {
  const { GOOGLE_MAPS_ANDROID_API_KEY: _key, ...missing } = env;
  const result = evaluatePreviewConfig({ env: missing, run: success });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(line => line.includes('GOOGLE_MAPS_ANDROID_API_KEY')));
});

test('invalid JSON, wrong resolved values and timed out subprocesses fail without exposing captured output', () => {
  for (const response of [{ status: 0, stdout: env.GOOGLE_MAPS_ANDROID_API_KEY },
    { status: 0, stdout: JSON.stringify({ ...exp, android: {} }) },
    { status: null, error: { code: 'ETIMEDOUT' }, stderr: env.GOOGLE_MAPS_ANDROID_API_KEY }]) {
    const result = evaluatePreviewConfig({ env, run: () => response });
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(env.GOOGLE_MAPS_ANDROID_API_KEY));
  }
});
