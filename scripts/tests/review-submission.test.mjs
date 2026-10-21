import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { renderHarness } from "../lib/performance-render-harness.mjs";

function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", code)(exports, (id) => {
    if (id in dependencies) return dependencies[id];
    if (id === "@/src/utils/reviewValidation") return validation;
    if (id === "@/src/utils/reviewAuthor") return load("src/utils/reviewAuthor.ts");
    throw new Error(`Unmocked dependency: ${id}`);
  });
  return exports;
}
const validation = load("src/utils/reviewValidation.ts");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const existingReview = { id: "job_customer", requestId: "job", customerId: "customer", technicianId: "tech", rating: 1, comment: "The fault was not resolved.", photoPaths: [] };
const reviewContext = { requestId: "job", customerId: "customer", technicianId: "tech", technicianName: "Gihan", title: "Repair socket", existingReview: null };

function screen({ existing = null, save = async () => ({ review: existingReview, created: true }), pick = async () => [] } = {}) {
  const observers = new Set(), calls = [], routes = [];
  const auth = { currentUser: { uid: "customer", emailVerified: true }, onAuthStateChanged(callback) {
    observers.add(callback); callback(auth.currentUser); return () => observers.delete(callback);
  } };
  const h = renderHarness("app/(tabs)/review-technician.tsx", { effects: true, dependencies: {
    "expo-router": { useLocalSearchParams: () => ({ id: "job", technicianId: "forged" }), router: { back() {}, replace: (route) => routes.push(route) } },
    "@/src/firebase/config": { auth },
    "@/src/services/review.service": { getCustomerReviewContext: async () => ({ ...reviewContext, existingReview: existing }) },
    "@/src/services/reviewPhotos.service": { pickReviewPhotos: pick },
    "@/src/services/reviewSubmission.service": { submitReviewWithPhotos: (input) => { calls.push(input); return save(input); } },
    "@/src/components/reviews/ReviewPhotos": { ReviewPhotos: "ReviewPhotos" },
  } });
  const render = () => h.render();
  const text = () => h.elements().filter((e) => e.type === "Text").flatMap((e) => [e.props.children].flat(Infinity)).join(" | ");
  const button = (label) => h.elements().find((e) => e.type === "TouchableOpacity" && e.props.accessibilityLabel === label);
  return { ...h, render, calls, routes, auth, text, button, ready: async () => { render(); await tick(); render(); },
    stars: (n) => { button(`${n} out of 5 stars`).props.onPress(); render(); },
    feedback: (value) => { h.elements().find((e) => e.type === "TextInput").props.onChangeText(value); render(); },
    account: (uid) => { auth.currentUser = uid ? { uid, emailVerified: true } : null; observers.forEach((callback) => callback(auth.currentUser)); render(); },
  };
}

test("opening Rate Service loads a form with no write, no preselected stars, technician and request title", async () => {
  const f = screen(); await f.ready();
  assert.equal(f.calls.length, 0); assert.ok(!f.text().includes("Thank You"));
  assert.ok(f.text().includes("Gihan")); assert.ok(f.text().includes("Repair socket"));
  assert.ok(f.button("Submit review").props.disabled);
  for (let n = 1; n <= 5; n++) assert.equal(f.button(`${n} out of 5 stars`).props.accessibilityState.checked, false);
  f.stars(1); f.feedback("Negative experience, needs improvement.");
  assert.equal(f.button("Submit review").props.disabled, false);
  f.feedback("a".repeat(301)); assert.ok(f.button("Submit review").props.disabled);
  assert.match(f.text(), /301.*\/.*300/); f.cleanup();
});
test("an existing review opens Your Review and its saved data, never a false Thank You or a duplicate form", async () => {
  const f = screen({ existing: { ...existingReview, photoPaths: ["saved-photo"] } }); await f.ready();
  assert.equal(f.calls.length, 0); assert.ok(f.text().includes("Your Review"));
  assert.ok(f.text().includes(existingReview.comment)); assert.ok(!f.text().includes("Thank You"));
  assert.equal(f.button("Submit review"), undefined);
  assert.deepEqual(f.elements().find((e) => e.type === "ReviewPhotos").props.paths, ["saved-photo"]); f.cleanup();
});
test("completed request uses Rate Service or View Your Review and passes only the authoritative request ID", () => {
  for (const state of ["new", "existing"]) {
    const routes = [], job = { id: "job", customerId: "customer", status: "completed", title: "Repair socket", imageUrls: [], technicianName: "Gihan" };
    const h = renderHarness("app/(tabs)/request-details.tsx", { initial: [job, false, "", false, state], dependencies: {
      "expo-router": { useLocalSearchParams: () => ({ id: "job" }), useFocusEffect() {}, router: { push: (route) => routes.push(route) } },
      "@/src/firebase/config": { auth: { currentUser: { uid: "customer" } } },
      "@/src/services/request.service": { formatRequestDate: () => "Local test date" },
      "@/src/services/review.service": {}, "@/src/components/maps/JobTechnicianLocation": { JobTechnicianLocation: "Location" },
    } });
    h.render();
    const label = state === "existing" ? "View Your Review" : "Rate Service";
    const button = h.elements().find((e) => e.type === "TouchableOpacity" && [e.props.children].flat().some((child) => child?.props?.children === label));
    assert.ok(button); button.props.onPress();
    assert.deepEqual(routes, [{ pathname: "/review-technician", params: { id: "job" } }]); h.cleanup();
  }
});
test("Thank You waits for confirmed persistence; repeated taps cannot duplicate and submission accepts a low rating", async () => {
  const wait = deferred(), f = screen({ save: () => wait.promise }); await f.ready(); f.stars(1);
  const press = f.button("Submit review").props.onPress;
  const saving = press(); await press(); f.render();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].rating, 1); assert.ok(!f.text().includes("Thank You"));
  wait.resolve({ review: existingReview, created: true }); await saving; f.render();
  assert.ok(f.text().includes("Thank You")); assert.ok(f.text().includes(existingReview.comment)); f.cleanup();
});
test("recoverable save failure preserves stars, feedback and selected photos for an explicit retry", async () => {
  let fail = true;
  const f = screen({ pick: async () => [{ uri: "file://selected", size: 50 }], save: async () => {
    if (fail) throw new Error("Network error. Retry."); return { review: existingReview, created: true };
  } }); await f.ready(); f.stars(2); f.feedback("Honest feedback");
  await f.button("Add review photos").props.onPress(); f.render();
  await f.button("Submit review").props.onPress(); f.render();
  assert.ok(!f.text().includes("Thank You")); assert.ok(f.text().includes("Network error"));
  assert.equal(f.elements().find((e) => e.type === "TextInput").props.value, "Honest feedback");
  assert.ok(f.button("2 out of 5 stars").props.accessibilityState.checked); assert.ok(f.button("Remove photo 1"));
  fail = false; await f.button("Submit review").props.onPress(); f.render();
  assert.equal(f.calls[1].photos.length, 1); assert.ok(f.text().includes("Thank You")); f.cleanup();
});
test("photo previews can be removed; picker denial permits browsing and submitting without photos", async () => {
  let denied = false;
  const f = screen({ pick: async () => { if (denied) throw new Error("Photo permission denied"); return [{ uri: "one", size: 30 }, { uri: "two", size: 30 }]; } });
  await f.ready(); await f.button("Add review photos").props.onPress(); f.render();
  assert.equal(f.elements().filter((e) => e.type === "Image").length, 2);
  f.button("Remove photo 1").props.onPress(); f.render(); f.button("Remove photo 1").props.onPress(); f.render();
  assert.equal(f.elements().filter((e) => e.type === "Image").length, 0);
  denied = true; await f.button("Add review photos").props.onPress(); f.render(); f.stars(3);
  assert.ok(f.text().includes("permission denied")); assert.equal(f.button("Submit review").props.disabled, false); f.cleanup();
});
test("account changes cannot display a previous customer's saved or pending review", async () => {
  const wait = deferred(), f = screen({ save: () => wait.promise }); await f.ready(); f.stars(4);
  const saving = f.button("Submit review").props.onPress(); f.account(null);
  wait.resolve({ review: existingReview, created: true }); await saving; f.render();
  assert.ok(!f.text().includes("Thank You")); assert.ok(!f.text().includes(existingReview.comment)); f.cleanup();
});

function coordinator({ failUpload = 0, failSave = false, afterFailure = null, preexisting = null, cleanup = true, publishFails = false, saveCode = "permission-denied" } = {}) {
  let contextReads = 0, writes = 0, uploads = 0; const removed = [], published = [];
  const gate = deferred(); let wait = false;
  const auth = { currentUser: { uid: "customer" } };
  const mod = load("src/services/reviewSubmission.service.ts", {
    "firebase/firestore": { collection: () => ({}), doc: () => ({ id: "abcdefghijklmnopqrst" }) },
    "@/src/firebase/config": { auth, db: {} },
    "./review.service": { getReviewId: (r, c) => `${r}_${c}`, getCustomerReviewContext: async () => {
      contextReads++; if (wait) await gate.promise; return { ...reviewContext, existingReview: preexisting };
    }, getReviewForRequest: async () => afterFailure, submitServiceReview: async (input) => {
      writes++; if (failSave) throw Object.assign(new Error("Firestore unavailable"), { code: saveCode });
      return { review: { ...existingReview, ...input } };
    } },
    "./reviewPhotos.service": { uploadReviewPhoto: async () => { uploads++; if (uploads === failUpload) throw new Error("Upload failed"); },
      cleanupReviewUploads: async (paths) => { removed.push(...paths); return cleanup; },
      publishReviewPhotos: async (paths) => { published.push(...paths); if (publishFails) throw new Error("Offline"); } },
  });
  const input = { requestId: "job", rating: 1, comment: "", photos: [{ uri: "a" }, { uri: "b" }] };
  return { submit: (extra = {}) => mod.submitReviewWithPhotos({ ...input, ...extra }), removed, published, gate, auth,
    wait: () => { wait = true; }, reads: () => contextReads, writes: () => writes, uploads: () => uploads };
}
test("submission without photos never invokes Storage; all selected photos upload before one saved review", async () => {
  const noPhotos = coordinator(); assert.equal((await noPhotos.submit({ photos: [] })).created, true);
  assert.equal(noPhotos.uploads(), 0); assert.equal(noPhotos.writes(), 1); assert.deepEqual(noPhotos.published, []);
  const f = coordinator(); const result = await f.submit(); assert.equal(f.uploads(), 2); assert.equal(f.writes(), 1);
  assert.equal(result.review.photoPaths.length, 2); assert.deepEqual(f.published, result.review.photoPaths);
});
test("partial upload failure never submits without the photos; cleanup is scoped to this attempt and retry gets a fresh write opportunity", async () => {
  const f = coordinator({ failUpload: 2 }); await assert.rejects(f.submit(), /Upload failed/);
  assert.equal(f.writes(), 0); assert.equal(f.removed.length, 2);
  assert.ok(f.removed.every((p) => p.startsWith("review_photos/customer/job_customer/abcdefghijklmnopqrst/")));
  assert.equal((await f.submit()).created, true); assert.equal(f.writes(), 1);
});
test("Firestore failure cleans only unreferenced uploads; saved-review photos survive concurrent and lost-ack retries", async () => {
  const f = coordinator({ failSave: true }); await assert.rejects(f.submit(), /Firestore unavailable/); assert.equal(f.removed.length, 2);
  const savedPath = validation.reviewPhotoPath("customer", "job_customer", "abcdefghijklmnopqrst", 0);
  const race = coordinator({ failSave: true, afterFailure: { ...existingReview, photoPaths: [savedPath] } });
  assert.equal((await race.submit()).created, false); assert.equal(race.removed.length, 1); assert.ok(!race.removed.includes(savedPath));
  const old = coordinator({ preexisting: existingReview }); assert.equal((await old.submit()).created, false);
  assert.equal(old.uploads(), 0); assert.equal(old.writes(), 0); assert.deepEqual(old.removed, []);
});
test("cross-component duplicate submissions share a single operation and reject an account change during preflight", async () => {
  const f = coordinator(); f.wait(); const one = f.submit(), two = f.submit(); assert.equal(one, two);
  f.gate.resolve(); await one; assert.equal(f.reads(), 1); assert.equal(f.writes(), 1);
  const changed = coordinator(); changed.wait(); const saving = changed.submit(); changed.auth.currentUser = { uid: "another" }; changed.gate.resolve();
  await assert.rejects(saving, /Submission stopped/); assert.equal(changed.uploads(), 0); assert.equal(changed.writes(), 0);
});
test("publication failure reports a saved review without deleting its uploaded photos or inviting a duplicate", async () => {
  const f = coordinator({ publishFails: true }); const result = await f.submit();
  assert.equal(result.created, true); assert.ok(result.warning.includes("saved")); assert.deepEqual(f.removed, []);
});
test("an ambiguous Firestore commit failure retains uploads instead of racing cleanup against a delayed save", async () => {
  const f = coordinator({ failSave: true, saveCode: "unavailable" });
  await assert.rejects(f.submit(), /retained because the save could not be confirmed/);
  assert.equal(f.uploads(), 2); assert.equal(f.writes(), 1); assert.deepEqual(f.removed, []);
});
test("an acknowledged review succeeds even when the separate notification write remains offline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let written = null;
  const service = load("src/services/review.service.ts", {
    "@/src/firebase/config": { auth: { currentUser: { uid: "customer", emailVerified: true } }, db: {} },
    "firebase/firestore": { doc: (_, collection, id) => `${collection}/${id}`, serverTimestamp: () => "server-time",
      runTransaction: async (_, callback) => callback({ get: async (path) => ({ data: () => path.startsWith("users/")
        ? { role: "customer", fullName: "Bandara", accountStatus: "active" }
        : { customerId: "customer", technicianId: "tech", status: "completed" } }), set: (_path, data) => { written = data; } }),
    },
    "@/src/services/notification.service": { createPersonalNotification: () => new Promise(() => {}) },
  });
  const saving = service.submitServiceReview({ requestId: "job", customerId: "customer", rating: 1, comment: "Needs improvement" });
  await tick(); assert.equal(written.rating, 1); t.mock.timers.tick(8000);
  const result = await saving; assert.equal(result.review.rating, 1); assert.ok(result.notificationWarning.includes("saved"));
});
test("rating, comments, source/output bytes, types, and photo ownership have meaningful boundary validation", () => {
  for (const rating of [0, 6, 1.1, NaN]) assert.ok(validation.validateReview(rating, ""));
  for (let rating = 1; rating <= 5; rating++) assert.equal(validation.validateReview(rating, ""), null);
  assert.equal(validation.validateReview(1, "x".repeat(300)), null); assert.ok(validation.validateReview(1, "x".repeat(301)));
  const jpeg = new Uint8Array([255, 216, 255, 224]);
  assert.doesNotThrow(() => validation.validateImageBytes(jpeg, true));
  for (const bad of [new Uint8Array(), new TextEncoder().encode('<svg xmlns="x"/>'), new Uint8Array([71, 73, 70, 56])]) assert.throws(() => validation.validateImageBytes(bad));
  const big = new Uint8Array(validation.REVIEW_PHOTO_BYTES_MAX + 1); big.set(jpeg); assert.throws(() => validation.validateImageBytes(big, true), /5 MB/);
  const attempt = "abcdefghijklmnopqrst", valid = validation.reviewPhotoPath("customer", "job_customer", attempt, 0);
  assert.doesNotThrow(() => validation.validateReviewPhotos([valid], "customer", "job_customer", attempt));
  for (const paths of [["request_photos/private"], [valid.replace("customer/", "someone/")], Array(6).fill(valid)]) assert.throws(() => validation.validateReviewPhotos(paths, "customer", "job_customer", attempt));
});

test("larger photo viewer is accessible, closes explicitly and clears on account changes", () => {
  const observers = new Set(), auth = { currentUser: { uid: "customer" }, onAuthStateChanged: (next) => { observers.add(next); return () => observers.delete(next); } };
  const h = renderHarness("src/components/reviews/ReviewPhotos.tsx", { exportName: "ReviewPhotos", effects: true, dependencies: {
    "@/src/firebase/config": { auth }, "@/src/services/reviewPhotos.service": {},
  } });
  h.render({ paths: ["path"], customerId: "customer" });
  h.elements().find((e) => typeof e.type === "function").props.onOpen("data:image/jpeg;base64,test"); h.render();
  assert.ok(h.elements().find((e) => e.type === "Modal").props.visible);
  assert.ok(h.elements().some((e) => e.props?.accessibilityLabel === "Enlarged review photo"));
  h.elements().find((e) => e.props?.accessibilityLabel === "Close review photo").props.onPress(); h.render();
  assert.equal(h.elements().find((e) => e.type === "Modal").props.visible, false);
  auth.currentUser = null; observers.forEach((next) => next(null)); assert.equal(h.render(), null); h.cleanup();
});
