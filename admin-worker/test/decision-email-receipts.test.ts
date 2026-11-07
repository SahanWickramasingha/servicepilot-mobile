import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTechnicianDecisionEmailService } from '../../functions/src/domain/technicianDecisionEmail';
import { ProviderError } from '../src/runtime';

type Row = Record<string, unknown>;
type Ref = { path: string; get: () => Promise<{ data: () => Row | undefined }> };
type Tx = { get: (ref: Ref) => Promise<{ data: () => Row | undefined }>; getAll: (...refs: Ref[]) => Promise<{ data: () => Row | undefined }[]>;
  set: (ref: Ref, row: Row) => void };
type Dependencies = Parameters<typeof createTechnicianDecisionEmailService>[0];

function fixture(provider: 'gmail' | 'resend' = 'gmail') {
  const rows = new Map<string, Row>([
    ['users/reviewer', { role: 'super_admin', accountStatus: 'active' }],
    ['users/tech', { uid: 'tech', role: 'technician', accountStatus: 'active', emailVerified: true, fullName: 'Test Technician',
      email: 'tech@example.test', technicianApprovalStatus: 'approved', reviewedBy: 'reviewer', reviewedAt: { seconds: 1777777777, nanoseconds: 1234 } }],
  ]);
  let clock = 1800000000000, calls = 0, queue = Promise.resolve(), loseCommit = false, loseRead = false;
  let send = async () => ({ id: 'provider-id' });
  const doc = (path: string): Ref => ({ path, get: async () => {
    if (loseRead && path.startsWith('technician_decision_emails/')) throw Error('receipt unavailable');
    return { data: () => rows.get(path) };
  } });
  const db = { doc, runTransaction: <T>(action: (tx: Tx) => Promise<T>): Promise<T> => {
    const operation = queue.then(async () => {
      const writes: [Ref, Row][] = [];
      const result = await action({ get: ref => ref.get(), getAll: (...refs) => Promise.all(refs.map(ref => ref.get())),
        set: (ref, row) => { writes.push([ref, row]); } });
      if (loseCommit && writes.some(([, row]) => row.status === 'submitted')) throw Error('receipt commit unavailable');
      for (const [ref, row] of writes) rows.set(ref.path, structuredClone(row));
      return result;
    });
    queue = operation.then(() => undefined, () => undefined);
    return operation;
  } };
  const auth = { verifyIdToken: async (_token: string, revoked: boolean) => { assert.equal(revoked, true); return { uid: 'reviewer', auth_time: 101 }; },
    getUser: async () => ({ email: 'tech@example.test', disabled: false }) };
  const engine = (patch: Partial<Dependencies> = {}) => createTechnicianDecisionEmailService({
    db: db as unknown as Dependencies['db'], auth: auth as unknown as Dependencies['auth'], provider, sender: 'sender@gmail.com',
    serverTimestamp: () => 'server-time', now: () => clock, sendEmail: async () => { calls++; return send(); }, ...patch,
  });
  return { rows, engine, calls: () => calls, advance: (ms: number) => { clock += ms; },
    sender: (next: typeof send) => { send = next; }, clock: () => clock,
    failReceipt: (unreadable = false) => { loseCommit = true; loseRead = unreadable; } };
}
const request = (engine: ReturnType<typeof createTechnicianDecisionEmailService>) => engine.request('Bearer fixture', { technicianUid: 'tech' });

test('Gmail receipt lease prevents concurrent submissions; submitted receipt suppresses every replay', async () => {
  const f = fixture(); let finish!: () => void;
  f.sender(() => new Promise(resolve => { finish = () => resolve({ id: 'gmail-id' }); }));
  const first = request(f.engine());
  while (!finish) await new Promise(setImmediate);
  const competing = await request(f.engine());
  assert.equal(competing.status, 'pending'); assert.equal(competing.retryable, false); assert.equal(f.calls(), 1);
  finish(); const completed = await first;
  assert.equal(completed.status, 'submitted'); assert.equal(completed.retryable, false);
  f.advance(25 * 60 * 60 * 1000);
  assert.equal((await request(f.engine())).status, 'submitted');
  assert.equal((await request(f.engine({ provider: 'resend' }))).status, 'submitted'); assert.equal(f.calls(), 1);
});

test('Gmail unknown outcomes stay non-retryable across time, configuration gaps and provider switches', async () => {
  const f = fixture(); f.sender(async () => { throw new ProviderError('email/outcome-unknown'); });
  const first = await request(f.engine());
  assert.equal(first.status, 'unknown'); assert.equal(first.retryable, false);
  f.advance(6000);
  for (const patch of [{}, { sender: undefined }, { provider: 'resend' as const }]) {
    const result = await request(f.engine(patch)); assert.equal(result.status, 'unknown'); assert.equal(result.retryable, false);
  }
  f.advance(25 * 60 * 60 * 1000);
  assert.equal((await request(f.engine())).retryable, false); assert.equal(f.calls(), 1);
});

test('Gmail crashed sending leases cannot restart after expiry or provider changes', async () => {
  const f = fixture();
  const initial = await f.engine().status('Bearer fixture', { technicianUid: 'tech' });
  f.rows.set('technician_decision_emails/' + initial.revision, { status: 'sending', provider: 'gmail',
    leaseUntilMs: f.clock() - 1, firstSendMs: f.clock() - 121000, everUncertain: false });
  const result = await request(f.engine()); assert.equal(result.status, 'unknown'); assert.equal(result.retryable, false);
  assert.equal((await request(f.engine({ provider: 'resend' }))).retryable, false); assert.equal(f.calls(), 0);
});

test('legacy uncertain Resend receipts cannot be sent through Gmail; safe Resend retries still work', async () => {
  const f = fixture('resend'); f.sender(async () => { throw new ProviderError('email/outcome-unknown'); });
  const first = await request(f.engine()); assert.equal(first.retryable, true);
  const stored = f.rows.get('technician_decision_emails/' + first.revision)!; delete stored.provider;
  f.advance(6000);
  assert.equal((await request(f.engine({ provider: 'gmail' }))).retryable, false); assert.equal(f.calls(), 1);
  f.sender(async () => ({ id: 'resend-retry' }));
  assert.equal((await request(f.engine())).status, 'submitted'); assert.equal(f.calls(), 2);
});

test('definitive pre-send/provider failures can retry Gmail after cooldown; missing settings never send', async () => {
  const f = fixture();
  assert.equal((await request(f.engine({ sender: undefined }))).status, 'not_configured'); assert.equal(f.calls(), 0);
  f.sender(async () => { throw new ProviderError('email/request-failed'); });
  const first = await request(f.engine()); assert.equal(first.status, 'failed'); assert.equal(first.retryable, true);
  await request(f.engine()); assert.equal(f.calls(), 1);
  f.advance(6000); f.sender(async () => ({ id: 'gmail-retry' }));
  assert.equal((await request(f.engine())).status, 'submitted'); assert.equal(f.calls(), 2);
});

test('Gmail lost final receipt acknowledgement cannot permit a resend even if its recovery read fails', async () => {
  for (const unreadable of [false, true]) {
    const f = fixture();
    f.sender(async () => { f.failReceipt(unreadable); return { id: 'gmail-accepted' }; });
    const result = await request(f.engine()); assert.equal(result.status, 'unknown'); assert.equal(result.retryable, false); assert.equal(f.calls(), 1);
  }
});

test('Gmail still requires the saved decision, reviewer access and matching authoritative Auth recipient', async () => {
  for (const role of ['super_admin', 'dispatcher']) {
    const f = fixture(); f.rows.set('users/reviewer', { role, accountStatus: 'active' });
    assert.equal((await request(f.engine())).status, 'submitted');
  }
  for (const patch of [{ email: 'victim@example.test' }, { accountStatus: 'disabled' }]) {
    const f = fixture(); Object.assign(f.rows.get('users/tech')!, patch);
    assert.equal((await request(f.engine())).status, 'failed'); assert.equal(f.calls(), 0);
  }
  const f = fixture(); f.rows.set('users/reviewer', { role: 'customer', accountStatus: 'active' });
  await assert.rejects(request(f.engine()), { code: 'permission-denied' }); assert.equal(f.calls(), 0);
  const pending = fixture(); Object.assign(pending.rows.get('users/tech')!, { technicianApprovalStatus: 'pending' });
  await assert.rejects(request(pending.engine()), { code: 'decision-unavailable' }); assert.equal(pending.calls(), 0);
});
