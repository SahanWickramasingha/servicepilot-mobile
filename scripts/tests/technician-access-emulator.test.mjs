import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import * as fs from 'firebase/firestore';
import { performanceTestDependency } from '../lib/performance-test-deps.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const projectId = 'demo-servicepilot-access';
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? '')) throw new Error('Loopback emulators required');
}
const trusted = adminApp({ projectId }), admin = getFirestore(trusted), clients = [];
function load(path, session, extra = {}) {
  const exports = {}, deps = { 'firebase/firestore': fs,
    '@/src/firebase/config': session, '../firebase/config': session, ...extra };
  new Function('exports', 'require', '__DEV__', ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8').replaceAll('import.meta.env.DEV', 'false'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports, id => deps[id] ?? performanceTestDependency(id, deps) ??
    (id.startsWith('@/src/utils/') ? load('src/utils/' + id.split('/').at(-1) + '.ts', session) : id.startsWith('@/functions/src/domain/') ? require('./lib/domain/' + id.split('/').at(-1) + '.js') :
      id.startsWith('../../../functions/src/domain/') ? require('./lib/domain/' + id.split('/').at(-1) + '.js') : require(id)), false);
  return exports;
}
async function session(uid, role = 'customer', extra = {}, verified = true) {
  const email = `${uid}@example.test`, password = 'Only-emulator-password-42';
  await adminAuth(trusted).createUser({ uid, email, password, emailVerified: verified });
  await admin.doc(`users/${uid}`).set({ uid, role, fullName: uid, email, phone: '123', address: 'Private address', emailVerified: verified, accountStatus: 'active', ...extra });
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, uid), auth = getAuth(app), db = fs.getFirestore(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); fs.connectFirestoreEmulator(db, host, +port);
  await signInWithEmailAndPassword(auth, email, password);
  const result = { app, auth, db }; clients.push(result); return result;
}
const build = require('./lib/domain/mapProjection.js').buildMapProfile;
let customer;
before(async () => {
  fs.setLogLevel('silent'); customer = await session('access-customer');
  await admin.doc('users/access-tech').set({ uid: 'access-tech', role: 'technician', fullName: 'Gihan', accountStatus: 'active', technicianApprovalStatus: 'approved', specialization: 'Electrical', serviceDistrictIds: ['kandy'] });
  const data = (await admin.doc('users/access-tech').get()).data();
  await admin.doc('technician_map_profiles/access-tech').set({ ...build('access-tech', data), updatedAt: Timestamp.now() });
});
after(async () => { for (const c of clients) { await fs.terminate(c.db); await deleteApp(c.app); } await admin.terminate(); });
function directory(session, filters, extra = {}) {
  const service = load('src/services/technician.service.ts', session, extra);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error('Listener timeout')); }, 12000);
    const stop = service.subscribeToApprovedTechnicians(items => { queueMicrotask(() => { clearTimeout(timer); stop(); resolve(items); }); }, error => { clearTimeout(timer); stop(); reject(error); }, filters);
  });
}
test('actual Dashboard and filtered directory subscriptions read eligible public profiles', async () => {
  assert.deepEqual((await directory(customer)).map(t => t.uid), ['access-tech']);
  assert.deepEqual((await directory(customer, { division: 'Kandy', category: 'electrical' })).map(t => t.uid), ['access-tech']);
  assert.deepEqual(await directory(customer, { division: 'Jaffna' }), []);
  await assert.rejects(fs.getDocFromServer(fs.doc(customer.db, 'users', 'access-tech')), e => e.code === 'permission-denied');
});

test('stale unverified ID token denies the exact query; directory refresh recovers after Auth verification', async () => {
  const c = await session('access-stale-token', 'customer', { emailVerified: true }, false);
  const source = fs.query(fs.collection(c.db, 'technician_map_profiles'), fs.where('approved', '==', true), fs.orderBy(fs.documentId()), fs.limit(8));
  await assert.rejects(fs.getDocsFromServer(source), e => e.code === 'permission-denied');
  await adminAuth(trusted).updateUser(c.auth.currentUser.uid, { emailVerified: true });
  // Current SDK token still has email_verified:false until explicitly refreshed.
  await assert.rejects(fs.getDocsFromServer(source), e => e.code === 'permission-denied');
  assert.deepEqual((await directory(c)).map(t => t.uid), ['access-tech']);
});

test('unverified, disabled, revoked and lifecycle-pending customers fail rather than succeed empty', async () => {
  for (const [suffix, extra, verified] of [['unverified', {}, false], ['disabled', { accountStatus: 'disabled' }, true],
    ['revoked', { sessionRevokedAt: Math.floor(Date.now() / 1000) + 30 }, true], ['lifecycle', { lifecyclePending: true }, true]]) {
    const c = await session('access-' + suffix, 'customer', extra, verified);
    await assert.rejects(directory(c), e => e.code === 'permission-denied');
  }
});

// Real public snapshots can outlive imported/deleted/disabled private accounts.
// Exercise the COMPLETE service (including every supplemental server read), not
// just an approved==true query. Both screens use these exact subscriptions.
async function mixedDirectoryFixtures() {
  const cases = [
    ['legacy', { role: 'technician', technicianApprovalStatus: 'approved' }],
    ['rejected', { role: 'technician', technicianApprovalStatus: 'rejected' }],
    ['disabled', { role: 'technician', technicianApprovalStatus: 'approved', accountStatus: 'disabled' }],
    ['missing', null],
    ['wrong-role', { role: 'customer', technicianApprovalStatus: 'approved' }],
    ['pending', { role: 'technician', technicianApprovalStatus: 'pending' }],
    ['missing-status', { role: 'technician' }],
  ];
  const ids = cases.map(([suffix]) => 'directory-' + suffix);
  for (const [suffix, patch] of cases) {
    const uid = 'directory-' + suffix;
    // Legacy profile deliberately lacks accountStatus, area, availability and
    // canonical category ID. Its supported legacy category must still work.
    const profile = { uid, fullName: uid, specialization: 'Electrical', serviceDistrictIds: ['kandy'], ...patch };
    if (patch) await admin.doc('users/' + uid).set(profile);
    await admin.doc('technician_map_profiles/' + uid).set({
      ...build(uid, { ...profile, role: 'technician', technicianApprovalStatus: 'approved', accountStatus: 'active' }), updatedAt: Timestamp.now(),
    });
  }
  return { ids, excluded: ids.filter(id => id !== 'directory-legacy'), async cleanup() {
    for (const id of ids) { await admin.doc('technician_map_profiles/' + id).delete(); await admin.doc('users/' + id).delete(); }
  } };
}
for (const [screen, filters] of [['Dashboard', undefined], ['Technicians', { division: 'Kandy', category: 'electrical' }]]) {
  test(`${screen}: complete subscription excludes authoritatively ineligible stale projections and retains legacy technicians`, async () => {
    const fixture = await mixedDirectoryFixtures();
    try {
      const initial = await fs.getDocsFromServer(fs.query(fs.collection(customer.db, 'technician_map_profiles'),
        fs.where('approved', '==', true), fs.orderBy(fs.documentId()), fs.limit(8)));
      assert.equal(initial.size, 8, 'initial public query succeeds with all mixed records');
      for (const id of fixture.excluded) {
        await assert.rejects(fs.getDocFromServer(fs.doc(customer.db, 'technician_map_profiles', id)), e => e.code === 'permission-denied');
      }
      const reads = [];
      const observed = { ...fs, getDocFromServer: async ref => {
        try { const result = await fs.getDocFromServer(ref); reads.push({ path: ref.path, result: result.exists() ? 'found' : 'missing' }); return result; }
        catch (error) { reads.push({ path: ref.path, result: error.code }); throw error; }
      } };
      assert.deepEqual((await directory(customer, filters, { 'firebase/firestore': observed })).map(t => t.uid).sort(), ['access-tech', 'directory-legacy']);
      for (const id of fixture.excluded) {
        assert.ok(reads.some(r => r.path === 'technician_map_profiles/' + id && r.result === 'permission-denied'));
        assert.ok(reads.some(r => r.path === 'technician_directory_exclusions/' + id && r.result === 'missing'), 'Rules must affirm current ineligibility before exclusion');
      }
      assert.equal(reads.some(r => r.path.startsWith('users/')), false, 'no client private profile reads');
      await assert.rejects(fs.getDocFromServer(fs.doc(customer.db, 'users', 'directory-legacy')), e => e.code === 'permission-denied');
    } finally { await fixture.cleanup(); }
  });
}

test('24 real supplemental approval reads stay within Rules access-call limits; page/filter bounds remain intact', async () => {
  const ids = Array.from({ length: 24 }, (_, i) => 'directory-bulk-' + String(i).padStart(2, '0'));
  try {
    for (const [i, uid] of ids.entries()) {
      const profile = { uid, role: 'technician', fullName: uid, technicianApprovalStatus: 'approved',
        specialization: 'Electrical', serviceDistrictIds: ['kandy'], ...(i % 2 ? { accountStatus: 'active' } : {}) };
      await admin.doc('users/' + uid).set(profile);
      await admin.doc('technician_map_profiles/' + uid).set({ ...build(uid, profile), updatedAt: Timestamp.now() });
    }
    for (const [filters, expected] of [[undefined, 8], [{ division: 'Kandy', category: 'electrical', pageCount: 99 }, 24]]) {
      const reads = [];
      const observed = { ...fs, getDocFromServer: ref => { reads.push(ref.path); return fs.getDocFromServer(ref); } };
      assert.equal((await directory(customer, filters, { 'firebase/firestore': observed })).length, expected);
      assert.equal(reads.length, expected);
      assert.ok(reads.every(path => path.startsWith('technician_map_profiles/')));
    }
  } finally {
    for (const id of ids) { await admin.doc('technician_map_profiles/' + id).delete(); await admin.doc('users/' + id).delete(); }
  }
});

test('negative eligibility proof is authoritative, server-only, read-only and never discloses stored data', async () => {
  const fixture = await mixedDirectoryFixtures();
  const proof = (c, uid) => fs.doc(c.db, 'technician_directory_exclusions', uid);
  try {
    assert.equal((await fs.getDocFromServer(proof(customer, 'directory-missing'))).exists(), false);
    await assert.rejects(fs.getDocFromServer(proof(customer, 'directory-legacy')), e => e.code === 'permission-denied');
    await assert.rejects(fs.getDocsFromServer(fs.query(fs.collection(customer.db, 'technician_directory_exclusions'), fs.limit(24))), e => e.code === 'permission-denied');
    await assert.rejects(fs.setDoc(proof(customer, 'directory-rejected'), { eligible: false }), e => e.code === 'permission-denied');
    await admin.doc('technician_directory_exclusions/directory-rejected').set({ privateData: 'must never be exposed' });
    await assert.rejects(fs.getDocFromServer(proof(customer, 'directory-rejected')), e => e.code === 'permission-denied');
    for (const [suffix, role, extra, verified] of [
      ['disabled', 'customer', { accountStatus: 'disabled' }, true], ['unverified', 'customer', {}, false],
      ['revoked', 'customer', { sessionRevokedAt: Math.floor(Date.now() / 1000) + 30 }, true],
      ['lifecycle', 'customer', { lifecyclePending: true }, true], ['technician', 'technician', {}, true],
    ]) {
      const c = await session('proof-' + suffix, role, extra, verified);
      await assert.rejects(fs.getDocFromServer(proof(c, 'directory-missing')), e => e.code === 'permission-denied');
    }
    // A stale projection can be excluded again after a new authoritative change;
    // no negative result is cached in a public document or client status cache.
    await admin.doc('users/directory-missing').set({ role: 'technician', technicianApprovalStatus: 'approved' });
    await assert.rejects(fs.getDocFromServer(proof(customer, 'directory-missing')), e => e.code === 'permission-denied');
    assert.equal((await fs.getDocFromServer(fs.doc(customer.db, 'technician_map_profiles', 'directory-missing'))).exists(), true);
  } finally {
    await admin.doc('technician_directory_exclusions/directory-rejected').delete();
    await fixture.cleanup();
  }
});

test('unexplained approval denial and unavailable exclusion proof still fail BOTH subscriptions instead of returning partial/empty success', async () => {
  for (const filters of [undefined, { division: 'Kandy', category: 'electrical' }]) {
    const observed = { ...fs, getDocFromServer: ref => {
      if (ref.path === 'technician_map_profiles/access-tech') return Promise.reject(Object.assign(new Error('Injected ambiguous denial'), { code: 'permission-denied' }));
      return fs.getDocFromServer(ref);
    } };
    await assert.rejects(directory(customer, filters, { 'firebase/firestore': observed }), e =>
      e.code === 'permission-denied' && /approval check/.test(e.message) && /technician_map_profiles\/access-tech/.test(e.message));
  }
  const fixture = await mixedDirectoryFixtures();
  try {
    for (const filters of [undefined, { division: 'Kandy', category: 'electrical' }]) {
      const observed = { ...fs, getDocFromServer: ref => ref.path.startsWith('technician_directory_exclusions/') ?
        Promise.reject(Object.assign(new Error('Injected network outage'), { code: 'unavailable' })) : fs.getDocFromServer(ref) };
      await assert.rejects(directory(customer, filters, { 'firebase/firestore': observed }), e => e.code === 'unavailable' && /exclusion check/.test(e.message));
    }
  } finally { await fixture.cleanup(); }
});

async function applicant(uid, extra = {}) {
  const profile = { uid, role: 'technician', fullName: 'Pending technician', email: uid + '@example.test', phone: '123', address: 'Private street',
    emailVerified: true, accountStatus: 'active', technicianApprovalStatus: 'pending', specialization: 'Electrical',
    serviceDivision: 'Kandy', serviceDistrictIds: ['kandy'], availability: 'offline', ...extra };
  await admin.doc(`users/${uid}`).set(profile);
  await admin.doc(`technician_map_profiles/${uid}`).set({ ...build(uid, profile), updatedAt: Timestamp.now() });
  return profile;
}
function review(c, technicianUid, status, rejectionReason) {
  return load('admin-web/src/services/technicianApprovalService.ts', c).reviewTechnicianApplication({ technicianUid, dispatcherUid: c.auth.currentUser.uid, status, rejectionReason });
}
function applicationPage(c) {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    const timer = setTimeout(() => { stop(); reject(new Error('Application query timeout')); }, 12000);
    const react = { useState: value => [value, next => {
      if (next && typeof next === 'object' && next.loading === false) {
        clearTimeout(timer); stop(); next.error ? reject(new Error(next.error)) : resolve(next.data);
      }
    }], useEffect: connect => { stop = connect(); } };
    load('admin-web/src/hooks/useTechnicianUsers.ts', c, { react, '../utils/format': { timestampMillis: value => value?.toMillis?.() ?? 0 } })
      .useTechnicianUsers({ reviewQueue: true, status: 'pending', page: 'dispatcher/applications', queryType: 'pending-technician-applications' });
  });
}
test('Super Admin and each active Dispatcher can decide verified complete legacy applications atomically', async () => {
  for (const [uid, role] of [['review-admin', 'super_admin'], ['review-dispatcher-a', 'dispatcher'], ['review-dispatcher-b', 'dispatcher']]) {
    const actor = await session(uid, role);
    for (const status of ['approved', 'rejected']) {
      const id = `${uid}-${status}`; await applicant(id);
      assert.ok((await applicationPage(actor)).some(p => p.id === id));
      await review(actor, id, status, status === 'rejected' ? 'Qualification evidence needed\nPlease provide the certificate.' : undefined);
      const profile = (await admin.doc(`users/${id}`).get()).data(), projection = (await admin.doc(`technician_map_profiles/${id}`).get()).data();
      assert.equal(profile.technicianApprovalStatus, status); assert.equal(profile.reviewedBy, uid);
      assert.ok(profile.reviewedAt instanceof Timestamp); assert.equal(profile.updatedAt.toMillis(), projection.updatedAt.toMillis());
      assert.equal(projection.approved, status === 'approved'); assert.equal(profile.availability, 'offline');
      assert.equal(projection.availability, 'offline'); assert.equal((await admin.doc(`technician_locations/${id}`).get()).exists, false);
      assert.equal(projection.address, undefined); assert.equal(projection.email, undefined);
      await assert.rejects(review(actor, id, status, 'Again'), /already reviewed/);
      if (status === 'approved') assert.equal((await fs.getDocFromServer(fs.doc(customer.db, 'technician_map_profiles', id))).exists(), true);
      else await assert.rejects(fs.getDocFromServer(fs.doc(customer.db, 'technician_map_profiles', id)), e => e.code === 'permission-denied');
    }
  }
});
test('Rules reject forged verification, incomplete/unverified applicants, invalid reasons and unauthorized actors', async () => {
  const dispatcher = await session('review-guard-dispatcher', 'dispatcher');
  for (const [suffix, extra] of [['unverified', { emailVerified: false }], ['incomplete', { phone: '  ' }], ['disabled', { accountStatus: 'disabled' }]]) {
    const uid = 'review-guard-' + suffix; const profile = await applicant(uid, extra);
    // Bypass client service validation to exercise authoritative Rules.
    const batch = fs.writeBatch(dispatcher.db);
    batch.update(fs.doc(dispatcher.db, 'users', uid), { technicianApprovalStatus: 'approved', reviewedBy: dispatcher.auth.currentUser.uid, reviewedAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
    batch.set(fs.doc(dispatcher.db, 'technician_map_profiles', uid), { ...build(uid, { ...profile, technicianApprovalStatus: 'approved' }), updatedAt: fs.serverTimestamp() });
    await assert.rejects(batch.commit(), e => e.code === 'permission-denied');
  }
  const target = 'review-guard-target'; await applicant(target);
  for (const [uid, role, extra] of [['review-customer', 'customer', {}], ['review-tech', 'technician', {}], ['review-disabled-dispatcher', 'dispatcher', { accountStatus: 'disabled' }], ['review-disabled-admin', 'super_admin', { accountStatus: 'disabled' }]]) {
    const c = await session(uid, role, extra);
    await assert.rejects(review(c, target, 'approved'), e => e.code === 'permission-denied');
  }
  await assert.rejects(review(dispatcher, target, 'rejected', '  '), /valid application review/);
  const profile = (await admin.doc(`users/${target}`).get()).data();
  for (const patch of [{ technicianApprovalStatus: 'rejected', rejectionReason: '   ' },
    { technicianApprovalStatus: 'approved', reviewedBy: 'someone-else' },
    { technicianApprovalStatus: 'approved', reviewedAt: fs.Timestamp.fromMillis(0) }]) {
    const status = patch.technicianApprovalStatus;
    const batch = fs.writeBatch(dispatcher.db);
    batch.update(fs.doc(dispatcher.db, 'users', target), { technicianApprovalStatus: status, reviewedBy: dispatcher.auth.currentUser.uid,
      reviewedAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp(), ...patch });
    batch.set(fs.doc(dispatcher.db, 'technician_map_profiles', target), { ...build(target, { ...profile, technicianApprovalStatus: status }), updatedAt: fs.serverTimestamp() });
    await assert.rejects(batch.commit(), e => e.code === 'permission-denied');
  }
  await assert.rejects(fs.updateDoc(fs.doc(dispatcher.db, 'users', target), { technicianApprovalStatus: 'approved', reviewedBy: dispatcher.auth.currentUser.uid,
    reviewedAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() }), e => e.code === 'permission-denied');
  const unverified = await session('review-forge-verification', 'technician', { technicianApprovalStatus: 'pending' }, false);
  await assert.rejects(fs.updateDoc(fs.doc(unverified.db, 'users', unverified.auth.currentUser.uid), { emailVerified: true, updatedAt: fs.serverTimestamp() }), e => e.code === 'permission-denied');
});
test('concurrent approval and rejection produce exactly one decision without overwriting', async () => {
  const a = await session('review-race-a', 'dispatcher'), b = await session('review-race-b', 'super_admin');
  await applicant('review-race-target');
  const outcomes = await Promise.allSettled([review(a, 'review-race-target', 'approved'), review(b, 'review-race-target', 'rejected', 'Missing documents')]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(x => x.status === 'rejected').length, 1);
  const p = (await admin.doc('users/review-race-target').get()).data();
  assert.equal((await admin.doc('technician_map_profiles/review-race-target').get()).data().approved, p.technicianApprovalStatus === 'approved');
});
