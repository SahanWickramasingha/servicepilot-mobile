import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { performanceTestDependency } from "../lib/performance-test-deps.mjs";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(path, deps = {}) {
  const result = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", code)(result, (id) => {
    const performanceDep = performanceTestDependency(id, deps);
    if (performanceDep) return performanceDep;
    if (!(id in deps)) throw new Error(`Missing test dependency: ${id}`);
    return deps[id];
  });
  return result;
}
const rating = load("src/utils/technicianRating.ts");
const confirmed = { fromCache: false, hasPendingWrites: false };
const review = (stars, id = "bandara") => ({ id, rating: stars, customerName: "Bandara" });

function fixture(initialId = "gihan") {
  const auth = { currentUser: { uid: "gihan" } };
  const states = [], effects = [], listeners = [];
  let cursor = 0, effectCursor = 0, authCallback, authUnsubscribed = 0, unmounted = false;
  const react = {
    useCallback: (callback) => callback,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next) => {
        assert.equal(unmounted, false, "An obsolete callback updated an unmounted component");
        states[index] = typeof next === "function" ? next(states[index]) : next;
      }];
    },
    useEffect: (fn, deps) => {
      const index = effectCursor++, previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        previous?.cleanup();
        effects[index] = { deps, cleanup: fn() };
      }
    },
  };
  const hook = load("src/hooks/useTechnicianReviews.ts", {
    react, "expo-router": { useFocusEffect() {} }, "@/src/firebase/config": { auth }, "@/src/utils/technicianRating": rating,
    "firebase/auth": { onAuthStateChanged: (_, next) => {
      authCallback = next;
      return () => { authUnsubscribed++; };
    } },
    "@/src/services/technician.service": { subscribeToTechnicianReviews: (id, next, error) => {
      const listener = { id, next: (rows, meta) => next(rows, meta, meta.fromCache || meta.hasPendingWrites ? null : rating.summarizeTechnicianReviews(rows)), error, stopped: false };
      listeners.push(listener);
      return () => { listener.stopped = true; };
    } },
  }).useTechnicianReviews;
  let target = initialId;
  const render = (nextId = target) => {
    target = nextId; cursor = 0; effectCursor = 0;
    return hook(target);
  };
  render();
  const account = (uid) => { auth.currentUser = uid ? { uid } : null; authCallback(auth.currentUser); };
  account("gihan");
  return { render, account, auth, listeners,
    latest: () => listeners.at(-1), authUnsubscribed: () => authUnsubscribed,
    unmount: () => { effects.forEach((effect) => effect.cleanup()); unmounted = true; } };
}

test("Gihan's 5-star Bandara review produces the same 5.0/1 display for both roles", () => {
  for (const viewer of ["gihan", "customer"]) {
    const f = fixture(); f.account(viewer);
    assert.equal(f.latest().id, "gihan");
    f.latest().next([review(5)], confirmed);
    const state = f.render(), display = rating.getTechnicianRatingDisplay(state);
    assert.deepEqual(state.summary, { average: 5, count: 1 });
    assert.equal(display.label, "5.0 (1 review)");
    assert.equal(state.reviews[0].customerName, "Bandara");
    f.unmount();
  }
});

test("zero reviews appears only after complete server confirmation, never cached empty or pending writes", () => {
  const f = fixture();
  assert.equal(rating.getTechnicianRatingDisplay(f.render()).value, "Loading ratings...");
  for (const metadata of [{ ...confirmed, fromCache: true }, { ...confirmed, hasPendingWrites: true }]) {
    f.latest().next([], metadata);
    assert.equal(f.render().status, "loading");
  }
  f.latest().next([], confirmed);
  assert.equal(rating.getTechnicianRatingDisplay(f.render()).value, "No ratings yet");
  assert.deepEqual(f.render().summary, { average: 0, count: 0 });
  f.unmount();
});

test("all eligible reviews count before the customer displays five cards; malformed stars are excluded", () => {
  const f = fixture();
  const reviews = [5, 5, 5, 5, 5, 1, 2, 0, 6, 4.5, NaN, Infinity, "5", null].map(review);
  f.latest().next(reviews, confirmed);
  assert.deepEqual(f.render().summary, { average: 4, count: 7 });
  assert.equal(rating.getTechnicianRatingDisplay(f.render()).label, "4.0 (7 reviews)");
  assert.notEqual(f.render().summary.average, rating.summarizeTechnicianReviews(reviews.slice(0, 5)).average);
  f.unmount();
});

test("a submitted review updates a mounted technician's average and count without an auth change", () => {
  const f = fixture(), listener = f.latest();
  listener.next([review(5)], confirmed);
  assert.equal(rating.getTechnicianRatingDisplay(f.render()).label, "5.0 (1 review)");
  listener.next([review(5), review(3, "second")], confirmed);
  assert.equal(rating.getTechnicianRatingDisplay(f.render()).label, "4.0 (2 reviews)");
  assert.equal(f.latest(), listener);
  f.unmount();
});

test("permission and network failures remain distinct from a successfully loaded zero-review result", () => {
  for (const code of ["permission-denied", "unavailable"]) {
    const f = fixture();
    f.latest().next([review(5)], confirmed);
    f.latest().error(Object.assign(new Error("Denied"), { code }));
    const state = f.render(), display = rating.getTechnicianRatingDisplay(state);
    assert.equal(state.status, code === "permission-denied" ? "error" : "stale");
    assert.equal(state.summary?.count ?? null, code === "permission-denied" ? null : 1);
    assert.equal(state.reviews.length, code === "permission-denied" ? 0 : 1);
    assert.match(display.value, code === "permission-denied" ? /Ratings unavailable/ : /out of date/);
    assert.ok(display.label.includes("Reviews are temporarily unavailable."));
    f.unmount();
  }
});

test("account switching clears the old result, unsubscribes, and ignores late data/errors", () => {
  const f = fixture(), old = f.latest();
  old.next([review(5)], confirmed);
  f.account("other-technician");
  assert.equal(old.stopped, true); assert.equal(f.render().summary, null);
  old.next([review(1)], confirmed); old.error(new Error("Old session"));
  assert.equal(f.render().status, "loading");
  f.render("other-technician"); f.account("other-technician");
  assert.equal(f.latest().id, "other-technician");
  f.latest().next([], confirmed);
  assert.equal(rating.getTechnicianRatingDisplay(f.render()).value, "No ratings yet");
  f.unmount();
});

test("target changes hide old results even before effects and late old callbacks cannot restore them", () => {
  const f = fixture(), old = f.latest();
  old.next([review(5)], confirmed);
  assert.equal(f.render("another-profile").summary, null);
  assert.equal(old.stopped, true); f.account("gihan");
  old.next([review(5)], confirmed);
  assert.equal(f.render().summary, null);
  f.latest().next([review(2)], confirmed);
  assert.equal(f.render().summary.average, 2);
  f.unmount();
});

test("logout and unmount clean up both listeners; late callbacks cannot update state", () => {
  const f = fixture(), old = f.latest();
  old.next([review(5)], confirmed); f.account(null);
  assert.equal(old.stopped, true); assert.equal(f.render().summary, null);
  const subscriptions = f.listeners.length;
  old.next([review(5)], confirmed); old.error(new Error("Late"));
  assert.equal(f.render().summary, null); assert.equal(f.listeners.length, subscriptions);
  f.account("gihan"); const latest = f.latest(); f.unmount();
  assert.equal(latest.stopped, true); assert.ok(f.authUnsubscribed() > 0);
  latest.next([review(5)], confirmed); latest.error(new Error("Late unmount"));
});

test("a missing target never subscribes or advertises zero ratings", () => {
  const f = fixture(null);
  assert.equal(f.listeners.length, 0); assert.equal(f.render().status, "loading");
  f.unmount();
});

test("the real review service uses a bounded technician page and the full server aggregate with metadata-only changes", async () => {
  let snapshotNext;
  const sdk = {
    collection: (_, name) => name, where: (...args) => args, query: (source, ...args) => Array.isArray(source) ? [...source, ...args] : [source, ...args],
    orderBy: (...args) => ["orderBy", ...args], documentId: () => "__name__", limit: (n) => ["limit", n],
    count: () => "count", average: () => "average",
    getAggregateFromServer: async (query) => {
      assert.ok(!query.some((item) => item[0] === "limit"));
      return { data: () => ({ count: 47, average: 4 }) };
    },
    getCountFromServer: async () => ({ data: () => ({ count: 47 }) }),
    onSnapshot: (query, options, next) => {
      assert.deepEqual(query, ["service_reviews", ["technicianId", "==", "gihan"], ["rating", "in", [1, 2, 3, 4, 5]], ["orderBy", "createdAt", "desc"], ["orderBy", "__name__", "desc"], ["limit", 20]]);
      assert.deepEqual(options, { includeMetadataChanges: true });
      snapshotNext = next; return () => {};
    },
  };
  const service = load("src/services/technician.service.ts", {
    "firebase/firestore": sdk, "@/src/firebase/config": { db: {} },
    "@/src/constants/serviceRequests": {}, "@/functions/src/domain/map": {},
    "@/functions/src/domain/serviceAreas": {}, "@/functions/src/domain/mapProjection": {},
    "@/functions/src/domain/availability": load("functions/src/domain/availability.ts"),
    "@/src/utils/technicianRating": rating,
  });
  let reviews, metadata, summary;
  const stop = service.subscribeToTechnicianReviews("gihan", (rows, meta, total) => { reviews = rows; metadata = meta; summary = total; }, assert.fail);
  const documents = [5, 3, "5", 0, 6, 2.5].map((stars, index) => ({
    id: String(index), data: () => ({ ...review(stars), technicianId: "gihan", createdAt: { toMillis: () => 1000 - index } }),
  }));
  snapshotNext({ docs: documents, metadata: confirmed });
  await new Promise(setImmediate);
  assert.deepEqual(reviews.map(r => r.rating), [5, 3]);
  assert.equal(reviews[0].customerName, "Bandara"); assert.equal(metadata, confirmed);
  assert.deepEqual(summary, { average: 4, count: 47 }); stop();
});

test("compact cards use the same verified summary/rounding/counts and never fall back to stale aggregate props", () => {
  let state;
  const jsx = (type, props) => ({ type, props });
  const component = load("src/components/technicians/TechnicianRating.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react-native": { Star: "Star" }, "react-native": { Text: "Text" },
    "@/src/hooks/useTechnicianReviews": { useTechnicianReviews: (id) => { assert.equal(id, "gihan"); return state; } },
    "@/src/utils/technicianRating": rating,
  }).TechnicianRating;
  const flatten = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)];
  for (const stars of [[], [5], [5, 4, 4], [1, 2], [5, 5, 5, 5, 5, 1, 2]]) {
    state = { status: "ready", summary: rating.summarizeTechnicianReviews(stars.map(review)), errorMessage: "" };
    const expected = rating.getTechnicianRatingDisplay(state);
    const nodes = flatten(component({ technicianId: "gihan", averageRating: 0, reviewCount: 0 }));
    assert.ok(nodes.some((node) => node.type === "Text" && node.props.children === expected.value));
    assert.ok(nodes.some((node) => node.type === "Text" && node.props.children === expected.countLabel));
    assert.equal(nodes.find((node) => node.type === "Text").props.accessibilityLabel, expected.label);
  }
  for (const status of ["loading", "error"]) {
    state = { status, summary: null, errorMessage: "Ratings unavailable: permission denied." };
    const nodes = flatten(component({ technicianId: "gihan", averageRating: 5, reviewCount: 99 }));
    assert.equal(nodes.filter((node) => node.type === "Text").length, status === "error" ? 2 : 1);
    assert.ok(!nodes.some((node) => /No ratings yet|0 reviews|New/.test(node.props?.children)));
    assert.equal(nodes.find((node) => node.type === "Text").props.accessibilityRole, status === "error" ? "alert" : undefined);
  }
  assert.equal(rating.getTechnicianRatingDisplay({ status: "ready", summary: rating.summarizeTechnicianReviews([5, 4, 4].map(review)), errorMessage: "" }).label, "4.3 (3 reviews)");
});

test("profile/dashboard/cards share one bounded query and server aggregate; failures, account changes and final unsubscribe clear it", async () => {
  const auth = { currentUser: { uid: "customer" } }, listeners = [], values = [], failures = [];
  let calculations = 0, sessionChanged;
  auth.onAuthStateChanged = (next) => { sessionChanged = next; return () => {}; };
  const service = load("src/services/technician.service.ts", {
    "firebase/firestore": { collection: (_, name) => name, where: (...args) => args, query: (...args) => args,
      orderBy: (...args) => args, documentId: () => "__name__", limit: (n) => n, count: () => "count", average: () => "average",
      getAggregateFromServer: async () => { calculations++; return { data: () => ({ count: 2, average: 4 }) }; },
      getCountFromServer: async () => ({ data: () => ({ count: 2 }) }),
      onSnapshot: (query, options, next, error) => { const listener = { query, options, next, error, stopped: false }; listeners.push(listener); return () => { listener.stopped = true; }; } },
    "@/src/firebase/config": { auth, db: {} }, "@/src/constants/serviceRequests": {}, "@/functions/src/domain/map": {},
    "@/functions/src/domain/serviceAreas": {}, "@/functions/src/domain/mapProjection": {}, "@/functions/src/domain/availability": {},
    "@/src/utils/technicianRating": rating,
  });
  const subscribe = () => service.subscribeToTechnicianReviews("gihan", (rows, meta, summary) => values.push({ rows, meta, summary }), (error) => failures.push(error));
  const stops = Array.from({ length: 5 }, subscribe);
  assert.equal(listeners.length, 1);
  assert.ok(JSON.stringify(listeners[0].query).includes('"technicianId","==","gihan"'));
  const snapshot = { docs: [5, 3].map((stars, i) => ({ id: String(i), data: () => ({ rating: stars, customerName: "Bandara", technicianId: "gihan" }) })), metadata: confirmed };
  listeners[0].next(snapshot);
  await new Promise(setImmediate);
  assert.equal(calculations, 1); assert.equal(values.length, 5);
  assert.ok(values.every((value) => value.summary === values[0].summary));
  assert.deepEqual(values[0].summary, { average: 4, count: 2 });
  stops.push(subscribe()); assert.equal(calculations, 1); assert.equal(listeners.length, 1);
  listeners[0].error(Object.assign(new Error("Denied"), { code: "permission-denied" }));
  assert.equal(failures.length, 6); assert.equal(values.at(-1).summary, null);
  auth.currentUser = { uid: "another-customer" }; sessionChanged();
  assert.equal(listeners[0].stopped, true);
  const length = values.length; listeners[0].next(snapshot); assert.equal(values.length, length);
  const stopNew = subscribe(); assert.equal(listeners.length, 2);
  stops.forEach((stop) => stop()); assert.equal(listeners[1].stopped, false);
  stopNew(); assert.equal(listeners[1].stopped, true);
});

test("administrator lookup uses the same summary, only selected technician reviews, and cleans up obsolete accounts", () => {
  const auth = { currentUser: { uid: "admin" } }, results = [], failures = [];
  let listener, stopped = false;
  const service = load("admin-web/src/services/technicianRatingService.ts", {
    "firebase/firestore": { collection: (_, name) => name, where: (...args) => args, query: (...args) => args,
      onSnapshot: (query, options, next, error) => { listener = { query, options, next, error }; return () => { stopped = true; }; } },
    "../firebase/config": { auth, db: {} }, "../../../src/utils/technicianRating": rating,
  });
  const stop = service.subscribeToAdminTechnicianRating("gihan", (summary) => results.push(summary), (error) => failures.push(error));
  assert.deepEqual(listener.query, ["service_reviews", ["technicianId", "==", "gihan"]]);
  assert.deepEqual(listener.options, { includeMetadataChanges: true });
  listener.next({ docs: [], metadata: { ...confirmed, fromCache: true } }); assert.equal(results.length, 0);
  const snapshot = { docs: [5, 4, 4].map((stars) => ({ data: () => ({ rating: stars }) })), metadata: confirmed };
  listener.next(snapshot); assert.equal(rating.getTechnicianRatingDisplay({ status: "ready", summary: results[0], errorMessage: "" }).label, "4.3 (3 reviews)");
  listener.error(new Error("Network failure")); assert.equal(failures.length, 1);
  auth.currentUser = { uid: "different-admin" }; listener.next(snapshot); listener.error(new Error("Old session"));
  assert.equal(results.length, 1); assert.equal(failures.length, 1);
  stop(); assert.equal(stopped, true); listener.next(snapshot); assert.equal(results.length, 1);
});

function retryServiceFixture(aggregate) {
  const auth = { currentUser: { uid: "gihan" } }, listeners = [], values = [], failures = [];
  let changed;
  auth.onAuthStateChanged = (next) => { changed = next; return () => {}; };
  const service = load("src/services/technician.service.ts", {
    "firebase/firestore": { collection: (_, name) => name, where: (...args) => args, query: (...args) => args,
      orderBy: (...args) => args, documentId: () => "__name__", limit: (n) => n, count: () => "count", average: () => "average",
      getAggregateFromServer: aggregate, getCountFromServer: async () => ({ data: () => ({ count: 1 }) }),
      onSnapshot: (_, options, next, error) => { const listener = { next, error, stopped: false }; listeners.push(listener); return () => { listener.stopped = true; }; } },
    "@/src/firebase/config": { auth, db: {} }, "@/src/constants/serviceRequests": {}, "@/functions/src/domain/map": {},
    "@/functions/src/domain/serviceAreas": {}, "@/functions/src/domain/mapProjection": {}, "@/functions/src/domain/availability": {},
    "@/src/utils/technicianRating": rating,
  });
  const subscribe = () => service.subscribeToTechnicianReviews("gihan", (_, meta, summary) => values.push(summary), (error) => failures.push(error));
  return { service, auth, listeners, values, failures, subscribe, change: () => changed(),
    snapshot: { docs: [{ id: "first", data: () => ({ rating: 5, customerName: "Bandara", createdAt: { toMillis: () => 1000 } }) }], metadata: confirmed } };
}

test("offline confirmation deadline reports an error; Retry reconnects one shared listener despite other mounted consumers and rapid taps", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let aggregates = 0;
  const f = retryServiceFixture(async () => { aggregates++; return { data: () => ({ count: 1, average: 5 }) }; });
  const stops = [f.subscribe(), f.subscribe()];
  try {
    f.listeners[0].next({ docs: [], metadata: { ...confirmed, fromCache: true } });
    assert.equal(aggregates, 0); assert.equal(f.values.length, 0);
    t.mock.timers.tick(15000); assert.equal(f.failures.length, 2); assert.ok(f.failures.every((e) => e.code === "unavailable"));
    f.service.retryTechnicianReviews("gihan"); f.service.retryTechnicianReviews("gihan");
    assert.equal(f.listeners.length, 2); assert.equal(f.listeners[0].stopped, true);
    f.listeners[1].next(f.snapshot); await new Promise(setImmediate);
    assert.equal(aggregates, 1); assert.equal(f.values.filter(Boolean).length, 2);
    assert.ok(f.values.filter(Boolean).every((s) => s.count === 1 && s.average === 5));
  } finally { stops.forEach((stop) => stop()); }
  assert.equal(f.listeners[1].stopped, true);
});

test("an aggregate pending during account switching cannot restore the previous account's reviews", async () => {
  let resolve;
  const f = retryServiceFixture(() => new Promise((yes) => { resolve = yes; }));
  const stop = f.subscribe();
  f.listeners[0].next(f.snapshot);
  f.auth.currentUser = { uid: "new-account" }; f.change();
  resolve({ data: () => ({ count: 1, average: 5 }) }); await new Promise(setImmediate);
  assert.ok(f.values.every((value) => value === null)); assert.equal(f.listeners[0].stopped, true); stop();
});
