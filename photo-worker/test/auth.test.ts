import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, createRemoteJWKSet, customFetch, exportJWK, generateKeyPair, SignJWT } from "jose";
import { authenticate, FIREBASE_JWKS, verifyFirebaseToken } from "../src/auth";
const project = "demo-servicepilot";
const pair = await generateKeyPair("RS256", { extractable: true });
const jwk = { ...await exportJWK(pair.publicKey), kid: "first", alg: "RS256", use: "sig" };
const keySet = createLocalJWKSet({ keys: [jwk] });
const token = (options: any = {}) => new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 10, email_verified: true, ...options.payload })
  .setProtectedHeader({ alg: "RS256", kid: options.kid ?? "first" }).setSubject(options.sub ?? "customer")
  .setIssuer(options.issuer ?? `https://securetoken.google.com/${project}`).setAudience(options.audience ?? project)
  .setIssuedAt().setExpirationTime(options.expires ?? "5m").sign(options.privateKey ?? pair.privateKey);
test("Firebase RS256 signature, issuer, audience, expiry, subject and auth time are mandatory", async () => {
  assert.equal((await verifyFirebaseToken(await token(), project, keySet)).uid, "customer");
  for (const options of [{ issuer: "https://evil.test" }, { audience: "another-project" }, { expires: Math.floor(Date.now() / 1000) - 1 }, { sub: "" }, { payload: { auth_time: Date.now() } }]) {
    await assert.rejects(verifyFirebaseToken(await token(options), project, keySet));
  }
  await assert.rejects(verifyFirebaseToken("eyJhbGciOiJub25lIn0.e30.", project, keySet));
  const forged = await new SignJWT({ sub: "customer" }).setProtectedHeader({ alg: "HS256" }).sign(new Uint8Array(32));
  await assert.rejects(verifyFirebaseToken(forged, project, keySet));
});
test("remote signing keys cache and refresh for a rotated key without accepting an unknown signature", async () => {
  const second = await generateKeyPair("RS256", { extractable: true });
  let active = jwk, reads = 0;
  const remote = createRemoteJWKSet(new URL("https://keys.example.test/jwks"), { cooldownDuration: 0, cacheMaxAge: 3600000,
    [customFetch]: async () => { reads++; return new Response(JSON.stringify({ keys: [active] }), { headers: { "Content-Type": "application/json" } }); } });
  await verifyFirebaseToken(await token(), project, remote); await verifyFirebaseToken(await token(), project, remote); assert.equal(reads, 1);
  active = { ...await exportJWK(second.publicKey), kid: "second", alg: "RS256", use: "sig" };
  await verifyFirebaseToken(await token({ kid: "second", privateKey: second.privateKey }), project, remote); assert.equal(reads, 2);
  await assert.rejects(verifyFirebaseToken(await token({ kid: "second" }), project, remote));
});
test("unavailable signing keys fail closed as a provider outage, not a fabricated invalid-token result", async () => {
  await assert.rejects(verifyFirebaseToken(await token(), project, async () => { throw new TypeError("Network unavailable"); }), (e: any) => e.status === 503);
});
test("current Auth account lookup rejects disabled, deleted and revoked users; JWT verification alone is insufficient", async (t) => {
  let user: any = { localId: "customer", validSince: "1", emailVerified: true }, lookupStatus = 200;
  t.mock.method(globalThis, "fetch", async (url: any) => {
    if (String(url) === FIREBASE_JWKS) return new Response(JSON.stringify({ keys: [jwk] }));
    assert.match(String(url), /^https:\/\/identitytoolkit.googleapis.com/);
    return new Response(JSON.stringify({ users: user ? [user] : [] }), { status: lookupStatus });
  });
  const request = new Request("https://worker.test/v1/photos", { headers: { Authorization: `Bearer ${await token()}` } });
  const env = { FIREBASE_PROJECT_ID: project, FIREBASE_WEB_API_KEY: "emulator-only" } as any;
  assert.equal((await authenticate(request, env)).uid, "customer");
  for (const next of [{ ...user, disabled: true }, { ...user, validSince: String(Date.now()) }, { ...user, localId: "other" }, null]) {
    user = next; await assert.rejects(authenticate(request, env));
  }
  lookupStatus = 503; await assert.rejects(authenticate(request, env));
});
