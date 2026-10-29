import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

test("workerd streams bounded bytes into a real local R2 binding with FixedLengthStream", async () => {
  const bytes = new Uint8Array([255, 216, 255, 0]);
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import { boundedPut } from './src/stream.ts';
    export default { async fetch(request, env) {
      const id = new URL(request.url).pathname === '/valid' ? 'a'.repeat(64) : new URL(request.url).pathname === '/separated' ? 'c'.repeat(64) : 'b'.repeat(64);
      if (new URL(request.url).pathname !== '/valid') {
        const headers = new Headers(request.headers); headers.delete('Content-Length');
        request = new Request(request, { headers });
      }
      const meta = { id, purpose: 'request', ...(new URL(request.url).pathname === '/separated' ? { objectKeyVersion: 2 } : {}), size: 4, contentType: 'image/jpeg', sha256: '${bytesToHex(sha256(bytes))}' };
      try { await boundedPut(request, env.PHOTOS, meta); return new Response('saved'); }
      catch (error) { return new Response('rejected', {status: error.status || 503}); }
    } };
  ` }, bundle: true, format: "esm", platform: "browser", target: "es2022", write: false });
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2026-10-29", r2Buckets: ["PHOTOS"],
    // No real Firebase, R2, or network uploads are permitted in this test.
    outboundService: () => new Response("network-disabled", { status: 503 }) }));
  try {
    const response = await runtime.dispatchFetch("http://local.test/valid", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: bytes });
    assert.equal(response.status, 200);
    const bindings = await runtime.getBindings();
    const saved = await bindings.PHOTOS.get(`photos/v1/${"a".repeat(64)}`);
    assert.deepEqual(new Uint8Array(await saved.arrayBuffer()), bytes);
    assert.equal((await runtime.dispatchFetch("http://local.test/separated", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: bytes })).status, 200);
    const separated = await bindings.PHOTOS.get(`photos/v1/customer-requests/${"c".repeat(64)}`);
    assert.deepEqual(new Uint8Array(await separated.arrayBuffer()), bytes);
    assert.equal((await runtime.dispatchFetch("http://local.test/oversized", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array(100) })).status, 413);
    assert.equal(await bindings.PHOTOS.head(`photos/v1/${"b".repeat(64)}`), null);
    assert.equal((await runtime.dispatchFetch("http://local.test/bad-hash", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array([255, 216, 255, 1]) })).status, 400);
    assert.equal(await bindings.PHOTOS.head(`photos/v1/${"b".repeat(64)}`), null, "Invalid bytes must not commit before upstream EOF/hash verification");
  } finally { await runtime.dispose(); }
});
