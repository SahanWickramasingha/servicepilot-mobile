// Current regressions plus a pinned historical control for the original defect.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';
const require = createRequire(import.meta.url), ts = require('typescript');
function evaluate(source, dependencies) {
  const exports = {}, code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, id => { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; });
  return exports;
}
for (const revision of ['working-tree', 'historical-baseline']) {
  test(`${revision}: terminal account-listener failure must invalidate an earlier asynchronous access check`, async () => {
    let authListener, nextProfile, profileError, resolveToken;
    const events = [], user = { uid: 'fixture', getIdTokenResult: () => new Promise(done => { resolveToken = done; }) }, auth = { currentUser: user };
    const source = revision === 'working-tree' ? readFileSync('src/services/account-session.service.ts', 'utf8') :
      execFileSync('git', ['show', '2102ae09910e96650697098465d3dd7cad06cf33:src/services/account-session.service.ts'], { encoding: 'utf8', windowsHide: true });
    const service = evaluate(source, {
      'firebase/auth': { onAuthStateChanged: (_, callback) => { authListener = callback; return () => {}; } },
      'firebase/firestore': { doc: () => ({}), onSnapshot: (_, ...args) => { const [next, error] = args.slice(-2); nextProfile = next; profileError = error; return () => {}; } },
      '@/src/firebase/config': { auth, db: {} }, '@/functions/src/domain/accountSession': loadService('functions/src/domain/accountSession.ts', {}),
      './profile-initialization.service': loadService('src/services/profile-initialization.service.ts', {}),
      './onboarding-draft.service': { clearOnboardingDraftUnless() {} },
    });
    const stop = service.observeAccountSession({ allowed: () => events.push('allowed'), denied: () => events.push('denied'), error: () => events.push('error') });
    try {
      authListener(user);
      const running = nextProfile({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => ({ accountStatus: 'active', sessionRevokedAt: 100 }) });
      profileError(Object.assign(new Error('Terminal listener failure'), { code: 'permission-denied' }));
      resolveToken({ claims: { auth_time: 101 } }); await running;
      assert.deepEqual(events, revision === 'historical-baseline' ? ['error', 'allowed'] : ['error'],
        revision === 'historical-baseline' ? 'Record the historical defect independently of future commits.' : 'An older token result must not reopen access after the live listener has terminated.');
    } finally { stop(); }
  });
}

test('registration initialization completion must not reuse a snapshot after its listener terminates', async () => {
  let authListener, nextProfile, profileError;
  const events = [], user = { uid: 'fixture', email: 'fixture@example.test' }, auth = { currentUser: user };
  const initialization = loadService('src/services/profile-initialization.service.ts', {});
  const window = initialization.beginProfileInitialization(user.email);
  const service = loadService('src/services/account-session.service.ts', {
    'firebase/auth': { onAuthStateChanged: (_, callback) => { authListener = callback; return () => {}; } },
    'firebase/firestore': { doc: () => ({}), onSnapshot: (_, ...args) => { const [next, error] = args.slice(-2); nextProfile = next; profileError = error; return () => {}; } },
    '@/src/firebase/config': { auth, db: {} }, '@/functions/src/domain/accountSession': loadService('functions/src/domain/accountSession.ts', {}),
    './profile-initialization.service': initialization,
    './onboarding-draft.service': { clearOnboardingDraftUnless() {} },
  });
  const stop = service.observeAccountSession({ allowed: () => events.push('allowed'), denied: () => events.push('denied'), error: () => events.push('error') });
  try {
    authListener(user); await nextProfile({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => ({ accountStatus: 'active' }) });
    profileError(new Error('Terminal listener failure')); window.finish();
    assert.deepEqual(events, ['error'], 'Ending registration must not reopen a gate whose status listener has terminated.');
  } finally { window.finish(); stop(); }
});

test('token verification failure stays blocked through registration completion; a disabled snapshot still denies immediately', async () => {
  let authListener, nextProfile;
  const events = [], user = { uid: 'fixture', email: 'fixture@example.test', getIdTokenResult: async () => { throw new Error('Offline'); } }, auth = { currentUser: user };
  const initialization = loadService('src/services/profile-initialization.service.ts', {}), window = initialization.beginProfileInitialization(user.email);
  const service = loadService('src/services/account-session.service.ts', {
    'firebase/auth': { onAuthStateChanged: (_, callback) => { authListener = callback; return () => {}; } },
    'firebase/firestore': { doc: () => ({}), onSnapshot: (_, ...args) => { const next = typeof args[0] === 'function' ? args[0] : args[1]; nextProfile = next; return () => {}; } },
    '@/src/firebase/config': { auth, db: {} }, '@/functions/src/domain/accountSession': loadService('functions/src/domain/accountSession.ts', {}),
    './profile-initialization.service': initialization,
    './onboarding-draft.service': { clearOnboardingDraftUnless() {} },
  });
  const stop = service.observeAccountSession({ allowed: () => events.push('allowed'), denied: () => events.push('denied'), error: () => events.push('error') });
  try {
    authListener(user); await nextProfile({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => ({ sessionRevokedAt: 100 }) });
    window.finish(); assert.deepEqual(events, ['error']);
    await nextProfile({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => ({ accountStatus: 'disabled' }) });
    assert.deepEqual(events, ['error', 'denied']);
  } finally { window.finish(); stop(); }
});

test('LiveAccountGate blocks errors, retries using a new observer and keeps disabled-account denial/signout', async () => {
  const observers = []; let signouts = 0;
  const h = renderHarness('src/components/auth/LiveAccountGate.tsx', { effects: true, exportName: 'LiveAccountGate', dependencies: {
    'expo-router': { router: { replace() {} } },
    '@/src/services/user.service': { getMobileAccessDecision: () => ({ allowed: true }) },
    '@/src/services/auth.service': { logoutRevokedUser: async () => { signouts++; } },
    '@/src/services/account-session.service': { observeAccountSession: callbacks => {
      const item = { callbacks, stopped: false }; observers.push(item); return () => { item.stopped = true; };
    } },
  } });
  const render = () => h.render({ children: 'protected-content' }); render();
  observers[0].callbacks.error('Unable to verify access'); render();
  assert.equal(h.elements().find(item => item.type === 'Modal').props.visible, true);
  assert.equal(h.elements().find(item => item.props.children === 'protected-content').props.pointerEvents, 'none');
  assert.equal(signouts, 0);
  await h.elements().find(item => item.type === 'TouchableOpacity').props.onPress(); render();
  assert.equal(observers[0].stopped, true); assert.equal(observers.length, 2);
  assert.equal(h.elements().find(item => item.type === 'Modal').props.visible, true);
  observers[1].callbacks.allowed({ role: 'customer', emailVerified: true }, { uid: 'fixture' }, true); render();
  assert.equal(h.elements().find(item => item.type === 'Modal').props.visible, false);
  observers[1].callbacks.denied('Account disabled'); render();
  assert.equal(signouts, 1); assert.equal(h.elements().find(item => item.type === 'Modal').props.visible, true);
  h.cleanup();
});

test('callable map session enforcement succeeds with its actual category dependency supplied', async () => {
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const api = loadService('functions/src/services/map.service.ts', {
    'firebase-functions/v2/https': { HttpsError }, '../domain/accountSession': loadService('functions/src/domain/accountSession.ts', {}),
    '../domain/map': { DISTRICTS: [{ id: 'kandy' }] },
  });
  for (const [profile, authTime, allowed] of [[{ role: 'customer', accountStatus: 'disabled' }, 200, false],
    [{ role: 'customer', lifecyclePending: true }, 200, false], [{ role: 'customer', sessionRevokedAt: 100 }, 100, false],
    [{ role: 'customer', sessionRevokedAt: 100 }, 101, true]]) {
    let reads = 0; const query = { where: () => query, get: async () => ({ docs: [] }) };
    const db = { doc: () => ({ get: async () => ({ data: () => profile }) }), collection: () => { reads++; return query; } };
    const running = api.readMapTechnicians(db, { uid: 'local', token: { email_verified: true, auth_time: authTime } }, { districtId: 'kandy' });
    if (allowed) assert.deepEqual(await running, []); else await assert.rejects(running, error => error.code === 'permission-denied');
    assert.equal(reads, allowed ? 1 : 0);
  }
});

test('current request form prevents duplicate taps with current state layout and native upload dependencies isolated', async () => {
  const auth = { currentUser: { uid: 'customer' } }, tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const initial = [{ uid: 'customer', role: 'customer' }, { uid: 'tech', availability: 'available', specialization: 'Electrical' },
    'Electrical', 'Repair', 'Description', 'Private fixture', 'Kandy', tomorrow, false, '11:00 AM', '60', 'normal', [], false, false, ''];
  initial[20] = false; initial[21] = false; initial[22] = ''; initial[23] = '';
  let writes = 0, rejectWrite;
  const h = renderHarness('app/(tabs)/create-request.tsx', { initial, dependencies: {
    'expo-router': { useLocalSearchParams: () => ({ technicianId: 'tech' }), router: { replace() {} } }, '@/src/firebase/config': { auth },
    '@react-native-community/datetimepicker': { __esModule: true, default: 'DateTimePicker' },
    '@/src/services/user.service': {}, '@/src/services/technician.service': {},
    '@/src/services/requestAttachments.service': { cleanupUnsubmittedPhotos: async () => {} },
    '@/src/components/technicians/AvailabilityBadge': { AvailabilityBadge: 'AvailabilityBadge' },
    '@/src/components/technicians/TechnicianRating': { TechnicianRating: 'TechnicianRating' },
    '@/src/utils/requestSubmissionDiagnostics': { submissionFailureMessage: () => 'Test failure', reportSubmissionFailure() {} },
    '@/src/services/request.service': { createServiceRequestAttemptId: () => 'abcdefghijklmnopqrst',
      createServiceRequest: () => { writes++; return new Promise((_, reject) => { rejectWrite = reject; }); } },
  } });
  h.render(); const submit = h.elements().find(element => element.type === 'TouchableOpacity' && element.props.onPress?.name === 'handleSubmit').props.onPress;
  const first = submit(), duplicate = submit(); assert.equal(writes, 1);
  rejectWrite(new Error('Local rejected write')); await Promise.all([first, duplicate]);
});
