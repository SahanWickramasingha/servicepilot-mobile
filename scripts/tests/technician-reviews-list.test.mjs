import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { renderHarness } from "../lib/performance-render-harness.mjs";

function pure(path) {
  const result = {};
  new Function("exports", ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(result);
  return result;
}
const rating = pure("src/utils/technicianRating.ts"), authors = pure("src/utils/reviewAuthor.ts");
const stamp = (millis) => ({ toMillis: () => millis });
const review = (id, extra = {}) => ({ id, technicianId: "tech-a", customerName: "Bandara", rating: 5, comment: "Excellent service", createdAt: stamp(1000), ...extra });
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture({ rows = [review("first")], count = rows.length, status = "ready", getPage = async () => ({ reviews: [], cursor: null }) } = {}) {
  const auth = { currentUser: { uid: "tech-a" } }, targets = [];
  let retryCount = 0, pageCalls = 0;
  let ratings = { status, summary: status === "ready" ? { average: count ? 4.3 : 0, count } : null,
    reviews: rows, cursor: null, errorMessage: "Reviews are temporarily unavailable.", retry: () => { retryCount++; } };
  let workspace = { uid: "tech-a", profile: { uid: "tech-a", role: "technician", fullName: "Gihan" }, requests: [], loading: false, errorMessage: "" };
  const h = renderHarness("app/technician/performance.tsx", { effects: true, dependencies: {
    "@/src/components/reviews/ReviewPhotos": { ReviewPhotos: "ReviewPhotos" },
    "expo-router": { router: { back() {} } }, "@/src/firebase/config": { auth },
    "@/src/hooks/useTechnicianWorkspace": { useTechnicianWorkspace: () => workspace },
    "@/src/hooks/useTechnicianReviews": { useTechnicianReviews: (id) => { targets.push(id); return ratings; } },
    "@/src/services/technician.service": { TECHNICIAN_REVIEWS_PAGE_SIZE: 20, getTechnicianReviewsPage: (...args) => { pageCalls++; return getPage(...args); } },
  } });
  const render = () => { h.render(); h.render(); return h.elements().find((e) => e.type === "FlatList")?.props; };
  const text = () => h.elements().filter((e) => e.type === "Text").map((e) => [e.props.children].flat(Infinity).join("")).join(" | ");
  return { ...h, render, text, auth, targets, pageCalls: () => pageCalls, retryCount: () => retryCount,
    setRatings: (next) => { ratings = { ...ratings, ...next }; },
    account: (uid) => { auth.currentUser = uid ? { uid } : null; workspace = { ...workspace, uid, profile: uid ? { uid, role: "technician" } : null }; },
    button: (label) => h.elements().find((e) => e.type === "TouchableOpacity" && e.props.children?.props?.children === label),
  };
}

test("legacy dates never throw or invent today; newest-first ordering has deterministic ID ties and unknown dates last", () => {
  for (const value of [undefined, null, "yesterday", {}, { toMillis: () => NaN }, { toMillis() { throw new Error("legacy"); } }]) {
    assert.equal(rating.formatTechnicianReviewDate(value), "Date unavailable");
  }
  const rows = [review("legacy", { createdAt: undefined }), review("old", { createdAt: stamp(-1) }), review("a"), review("z")];
  assert.deepEqual(rows.sort(rating.compareTechnicianReviews).map((r) => r.id), ["z", "a", "old", "legacy"]);
  assert.ok(!rating.formatTechnicianReviewDate(stamp(1000)).includes("unavailable"));
  assert.equal(authors.getReviewDisplayName({ customerName: " Customer " }), undefined);
});

test("zero/one/multiple reviews display the shared full summary and only verified zero displays emptiness", () => {
  for (const count of [0, 1, 43]) {
    const f = fixture({ rows: count ? [review("first")] : [], count }); const list = f.render();
    assert.equal(list.data.length, count ? 1 : 0);
    assert.equal(f.text().includes("No reviews yet"), count === 0);
    assert.ok(f.text().includes(count ? `4.3 (${count} review${count === 1 ? "" : "s"})` : "No ratings yet"));
    assert.equal(list.keyExtractor(review("stable-id")), "stable-id"); f.cleanup();
  }
});

test("cards reuse permitted names, stars, optional comments and dates without private profile lookups or invented legacy fields", () => {
  const f = fixture(), list = f.render();
  const named = list.renderItem({ item: review("named") }); named.type(named.props);
  assert.ok(f.text().includes("Bandara")); assert.ok(f.text().includes("Excellent service"));
  assert.ok(f.elements().some((e) => e.type === "View" && e.props.accessibilityLabel === "5 out of 5 stars"));
  f.render(); const legacy = list.renderItem({ item: review("legacy", { customerName: undefined, comment: "", createdAt: undefined }) }); legacy.type(legacy.props);
  assert.ok(f.text().includes("Reviewer name unavailable")); assert.ok(f.text().includes("Date unavailable"));
  assert.ok(!f.text().includes("No written comment")); f.cleanup();
});

test("loading and permission/network errors never display an empty result and Retry calls the shared stream", () => {
  for (const status of ["loading", "error"]) {
    const f = fixture({ rows: [], status }); const list = f.render();
    assert.deepEqual(list.data, []); assert.ok(!f.text().includes("No reviews yet"));
    if (status === "error") {
      assert.equal(f.text().split("Reviews are temporarily unavailable.").length - 1, 1);
      assert.equal(f.elements().filter((e) => e.type === "TouchableOpacity" && e.props.accessibilityLabel === "Retry reviews").length, 1);
      f.button("Retry").props.onPress(); assert.equal(f.retryCount(), 1);
    }
    else assert.ok(f.text().includes("Loading reviews..."));
    f.cleanup();
  }
});

test("manual pagination guards duplicate taps, deduplicates rows, preserves the full summary and retries the same failed cursor", async () => {
  const wait = pending(); let fail = true;
  const cursor = { kind: "dated", id: "first", createdAt: stamp(1000), includeUndated: false };
  const f = fixture({ count: 43, getPage: async (uid, next) => {
    assert.equal(uid, "tech-a"); assert.equal(next, cursor);
    if (fail) throw Object.assign(new Error("Offline"), { code: "unavailable" });
    return wait.promise;
  } });
  f.setRatings({ cursor }); f.render(); await f.button("Load More Reviews").props.onPress(); f.render();
  assert.ok(f.text().includes("Unable to load more reviews")); assert.ok(!f.text().includes("No reviews yet"));
  fail = false;
  const press = f.button("Retry loading reviews").props.onPress;
  const saving = press(); await press(); assert.equal(f.pageCalls(), 2);
  wait.resolve({ reviews: [review("first"), review("older", { rating: 1, createdAt: stamp(1) })], cursor: null }); await saving;
  const list = f.render(); assert.deepEqual(list.data.map((r) => r.id), ["first", "older"]);
  assert.ok(f.text().includes("4.3 (43 reviews)")); assert.equal(f.button("Load More Reviews"), undefined); f.cleanup();
});

test("account switching, a changed live head and unmount discard pending pages and previously loaded rows", async () => {
  for (const action of ["account", "head", "unmount"]) {
    const wait = pending(), f = fixture({ count: 43, getPage: () => wait.promise });
    f.setRatings({ cursor: { kind: "undated", id: null } }); f.render();
    const saving = f.button("Load More Reviews").props.onPress();
    if (action === "account") { f.account("tech-b"); f.setRatings({ reviews: [review("b-review")], cursor: null }); f.render(); }
    if (action === "head") { f.setRatings({ reviews: [review("new-head")], cursor: null }); f.render(); }
    if (action === "unmount") f.cleanup();
    wait.resolve({ reviews: [review("obsolete-page")], cursor: null }); await saving;
    assert.ok(!f.render().data.some((row) => row.id === "obsolete-page"));
    if (action === "account") assert.ok(f.targets.includes("tech-b")); f.cleanup();
  }
});

test("the technician review screen never uses a supplied/previous technician identity instead of the current Auth UID", () => {
  const f = fixture(); f.render(); f.auth.currentUser = { uid: "another-account" };
  assert.equal(f.render(), undefined); assert.equal(f.targets.at(-1), null);
  assert.ok(!f.text().includes("Bandara")); f.cleanup();
});
test("an already-open paginated screen keeps every loaded card across a new realtime review and continued pagination", async () => {
  const makeRows = (from, to) => Array.from({ length: from - to + 1 }, (_, index) => review(`review-${from - index}`, { createdAt: stamp(from - index) }));
  const makeCursor = (n) => ({ kind: "dated", id: `review-${n}`, createdAt: stamp(n), includeUndated: false });
  let page = 0;
  const f = fixture({ rows: makeRows(43, 24), count: 43, getPage: async () => ++page === 1
    ? { reviews: makeRows(23, 4), cursor: makeCursor(4) } : { reviews: makeRows(3, 1), cursor: null } });
  try {
    f.setRatings({ cursor: makeCursor(24) }); f.render(); await f.button("Load More Reviews").props.onPress();
    assert.equal(f.render().data.length, 40);
    f.setRatings({ status: "stale" }); assert.equal(f.render().data.length, 40); assert.ok(f.text().includes("out of date"));
    f.setRatings({ status: "ready", reviews: makeRows(44, 25), cursor: makeCursor(25), summary: { average: 4.3, count: 44 } });
    let list = f.render(); assert.deepEqual(list.data.map((row) => row.id), makeRows(44, 4).map((row) => row.id));
    await f.button("Load More Reviews").props.onPress(); list = f.render();
    assert.deepEqual(list.data.map((row) => row.id), makeRows(44, 1).map((row) => row.id));
    assert.equal(new Set(list.data.map((row) => row.id)).size, 44); assert.equal(f.button("Load More Reviews"), undefined);
  } finally { f.cleanup(); }
});

test("dashboard View Reviews opens the existing Performance destination", () => {
  const routes = [];
  const h = renderHarness("app/technician/(tabs)/index.tsx", { dependencies: {
    "expo-router": { router: { push: (path) => routes.push(path) } },
    "@/src/firebase/config": { auth: { currentUser: { uid: "tech-a" } } },
    "@/src/hooks/useTechnicianWorkspace": { useTechnicianWorkspace: () => ({ uid: "tech-a", profile: { uid: "tech-a", role: "technician" }, requests: [], loading: false }) },
    "@/src/hooks/useTechnicianReviews": { useTechnicianReviews: () => ({ status: "ready", summary: { average: 5, count: 1 } }) },
    "@/src/services/notification.service": {},
    "@/src/components/technicians/TechnicianAvailabilityPanel": { TechnicianAvailabilityPanel: "Availability" },
  } });
  h.render(); h.elements().find((e) => e.props?.accessibilityLabel === "View reviews received by you").props.onPress();
  assert.deepEqual(routes, ["/technician/performance"]);
});
