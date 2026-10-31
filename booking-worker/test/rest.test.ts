import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firestoreStore, values } from '../src/firestore';

test('REST carries transaction tokens through reads/queries/commit, transforms, masks and exists preconditions', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const requests: { path: string; body: any }[] = [];
  globalThis.fetch = async (url, options) => {
    const path = String(url).split('/documents')[1], body = JSON.parse(String(options?.body)); requests.push({ path, body });
    const root = 'projects/demo-worker/databases/(default)/documents';
    return Response.json(path === ':beginTransaction' ? { transaction: 'tx-1' } : path === ':batchGet' ?
      [{ missing: root + '/users/a' }, { found: { name: root + '/service_requests/job', fields: { status: { stringValue: 'pending' } } } }] :
      path === ':runQuery' ? [{ document: { name: root + '/service_requests/other', fields: { scheduledAt: { timestampValue: '2099-10-10T04:30:00.123456Z' } } } }] : {});
  };
  const db = firestoreStore({ project: 'demo-worker', token: async () => 'synthetic-oauth' });
  await db.runTransaction(async tx => {
    const docs = await tx.getAll(db.doc('service_requests/job'), db.doc('users/a'));
    assert.equal(docs[0].data()?.status, 'pending'); assert.equal(docs[1].data(), undefined);
    const result = await tx.get(db.collection('service_requests').where('technicianId', '==', 'tech').where('status', 'in', ['accepted']).limit(501));
    assert.equal(result.docs[0].data().scheduledAt.toMillis(), Date.parse('2099-10-10T04:30:00Z') + 123.456);
    tx.update(db.doc('service_requests/job'), { status: 'accepted', scheduleProposal: values.deleteField(), updatedAt: values.serverTimestamp(), scheduledAt: values.timestamp(1000) });
    tx.set(db.doc('booking_schedule_locks/tech.தமிழ்'), { revision: 1, updatedAt: values.serverTimestamp() });
  });
  for (const row of requests.slice(1)) assert.equal(row.body.transaction, 'tx-1');
  const commit = requests.at(-1)!.body, write = commit.writes[0];
  assert.deepEqual(write.currentDocument, { exists: true });
  assert.deepEqual(write.updateMask.fieldPaths, ['status', 'scheduleProposal', 'scheduledAt']);
  assert.equal(write.update.fields.scheduleProposal, undefined);
  assert.deepEqual(write.updateTransforms, [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]);
  assert.equal(commit.writes[1].updateMask, undefined);
});

test('definite ABORTED restarts the entire transaction; an ambiguous commit is never blindly retried', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let begins = 0, commits = 0, callbacks = 0, ambiguous = false;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith(':beginTransaction')) { begins++; if (begins === 2) assert.equal(body.options.readWrite.retryTransaction, 'tx-1'); return Response.json({ transaction: 'tx-' + begins }); }
    if (String(url).endsWith(':commit')) {
      commits++;
      if (ambiguous) throw new TypeError('synthetic lost response');
      if (commits === 1) return Response.json({ error: { status: 'ABORTED' } }, { status: 409 });
    }
    return Response.json({});
  };
  const make = () => firestoreStore({ project: 'demo-worker', token: async () => 'synthetic' });
  await make().runTransaction(async () => { callbacks++; return 1; });
  assert.equal(callbacks, 2); assert.equal(begins, 2); assert.equal(commits, 2);
  ambiguous = true;
  await assert.rejects(make().runTransaction(async () => 1), (error: any) => error.code === 'booking/commit-outcome-unknown');
  assert.equal(begins, 3); assert.equal(commits, 3);
});
