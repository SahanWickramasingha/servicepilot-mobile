import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService, sessionFixture } from '../lib/subscription-reliability-workloads.mjs';
import { renderHarness } from '../lib/performance-render-harness.mjs';
const { workElapsedMs } = loadService('functions/src/domain/workTimer.ts', {});
const stamp = (value) => ({ toMillis: () => value });

test('timestamp duration survives navigation/restart, freezes while paused/finalized, excludes pauses and clamps clock rollback', () => {
  const timer = { elapsedMs: 2000, runningSince: stamp(10000), pausedAt: null, revision: 2 };
  assert.equal(workElapsedMs(timer, undefined, undefined, 20000), 12000);
  assert.equal(workElapsedMs({ ...timer }, undefined, undefined, 40000), 32000);
  assert.equal(workElapsedMs({ ...timer, pausedAt: stamp(14000) }, undefined, undefined, 999999), 6000);
  assert.equal(workElapsedMs({ ...timer, elapsedMs: 6000, runningSince: stamp(30000) }, undefined, stamp(35000), 999999), 11000);
  assert.equal(workElapsedMs(undefined, stamp(1000), stamp(9000)), 8000);
  assert.equal(workElapsedMs(undefined), 0);
  assert.equal(workElapsedMs(timer, undefined, undefined, 5000), 2000);
  assert.equal(workElapsedMs({ ...timer, elapsedMs: NaN }), 0);
  assert.equal(workElapsedMs({ ...timer, runningSince: stamp(10000.9), pausedAt: stamp(14000.1) }), 6000);
});

function fixture() {
  const session = sessionFixture(); session.emit('tech'); session.auth.currentUser.emailVerified = true;
  const job = { status: 'in_progress', technicianId: 'tech', startedAt: stamp(1000) };
  const profile = { role: 'technician', technicianApprovalStatus: 'approved' };
  let clock = 5000, writes = 0;
  const service = loadService('src/services/request.service.ts', {
    '@/src/firebase/config': { auth: session.auth, db: {} },
    '@/src/constants/serviceRequests': {}, '@/functions/src/domain/availability': {},
    'firebase/firestore': { doc: (_, collection, id) => ({ collection, id }),
      serverTimestamp: () => stamp(clock),
      runTransaction: async (_, run) => run({
        get: async (ref) => ({ data: () => ref.collection === 'users' ? profile : job }),
        update: (_, changes) => { Object.assign(job, changes); writes++; },
      }),
    },
  });
  return { service, session, job, profile, writes: () => writes, now: (value) => { clock = value; } };
}

test('persisted pause/resume is idempotent, excludes server-recorded pauses and refuses stale revisions and accounts', async () => {
  const f = fixture();
  await f.service.setJobTimerPaused('job', true, 0);
  assert.equal(f.job.workTimer.pausedAt.toMillis(), 5000);
  await f.service.setJobTimerPaused('job', true, 0); assert.equal(f.writes(), 1);
  f.now(10000); await f.service.setJobTimerPaused('job', false, 1);
  assert.equal(f.job.workTimer.elapsedMs, 4000);
  assert.equal(workElapsedMs(f.job.workTimer, undefined, undefined, 12000), 6000);
  await assert.rejects(f.service.setJobTimerPaused('job', true, 1), /another screen/);
  f.profile.accountStatus = 'disabled'; await assert.rejects(f.service.setJobTimerPaused('job', true, 2), /active/);
  f.profile.accountStatus = 'active'; f.job.status = 'completed'; await assert.rejects(f.service.setJobTimerPaused('job', true, 2), /in-progress/);
  f.session.emit('other'); await assert.rejects(f.service.setJobTimerPaused('job', true, 2));
  assert.equal(f.writes(), 2);
});

test('job screen updates its checklist from saved evidence and restores elapsed time on reopening without writing per tick', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 11000, evidence = null, writes = 0;
  t.mock.method(Date, 'now', () => now);
  const request = { id: 'job', status: 'in_progress', technicianId: 'tech', title: 'Repair', startedAt: stamp(1000) };
  const deps = {
    'expo-router': { router: { back() {} } }, '@/src/firebase/config': { auth: { currentUser: { uid: 'tech' } } },
    '@/src/hooks/useTechnicianRequest': { useTechnicianRequest: () => ({ request, requestId: 'job', loading: false, errorMessage: '' }) },
    '@/src/hooks/useJobEvidence': { useJobEvidence: () => ({ evidence, confirmed: true, error: '' }) },
    '@/src/services/request.service': { setJobTimerPaused: async () => { writes++; }, updateTechnicianRequestStatus: async () => { writes++; } },
  };
  const create = () => renderHarness('app/technician/job-action.tsx', { effects: true, dependencies: deps });
  let h = create(); h.render();
  assert.ok(h.elements().some((e) => e.type === 'Text' && e.props.children === '00:00:10'));
  assert.ok(h.elements().filter((e) => e.type?.name === 'ActionCard').every((e) => e.props.completed === false));
  evidence = { beforePhotos: ['saved-before'], notes: { diagnosis: 'Saved' }, afterPhotos: [], signature: undefined };
  h.render(); assert.deepEqual(h.elements().filter((e) => e.type?.name === 'ActionCard').map((e) => e.props.completed), [true, true, false, false]);
  h.cleanup(); now = 121000; h = create(); h.render();
  assert.ok(h.elements().some((e) => e.type === 'Text' && e.props.children === '00:02:00'));
  now = 122000; t.mock.timers.tick(1000); h.render();
  assert.ok(h.elements().some((e) => e.type === 'Text' && e.props.children === '00:02:01'));
  assert.equal(writes, 0); h.cleanup();
});
