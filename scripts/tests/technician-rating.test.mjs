import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { performanceTestDependency } from "../lib/performance-test-deps.mjs";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(path, deps = {}) {
  const result = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
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
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next) => {
        assert.equal(unmounted, false, "An obsolete callback updated an unmounted component");
        states[index] = next;
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
    react, "@/src/firebase/config": { auth }, "@/src/utils/technicianRating": rating,
    "firebase/auth": { onAuthStateChanged: (_, next) => {
      authCallback = next;
      return () => { authUnsubscribed++; };
    } },
    "@/src/services/technician.service": { subscribeToTechnicianReviews: (id, next, error) => {
      const listener = { id, next, error, stopped: false };
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
    assert.equal(state.status, "error"); assert.equal(state.summary, null);
    assert.deepEqual(state.reviews, []); assert.equal(display.value, "Ratings unavailable");
    assert.equal(display.countValue, "Unavailable");
    assert.match(display.label, code === "permission-denied" ? /permission denied/ : /Unable to load/);
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

test("the real review service queries every review for one ID and requests metadata-only changes", () => {
  let snapshotNext;
  const sdk = {
    collection: (_, name) => name, where: (...args) => args, query: (...args) => args,
    onSnapshot: (query, options, next) => {
      assert.deepEqual(query, ["service_reviews", ["technicianId", "==", "gihan"]]);
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
  let reviews, metadata;
  service.subscribeToTechnicianReviews("gihan", (rows, meta) => { reviews = rows; metadata = meta; }, assert.fail);
  const documents = [5, 3, "5", 0, 6, 2.5].map((stars, index) => ({
    id: String(index), data: () => ({ ...review(stars), technicianId: "gihan" }),
  }));
  snapshotNext({ docs: documents, metadata: confirmed });
  assert.deepEqual(reviews.map(r => r.rating), [5, 3]);
  assert.equal(reviews[0].customerName, "Bandara"); assert.equal(metadata, confirmed);
});
