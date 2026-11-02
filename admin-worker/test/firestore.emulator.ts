import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { firestoreStore, serverTime } from '../src/firestore';
import { firebaseAuth } from '../src/auth';
import { firebaseSetupEmail } from '../src/email';
import type { Env } from '../src/runtime';
import { createDispatcherProvisioner } from '../../functions/src/domain/adminProvisioning';
import { createAccountLifecycleService } from '../../functions/src/domain/adminLifecycle';

// This entry is not included by test/*.test.ts. Real REST wire integration only
// against explicit loopback demo emulators; there is no deployed emulator mode.
const project = 'demo-servicepilot-admin-worker';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
if (![firestoreHost, authHost].every(host => /^(localhost|127\.0\.0\.1):\d+$/.test(host)) ||
  process.env.GCLOUD_PROJECT !== project) throw new Error('Explicit local demo Auth/Firestore emulators required');
const pair = await generateKeyPair('RS256');
const publicKey = { ...await exportJWK(pair.publicKey), kid: 'local-test' };
const keys = createLocalJWKSet({ keys: [publicKey] });
let failProfileCommit = false, dropCreateResponse = false, failLifecycleAuth = false;
let mailFails = false, emails = 0, authCreates = 0, authDeletes = 0;
const transport: typeof fetch = async (input, init) => {
  let url = String(input);
  const body = JSON.parse(String(init?.body ?? '{}'));
  if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
    url = url.replace('https://identitytoolkit.googleapis.com', 'http://' + authHost + '/identitytoolkit.googleapis.com');
    if (url.endsWith('/accounts')) authCreates++;
    if (url.endsWith(':delete')) authDeletes++;
    if (failLifecycleAuth && url.endsWith(':update')) throw new Error('injected Auth outage');
    const result = await fetch(url, init);
    if (dropCreateResponse && url.endsWith('/accounts')) { dropCreateResponse = false; throw new Error('lost create acknowledgement'); }
    if (url.endsWith(':sendOobCode') && result.ok) {
      const data = await result.json() as { oobLink: string };
      // The production adapter requires HTTPS links. No link is followed or
      // emailed; only the emulator's fixture URL is normalized in test transport.
      return new Response(JSON.stringify({ ...data, oobLink: data.oobLink.replace(/^http:/, 'https:') }));
    }
    return result;
  }
  assert.ok(url.startsWith('http://' + firestoreHost + '/v1/projects/' + project + '/'));
  if (failProfileCommit && url.endsWith(':commit') && body.writes?.some((w: any) => w.update?.fields?.role?.stringValue === 'dispatcher')) {
    failProfileCommit = false;
    return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE' } }), { status: 503 });
  }
  return fetch(url, init);
};
const store = firestoreStore(project, async () => 'owner', transport, 'http://' + firestoreHost + '/v1');
const restAuth = firebaseAuth(project, async () => 'owner', transport, keys);
// SDK types are erased; production uses the same tested adapter boundary.
const auth = restAuth as unknown as Parameters<typeof createDispatcherProvisioner>[0]['auth'];
const db = store as unknown as Parameters<typeof createDispatcherProvisioner>[0]['db'];
const dependencies = { auth, db, serverTimestamp: () => serverTime };
const provisioning = createDispatcherProvisioner({ ...dependencies, continueUrl: 'https://admin.example.test/login',
  sendSetupEmail: async () => { emails++; if (mailFails) throw new Error('test mail failure'); return 'sent'; } });
const lifecycle = createAccountLifecycleService(dependencies);
let bearer: string;
async function seed(uid: string, role: string, status = 'active') {
  await restAuth.createUser({ uid, email: `${uid}@example.test`, displayName: uid, password: 'Local-emulator-only-42', emailVerified: false, disabled: false });
  await store.runTransaction(async tx => { tx.set(store.doc(`users/${uid}`), { uid, fullName: uid, role, accountStatus: status,
    technicianApprovalStatus: 'approved', serviceDistrictIds: ['kandy'], availability: 'available' }); });
}
async function session(uid: string) {
  const now = Math.floor(Date.now() / 1000);
  return 'Bearer ' + await new SignJWT({ auth_time: now }).setProtectedHeader({ alg: 'RS256', kid: publicKey.kid })
    .setIssuer(`https://securetoken.google.com/${project}`).setAudience(project).setSubject(uid).setIssuedAt(now).setExpirationTime(now + 600).sign(pair.privateKey);
}
const input = () => ({ fullName: 'Local Dispatcher', email: `dispatcher-${randomUUID()}@example.test`, requestId: randomUUID() });
const profile = async (uid: string) => (await store.doc('users/' + uid).get()).data();
before(async () => { await seed('admin', 'super_admin'); bearer = await session('admin'); });

test('REST core denies dispatcher, inactive Super Admin, forged fields, missing status and revoked Auth', async () => {
  await seed('dispatcher', 'dispatcher'); await seed('inactive', 'super_admin', 'disabled');
  for (const uid of ['dispatcher', 'inactive']) await assert.rejects(provisioning.create(await session(uid), input()), { code: 'permission-denied' });
  await assert.rejects(provisioning.create(bearer, { ...input(), role: 'super_admin' }), { code: 'invalid-argument' });
  await seed('legacy', 'super_admin');
  await store.runTransaction(async tx => { tx.set(store.doc('users/legacy'), { role: 'super_admin' }); });
  await assert.rejects(provisioning.create(await session('legacy'), input()), { code: 'permission-denied' });
  await seed('revoked', 'super_admin');
  await restAuth.updateUser('revoked', { disabled: true });
  await assert.rejects(provisioning.create(await session('revoked'), input()), { code: 'unauthenticated' });
});

test('REST transactions prevent duplicate creation and preserve profile/audit/receipt and retry identity', async () => {
  const beforeCreates = authCreates, beforeEmails = emails;
  const data = input();
  const results = await Promise.allSettled([provisioning.create(bearer, data), provisioning.create(bearer, data)]);
  const first = results.find(r => r.status === 'fulfilled');
  assert.ok(first && first.status === 'fulfilled');
  const replay = await provisioning.create(bearer, data);
  assert.equal(replay.uid, first.value.uid);
  assert.equal(authCreates - beforeCreates, 1); assert.equal(emails - beforeEmails, 1);
  assert.equal((await profile(replay.uid))?.role, 'dispatcher');
  const audit = (await store.doc(`audit_logs/dispatcher-created-${replay.uid}`).get()).data();
  assert.equal(audit?.actorUid, 'admin');
  assert.equal(audit?.action, 'SUPER_ADMIN_CREATED_DISPATCHER');
  assert.equal(typeof audit?.createdAt.toMillis(), 'number');
  await assert.rejects(provisioning.create(bearer, { ...input(), email: data.email }), { code: 'already-exists' });
});

test('definite profile commit failure rolls back only the newly created Auth user', async () => {
  const beforeDeletes = authDeletes;
  failProfileCommit = true;
  const data = input();
  await assert.rejects(provisioning.create(bearer, data), { code: 'unavailable' });
  assert.equal(authDeletes - beforeDeletes, 1);
  const retry = await provisioning.create(bearer, data);
  assert.equal((await profile(retry.uid))?.role, 'dispatcher');
});

test('ambiguous Auth creation retains reservations and never deletes an uncertain account', async () => {
  const beforeDeletes = authDeletes;
  dropCreateResponse = true;
  const data = input();
  await assert.rejects(provisioning.create(bearer, data), { code: 'operation-recovery-required' });
  await assert.rejects(provisioning.create(bearer, data), { code: 'operation-recovery-required' });
  assert.equal(authDeletes, beforeDeletes);
});

test('mail failure preserves committed account and resend lease/cooldown prevent immediate duplicates', async () => {
  mailFails = true;
  const created = await provisioning.create(bearer, input());
  assert.equal(created.emailDelivery, 'failed');
  assert.equal((await profile(created.uid))?.accountStatus, 'active');
  mailFails = false;
  assert.equal((await provisioning.resend(bearer, { uid: created.uid })).emailDelivery, 'sent');
  const beforeEmails = emails;
  await provisioning.resend(bearer, { uid: created.uid });
  assert.equal(emails, beforeEmails);
});

test('lifecycle denies protected targets; revokes map before Auth; retry completes without restoring sharing', async () => {
  await assert.rejects(lifecycle.change(bearer, { targetUid: 'admin', action: 'disable', requestId: randomUUID() }), { code: 'protected-account' });
  await seed('other-admin', 'super_admin');
  await assert.rejects(lifecycle.change(bearer, { targetUid: 'other-admin', action: 'disable', requestId: randomUUID() }), { code: 'protected-account' });
  await seed('technician', 'technician');
  const data = { targetUid: 'technician', action: 'disable', requestId: randomUUID() };
  failLifecycleAuth = true;
  await assert.rejects(lifecycle.change(bearer, data), { code: 'lifecycle-incomplete' });
  assert.equal((await profile('technician'))?.lifecyclePending, true);
  for (const collection of ['technician_locations', 'technician_map_locations']) {
    const location = (await store.doc(collection + '/technician').get()).data();
    assert.equal(location?.sharingEnabled, false); assert.equal(location?.latitude, undefined);
  }
  failLifecycleAuth = false;
  assert.equal((await lifecycle.change(bearer, data)).outcome, 'complete');
  assert.equal((await profile('technician'))?.lifecyclePending, false);
  assert.equal((await restAuth.getUser('technician')).disabled, true);
  await lifecycle.change(bearer, { targetUid: 'technician', action: 'enable', requestId: randomUUID() });
  assert.equal((await profile('technician'))?.availability, 'offline');
  assert.equal((await store.doc('technician_map_locations/technician').get()).data()?.sharingEnabled, false);
  await assert.rejects(lifecycle.change(bearer, data), { code: 'request-conflict' });
  await lifecycle.change(bearer, { targetUid: 'technician', action: 'delete', requestId: randomUUID() });
  await assert.rejects(lifecycle.change(bearer, { targetUid: 'technician', action: 'enable', requestId: randomUUID() }), { code: 'deleted-account' });
});

test('Firebase onboarding preserves trusted creation, audit, accepted replay and cooldown without generating links', async () => {
  let requests = 0, clock = Date.now();
  const env = { ADMIN_WEB_ORIGIN: 'https://servicepilot-admin-web.pages.dev', FIREBASE_WEB_API_KEY: 'test-public-project-key' } as Env;
  const requestSetupEmail = firebaseSetupEmail(env, async () => { requests++; return new Response('{}'); });
  const noLinksAuth = { ...restAuth, generatePasswordResetLink: async () => { throw new Error('Link generation must never be called'); } } as unknown as typeof auth;
  const builtin = createDispatcherProvisioner({ ...dependencies, auth: noLinksAuth, now: () => clock,
    continueUrl: env.ADMIN_WEB_ORIGIN + '/login', requestSetupEmail });
  await assert.rejects(builtin.create(await session('dispatcher'), input()), { code: 'permission-denied' });
  assert.equal(requests, 0);
  const data = input(), result = await builtin.create(bearer, data);
  assert.equal(result.emailDelivery, 'accepted');
  assert.equal(requests, 1);
  assert.deepEqual(Object.keys(result).sort(), ['dispatcherId', 'emailDelivery', 'uid']);
  assert.equal((await profile(result.uid))?.emailVerified, false);
  assert.equal((await profile(result.uid))?.invitationStatus, 'pending');
  assert.equal((await store.doc(`audit_logs/dispatcher-created-${result.uid}`).get()).data()?.actorUid, 'admin');
  assert.equal((await builtin.create(bearer, data)).emailDelivery, 'accepted');
  assert.equal((await builtin.resend(bearer, { uid: result.uid })).emailDelivery, 'accepted');
  assert.equal(requests, 1);
  const receipt = (await store.doc(`dispatcher_invitation_deliveries/${result.uid}`).get()).data();
  assert.equal(receipt?.status, 'accepted');
  assert.ok(!JSON.stringify(receipt).match(/password|resetLink|oobLink/));
  clock += 60001;
  await builtin.resend(bearer, { uid: result.uid });
  assert.equal(requests, 2);
});

test('Firebase quota and unknown outcomes retain accounts/audits and enforce a bounded retry wait', async () => {
  for (const mode of ['quota', 'network'] as const) {
    let requests = 0, clock = Date.now(), recovered = false;
    const requestSetupEmail = firebaseSetupEmail({ ADMIN_WEB_ORIGIN: 'https://admin.pages.dev', FIREBASE_WEB_API_KEY: 'test-public-project-key' } as Env, async () => {
      requests++;
      if (recovered) return new Response('{}');
      if (mode === 'network') throw new Error('Ambiguous request');
      return new Response(JSON.stringify({ error: { message: 'QUOTA_EXCEEDED' } }), { status: 429 });
    });
    const builtin = createDispatcherProvisioner({ ...dependencies, now: () => clock, continueUrl: 'https://admin.pages.dev/login', requestSetupEmail });
    const data = input(), result = await builtin.create(bearer, data);
    const expected = mode === 'quota' ? 'failed' : 'unknown';
    assert.equal(result.emailDelivery, expected);
    assert.equal((await profile(result.uid))?.accountStatus, 'active');
    assert.equal((await profile(result.uid))?.emailVerified, false);
    assert.equal((await builtin.create(bearer, data)).emailDelivery, expected);
    await assert.rejects(builtin.resend(bearer, { uid: result.uid }), { code: 'resource-exhausted' });
    assert.equal(requests, 1);
    recovered = true; clock += 60001;
    assert.equal((await builtin.resend(bearer, { uid: result.uid })).emailDelivery, 'accepted');
    assert.equal(requests, 2);
  }
});
