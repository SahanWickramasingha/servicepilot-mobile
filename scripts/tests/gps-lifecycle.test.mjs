import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHarness } from '../lib/performance-render-harness.mjs';
import { sessionFixture } from '../lib/subscription-reliability-workloads.mjs';
const tick = () => new Promise(setImmediate);
function fixture() {
  const session = sessionFixture(), profiles = [], events = [], observers = new Set();
  const h = renderHarness('src/components/maps/TechnicianLocationLifecycle.tsx', { effects: true, exportName: 'TechnicianLocationLifecycle', dependencies: {
    '@/src/firebase/config': { auth: session.auth }, 'firebase/auth': session.sdk,
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, callback) => { observers.add(callback); return { remove: () => observers.delete(callback) }; } } },
    '@/src/services/user.service': { subscribeToUserProfile: (uid, next, error) => { const profile = { uid, next, error, stopped: false }; profiles.push(profile); return () => { profile.stopped = true; }; } },
    '@/src/services/foreground-location.service': { foregroundSharing: { setSession: async (uid) => events.push(['session', uid]), cleanup: async () => events.push(['cleanup']), setActive: async (state) => events.push(['active', state]) } },
    '@/src/services/location.service': { syncOwnMapProfile: async (uid) => events.push(['sync', uid]) },
  } });
  h.render();
  const login = (uid) => { session.emit(uid); if (session.auth.currentUser) { session.auth.currentUser.emailVerified = true; session.auth.currentUser.getIdTokenResult = async () => ({ claims: { auth_time: 101 } }); } };
  return { session, profiles, events, observers, h, login };
}
const approved = { role: 'technician', technicianApprovalStatus: 'approved', accountStatus: 'active' };
test('obsolete profile callbacks cannot restore a GPS session or public sync after account switching or unmount', async () => {
  const f = fixture(); f.login('tech-a'); const old = f.profiles.at(-1); await old.next(approved);
  f.login('tech-b'); const current = f.profiles.at(-1); assert.equal(old.stopped, true);
  const before = f.events.length; await old.next(approved); old.error(); assert.equal(f.events.length, before);
  await current.next(approved); assert.ok(f.events.some(([action, uid]) => action === 'session' && uid === 'tech-b'));
  f.h.cleanup(); const after = f.events.length; await current.next(approved); current.error(); assert.equal(f.events.length, after);
  assert.equal(f.observers.size, 0); assert.equal(f.session.observers(), 0);
});
test('pending lifecycle and revoked logins stop GPS; reactivation never enables sharing automatically', async () => {
  const f = fixture(); f.login('tech-a'); const profile = f.profiles.at(-1);
  for (const patch of [{ accountStatus: 'disabled' }, { accountStatus: 'deleted' }, { lifecyclePending: true }, { sessionRevokedAt: 101 }]) {
    const start = f.events.length; await profile.next({ ...approved, ...patch });
    assert.ok(f.events.slice(start).some(([action]) => action === 'cleanup'));
    assert.ok(!f.events.slice(start).some(([action, uid]) => action === 'session' && uid));
  }
  await profile.next({ ...approved, sessionRevokedAt: 100 });
  assert.ok(f.events.some(([action, uid]) => action === 'session' && uid === 'tech-a'));
  assert.ok(!f.events.some(([action]) => action === 'enable')); f.h.cleanup();
});
test('a token verification completing after logout cannot restart tracking; foreground observers clean up', async () => {
  const f = fixture(); f.login('tech-a'); let resolve;
  f.session.auth.currentUser.getIdTokenResult = () => new Promise((yes) => { resolve = yes; });
  const pending = f.profiles.at(-1).next({ ...approved, sessionRevokedAt: 100 });
  f.login(null); const count = f.events.length; resolve({ claims: { auth_time: 200 } }); await pending; await tick();
  assert.equal(f.events.length, count);
  for (const observer of f.observers) { observer('background'); observer('active'); }
  assert.deepEqual(f.events.slice(-2), [['active', false], ['active', true]]); f.h.cleanup();
});
