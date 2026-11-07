import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import ts from 'typescript';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as fs from 'firebase/firestore';
import { firestoreStore, serverTime } from '../src/firestore';
import { firebaseAuth } from '../src/auth';
import { decisionEmail } from '../src/email';
import type { Env } from '../src/runtime';
import { createTechnicianDecisionEmailService, type DecisionEmailMessage } from '../../functions/src/domain/technicianDecisionEmail';

const project = 'demo-servicepilot-admin-worker';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '', authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
if (![firestoreHost, authHost].every(h => /^(localhost|127\.0\.0\.1):\d+$/.test(h)) || process.env.GCLOUD_PROJECT !== project) throw Error('Loopback demo emulators only');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const buildProfile = require('./lib/domain/mapProjection.js').buildMapProfile;
const pair = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(pair.publicKey), kid: 'decision-local' };
const keys = createLocalJWKSet({ keys: [jwk] });
const transport: typeof fetch = (input, init) => {
  const url = String(input);
  if (url.startsWith('https://identitytoolkit.googleapis.com/')) return fetch(url.replace('https://identitytoolkit.googleapis.com', 'http://' + authHost + '/identitytoolkit.googleapis.com'), init);
  assert.ok(url.startsWith('http://' + firestoreHost + '/v1/projects/' + project + '/'), 'no production requests');
  return fetch(url, init);
};
const store = firestoreStore(project, async () => 'owner', transport, 'http://' + firestoreHost + '/v1');
const restAuth = firebaseAuth(project, async () => 'owner', transport, keys);
type Dependencies = Parameters<typeof createTechnicianDecisionEmailService>[0];
const auth = restAuth as unknown as Dependencies['auth'], db = store as unknown as Dependencies['db'];
let clock = Date.now(), providerMode = 'success';
const calls: { key: string; message: DecisionEmailMessage }[] = [], apps: ReturnType<typeof initializeApp>[] = [];
const env = { ADMIN_EMAIL_FROM: 'servicepilot@example.test', RESEND_API_KEY: 'local-test-only' } as Env;
const sendEmail = decisionEmail(env, async (url, init) => {
  assert.equal(String(url), 'https://api.resend.com/emails');
  calls.push({ key: new Headers(init?.headers).get('Idempotency-Key')!, message: JSON.parse(String(init?.body)) });
  if (providerMode === 'network') throw Error('PRIVATE_PROVIDER_EXCEPTION');
  return providerMode === 'failure' ? new Response('{}', { status: 429 }) : new Response(JSON.stringify({ id: 'accepted-' + calls.length }));
});
const engine = (patch: Partial<Dependencies> = {}) => createTechnicianDecisionEmailService({ auth, db,
  sender: env.ADMIN_EMAIL_FROM, sendEmail, serverTimestamp: () => serverTime, now: () => clock, ...patch });
const data = async (path: string) => (await store.doc(path).get()).data();
async function bearer(uid: string) {
  const now = Math.floor(Date.now() / 1000);
  return 'Bearer ' + await new SignJWT({ auth_time: now }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(`https://securetoken.google.com/${project}`).setAudience(project).setSubject(uid).setIssuedAt(now).setExpirationTime(now + 600).sign(pair.privateKey);
}
async function reviewer(uid: string, role: string, patch = {}) {
  await restAuth.createUser({ uid, email: uid + '@example.test', password: 'Local-test-only-42', displayName: uid, emailVerified: true, disabled: false });
  await store.runTransaction(async tx => { tx.set(store.doc('users/' + uid), { uid, role, fullName: uid, accountStatus: 'active', ...patch }); });
}
async function target(status: 'pending' | 'approved' | 'rejected' = 'approved', extra = {}) {
  const uid = 'decision-tech-' + randomUUID();
  await restAuth.createUser({ uid, email: uid + '@example.test', password: 'Local-test-only-42', displayName: uid, emailVerified: true, disabled: false });
  const profile = { uid, role: 'technician', fullName: 'Applicant <b>unsafe</b>', email: uid + '@example.test', phone: '0710000000', address: 'Private fixture street',
    emailVerified: true, accountStatus: 'active', technicianApprovalStatus: status, serviceDistrictIds: ['kandy'], specialization: 'Electrical', availability: 'offline',
    ...(status === 'pending' ? {} : { reviewedAt: serverTime, reviewedBy: 'decision-admin', ...(status === 'rejected' ? { rejectionReason: '<script>bad</script>\nCertificate required' } : {}) }), ...extra };
  await store.runTransaction(async tx => { tx.set(store.doc('users/' + uid), profile); tx.set(store.doc('technician_map_profiles/' + uid), { ...buildProfile(uid, profile), updatedAt: serverTime }); });
  return uid;
}
async function actualReview(actor: string, uid: string, status: 'approved' | 'rejected') {
  const app = initializeApp({ projectId: project, apiKey: 'emulator-only' }, randomUUID()); apps.push(app);
  const clientAuth = getAuth(app), clientDb = fs.getFirestore(app);
  connectAuthEmulator(clientAuth, 'http://' + authHost, { disableWarnings: true });
  const [host, port] = firestoreHost.split(':'); fs.connectFirestoreEmulator(clientDb, host, +port);
  await signInWithEmailAndPassword(clientAuth, actor + '@example.test', 'Local-test-only-42');
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL('../../admin-web/src/services/technicianApprovalService.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, (id: string) => id === 'firebase/firestore' ? fs : id === '../firebase/config' ? { db: clientDb } : require('./lib/domain/' + id.split('/').at(-1) + '.js'));
  await exports.reviewTechnicianApplication({ technicianUid: uid, dispatcherUid: actor, status, rejectionReason: status === 'rejected' ? 'Certificate evidence required\nPlease provide it.' : undefined });
  return clientDb;
}
before(async () => { fs.setLogLevel('silent'); await reviewer('decision-admin', 'super_admin'); await reviewer('decision-dispatcher', 'dispatcher'); });
after(async () => { for (const app of apps) { await fs.terminate(fs.getFirestore(app)); await deleteApp(app); } });

test('actual web approval/rejection commits first; both authorized roles request accurate emails without changing availability/sharing', async () => {
  for (const actor of ['decision-admin', 'decision-dispatcher']) for (const status of ['approved', 'rejected'] as const) {
    const uid = await target('pending'), token = await bearer(actor), start = calls.length;
    await assert.rejects(engine().request(token, { technicianUid: uid }), { code: 'decision-unavailable' });
    assert.equal(calls.length, start);
    const clientDb = await actualReview(actor, uid, status);
    assert.equal((await data('users/' + uid))?.reviewedBy, actor);
    const result = await engine().request(token, { technicianUid: uid });
    assert.equal(result.status, 'submitted'); assert.equal(calls.length, start + 1);
    const message = calls.at(-1)!.message;
    assert.deepEqual(message.to, [uid + '@example.test']); assert.ok(!message.html.includes('<b>unsafe</b>'));
    assert.equal(message.subject, status === 'approved' ? 'Your ServicePilot technician application is approved' : 'Update on your ServicePilot technician application');
    assert.equal(message.text.includes('can sign in'), status === 'approved');
    if (status === 'rejected') assert.ok(message.text.includes('Certificate evidence required'));
    assert.equal((await data('technician_map_profiles/' + uid))?.approved, status === 'approved');
    assert.equal((await data('users/' + uid))?.availability, 'offline');
    assert.equal(await data('technician_map_locations/' + uid), undefined);
    await assert.rejects(fs.getDocFromServer(fs.doc(clientDb, 'technician_decision_emails', result.revision)), e => e.code === 'permission-denied');
    await assert.rejects(fs.setDoc(fs.doc(clientDb, 'technician_decision_emails', result.revision), { status: 'submitted' }), e => e.code === 'permission-denied');
  }
});
test('unauthorized, inactive, revoked reviewers and forged recipients/decisions cannot request provider mail', async () => {
  const uid = await target(), start = calls.length;
  for (const [name, role, patch] of [['customer', 'customer', {}], ['tech', 'technician', {}], ['disabled', 'dispatcher', { accountStatus: 'disabled' }],
    ['pending', 'dispatcher', { lifecyclePending: true }], ['revoked', 'super_admin', { sessionRevokedAt: Math.floor(Date.now() / 1000) + 60 }]] as const) {
    const actor = 'decision-' + name; await reviewer(actor, role, patch);
    await assert.rejects(engine().request(await bearer(actor), { technicianUid: uid }), { code: 'permission-denied' });
  }
  const token = await bearer('decision-admin');
  for (const fields of [{ email: 'victim@example.test' }, { role: 'super_admin' }, { status: 'approved' }, { rejectionReason: 'forged' }]) {
    await assert.rejects(engine().request(token, { technicianUid: uid, ...fields }), { code: 'invalid-argument' });
  }
  await assert.rejects(engine().request(undefined, { technicianUid: uid }), { code: 'unauthenticated' });
  await assert.rejects(engine().request(token, { technicianUid: uid, revision: '0'.repeat(64) }), { code: 'decision-changed' });
  await restAuth.updateUser('decision-dispatcher', { disabled: true });
  await assert.rejects(engine().request(await bearer('decision-dispatcher'), { technicianUid: uid }), { code: 'unauthenticated' });
  await restAuth.updateUser('decision-dispatcher', { disabled: false });
  assert.equal(calls.length, start);
});
test('concurrent requests and durable replay submit only once per decision revision', async () => {
  const uid = await target(), token = await bearer('decision-admin'), start = calls.length;
  const results = await Promise.all([engine().request(token, { technicianUid: uid }), engine().request(token, { technicianUid: uid })]);
  assert.ok(results.some(r => r.status === 'submitted')); assert.equal(calls.length, start + 1);
  assert.equal((await engine().request(token, { technicianUid: uid })).status, 'submitted');
  assert.equal((await engine().status(token, { technicianUid: uid })).status, 'submitted');
  clock += 25 * 60 * 60 * 1000;
  assert.equal((await engine().request(token, { technicianUid: uid })).status, 'submitted');
  assert.equal(calls.length, start + 1, 'receipt suppresses replays even after provider key expiry'); clock = Date.now();
});
test('competing real approval transactions produce one saved decision and one notification', async () => {
  const uid = await target('pending'), start = calls.length;
  const decisions = await Promise.allSettled([actualReview('decision-admin', uid, 'approved'), actualReview('decision-dispatcher', uid, 'rejected')]);
  assert.equal(decisions.filter(r => r.status === 'fulfilled').length, 1);
  const saved = await data('users/' + uid);
  await Promise.all([engine().request(await bearer('decision-admin'), { technicianUid: uid }), engine().request(await bearer('decision-dispatcher'), { technicianUid: uid })]);
  assert.equal(calls.length, start + 1);
  assert.equal(calls.at(-1)!.message.text.includes('can sign in'), saved?.technicianApprovalStatus === 'approved');
});
test('revision identity retains stored submillisecond precision rather than rounding to milliseconds', async () => {
  const uid = await target(), token = await bearer('decision-admin');
  const current = await data('users/' + uid), Timestamp = current!.reviewedAt.constructor;
  await store.runTransaction(async tx => { tx.update(store.doc('users/' + uid), { reviewedAt: new Timestamp('2026-11-06T00:00:00.000001000Z') }); });
  const one = await engine().status(token, { technicianUid: uid });
  await store.runTransaction(async tx => { tx.update(store.doc('users/' + uid), { reviewedAt: new Timestamp('2026-11-06T00:00:00.000002000Z') }); });
  const two = await engine().status(token, { technicianUid: uid });
  assert.notEqual(one.revision, two.revision);
});
test('provider failure is separate from decision success; retry uses the same frozen payload/key without reapproval', async () => {
  const uid = await target('rejected'), token = await bearer('decision-admin'), original = await data('users/' + uid);
  providerMode = 'failure'; const first = await engine().request(token, { technicianUid: uid }); assert.equal(first.status, 'failed');
  const before = calls.at(-1)!;
  await store.runTransaction(async tx => { tx.update(store.doc('users/' + uid), { fullName: 'Edited after first request' }); });
  providerMode = 'success'; clock += 6000;
  const second = await engine().request(token, { technicianUid: uid, revision: first.revision });
  assert.equal(second.status, 'submitted'); assert.deepEqual(calls.at(-1), before);
  const current = await data('users/' + uid);
  assert.equal(current?.reviewedBy, original?.reviewedBy); assert.equal(current?.reviewedAt.toMillis(), original?.reviewedAt.toMillis());
  assert.equal(current?.technicianApprovalStatus, 'rejected'); clock = Date.now();
});
test('missing configuration is truthful and recoverable; recipient mismatch never calls provider', async () => {
  const uid = await target(), token = await bearer('decision-admin'), start = calls.length;
  const result = await engine({ sender: undefined }).request(token, { technicianUid: uid });
  assert.equal(result.status, 'not_configured'); assert.equal(calls.length, start);
  assert.equal((await engine().request(token, { technicianUid: uid })).status, 'submitted');
  const foreign = await target('approved', { email: 'victim@example.test' });
  assert.equal((await engine().request(token, { technicianUid: foreign })).status, 'failed'); assert.equal(calls.length, start + 1);
});
test('ambiguous provider response retries safely inside retention and refuses an unsafe resend after the window', async () => {
  const uid = await target(), token = await bearer('decision-admin');
  providerMode = 'network'; const first = await engine().request(token, { technicianUid: uid }); assert.equal(first.status, 'unknown');
  const before = calls.length; clock += 24 * 60 * 60 * 1000;
  const expired = await engine().request(token, { technicianUid: uid });
  assert.equal(expired.status, 'unknown'); assert.equal(expired.retryable, false); assert.equal(calls.length, before);
  clock = Date.now(); providerMode = 'success';
});
test('a definite failure can be retried later without shortening a new ambiguous request window', async () => {
  const uid = await target(), token = await bearer('decision-admin');
  providerMode = 'failure'; assert.equal((await engine().request(token, { technicianUid: uid })).status, 'failed');
  clock += 25 * 60 * 60 * 1000; providerMode = 'network';
  const uncertain = await engine().request(token, { technicianUid: uid }); assert.equal(uncertain.status, 'unknown'); assert.equal(uncertain.retryable, true);
  const before = calls.length; clock += 6000; providerMode = 'success';
  assert.equal((await engine().request(token, { technicianUid: uid })).status, 'submitted'); assert.equal(calls.length, before + 1);
  clock = Date.now();
});
test('configuration gaps cannot erase uncertainty from a crashed send and allow duplicates after retention expires', async () => {
  const uid = await target(), token = await bearer('decision-admin');
  providerMode = 'network'; const initial = await engine().request(token, { technicianUid: uid });
  const ref = store.doc('technician_decision_emails/' + initial.revision);
  await store.runTransaction(async tx => { tx.update(ref, { status: 'sending', everUncertain: false, leaseUntilMs: clock - 1, retryAfterMs: 0 }); });
  assert.equal((await engine({ sender: undefined }).request(token, { technicianUid: uid })).status, 'not_configured');
  assert.equal((await ref.get()).data()?.everUncertain, true);
  const before = calls.length; clock += 24 * 60 * 60 * 1000; providerMode = 'success';
  const blocked = await engine().request(token, { technicianUid: uid });
  assert.equal(blocked.status, 'unknown'); assert.equal(blocked.retryable, false); assert.equal(calls.length, before);
  clock = Date.now();
});
test('lost receipt acknowledgement is confirmed without sending or deciding twice', async () => {
  const uid = await target(), token = await bearer('decision-admin'), start = calls.length;
  const proxy = { ...db, doc: db.doc.bind(db), runTransaction: async (action: any) => {
    const value: any = await db.runTransaction(action);
    if (value.status === 'submitted') throw Error('lost receipt acknowledgement');
    return value;
  } } as unknown as Dependencies['db'];
  assert.equal((await engine({ db: proxy }).request(token, { technicianUid: uid })).status, 'submitted');
  assert.equal((await engine().request(token, { technicianUid: uid })).status, 'submitted'); assert.equal(calls.length, start + 1);
});
