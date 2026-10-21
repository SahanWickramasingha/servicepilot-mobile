import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { performanceTestDependency } from "../lib/performance-test-deps.mjs";
import { renderHarness } from "../lib/performance-render-harness.mjs";

function load(path, deps = {}) {
  const result = {};
  new Function("exports", "require", ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(result, (id) => {
    if (id in deps) return deps[id];
    const shared = performanceTestDependency(id, deps); if (shared) return shared;
    if (id === "./technicianRating") return rating;
    throw new Error(`Missing dependency ${id}`);
  }); return result;
}
const rating = load("src/utils/technicianRating.ts");
const paging = load("src/utils/reviewPagination.ts", { "@/src/services/technician.service": { TECHNICIAN_REVIEWS_PAGE_SIZE: 20 } });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const stamp = (n) => ({ toMillis: () => n });
const row = (n) => ({ id: `review-${n}`, requestId: `request-${n}`, technicianId: "tech-a", customerId: "customer-a", customerName: "Bandara", rating: n % 5 + 1,
  comment: `Feedback ${n}`, photoPaths: n === 44 ? ["saved-photo"] : [], createdAt: stamp(n) });
const rows = (start, end) => Array.from({ length: start - end + 1 }, (_, index) => row(start - index));
const cursor = (n) => ({ kind: "dated", id: `review-${n}`, createdAt: stamp(n), includeUndated: false });
const meta = { fromCache: false, hasPendingWrites: false };

function serviceFixture() {
  const auth = { currentUser: { uid: "customer" } }, listeners = [], values = [], errors = [];
  let changed, total = 43, dated = 43, aggregates = 0, reads = 0, head = rows(43, 24);
  let failRead, failAggregate, pendingAggregate;
  auth.onAuthStateChanged = (callback) => { changed = callback; return () => {}; };
  const snapshot = () => ({ docs: head.map((data) => ({ id: data.id, data: () => data })), metadata: meta });
  const sdk = { collection: (_, name) => name, where: (...args) => args, query: (...args) => args, orderBy: (...args) => args,
    documentId: () => "__name__", limit: (n) => ["limit", n], count: () => "count", average: () => "average",
    getAggregateFromServer: async () => { aggregates++; if (pendingAggregate) await pendingAggregate;
      if (failAggregate) throw failAggregate;
      return { data: () => ({ count: total, average: 3 }) }; },
    getCountFromServer: async () => ({ data: () => ({ count: dated }) }),
    getDocsFromServer: async () => { reads++; await tick(); if (failRead) throw failRead; return snapshot(); },
    onSnapshot: (query, options, next, error) => { const listener = { query, options, next, error, stopped: false }; listeners.push(listener); return () => { listener.stopped = true; }; },
  };
  const service = load("src/services/technician.service.ts", { "firebase/firestore": sdk, "@/src/firebase/config": { auth, db: {} },
    "@/src/constants/serviceRequests": {}, "@/functions/src/domain/map": {}, "@/functions/src/domain/serviceAreas": {},
    "@/functions/src/domain/mapProjection": {}, "@/functions/src/domain/availability": {}, "@/src/utils/technicianRating": rating });
  return { auth, service, values, errors, listeners, snapshot, stats: () => ({ aggregates, reads }),
    subscribe: (id = "tech-a") => service.subscribeToTechnicianReviews(id, (reviews, metadata, summary, cursor) => values.push({ reviews, metadata, summary, cursor }), (error) => errors.push(error)),
    set: (nextTotal, nextDated = nextTotal, nextHead = head) => { total = nextTotal; dated = nextDated; head = nextHead; },
    fail: (code) => { failRead = code ? Object.assign(new Error("Local simulated failure"), { code }) : undefined; },
    failSummary: (code) => { failAggregate = code ? Object.assign(new Error("The query requires an index."), { code }) : undefined; },
    hold: (promise) => { pendingAggregate = promise; }, account: (uid) => { auth.currentUser = { uid }; changed(); },
  };
}
test("shared focus invalidation refreshes full totals with an unchanged head, bounds reads and coalesces all card consumers", async () => {
  const f = serviceFixture(), stops = Array.from({ length: 5 }, () => f.subscribe());
  try {
    f.listeners[0].next(f.snapshot()); await tick();
    assert.equal(f.listeners.length, 1); assert.equal(f.values.at(-1).summary.count, 43); assert.equal(f.values.at(-1).reviews.length, 20);
    f.set(44, 43); // A legacy review outside the dated head; no listener event.
    for (let i = 0; i < 5; i++) f.service.refreshTechnicianReviews("tech-a");
    assert.equal(f.values.at(-1).metadata.fromCache, true);
    await tick(); await tick();
    assert.deepEqual(f.stats(), { aggregates: 2, reads: 1 });
    assert.equal(f.values.at(-1).summary.count, 44); assert.equal(f.values.at(-1).cursor.includeUndated, true);
    assert.ok(JSON.stringify(f.listeners[0].query).includes('["limit",20]'));
  } finally { stops.forEach((stop) => stop()); }
});
test("cache-only transitions are stale, network recovery revalidates, and terminal query errors reconnect on focus", async () => {
  const f = serviceFixture(), stop = f.subscribe();
  try {
    f.listeners[0].next(f.snapshot()); await tick();
    f.listeners[0].next({ ...f.snapshot(), metadata: { ...meta, fromCache: true } });
    assert.equal(f.values.at(-1).metadata.fromCache, true); assert.equal(f.values.at(-1).summary.count, 43);
    f.fail("unavailable"); f.service.refreshTechnicianReviews("tech-a"); await tick(); await tick();
    assert.equal(f.errors.at(-1).code, "unavailable");
    f.fail(null); f.service.refreshTechnicianReviews("tech-a"); await tick(); await tick();
    assert.equal(f.values.at(-1).metadata.fromCache, false);
    f.listeners[0].error(Object.assign(new Error("Missing index"), { code: "failed-precondition" }));
    const length = f.values.length; f.listeners[0].next(f.snapshot()); assert.equal(f.values.length, length);
    f.service.refreshTechnicianReviews("tech-a"); assert.equal(f.listeners.length, 2); assert.equal(f.listeners[0].stopped, true);
    f.listeners[1].next(f.snapshot()); await tick(); assert.equal(f.values.at(-1).summary.count, 43);
  } finally { stop(); }
});
test("Retry replaces a failed listener or aggregate request after index readiness, coalesces taps and ignores obsolete callbacks", async () => {
  for (const stage of ["listener", "aggregate"]) {
    const f = serviceFixture(), stop = f.subscribe();
    try {
      if (stage === "listener") f.listeners[0].error(Object.assign(new Error("The query requires an index."), { code: "failed-precondition" }));
      else { f.failSummary("failed-precondition"); f.listeners[0].next(f.snapshot()); await tick(); }
      assert.equal(f.errors.at(-1).code, "failed-precondition");
      assert.equal(f.values.filter((value) => value.summary !== null).length, 0, "A failed aggregate cannot publish a fake zero or incomplete summary");
      f.failSummary(null);
      for (let tap = 0; tap < 5; tap++) f.service.retryTechnicianReviews("tech-a");
      assert.equal(f.listeners.length, 2); assert.equal(f.listeners[0].stopped, true);
      const before = f.values.length;
      f.listeners[0].next(f.snapshot()); assert.equal(f.values.length, before);
      f.listeners[1].next(f.snapshot()); await tick();
      assert.equal(f.values.at(-1).summary.count, 43); assert.equal(f.values.at(-1).metadata.fromCache, false);
    } finally { stop(); }
  }
});

test("subsequent aggregate deadlines are bounded and account changes reject in-flight refreshes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = serviceFixture(), stop = f.subscribe(); let resolve;
  try {
    f.listeners[0].next(f.snapshot()); await tick();
    f.hold(new Promise((yes) => { resolve = yes; })); f.set(44, 44, rows(44, 25)); f.listeners[0].next(f.snapshot());
    t.mock.timers.tick(15000); assert.equal(f.errors.at(-1).code, "unavailable");
    f.account("another-customer"); const length = f.values.length;
    resolve(); await tick(); assert.equal(f.values.length, length); assert.equal(f.listeners[0].stopped, true);
  } finally { stop(); }
});
test("new realtime head preserves a loaded 40-review chain, displaced boundary row, cursor, photos and deduplication", () => {
  const oldHead = rows(43, 24), tail = rows(23, 4), tailCursor = cursor(4);
  const next = paging.rebaseReviewPages({ head: oldHead, headCursor: cursor(24), extra: tail, cursor: tailCursor }, rows(44, 25), cursor(25));
  const all = [...next.head, ...next.extra];
  assert.deepEqual(all.map((r) => r.id), rows(44, 4).map((r) => r.id));
  assert.equal(next.cursor, tailCursor); assert.equal(new Set(all.map((r) => r.id)).size, 41);
  assert.equal(all[0].comment, "Feedback 44"); assert.deepEqual(all[0].photoPaths, ["saved-photo"]);
  const again = paging.rebaseReviewPages(next, [...next.head], cursor(25));
  assert.deepEqual(again.extra.map((r) => r.id), next.extra.map((r) => r.id));
});
test("disjoint windows restart contiguous paging; deleted head rows and new legacy tails are handled explicitly", () => {
  const previous = { head: rows(43, 24), headCursor: cursor(24), extra: rows(23, 4), cursor: cursor(4) };
  const jump = paging.rebaseReviewPages(previous, rows(70, 51), cursor(51));
  assert.equal(jump.restarted, true);
  assert.deepEqual(jump.extra, []); assert.equal(jump.cursor.id, "review-51");
  const removed = paging.rebaseReviewPages(previous, rows(42, 23), cursor(23));
  assert.ok(![...removed.head, ...removed.extra].some((row) => row.id === "review-43"));
  const legacy = paging.rebaseReviewPages({ ...previous, cursor: null }, [...previous.head], { ...cursor(24), includeUndated: true });
  assert.ok(legacy.cursor.includeUndated); assert.equal(legacy.extra.length, 20);
});
test("hook focus reaches shared refresh; stale zero/error never becomes No ratings yet and permission loss clears all data", () => {
  let focus, next, error, refreshes = 0;
  const auth = { currentUser: { uid: "tech-a" } };
  const h = renderHarness("src/hooks/useTechnicianReviews.ts", { effects: true, exportName: "useTechnicianReviews", dependencies: {
    "expo-router": { useFocusEffect: (callback) => { focus = callback; } },
    "firebase/auth": { onAuthStateChanged: (_, callback) => { callback(auth.currentUser); return () => {}; } },
    "@/src/firebase/config": { auth }, "@/src/services/technician.service": {
      refreshTechnicianReviews: () => { refreshes++; }, retryTechnicianReviews() {}, subscribeToTechnicianReviews: (_, onNext, onError) => { next = onNext; error = onError; return () => {}; },
    },
  } });
  try {
    h.render("tech-a"); focus(); assert.equal(refreshes, 1);
    next([], meta, { count: 0, average: 0 }); assert.equal(h.render("tech-a").status, "ready");
    next([], { ...meta, fromCache: true }, { count: 0, average: 0 });
    let state = h.render("tech-a"); assert.equal(state.status, "stale"); assert.ok(!rating.getTechnicianRatingDisplay(state).value.includes("No ratings yet"));
    next([row(44)], meta, { count: 44, average: 3 }); error(Object.assign(new Error("Offline"), { code: "unavailable" }));
    state = h.render("tech-a"); assert.equal(state.status, "stale"); assert.equal(state.reviews.length, 1);
    error(Object.assign(new Error("Denied"), { code: "permission-denied" })); state = h.render("tech-a");
    assert.equal(state.status, "error"); assert.equal(state.summary, null); assert.deepEqual(state.reviews, []);
    auth.currentUser = { uid: "tech-b" }; assert.equal(h.render("tech-b").summary, null);
  } finally { h.cleanup(); }
});
