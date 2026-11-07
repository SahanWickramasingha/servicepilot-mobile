import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('Gmail adapter executes in workerd with mocked OAuth/send and native UTF-8/base64 primitives', async () => {
  const { outputFiles } = await build({ stdin: { contents: `
    import { decisionEmail } from './src/email';
    import { decisionEmailMessage } from '../functions/src/domain/technicianDecisionEmail';
    export default { async fetch(request, env) {
      const message = decisionEmailMessage(env.ADMIN_EMAIL_FROM, 'fixture@example.test', 'සිංහල தமிழ் 😀', 'rejected', 'Evidence required');
      return Response.json(await decisionEmail(env, fetch)(message, 'technician-decision/runtime-fixture'));
    } };
  `, resolveDir: process.cwd(), sourcefile: 'gmail-runtime-fixture.ts' },
  bundle: true, write: false, format: 'esm', platform: 'neutral', conditions: ['workerd', 'worker', 'browser'], external: ['node:crypto'] });
  const hosts: string[] = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: outputFiles[0].text,
    compatibilityDate: '2026-10-30', bindings: { TECHNICIAN_EMAIL_PROVIDER: 'gmail', ADMIN_EMAIL_FROM: 'sender@gmail.com',
      GMAIL_CLIENT_ID: 'fixture-client', GMAIL_CLIENT_SECRET: 'fixture-secret', GMAIL_REFRESH_TOKEN: 'fixture-refresh' },
    outboundService: async request => {
      const url = new URL(request.url); hosts.push(url.hostname);
      if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'fixture-access', token_type: 'Bearer' });
      assert.equal(url.hostname, 'gmail.googleapis.com');
      assert.equal(request.headers.get('Authorization'), 'Bearer fixture-access');
      const { raw } = await request.json() as { raw: string };
      const mime = Buffer.from(raw, 'base64url').toString('utf8');
      assert.ok(mime.includes('Content-Type: multipart/alternative;'));
      assert.ok(!mime.includes('fixture-secret')); assert.ok(!mime.includes('fixture-refresh'));
      return Response.json({ id: 'mock-gmail-id' });
    } }));
  try {
    const response = await mf.dispatchFetch('https://worker.example.test/fixture');
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { id: 'mock-gmail-id' });
    assert.deepEqual(hosts, ['oauth2.googleapis.com', 'gmail.googleapis.com']);
  } finally { await mf.dispose(); }
});
