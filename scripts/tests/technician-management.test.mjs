import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const domain = name => require('../../functions/lib/domain/' + name + '.js');
function load(path, dependencies) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8').replaceAll('import.meta.env.DEV', 'false'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(exports, id => {
    if (id in dependencies) return dependencies[id];
    const match = id.match(/functions\/src\/domain\/(\w+)$/); if (match) return domain(match[1]);
    throw Error('Missing test dependency ' + id);
  });
  return exports;
}
const presentation = load('admin-web/src/components/technicians/technicianPresentation.ts', {});
const applicant = (id = 'tech', patch = {}) => ({ id, uid: id, role: 'technician', email: id + '@example.test', fullName: id,
  emailVerified: true, technicianApprovalStatus: 'pending', phone: '123', address: 'Private street', specialization: 'Electrical', ...patch });

test('review controls require the existing complete verified pending predicate and matching saved identity', () => {
  assert.equal(presentation.canReviewApplication(applicant()), true, 'complete legacy record remains eligible');
  for (const patch of [{ emailVerified: false }, { accountStatus: 'disabled' }, { lifecyclePending: true }, { phone: '' },
    { technicianApprovalStatus: 'approved' }, { technicianApprovalStatus: 'rejected' }, { uid: 'someone-else' }]) {
    assert.equal(presentation.canReviewApplication(applicant('tech', patch)), false);
  }
});
test('service area and reviewer labels use safe saved data and never use audit UIDs as names', () => {
  assert.equal(presentation.serviceAreaLabel(applicant('tech', { serviceDistrictIds: ['kandy'], serviceAreasByDistrict: { kandy: 'lk-postal-20400-peradeniya' } })), 'Peradeniya, Kandy');
  assert.equal(presentation.serviceAreaLabel(applicant('tech', { serviceDistrictIds: ['kandy'] })), 'Kandy');
  assert.equal(presentation.serviceAreaLabel(applicant('tech', { serviceDivision: 'Legacy service division' })), 'Legacy service division');
  assert.equal(presentation.serviceAreaLabel(applicant()), 'Not provided', 'no street address inference');
  assert.equal(presentation.reviewerLabel(applicant('tech', { reviewedBy: 'reviewer' }), { id: 'reviewer', fullName: 'Authorized Reviewer' }), 'Authorized Reviewer');
  assert.equal(presentation.reviewerLabel(applicant('tech', { reviewedBy: 'raw-uid' }), { id: 'reviewer', fullName: 'Authorized Reviewer' }), 'Reviewer unavailable');
  assert.equal(presentation.isReviewConflict(Error('Application already reviewed, unverified or incomplete. Refresh the applications list.')), true);
  assert.equal(presentation.isReviewConflict({ code: 'aborted' }), true);
  assert.equal(presentation.isReviewConflict({ code: 'permission-denied' }), false);
});

function hookFixture() {
  let cursor = 0; const slots = [], tasks = [], streams = [];
  const same = (a, b) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useEffect(effect, deps) { const i = cursor++, previous = slots[i]; if (!previous || !same(previous.deps, deps)) tasks.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; }); },
  };
  const sdk = { collection: (_, path) => path, where: (...args) => ({ where: args }), limit: value => ({ limit: value }), documentId: () => '__name__',
    orderBy: field => ({ orderBy: field }), startAfter: value => ({ startAfter: value }), query: (...parts) => parts,
    onSnapshot(query, options, next, error) { const stream = { query, options, next, error, stopped: false }; streams.push(stream); return () => { stream.stopped = true; }; } };
  const hook = load('admin-web/src/hooks/useTechnicianUsers.ts', { react, 'firebase/firestore': sdk, 'firebase/app': { FirebaseError: class extends Error {} },
    '../firebase/config': { db: {} }, '../utils/format': { timestampMillis: () => 0 } }).useTechnicianUsers;
  const props = { paginated: true, status: 'pending', page: 'admin/applications', queryType: 'pending-technicians' };
  const render = () => { cursor = 0; const value = hook(props); while (tasks.length) tasks.shift()(); return value; };
  const state = () => { render(); return render(); };
  const emit = (rows, cached = false, stream = streams.at(-1)) => stream.next({ metadata: { fromCache: cached }, size: rows.length, docs: rows.map(row => ({ id: row.id, data: () => row })) });
  return { props, state, streams, emit, cleanup() { for (const slot of slots) slot?.cleanup?.(); } };
}
test('cursor pagination is bounded to 50 raw records, supports Previous, and resets on status changes', () => {
  const f = hookFixture(); f.state(); const first = f.streams[0];
  assert.ok(first.query.some(c => c.limit === 50));
  assert.ok(first.query.some(c => c.orderBy === '__name__'));
  assert.ok(first.query.some(c => JSON.stringify(c.where) === JSON.stringify(['emailVerified', '==', true])));
  const rows = Array.from({ length: 50 }, (_, i) => applicant(String(i).padStart(2, '0'), i ? { phone: '' } : {}));
  f.emit(rows); let state = f.state(); assert.equal(state.data.length, 1); assert.equal(state.hasMore, true);
  state.loadMore(); state = f.state(); assert.equal(state.pageNumber, 2); assert.equal(state.hasPrevious, true); assert.equal(first.stopped, true);
  assert.ok(f.streams[1].query.some(c => c.startAfter === '49'), 'cursor uses last raw record, not last visible applicant');
  f.emit([]); state = f.state(); assert.equal(state.data.length, 0); assert.equal(state.hasMore, false); assert.equal(state.hasPrevious, true);
  state.previousPage(); state = f.state(); assert.equal(state.pageNumber, 1); assert.equal(state.hasPrevious, false);
  assert.ok(!f.streams.at(-1).query.some(c => 'startAfter' in Object(c)));
  f.props.status = 'approved'; state = f.state(); assert.equal(state.pageNumber, 1);
  assert.ok(!f.streams.at(-1).query.some(c => c.where?.[0] === 'emailVerified'));
  f.cleanup(); assert.ok(f.streams.every(s => s.stopped));
});
test('server confirmation, Retry and listener cleanup keep failures distinct from confirmed empty', () => {
  const f = hookFixture(); f.state(); const original = f.streams[0];
  f.emit([], true); assert.equal(f.state().loading, true);
  original.error(new Error('offline')); let state = f.state(); assert.ok(state.error); assert.equal(state.loading, false);
  state.retry(); state = f.state(); assert.equal(original.stopped, true); assert.equal(state.loading, true);
  f.emit([applicant('obsolete')], false, original); assert.equal(f.state().data.length, 0, 'closed callbacks cannot restore old data');
  f.emit([]); state = f.state(); assert.equal(state.error, ''); assert.equal(state.loading, false); assert.deepEqual(state.data, []);
  f.cleanup();
});
