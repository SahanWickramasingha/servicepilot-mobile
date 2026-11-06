// Real registration, Auth, profile transaction, session observer and Rules.
// Tests must never connect to production, even when invoked outside the runner.
import assert from 'node:assert/strict';
import { test, after, before } from 'node:test';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import * as authSdk from 'firebase/auth';
import * as fs from 'firebase/firestore';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? '')) throw Error('Loopback Auth and Firestore emulators required.');
}
const projectId = 'demo-servicepilot-registration';
if (process.env.GCLOUD_PROJECT !== projectId) throw Error('Disposable demo project required.');
fs.setLogLevel('silent');
const clients = [];
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const adminApp = requireFunctions('firebase-admin/app'), adminFirestore = requireFunctions('firebase-admin/firestore'), adminAuth = requireFunctions('firebase-admin/auth');
const trusted = adminApp.initializeApp({ projectId }, 'registration-confirmation'), admin = adminFirestore.getFirestore(trusted);
const input = role => ({ fullName: 'Registration fixture', email: `register-${randomUUID()}@example.test`,
  phone: '0712345678', address: 'Private test fixture', role, policyAccepted: true,
  ...(role === 'technician' ? { serviceCategoryId: 'electrical', experience: '2 years', qualifications: 'Training',
    certifications: '', serviceAreas: 'Kandy', serviceDivision: 'Kandy' } : {}) });
const password = 'Only-emulator-password-123';

// This comparison changes Rules only on the guarded disposable emulator project.
// Keep all other Rules identical so the verified-create predicate is the cause.
const currentRules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const verifiedCreatePredicate = `(request.resource.data.emailVerified == false ||
          (request.resource.data.emailVerified == true && request.auth.token.email_verified == true))`;
async function loadRegistrationRules(content) {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }),
  });
  assert.equal(response.ok, true, `Local registration Rules load failed: ${response.status}`);
}
before(() => loadRegistrationRules(currentRules));

function session(profileSdk = {}, authOverrides = {}) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, randomUUID());
  const auth = authSdk.getAuth(app), db = fs.getFirestore(app), diagnostics = [], events = [], verification = [];
  authSdk.connectAuthEmulator(auth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); fs.connectFirestoreEmulator(db, host, Number(port));
  const config = { auth, db };
  const debug = loadService('src/utils/registrationDebug.ts', {});
  const logging = { ...debug, logRegistrationDebug() {}, logRegistrationError: data => {
    // Only stage and code: no email, password, token, payload or private address.
    diagnostics.push({ stage: data.step, code: data.firebaseErrorCode });
  } };
  const initialization = loadService('src/services/profile-initialization.service.ts', {});
  const drafts = loadService('src/services/onboarding-draft.service.ts', { '@/src/firebase/config': config });
  const emailRequests = [];
  const authService = loadService('src/services/auth.service.ts', {
    '@/src/firebase/config': config, 'firebase/auth': { ...authSdk, ...authOverrides,
      sendEmailVerification: async user => {
        emailRequests.push('request');
        return (authOverrides.sendEmailVerification ?? authSdk.sendEmailVerification)(user);
      },
    }, '@/src/utils/registrationDebug': logging,
    '@/src/services/foreground-location.service': { foregroundSharing: { endRevokedSession() {} } },
  });
  const userService = loadService('src/services/user.service.ts', {
    '@/src/firebase/config': config, 'firebase/firestore': { ...fs, ...profileSdk }, '@/src/utils/registrationDebug': logging,
    '@/functions/src/domain/mapProjection': {}, '@/functions/src/domain/availability': {}, '@/functions/src/domain/serviceAreas': {},
  });
  const registration = loadService('src/services/registration.service.ts', {
    'expo-constants': { default: { expoConfig: { version: '1.0.0' } } },
    '@/src/utils/registrationDebug': logging,
    '@/src/firebase/config': config, './auth.service': { ...authService, sendVerificationEmail: async user => {
      // Record persistence order and use only the local Auth email sink.
      const profile = await fs.getDocFromServer(fs.doc(db, 'users', user.uid));
      verification.push({ hadProfile: profile.exists() });
      const result = await authService.sendVerificationEmail(user);

      return result;
    } },
    './user.service': userService, './profile-initialization.service': initialization, './onboarding-draft.service': drafts,
  });
  const observer = loadService('src/services/account-session.service.ts', {
    '@/src/firebase/config': config, 'firebase/auth': authSdk, 'firebase/firestore': fs,
    '@/functions/src/domain/accountSession': loadService('functions/src/domain/accountSession.ts', {}),
    './profile-initialization.service': initialization, './onboarding-draft.service': drafts,
  });
  const stop = observer.observeAccountSession({ pending: () => events.push('pending'), allowed: () => events.push('allowed'),
    setupRequired: (_, verified) => events.push(verified ? 'setup' : 'verify'), denied: () => events.push('denied'), error: () => events.push('error') });
  const value = { app, auth, db, ...registration, userService, drafts, diagnostics, events, verification, emailRequests, stop };
  clients.push(value); return value;
}
after(async () => {
  for (const client of clients) { client.stop(); await authSdk.signOut(client.auth); await fs.terminate(client.db); await deleteApp(client.app); }
  await admin.terminate(); await adminApp.deleteApp(trusted);
});


const policy = loadService('functions/src/domain/legalPolicy.ts', {
  './legal-content.json': { default: JSON.parse(readFileSync(new URL('../../functions/src/domain/legal-content.json', import.meta.url), 'utf8')) },
});
async function verified(h) {
  await adminAuth.getAuth(trusted).updateUser(h.auth.currentUser.uid, { emailVerified: true });
  await h.auth.currentUser.reload();
  await h.auth.currentUser.getIdTokenResult(true);
}
const ref = h => fs.doc(h.db, 'users', h.auth.currentUser.uid);
function fixture(data, uid) {
  return { uid, fullName: data.fullName, email: data.email, phone: data.phone, address: data.address, role: data.role,
    accountStatus: 'active', emailVerified: false, termsVersion: policy.TERMS_VERSION, privacyPolicyVersion: policy.PRIVACY_POLICY_VERSION,
    acceptedAt: fs.serverTimestamp(), createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp(),
    ...(data.role === 'technician' ? { serviceCategoryId: 'electrical', specialization: 'Electrical', experience: '2 years',
      qualifications: 'Training', certifications: '', serviceAreas: 'Kandy', serviceDivision: 'Kandy',
      technicianApprovalStatus: 'pending', availability: 'offline' } : {}) };
}
async function adminProfile(h, data, patch = {}) {
  const now = adminFirestore.Timestamp.now();
  await admin.doc('users/' + h.auth.currentUser.uid).set({ ...fixture(data, h.auth.currentUser.uid),
    acceptedAt: now, createdAt: now, updatedAt: now, ...patch });
  // Synchronize independent Admin fixture writes with the already active SDK
  // watch before asserting a no-overwrite baseline. Never application polling.
  const expected = { uid: h.auth.currentUser.uid, ...patch };
  for (let attempt = 0; attempt < 50; attempt++) {
    const snapshot = await fs.getDocFromServer(ref(h)), value = snapshot.data();
    if (Object.entries(expected).every(([key, item]) => isDeepStrictEqual(value?.[key], item))) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw Error('Local fixture watch did not observe the expected server version.');
}

test('verified profile-create denial is caused only by the old false-only Rules predicate; the narrow fix permits both roles', async t => {
  assert.equal(currentRules.split(verifiedCreatePredicate).length, 2, 'Expected exactly one verified-create predicate');
  const oldRules = currentRules.replace(verifiedCreatePredicate, 'request.resource.data.emailVerified == false');
  for (const role of ['customer', 'technician']) {
    let submitted;
    const h = session({ runTransaction: (db, action) => fs.runTransaction(db, tx => action({
      get: reference => tx.get(reference), set: (reference, payload) => { submitted = payload; tx.set(reference, payload); },
    })) }), data = input(role);
    await h.registerAccount(data.email, password, data); await verified(h);
    const user = h.auth.currentUser;
    assert.equal((await user.getIdTokenResult()).claims.email_verified, true);
    try {
      await loadRegistrationRules(oldRules);
      await assert.rejects(h.completeVerifiedRegistration(), error => {
        assert.equal(error.code, 'permission-denied');
        assert.equal(error.registrationStep, 'profile-create-transaction');
        assert.equal(error.emailVerificationConfirmed, true);
        assert.notEqual(error.profileWriteCommitted, true);
        t.diagnostic(JSON.stringify({ role, stage: error.registrationStep, code: error.code }));
        return true;
      });
      assert.equal(submitted.emailVerified, true);
      assert.equal(submitted.uid, user.uid);
      assert.equal(submitted.role, role);
      assert.equal((await admin.doc('users/' + user.uid).get()).exists, false);
      assert.equal(h.auth.currentUser, user); assert.ok(h.drafts.getOnboardingDraft());
    } finally { await loadRegistrationRules(currentRules); }
    assert.equal((await h.completeVerifiedRegistration()).next, role === 'customer' ? 'login' : 'technician-pending');
    const saved = (await admin.doc('users/' + user.uid).get()).data();
    assert.equal(saved.emailVerified, true); assert.equal(saved.role, role);
    if (role === 'technician') { assert.equal(saved.technicianApprovalStatus, 'pending'); assert.equal(saved.availability, 'offline'); }
    assert.equal(h.auth.currentUser, user);
  }
});

test('exact Customer Commit with exists=false and REQUEST_TIME transforms rejects stale claims, then accepts awaited refreshed claims', async () => {
  const h = session(), data = input('customer');
  await h.registerAccount(data.email, password, data);
  const user = h.auth.currentUser, staleToken = await user.getIdToken();
  assert.equal((await user.getIdTokenResult()).claims.email_verified, false);
  await adminAuth.getAuth(trusted).updateUser(user.uid, { emailVerified: true });
  await user.reload(); assert.equal(user.emailVerified, true);
  assert.equal((await user.getIdTokenResult()).claims.email_verified, false);
  const fields = Object.fromEntries(Object.entries({ uid: user.uid, fullName: data.fullName, email: data.email,
    phone: data.phone, address: data.address, role: 'customer', accountStatus: 'active',
    termsVersion: policy.TERMS_VERSION, privacyPolicyVersion: policy.PRIVACY_POLICY_VERSION,
  }).map(([key, value]) => [key, { stringValue: value }]));
  fields.emailVerified = { booleanValue: true };
  const body = JSON.stringify({ writes: [{ update: {
    name: `projects/${projectId}/databases/(default)/documents/users/${user.uid}`, fields,
  }, currentDocument: { exists: false }, updateTransforms: ['acceptedAt', 'createdAt', 'updatedAt']
    .map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) }] });
  const commit = token => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body,
  });
  assert.equal((await commit(staleToken)).status, 403);
  assert.equal((await admin.doc('users/' + user.uid).get()).exists, false);
  const fresh = await user.getIdTokenResult(true);
  assert.equal(fresh.claims.email_verified, true);
  assert.equal(fresh.claims.aud, projectId); assert.equal(fresh.claims.iss, `https://securetoken.google.com/${projectId}`);
  assert.equal(h.auth.app, h.db.app); assert.equal(h.db.app.options.projectId, projectId);
  assert.equal((await commit(fresh.token)).status, 200);
  const before = (await admin.doc('users/' + user.uid).get()).data();
  assert.equal(before.emailVerified, true);
  assert.equal((await h.completeVerifiedRegistration()).next, 'login');
  assert.deepEqual((await admin.doc('users/' + user.uid).get()).data(), before);
});

test('completion itself refreshes stale verified claims before either role starts a profile transaction', async () => {
  for (const role of ['customer', 'technician']) {
    let h, transactions = 0;
    h = session({ runTransaction: async (db, action) => {
      transactions++;
      assert.equal((await h.auth.currentUser.getIdTokenResult()).claims.email_verified, true);
      return fs.runTransaction(db, action);
    } });
    const data = input(role); await h.registerAccount(data.email, password, data);
    assert.equal((await h.auth.currentUser.getIdTokenResult()).claims.email_verified, false);
    await adminAuth.getAuth(trusted).updateUser(h.auth.currentUser.uid, { emailVerified: true });
    assert.equal((await h.completeVerifiedRegistration()).next, role === 'customer' ? 'login' : 'technician-pending');
    assert.equal(transactions, 1); assert.equal((await admin.doc('users/' + h.auth.currentUser.uid).get()).data().emailVerified, true);
  }
});

test('resend calls the real email SDK once, enforces cooldown, and already-verified reload skips sending without a new countdown', async t => {
  const now = Date.now; let elapsed = 0; t.mock.method(Date, 'now', () => now() + elapsed);
  const h = session(), data = input('customer'); await h.registerAccount(data.email, password, data);
  assert.equal(h.emailRequests.length, 1);
  elapsed += 61000;
  assert.equal((await h.requestOnboardingVerification()).alreadyVerified, false);
  assert.equal(h.emailRequests.length, 2); assert.ok(h.verificationResendSeconds() > 58);
  await assert.rejects(h.requestOnboardingVerification(), error => error.code === 'registration/resend-cooldown');
  assert.equal(h.emailRequests.length, 2);
  elapsed += 61000;
  await adminAuth.getAuth(trusted).updateUser(h.auth.currentUser.uid, { emailVerified: true });
  assert.equal((await h.requestOnboardingVerification()).alreadyVerified, true);
  assert.equal(h.emailRequests.length, 2); assert.equal(h.verificationResendSeconds(), 0);
  assert.equal((await h.completeVerifiedRegistration()).next, 'login');
});

test('resend failures retain original codes; throttling/uncertain requests back off without claiming acceptance', async t => {
  const now = Date.now; let elapsed = 0; t.mock.method(Date, 'now', () => now() + elapsed);
  for (const code of ['auth/too-many-requests', 'auth/network-request-failed', 'auth/invalid-user-token', 'auth/operation-timeout']) {
    let armed = false;
    const h = session({}, { sendEmailVerification: user => {
      if (armed) throw { code }; return authSdk.sendEmailVerification(user);
    } }), data = input('customer');
    await h.registerAccount(data.email, password, data); elapsed += 61000; armed = true;
    await assert.rejects(h.requestOnboardingVerification(), error => error.code === code && error.registrationStep === 'send-verification');
    assert.equal(h.auth.currentUser.email, data.email);
    assert.equal(h.verificationResendSeconds() > 0, ['auth/too-many-requests', 'auth/operation-timeout'].includes(code));
    assert.equal((await admin.doc('users/' + h.auth.currentUser.uid).get()).exists, false);
  }
});

test('resend duplicate taps and logout while SDK send is unresolved cannot update another session', async t => {
  const now = Date.now; let elapsed = 0; t.mock.method(Date, 'now', () => now() + elapsed);
  let release, armed = false;
  const hold = new Promise(resolve => { release = resolve; });
  const h = session({}, { sendEmailVerification: async user => {
    if (armed) await hold; else await authSdk.sendEmailVerification(user);
  } }), data = input('customer');
  await h.registerAccount(data.email, password, data); elapsed += 61000; armed = true;
  const pending = h.requestOnboardingVerification();
  await assert.rejects(h.requestOnboardingVerification(), error => error.code === 'registration/in-progress');
  // Wait for the SDK boundary to be entered, without weakening application locks.
  for (let index = 0; index < 50 && h.emailRequests.length < 2; index++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(h.emailRequests.length, 2);
  await authSdk.signOut(h.auth); release();
  await assert.rejects(pending, error => ['auth/user-mismatch', 'auth/registration-account-changed'].includes(error.code));
  assert.equal(h.auth.currentUser, null); assert.equal(h.verificationResendSeconds(), 0);
});

test('verified claims do not permit foreign identity, privileged roles, self-approval or fabricated trusted fields', async () => {
  const h = session(), data = input('technician');
  await h.registerAccount(data.email, password, data); await verified(h);
  const payload = { ...fixture(data, h.auth.currentUser.uid), emailVerified: true };
  for (const patch of [{ uid: 'another-user' }, { email: 'another@example.test' }, { role: 'admin' },
    { role: 'dispatcher' }, { technicianApprovalStatus: 'approved' }, { availability: 'available' },
    { averageRating: 5 }, { reviewCount: 10 }, { emailVerified: 'true' }]) {
    await assert.rejects(fs.setDoc(ref(h), { ...payload, ...patch }), error => error.code === 'permission-denied');
  }
  await assert.rejects(fs.setDoc(fs.doc(h.db, 'users', 'another-user'), { ...payload, uid: 'another-user' }),
    error => error.code === 'permission-denied');
  assert.equal((await admin.doc('users/' + h.auth.currentUser.uid).get()).exists, false);
});

for (const role of ['customer', 'technician']) {
  test(role + ': verification-first registration creates no pre-verification profile, then commits verified setup', async () => {
    const h = session(), data = input(role);
    const result = await h.registerAccount(data.email, password, data);
    assert.equal(result.next, 'verify-email'); assert.equal(result.verificationRequested, true);
    assert.equal((await fs.getDocFromServer(ref(h))).exists(), false);
    assert.deepEqual(h.verification, [{ hadProfile: false }]);
    await assert.rejects(h.completeVerifiedRegistration(), error => error.code === 'registration/email-not-verified');
    assert.equal((await fs.getDocFromServer(ref(h))).exists(), false);
    await verified(h);
    assert.equal((await h.completeVerifiedRegistration()).next, role === 'customer' ? 'login' : 'technician-pending');
    const saved = (await fs.getDocFromServer(ref(h))).data();
    assert.equal(saved.emailVerified, true); assert.equal(saved.role, role); assert.ok(saved.acceptedAt instanceof fs.Timestamp);
    if (role === 'technician') { assert.equal(saved.technicianApprovalStatus, 'pending'); assert.equal(saved.availability, 'offline'); }
    assert.equal(h.drafts.getOnboardingDraft(), undefined); assert.ok(!h.events.includes('denied'));
  });

  test(role + ': incomplete-account recovery reuses UID; incorrect credentials never create another profile', async () => {
    const h = session(), data = input(role);
    const { user } = await authSdk.createUserWithEmailAndPassword(h.auth, data.email, password), uid = user.uid;
    await authSdk.signOut(h.auth);
    await assert.rejects(h.registerAccount(data.email, 'Incorrect-password-123', data, true), error =>
      ['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials'].includes(error.code));
    assert.equal(h.auth.currentUser, null);
    await h.registerAccount(data.email, password, data, true);
    assert.equal(h.auth.currentUser.uid, uid); assert.equal((await fs.getDocFromServer(ref(h))).exists(), false);
    await verified(h); await h.completeVerifiedRegistration();
    const before = (await fs.getDocFromServer(ref(h))).data();
    await authSdk.signOut(h.auth);
    await h.registerAccount(data.email, password, { ...data, fullName: 'Must never overwrite' }, true);
    await h.completeVerifiedRegistration();
    assert.deepEqual((await fs.getDocFromServer(ref(h))).data(), before);
  });
}

test('restart during onboarding loses only memory fields; verified user can re-enter setup with the same UID', async () => {
  const h = session(), data = input('customer');
  await h.registerAccount(data.email, password, data); const uid = h.auth.currentUser.uid;
  h.drafts.clearOnboardingDraft(); await verified(h);
  assert.equal((await h.completeVerifiedRegistration()).next, 'profile-setup');
  assert.equal((await fs.getDocFromServer(ref(h))).exists(), false);
  assert.equal((await h.completeVerifiedRegistration(data)).next, 'login');
  assert.equal(h.auth.currentUser.uid, uid);
});

test('invalid payloads fail before Auth creation; public roles cannot fabricate trusted profile fields or verified claims', async () => {
  const h = session(), data = input('technician');
  for (const patch of [{ role: 'admin' }, { policyAccepted: false }, { qualifications: '' }, { serviceCategoryId: 'invalid' }]) {
    await assert.rejects(h.registerAccount(data.email, password, { ...data, ...patch }), error => error.code === 'registration/invalid-profile');
    assert.equal(h.auth.currentUser, null);
  }
  await h.registerAccount(data.email, password, data);
  for (const patch of [{ emailVerified: true }, { technicianApprovalStatus: 'approved' }, { role: 'dispatcher' }, { averageRating: 5 }]) {
    await assert.rejects(fs.setDoc(ref(h), { ...fixture(data, h.auth.currentUser.uid), ...patch }), error => error.code === 'permission-denied');
  }
  assert.equal((await fs.getDocFromServer(ref(h))).exists(), false);
});

test('legacy profile-first accounts verify without replacing names, roles, policy versions or technician review state', async () => {
  for (const role of ['customer', 'technician']) {
    const h = session(), data = input(role);
    await h.registerAccount(data.email, password, data);
    await h.userService.createUserProfile({ ...data, uid: h.auth.currentUser.uid });
    const before = (await fs.getDocFromServer(ref(h))).data();
    await verified(h); const result = await h.completeVerifiedRegistration();
    const after = (await fs.getDocFromServer(ref(h))).data();
    assert.equal(result.next, role === 'customer' ? 'login' : 'technician-pending');
    for (const key of Object.keys(before).filter(key => !['updatedAt', 'emailVerified'].includes(key))) assert.deepEqual(after[key], before[key]);
    assert.equal(after.emailVerified, true);
  }
});

test('profile confirmation rejects cache/pending snapshots and preserves resolved timestamps and the acknowledged write', async () => {
  for (const metadata of [{ fromCache: true, hasPendingWrites: false }, { fromCache: false, hasPendingWrites: true }]) {
    let armed = false, reads = 0;
    const h = session({ getDocFromServer: async reference => {
      const snapshot = await fs.getDocFromServer(reference);
      return armed && ++reads === 3 ? { exists: () => snapshot.exists(), data: () => snapshot.data(), metadata } : snapshot;
    } }), data = input('technician');
    await h.registerAccount(data.email, password, data); await verified(h); armed = true;
    await assert.rejects(h.completeVerifiedRegistration(), error => error.code === 'firestore/profile-confirmation-pending' && error.profileWriteCommitted === true);
    const before = (await fs.getDocFromServer(ref(h))).data();
    for (const key of ['createdAt', 'updatedAt', 'acceptedAt']) assert.ok(Number.isFinite(before[key].toMillis()));
    armed = false; assert.equal((await h.completeVerifiedRegistration()).next, 'technician-pending');
    assert.deepEqual((await fs.getDocFromServer(ref(h))).data(), before);
  }
});

test('a post-commit missing listener snapshot uses one read-only confirmation; genuine absence and account switches remain blocked', async () => {
  for (const scenario of ['saved-customer', 'saved-technician', 'deleted', 'switched', 'denied-read']) {
    let armed = false, reads = 0, transactions = 0, h;
    h = session({
      getDocFromServer: async reference => {
        const snapshot = await fs.getDocFromServer(reference);
        if (!armed || ++reads !== 3) return snapshot;
        assert.equal((await admin.doc('users/' + h.auth.currentUser.uid).get()).exists, true);
        if (scenario === 'deleted') await admin.doc('users/' + h.auth.currentUser.uid).delete();
        return { metadata: { fromCache: false, hasPendingWrites: false }, exists: () => false };
      },
      runTransaction: async (db, action, options) => {
        transactions++;
        if (transactions === 2) {
          assert.equal(options.maxAttempts, 1);
          if (scenario === 'switched') await authSdk.updateCurrentUser(h.auth, h.auth.currentUser);
          if (scenario === 'denied-read') throw { code: 'permission-denied' };
          return fs.runTransaction(db, tx => action({ get: reference => tx.get(reference),
            set() { assert.fail('Confirmation must never write'); }, update() { assert.fail('Confirmation must never update'); } }), options);
        }
        return fs.runTransaction(db, action, options);
      },
    });
    const data = input(scenario === 'saved-technician' ? 'technician' : 'customer');
    await h.registerAccount(data.email, password, data); await verified(h); armed = true;
    if (scenario.startsWith('saved-')) {
      assert.equal((await h.completeVerifiedRegistration()).next, data.role === 'customer' ? 'login' : 'technician-pending');
      assert.equal((await admin.doc('users/' + h.auth.currentUser.uid).get()).data().emailVerified, true);
    } else {
      const expected = scenario === 'deleted' ? 'firestore/profile-confirmation-missing' : scenario === 'switched' ? 'auth/registration-account-changed' : 'permission-denied';
      await assert.rejects(h.completeVerifiedRegistration(), error => error.code === expected && error.profileWriteCommitted === true && error.registrationStep === 'profile-server-confirmation');
    }
    assert.equal(transactions, 2);
  }
});

test('post-commit confirmation failures preserve original provider codes and reconcile without overwrite', async () => {
  for (const code of ['permission-denied', 'unavailable', undefined]) {
    let armed = false, reads = 0;
    const h = session({ getDocFromServer: async reference => {
      if (armed && ++reads === 3) throw code ? { code } : new Error('Confirmation boundary interrupted');
      return fs.getDocFromServer(reference);
    } }), data = input('technician');
    await h.registerAccount(data.email, password, data); await verified(h); armed = true;
    await assert.rejects(h.completeVerifiedRegistration(), error => error.profileWriteCommitted === true &&
      error.code === (code ?? 'firestore/profile-confirmation-failed') && error.registrationStep === 'profile-server-confirmation');
    assert.ok((await admin.doc('users/' + h.auth.currentUser.uid).get()).exists);
    const before = (await fs.getDocFromServer(ref(h))).data(); armed = false;
    await h.completeVerifiedRegistration({ ...data, fullName: 'Must not overwrite' });
    assert.deepEqual((await fs.getDocFromServer(ref(h))).data(), before);
  }
});

test('a real Rules write rejection differs from a lost transaction acknowledgement', async () => {
  for (const kind of ['denied', 'lost-ack']) {
    let armed = false;
    const h = session({ runTransaction: async (db, action) => {
      if (!armed) return fs.runTransaction(db, action);
      if (kind === 'denied') return fs.runTransaction(db, tx => action({
        get: reference => tx.get(reference), set: (reference, payload) => tx.set(reference, { ...payload, role: 'dispatcher' }),
      }));
      await fs.runTransaction(db, action); throw { code: 'unavailable' };
    } }), data = input('customer');
    await h.registerAccount(data.email, password, data); await verified(h); armed = true;
    await assert.rejects(h.completeVerifiedRegistration(), error => error.code === (kind === 'denied' ? 'permission-denied' : 'unavailable') &&
      error.registrationStep === 'profile-create-transaction' && error.profileWriteCommitted !== true);
    assert.equal((await admin.doc('users/' + h.auth.currentUser.uid).get()).exists, kind === 'lost-ack');
    armed = false; await h.completeVerifiedRegistration();
    assert.equal((await fs.getDocFromServer(ref(h))).data().role, 'customer');
  }
});

test('cross-role, inactive, revoked and malformed saved profiles remain blocked without repair', async () => {
  for (const patch of [{ role: 'technician' }, { accountStatus: 'disabled' }, { accountStatus: 'deleted' }, { lifecyclePending: true },
    { sessionRevokedAt: Math.floor(Date.now() / 1000) + 1000 }, { fullName: '' }]) {
    const h = session(), data = input('customer');
    await h.registerAccount(data.email, password, data); await verified(h); await adminProfile(h, data, patch);
    const uid = h.auth.currentUser.uid, before = (await admin.doc('users/' + uid).get()).data();
    await assert.rejects(h.completeVerifiedRegistration());
    assert.deepEqual((await admin.doc('users/' + uid).get()).data(), before);
  }
});

test('verified recovered technicians route by authoritative review state; old policy is not fabricated', async () => {
  for (const [status, patch, destination] of [['pending', {}, 'technician-pending'], ['approved', { sessionRevokedAt: 1 }, 'login'],
    ['rejected', {}, 'login'], ['pending', { termsVersion: 'older', privacyPolicyVersion: 'older' }, 'login']]) {
    const h = session(), data = input('technician');
    await h.registerAccount(data.email, password, data); await verified(h);
    await adminProfile(h, data, { emailVerified: true, technicianApprovalStatus: status, ...patch });
    const before = (await fs.getDocFromServer(ref(h))).data();
    assert.equal((await h.completeVerifiedRegistration()).next, destination);
    assert.deepEqual((await fs.getDocFromServer(ref(h))).data(), before);
  }
});

test('server absence must be authoritative; cached missing reads never create profiles', async () => {
  const h = session({ getDocFromServer: async reference => {
    const snapshot = await fs.getDocFromServer(reference);
    return { exists: () => snapshot.exists(), data: () => snapshot.data(), metadata: { fromCache: true, hasPendingWrites: false } };
  } }), data = input('customer');
  await assert.rejects(h.registerAccount(data.email, password, data), error => error.code === 'firestore/profile-confirmation-pending');
  assert.equal((await fs.getDocFromServer(ref(h))).exists(), false); assert.equal(h.verification.length, 0);
});

test('approved legacy district-only profiles retain optional-field compatibility and are never rewritten by recovery', async () => {
  const h = session(), data = input('technician');
  await h.registerAccount(data.email, password, data); await verified(h);
  await adminProfile(h, data, { emailVerified: true, technicianApprovalStatus: 'approved', serviceDistrictIds: ['kandy'] });
  const optional = ['experience', 'qualifications', 'certifications', 'serviceAreas', 'serviceDivision'];
  await admin.doc('users/' + h.auth.currentUser.uid).update(Object.fromEntries(optional.map(key => [key, adminFirestore.FieldValue.delete()])));
  let observed = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const value = (await fs.getDocFromServer(ref(h))).data();
    if (optional.every(key => value[key] === undefined)) { observed = true; break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(observed, true);
  const before = (await fs.getDocFromServer(ref(h))).data();
  assert.equal((await h.completeVerifiedRegistration()).next, 'login');
  assert.deepEqual((await fs.getDocFromServer(ref(h))).data(), before);
});

test('a concurrent existing profile is validated inside the transaction without another write', async () => {
  let armed = false, reads = 0, h, data;
  h = session({ getDocFromServer: async reference => {
    const snapshot = await fs.getDocFromServer(reference);
    if (armed && ++reads === 2) await adminProfile(h, data, { emailVerified: true, fullName: 'Concurrent saved name' });
    return snapshot;
  } }); data = input('customer');
  await h.registerAccount(data.email, password, data); await verified(h); armed = true;
  await h.completeVerifiedRegistration();
  assert.equal((await fs.getDocFromServer(ref(h))).data().fullName, 'Concurrent saved name');
});

test('same-UID replacement during confirmation cannot inherit the old attempt or be signed out by cleanup', async () => {
  let armed = false, reads = 0, h;
  h = session({ getDocFromServer: async reference => {
    const snapshot = await fs.getDocFromServer(reference);
    if (armed && ++reads === 3) await authSdk.updateCurrentUser(h.auth, h.auth.currentUser);
    return snapshot;
  } }); const data = input('customer');
  await h.registerAccount(data.email, password, data); await verified(h);
  const original = h.auth.currentUser; armed = true;
  await assert.rejects(h.completeVerifiedRegistration(), error => error.code === 'auth/registration-account-changed');
  assert.ok(h.auth.currentUser); assert.notEqual(h.auth.currentUser, original);
  assert.equal(h.auth.currentUser.uid, original.uid); assert.equal(h.verification.length, 1);
});
