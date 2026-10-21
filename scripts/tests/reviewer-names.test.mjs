import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { performanceTestDependency } from "../lib/performance-test-deps.mjs";
import * as firebaseAppSdk from "firebase/app";
import * as firestoreSdk from "firebase/firestore";
import { initializeApp as clientApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, doc, collection, getDoc, getDocs,
  setDoc, updateDoc, query, where, terminate, setLogLevel,
} from "firebase/firestore";
import { backfillReviewerName, proposeReviewerNameChange } from "../lib/reviewer-name-backfill.mjs";

// Never create fixtures unless connected to a loopback emulator and a demo project.
const PROJECT_ID = "demo-servicepilot-review-author";
const host = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (![host, authHost].every((value) => value && /^(127\.0\.0\.1|localhost):\d+$/.test(value))) {
  throw new Error("Run this test through the configured local Firestore and Auth emulators.");
}
const rootRequire = createRequire(new URL("../../package.json", import.meta.url));
const functionsRequire = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp: adminApp } = functionsRequire("firebase-admin/app");
const { getFirestore: adminFirestore, FieldValue } = functionsRequire("firebase-admin/firestore");
const { getAuth: adminAuth } = functionsRequire("firebase-admin/auth");
const trustedApp = adminApp({ projectId: PROJECT_ID });
const admin = adminFirestore(trustedApp);
const clients = new Map();
const clientApps = [];
const createdAt = new Date("2026-10-01T18:05:32.909Z");

function client(uid, verified = true) {
  const name = `${uid ?? "anonymous"}-${verified}`;
  if (clients.has(name)) return clients.get(name);
  const app = clientApp({ projectId: PROJECT_ID, apiKey: "emulator-only" }, name);
  const db = getFirestore(app);
  const [hostname, port] = host.split(":");
  connectFirestoreEmulator(db, hostname, Number(port), uid ? {
    mockUserToken: { sub: uid, email: `${uid}@example.test`, email_verified: verified },
  } : undefined);
  clients.set(name, db);
  clientApps.push(app);
  return db;
}

function loadTs(path, deps = {}) {
  const ts = rootRequire("typescript");
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  const sdk = { "firebase/app": firebaseAppSdk, "firebase/firestore": firestoreSdk };
  deps["@/functions/src/domain/availability"] ??= functionsRequire("./lib/domain/availability.js");
  // Use the host realm: Firestore validates plain-object prototypes when writing.
  const evaluate = new Function("exports", "require", "__DEV__", output);
  evaluate(exports, (id) => deps[id] ?? performanceTestDependency(id, deps) ?? sdk[id] ?? rootRequire(id), false);
  return exports;
}
const authorUi = loadTs("src/utils/reviewAuthor.ts");
const ratingUi = loadTs("src/utils/technicianRating.ts");
const syncPaging = loadTs("src/utils/reviewPagination.ts", { "./technicianRating": ratingUi,
  "@/src/services/technician.service": { TECHNICIAN_REVIEWS_PAGE_SIZE: 20 } });

function services(db, uid, authenticatedSession) {
  const config = { db, auth: authenticatedSession ?? { currentUser: uid ? { uid } : null } };
  const user = loadTs("src/services/user.service.ts", {
    "@/src/firebase/config": config,
    "@/src/utils/registrationDebug": {},
    "@/functions/src/domain/mapProjection": functionsRequire("./lib/domain/mapProjection.js"),
    "@/functions/src/domain/serviceAreas": functionsRequire("./lib/domain/serviceAreas.js"),
  });
  const notification = loadTs("src/services/notification.service.ts", {
    "@/src/firebase/config": config,
  });
  return {
    review: loadTs("src/services/review.service.ts", {
      "@/src/firebase/config": config,
      "@/src/services/user.service": user,
      "@/src/services/notification.service": notification,
      "@/src/utils/reviewAuthor": authorUi,
    }),
    technician: loadTs("src/services/technician.service.ts", {
      "@/src/firebase/config": config,
      "@/src/services/user.service": user,
      "@/functions/src/domain/map": functionsRequire("./lib/domain/map.js"),
      "@/functions/src/domain/serviceAreas": functionsRequire("./lib/domain/serviceAreas.js"),
      "@/functions/src/domain/mapProjection": functionsRequire("./lib/domain/mapProjection.js"),
      "@/src/constants/serviceRequests": loadTs("src/constants/serviceRequests.ts"),
      "@/src/utils/technicianRating": ratingUi,
    }),
  };
}
const reviewData = (requestId, overrides = {}) => ({
  requestId, customerId: "customer", technicianId: "technician", customerName: "Bandara",
  rating: 4, comment: "Verry good service", createdAt, ...overrides,
});
const freshReviewData = (requestId, overrides = {}) => reviewData(requestId, { createdAt: firestoreSdk.serverTimestamp(), ...overrides });
const reviewRef = (db, requestId, uid = "customer") => doc(db, "service_reviews", `${requestId}_${uid}`);
const denied = (promise) => assert.rejects(promise, (error) => error.code === "permission-denied");
async function request(id, extra = {}) {
  await admin.doc(`service_requests/${id}`).set({
    customerId: "customer", technicianId: "technician", status: "completed", ...extra,
  });
}
async function listedReviews(db, expectedId, expectedName) {
  const { technician } = services(db, "viewer");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("The review subscription did not receive the expected document."));
    }, 15000);
    const unsubscribe = technician.subscribeToTechnicianReviews("technician", (reviews) => {
      // A reused listener can first emit a cached snapshot predating the new review.
      if (expectedId && !reviews.some((entry) => entry.id === expectedId &&
          (expectedName === undefined || entry.customerName === expectedName))) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(reviews);
    }, (error) => {
      clearTimeout(timeout);
      unsubscribe();
      reject(error);
    });
  });
}

before(async () => {
  setLogLevel("silent"); // Expected permission-denied cases do not need SDK warning dumps.
  for (const [uid, role, fullName] of [
    ["customer", "customer", "Bandara"], ["viewer", "customer", "Other Viewer"],
    ["technician", "technician", "Amila"], ["other-tech", "technician", "Other Technician"],
    ["super-admin", "super_admin", "Admin"], ["dispatcher", "dispatcher", "Dispatcher"],
    ["placeholder", "customer", "Customer"], ["disabled", "customer", "Disabled"],
  ]) {
    await admin.doc(`users/${uid}`).set({ uid, role, fullName, emailVerified: true,
      accountStatus: uid === "disabled" ? "disabled" : "active",
      ...(role === "technician" ? { technicianApprovalStatus: "approved", averageRating: 4, reviewCount: 1 } : {}),
    });
  }
  await request("existing");
  const existing = reviewData("existing");
  delete existing.customerName;
  await admin.doc("service_reviews/existing_customer").set(existing);
  for (const [uid, fullName] of [["rating-gihan", "Gihan"], ["rating-zero", "Unreviewed Technician"]]) {
    await admin.doc(`users/${uid}`).set({ uid, fullName, role: "technician", emailVerified: true,
      technicianApprovalStatus: "approved", accountStatus: "active", averageRating: 0, reviewCount: 0 });
  }
});

after(async () => {
  await Promise.all([...clients.values()].map((db) => terminate(db)));
  await Promise.all(clientApps.map(deleteApp));
  await admin.terminate();
});

test("bounded technician pages retain full-history totals, deterministic newest-first order and missing legacy dates", async () => {
  const uid = "reviews-paged-tech";
  await admin.doc(`users/${uid}`).set({ uid, fullName: "Paged Technician", role: "technician", accountStatus: "active", emailVerified: true, technicianApprovalStatus: "approved" });
  const fixtures = Array.from({ length: 41 }, (_, index) => ({ id: `dated-${String(index).padStart(2, "0")}`, rating: index % 5 + 1,
    createdAt: new Date(Date.UTC(2026, 9, index + 1)), customerName: "Bandara", comment: "Local review fixture" }));
  fixtures.push({ id: "legacy-z", rating: 5 }, { id: "legacy-a", rating: 3, customerName: "Customer" }, { id: "legacy-null", rating: 4, createdAt: null });
  const batch = admin.batch();
  for (const { id, ...data } of fixtures) batch.set(admin.doc(`service_reviews/${uid}-${id}`), { ...data, technicianId: uid, customerId: "customer" });
  batch.set(admin.doc(`service_reviews/${uid}-invalid`), { technicianId: uid, customerId: "customer", rating: 4.5 });
  await batch.commit();
  const service = services(client(uid), uid).technician;
  let stop;
  const head = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { stop?.(); reject(new Error("No authoritative review page.")); }, 15000);
    stop = service.subscribeToTechnicianReviews(uid, (reviews, metadata, summary, cursor) => {
      if (!summary || metadata.fromCache) return;
      clearTimeout(timeout); resolve({ reviews, summary, cursor });
    }, (error) => { clearTimeout(timeout); reject(error); });
  });
  try {
    assert.equal(head.reviews.length, 20);
    assert.equal(head.reviews[0].id, `${uid}-dated-40`);
    const expected = ratingUi.summarizeTechnicianReviews(fixtures);
    assert.equal(head.summary.count, 44); assert.ok(Math.abs(head.summary.average - expected.average) < 1e-10);
    assert.notEqual(head.summary.average, ratingUi.summarizeTechnicianReviews(head.reviews).average);
    let cursor = head.cursor, all = [...head.reviews], requests = 0;
    while (cursor) {
      assert.ok(requests++ < 10, "Pagination failed to terminate.");
      const page = await service.getTechnicianReviewsPage(uid, cursor);
      assert.ok(page.reviews.length <= 20); all.push(...page.reviews); cursor = page.cursor;
    }
    assert.equal(all.length, 44); assert.equal(new Set(all.map((row) => row.id)).size, 44);
    all.sort(ratingUi.compareTechnicianReviews);
    assert.ok(all.slice(0, 41).every((row) => row.createdAt));
    assert.deepEqual(all.slice(-3).map((row) => row.id), [`${uid}-legacy-z`, `${uid}-legacy-null`, `${uid}-legacy-a`]);
    assert.equal(authorUi.getReviewDisplayName(all.at(-1)), undefined);
    assert.equal(ratingUi.formatTechnicianReviewDate(all.at(-1).createdAt), "Date unavailable");
    // No aggregate fields are required, and the list never reads a private author profile.
    assert.equal((await admin.doc(`users/${uid}`).get()).data().reviewCount, undefined);
    await denied(getDoc(doc(client(uid), "users", "customer")));
  } finally { stop(); }
});

test("rules protect paginated/aggregate reviews from anonymous, other-technician, dispatcher and inactive callers while customer/admin access remains", async () => {
  const uid = "reviews-paged-tech";
  const aggregate = (db) => firestoreSdk.getAggregateFromServer(query(collection(db, "service_reviews"),
    where("technicianId", "==", uid), where("rating", "in", [1, 2, 3, 4, 5])), { count: firestoreSdk.count() });
  for (const viewer of [null, "other-tech", "dispatcher", "disabled"]) {
    const db = client(viewer);
    await denied(aggregate(db));
    await denied(services(db, viewer).technician.getTechnicianReviewsPage(uid, { kind: "undated", id: null }));
  }
  for (const viewer of [uid, "customer", "super-admin"]) {
    assert.equal((await aggregate(client(viewer))).data().count, 44);
    await services(client(viewer), viewer).technician.getTechnicianReviewsPage(uid, { kind: "undated", id: null });
  }
});

test("existing review: Customer B sees Customer A's repaired name and initials; dry-run changes nothing", async () => {
  const ref = admin.doc("service_reviews/existing_customer");
  const beforeData = (await ref.get()).data();
  const aggregate = (await admin.doc("users/technician").get()).data();
  const unresolved = (await listedReviews(client("viewer"))).find((entry) => entry.id === ref.id);
  assert.equal(unresolved.customerId, "customer");
  assert.equal(authorUi.getReviewDisplayName(unresolved), undefined);
  assert.equal(authorUi.getReviewerInitials(authorUi.getReviewDisplayName(unresolved)), "?");
  const proposal = await backfillReviewerName(admin, { reviewId: ref.id });
  assert.equal(proposal.customerName.to, "Bandara");
  assert.deepEqual((await ref.get()).data(), beforeData);
  await assert.rejects(backfillReviewerName(admin, { reviewId: ref.id, apply: true }), /expected-name/);
  await assert.rejects(backfillReviewerName(admin, { reviewId: ref.id, apply: true, expectedName: "Amila" }), /differs/);
  await backfillReviewerName(admin, { reviewId: ref.id, apply: true, expectedName: "Bandara" });
  const afterData = (await ref.get()).data();
  assert.equal(afterData.customerName, "Bandara");
  delete afterData.customerName;
  assert.deepEqual(afterData, beforeData); // Includes IDs, rating, comment, and exact timestamp.
  assert.deepEqual((await admin.doc("users/technician").get()).data(), aggregate);
  const reviews = await listedReviews(client("viewer"), ref.id, "Bandara");
  const review = reviews.find((entry) => entry.id === ref.id);
  assert.equal(review.customerId, "customer");
  assert.equal(authorUi.getReviewDisplayName(review), "Bandara");
  assert.equal(authorUi.getReviewerInitials(authorUi.getReviewDisplayName(review)), "B");
  assert.equal(await backfillReviewerName(admin, { reviewId: ref.id, apply: true, expectedName: "Bandara" }), null);
});

test("literal Customer is recovered; real historical snapshots are preserved", async () => {
  await request("placeholder-review");
  const ref = admin.doc("service_reviews/placeholder-review_customer");
  await ref.set(reviewData("placeholder-review", { customerName: " Customer " }));
  await backfillReviewerName(admin, { reviewId: ref.id, apply: true, expectedName: "Bandara" });
  assert.equal((await ref.get()).data().customerName, "Bandara");
  await ref.update({ customerName: "Historical Name" });
  assert.equal(await backfillReviewerName(admin, { reviewId: ref.id }), null);
  assert.equal(authorUi.getReviewerInitials("  Nimal   Bandara "), "NB");
});

test("backfill rejects invalid authors, forged identity, and conflicting or missing Technician IDs", () => {
  const review = reviewData("legacy");
  const customer = { uid: "customer", role: "customer", fullName: "Bandara" };
  delete review.customerName;
  const current = { customerId: "customer", status: "completed", technicianId: "technician" };
  const legacy = { customerId: "customer", status: "completed", assignedTechnicianId: "technician" };
  assert.equal(proposeReviewerNameChange("legacy_customer", review, customer, legacy).customerName.to, "Bandara");
  for (const req of [{ ...current, assignedTechnicianId: "other-tech" },
    { ...current, technicianId: null }, { ...current, customerId: "viewer" }, { ...current, status: "in_progress" }]) {
    assert.throws(() => proposeReviewerNameChange("legacy_customer", review, customer, req));
  }
  for (const profile of [{ ...customer, role: "technician" }, { ...customer, uid: "viewer" },
    { ...customer, fullName: " CUSTOMER " }, { ...customer, fullName: " " }, undefined]) {
    assert.throws(() => proposeReviewerNameChange("legacy_customer", review, profile, current));
  }
});

test("Customer A submits: Customer B sees A's name and initials, with profiles private and notification intact", async () => {
  const db = client("customer");
  const { review } = services(db, "customer");
  await request("future");
  assert.equal(await review.getReviewForRequest("future", "customer"), null);
  await review.submitServiceReview({ requestId: "future", customerId: "customer", technicianId: "technician", rating: 4, comment: "Very good service" });
  const existing = await review.getReviewForRequest("future", "customer");
  assert.equal(existing.customerName, "Bandara");
  const rendered = (await listedReviews(client("viewer"), "future_customer")).find((entry) => entry.id === "future_customer");
  assert.equal(rendered.customerId, "customer");
  assert.notEqual(rendered.customerId, "viewer");
  assert.equal(authorUi.getReviewDisplayName(rendered), "Bandara");
  assert.equal(authorUi.getReviewerInitials(authorUi.getReviewDisplayName(rendered)), "B");
  for (const incorrectName of ["Other Viewer", "Amila", "Customer"]) {
    assert.notEqual(authorUi.getReviewDisplayName(rendered), incorrectName);
  }
  await denied(getDoc(doc(client("viewer"), "users", rendered.customerId)));
  const notifications = await getDocs(query(collection(client("technician"), "notifications"), where("userId", "==", "technician")));
  assert.ok(notifications.docs.some((entry) => entry.data().type === "new_review" && entry.data().requestId === "future"));
  await denied(review.submitServiceReview({ requestId: "future", customerId: "customer", technicianId: "technician", rating: 1, comment: "overwrite" }));
  assert.equal((await getDoc(reviewRef(db, "future"))).data().rating, 4);
});

test("unresolved authors never use a role label or fabricated initials", () => {
  for (const customerName of [undefined, "", " ", "Customer", " CUSTOMER "]) {
    const name = authorUi.getReviewDisplayName({ customerName });
    assert.equal(name, undefined);
    assert.equal(authorUi.getReviewerInitials(name), "?");
  }
});

test("two signed-in Auth emulator accounts: B sees A's new and repaired existing reviews", async () => {
  const identities = [
    { uid: "auth-customer-a", fullName: "Bandara" },
    { uid: "auth-customer-b", fullName: "Different Customer" },
  ];
  const sessions = [];
  try {
    for (const identity of identities) {
      // These credentials are emulator-only fixtures, never production credentials.
      const email = `${identity.uid}@example.test`;
      const password = "Emulator-only-review-test-42";
      await adminAuth(trustedApp).createUser({ uid: identity.uid, email, password, emailVerified: true });
      await admin.doc(`users/${identity.uid}`).set({ ...identity, role: "customer", accountStatus: "active", emailVerified: true });
      const app = clientApp({ projectId: PROJECT_ID, apiKey: "emulator-only" }, identity.uid);
      clientApps.push(app);
      const auth = getAuth(app);
      connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
      const db = getFirestore(app);
      const [hostname, port] = host.split(":");
      connectFirestoreEmulator(db, hostname, Number(port));
      clients.set(identity.uid, db);
      await signInWithEmailAndPassword(auth, email, password);
      assert.equal(auth.currentUser.uid, identity.uid);
      assert.equal(auth.currentUser.emailVerified, true);
      sessions.push({ auth, db });
    }
    const [customerA, customerB] = sessions;
    await request("auth-new", { customerId: identities[0].uid });
    await services(customerA.db, identities[0].uid, customerA.auth).review.submitServiceReview({
      requestId: "auth-new", customerId: identities[0].uid, technicianId: "technician", rating: 4, comment: "Very good service",
    });
    const newId = `auth-new_${identities[0].uid}`;
    const submitted = (await listedReviews(customerB.db, newId, "Bandara")).find((entry) => entry.id === newId);
    assert.equal(submitted.customerId, customerA.auth.currentUser.uid);
    assert.notEqual(submitted.customerId, customerB.auth.currentUser.uid);
    assert.equal(authorUi.getReviewDisplayName(submitted), "Bandara");
    assert.equal(authorUi.getReviewerInitials(authorUi.getReviewDisplayName(submitted)), "B");
    await denied(getDoc(doc(customerB.db, "users", identities[0].uid)));

    // Same legacy data shape as the inspected screenshot review, with no name snapshot.
    await request("auth-existing", { customerId: identities[0].uid });
    const existing = reviewData("auth-existing", { customerId: identities[0].uid });
    delete existing.customerName;
    const oldRef = admin.doc(`service_reviews/auth-existing_${identities[0].uid}`);
    await oldRef.set(existing);
    const before = (await oldRef.get()).data();
    const aggregate = (await admin.doc("users/technician").get()).data();
    await backfillReviewerName(admin, { reviewId: oldRef.id, apply: true, expectedName: "Bandara" });
    const repaired = (await listedReviews(customerB.db, oldRef.id, "Bandara")).find((entry) => entry.id === oldRef.id);
    assert.equal(authorUi.getReviewDisplayName(repaired), "Bandara");
    assert.equal(authorUi.getReviewerInitials(authorUi.getReviewDisplayName(repaired)), "B");
    const after = (await oldRef.get()).data();
    delete after.customerName;
    assert.deepEqual(after, before);
    assert.deepEqual((await admin.doc("users/technician").get()).data(), aggregate);
  } finally {
    await Promise.all(sessions.map(({ auth }) => signOut(auth)));
  }
});

test("names are mandatory, match the authoritative profile, and placeholders cannot be submitted", async () => {
  const db = client("customer");
  await request("names");
  for (const name of [undefined, "Amila", "Other Viewer", "Customer", " "]) {
    const data = freshReviewData("names", { customerName: name });
    if (name === undefined) delete data.customerName;
    await denied(setDoc(reviewRef(db, "names"), data));
  }
  await request("placeholder", { customerId: "placeholder" });
  await denied(setDoc(reviewRef(client("placeholder"), "placeholder", "placeholder"),
    freshReviewData("placeholder", { customerId: "placeholder", customerName: "Customer" })));
  const service = services(client("placeholder"), "placeholder").review;
  await assert.rejects(service.submitServiceReview({ requestId: "placeholder", customerId: "placeholder", technicianId: "technician", rating: 4, comment: "test" }), /update your customer profile/);
});

test("profile snapshot keeps exact whitespace for rules equality and displays normalized initials", async () => {
  await admin.doc("users/customer").update({ fullName: " Nimal Bandara " });
  try {
    await request("whitespace");
    await services(client("customer"), "customer").review.submitServiceReview({ requestId: "whitespace", customerId: "customer", technicianId: "technician", rating: 4, comment: "test" });
    const data = (await getDoc(reviewRef(client("customer"), "whitespace"))).data();
    assert.equal(data.customerName, " Nimal Bandara ");
    assert.equal(authorUi.getReviewDisplayName(data), "Nimal Bandara");
    assert.equal(authorUi.getReviewerInitials(authorUi.getReviewDisplayName(data)), "NB");
  } finally {
    await admin.doc("users/customer").update({ fullName: "Bandara" });
  }
});

test("current and legacy requests submit; missing/conflicting/incomplete requests and forged ratings do not", async () => {
  const db = client("customer");
  await request("current");
  await setDoc(reviewRef(db, "current"), freshReviewData("current"));
  await admin.doc("service_requests/legacy").set({ customerId: "customer", assignedTechnicianId: "technician", status: "completed" });
  await setDoc(reviewRef(db, "legacy"), freshReviewData("legacy"));
  for (const [id, extra] of [["missing", { technicianId: null }], ["conflicting", { assignedTechnicianId: "other-tech" }], ["incomplete", { status: "in_progress" }]]) {
    await request(id, extra);
    await denied(setDoc(reviewRef(db, id), freshReviewData(id)));
  }
  await request("forged");
  await denied(setDoc(reviewRef(db, "forged"), freshReviewData("forged", { technicianId: "other-tech" })));
  for (const rating of [0, 6, 4.5, "4"]) await denied(setDoc(reviewRef(db, "forged"), freshReviewData("forged", { rating })));
});

test("concurrent duplicate submissions allow one create and preserve its value", async () => {
  const db = client("customer");
  await request("concurrent");
  const results = await Promise.allSettled([3, 5].map((rating) => setDoc(reviewRef(db, "concurrent"), freshReviewData("concurrent", { rating }))));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "permission-denied");
  const snapshot = await admin.collection("service_reviews").where("requestId", "==", "concurrent").get();
  assert.equal(snapshot.size, 1);
  assert.ok([3, 5].includes(snapshot.docs[0].data().rating));
  await denied(updateDoc(doc(client("technician"), "users", "technician"), { averageRating: 5, reviewCount: 99 }));
});

test("Customers browse review snapshots while Customer profiles and requests remain private", async () => {
  const viewer = client("viewer");
  assert.equal((await getDoc(reviewRef(viewer, "existing"))).data().customerName, "Bandara");
  await denied(getDoc(doc(viewer, "users", "customer")));
  await denied(getDoc(doc(client("technician"), "users", "customer")));
  await denied(getDoc(doc(viewer, "service_requests", "existing")));
  await denied(setDoc(reviewRef(viewer, "current", "viewer"), reviewData("current", { customerId: "viewer", customerName: "Other Viewer" })));
  assert.ok((await getDoc(doc(client("customer"), "service_requests", "existing"))).exists());
  for (const uid of ["technician", "super-admin"]) {
    assert.ok((await getDocs(query(collection(client(uid), "service_reviews"), where("technicianId", "==", "technician")))).size > 0);
  }
  for (const uid of ["other-tech", "dispatcher", "disabled", undefined]) await denied(getDoc(reviewRef(client(uid), "existing")));
  await denied(getDoc(reviewRef(client("viewer", false), "existing")));
});

test("Customer broadcast receipt and read markers retain their existing permissions", async () => {
  const db = client("customer");
  await admin.doc("system_messages/broadcast").set({ senderId: "super-admin", senderRole: "super_admin", audienceRoles: ["customer"], status: "sent" });
  const received = await getDocs(query(collection(db, "system_messages"), where("audienceRoles", "array-contains", "customer"), where("status", "in", ["active", "sent"])));
  assert.equal(received.size, 1);
  await setDoc(doc(db, "message_reads", "customer_broadcast"), { userId: "customer", messageId: "broadcast", readAt: createdAt });
  assert.ok((await getDoc(doc(db, "message_reads", "customer_broadcast"))).exists());
  await denied(getDoc(doc(client("technician"), "system_messages", "broadcast")));
});

function ratingStream(db, uid, technicianId) {
  const values = [];
  let failure;
  const stop = services(db, uid).technician.subscribeToTechnicianReviews(technicianId, (reviews, metadata, summary) => {
    if (!metadata.fromCache && !metadata.hasPendingWrites) values.push({
      summary, reviews,
    });
  }, (error) => { failure = error; });
  return { stop, values, async until(count) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      const value = values.find(entry => entry.summary.count === count);
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`No confirmed ${count}-review rating arrived`);
  } };
}

test("zero aggregates do not hide Gihan's 5.0/1 Bandara review; both role listeners update live over five cards", async () => {
  const customer = ratingStream(client("viewer"), "viewer", "rating-gihan");
  const technician = ratingStream(client("rating-gihan"), "rating-gihan", "rating-gihan");
  try {
    await Promise.all([customer.until(0), technician.until(0)]);
    const service = services(client("customer"), "customer").review;
    await request("rating-first", { technicianId: "rating-gihan" });
    await service.submitServiceReview({ requestId: "rating-first", customerId: "customer",
      technicianId: "rating-gihan", rating: 5, comment: "Excellent service" });
    for (const stream of [customer, technician]) {
      const loaded = await stream.until(1);
      assert.deepEqual(loaded.summary, { average: 5, count: 1 });
      assert.equal(loaded.reviews[0].customerName, "Bandara");
      assert.equal(ratingUi.getTechnicianRatingDisplay({ status: "ready", summary: loaded.summary, errorMessage: "" }).label, "5.0 (1 review)");
    }
    for (const [index, stars] of [5, 5, 5, 5, 1, 2].entries()) {
      const requestId = `rating-more-${index}`;
      await request(requestId, { technicianId: "rating-gihan" });
      await service.submitServiceReview({ requestId, customerId: "customer", technicianId: "rating-gihan", rating: stars, comment: "Review" });
    }
    for (const stream of [customer, technician]) {
      assert.deepEqual((await stream.until(7)).summary, { average: 4, count: 7 });
      assert.ok(stream.values.some(value => value.summary.count === 1));
      assert.ok(stream.values.some(value => value.summary.count === 7));
    }
    const profile = (await admin.doc("users/rating-gihan").get()).data();
    assert.equal(profile.averageRating, 0); assert.equal(profile.reviewCount, 0);
    await denied(updateDoc(doc(client("rating-gihan"), "users", "rating-gihan"), { averageRating: 5, reviewCount: 99 }));
  } finally { customer.stop(); technician.stop(); }
});

test("an approved technician's confirmed empty query gives zero reviews; other technicians cannot read Gihan's reviews", async () => {
  const stream = ratingStream(client("rating-zero"), "rating-zero", "rating-zero");
  try { assert.deepEqual((await stream.until(0)).summary, { average: 0, count: 0 }); }
  finally { stream.stop(); }
  await denied(getDocs(query(collection(client("rating-zero"), "service_reviews"), where("technicianId", "==", "rating-gihan"))));
  await denied(getDoc(doc(client("rating-gihan"), "users", "customer")));
});

test("real Customer and Technician Auth sessions share current ratings despite missing/stale aggregate documents", async () => {
  const identities = [["rating-auth-buyer", "customer", "Bandara"], ["rating-auth-technician", "technician", "Live Technician"]];
  const sessions = [], stops = [], states = [[], []];
  try {
    for (const [uid, role, fullName] of identities) {
      const email = `${uid}@example.test`, password = "Emulator-only-rating-auth-42";
      await adminAuth(trustedApp).createUser({ uid, email, password, emailVerified: true });
      await admin.doc(`users/${uid}`).set({ uid, fullName, email, role, accountStatus: "active", emailVerified: true,
        ...(role === "technician" ? { technicianApprovalStatus: "approved", averageRating: 1, reviewCount: 99 } : {}) });
      const app = clientApp({ projectId: PROJECT_ID, apiKey: "emulator-only" }, uid);
      clientApps.push(app);
      const auth = getAuth(app), db = getFirestore(app);
      connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
      const [hostname, port] = host.split(":"); connectFirestoreEmulator(db, hostname, Number(port));
      clients.set(uid, db);
      await signInWithEmailAndPassword(auth, email, password);
      sessions.push({ uid, auth, db });
    }
    const technicianId = identities[1][0];
    let failure;
    for (const [i, session] of sessions.entries()) {
      const service = services(session.db, session.uid, session.auth).technician;
      // Multiple same-session displays must receive the very same shared summary.
      for (let consumer = 0; consumer < 3; consumer++) stops.push(service.subscribeToTechnicianReviews(technicianId, (_, metadata, summary) => {
        if (!metadata.fromCache && !metadata.hasPendingWrites && summary) states[i].push(summary);
      }, (error) => { failure = error; }));
    }
    const waitFor = async (count) => {
      const deadline = Date.now() + 15000;
      while (!states.every((values) => values.some((summary) => summary.count === count))) {
        if (failure) throw failure;
        if (Date.now() > deadline) throw new Error("A real Auth session did not receive its rating summary.");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    await waitFor(0);
    const customer = sessions[0], submit = services(customer.db, customer.uid, customer.auth).review;
    for (const [index, stars] of [5, 4, 4].entries()) {
      const requestId = `real-auth-rating-${index}`;
      await request(requestId, { customerId: customer.uid, technicianId });
      await submit.submitServiceReview({ requestId, customerId: customer.uid, technicianId, rating: stars, comment: "Local rating check" });
      await waitFor(index + 1);
    }
    for (const values of states) {
      const last = values.at(-1);
      assert.equal(ratingUi.getTechnicianRatingDisplay({ status: "ready", summary: last, errorMessage: "" }).label, "4.3 (3 reviews)");
      assert.equal(values.at(-2), last); assert.equal(values.at(-3), last);
    }
    const stale = (await admin.doc(`users/${technicianId}`).get()).data();
    assert.equal(stale.averageRating, 1); assert.equal(stale.reviewCount, 99);
    await denied(updateDoc(doc(sessions[1].db, "users", technicianId), { averageRating: 5, reviewCount: 100 }));
    await denied(getDoc(doc(sessions[1].db, "users", customer.uid)));
    await admin.doc(`users/${technicianId}`).update({ averageRating: FieldValue.delete(), reviewCount: FieldValue.delete() });
    assert.equal(states[0].at(-1).count, 3); assert.equal(states[1].at(-1).count, 3);
  } finally { stops.forEach((stop) => stop()); }
});

test("independent Customer/Technician sessions synchronize canonical reviews, full totals and 20-item paging without Functions", async () => {
  const sessions = [], stops = [], received = [[], [], []]; let failure;
  const identities = [["sync-customer-a", "customer", "Nimal Bandara"], ["sync-technician-a", "technician", "Gihan"], ["sync-technician-b", "technician", "Other Technician"]];
  const waitFor = async (predicate) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (failure) throw failure;
      if (Date.now() > deadline) throw new Error("Review synchronization timed out.");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  try {
    for (const [uid, role, fullName] of identities) {
      const email = `${uid}@example.test`, password = "Local-sync-only-42!";
      await adminAuth(trustedApp).createUser({ uid, email, password, emailVerified: true });
      await admin.doc(`users/${uid}`).set({ uid, role, fullName, email, accountStatus: "active", emailVerified: true,
        ...(role === "technician" ? { technicianApprovalStatus: "approved", averageRating: 1, reviewCount: 999 } : {}) });
      const app = clientApp({ projectId: PROJECT_ID, apiKey: "emulator-only" }, uid); clientApps.push(app);
      const auth = getAuth(app), db = getFirestore(app); connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
      const [hostname, port] = host.split(":"); connectFirestoreEmulator(db, hostname, Number(port)); clients.set(uid, db);
      await signInWithEmailAndPassword(auth, email, password);
      sessions.push({ uid, auth, db, service: services(db, uid, auth) });
    }
    const [customer, technician, other] = sessions;
    const batch = admin.batch();
    for (let n = 1; n <= 43; n++) batch.set(admin.doc(`service_reviews/sync-history-${String(n).padStart(2, "0")}`), {
      requestId: `sync-history-${n}`, customerId: customer.uid, technicianId: technician.uid, rating: 4,
      ...(n === 1 ? {} : { customerName: "Nimal Bandara" }), comment: n === 1 ? "" : `Existing review ${n}`,
      createdAt: new Date(Date.UTC(2025, 0, n)),
    });
    await batch.commit();
    for (const [index, session] of sessions.entries()) stops.push(session.service.technician.subscribeToTechnicianReviews(index === 2 ? other.uid : technician.uid,
      (reviews, metadata, summary, cursor) => { if (summary && !metadata.fromCache) received[index].push({ reviews, summary, cursor }); }, (error) => { failure = error; }));
    await waitFor(() => received[0].at(-1)?.summary.count === 43 && received[1].at(-1)?.summary.count === 43 && received[2].at(-1)?.summary.count === 0);
    const head = received[1].at(-1), second = await technician.service.technician.getTechnicianReviewsPage(technician.uid, head.cursor);
    assert.equal(head.reviews.length, 20); assert.equal(second.reviews.length, 20);
    const requestId = "sync-new-completed-request";
    await request(requestId, { customerId: customer.uid, technicianId: technician.uid });
    await customer.service.review.submitServiceReview({ requestId, customerId: customer.uid, rating: 1, comment: "The repair still needs attention." });
    await waitFor(() => received[0].at(-1)?.summary.count === 44 && received[1].at(-1)?.summary.count === 44);
    const stored = (await admin.doc(`service_reviews/${requestId}_${customer.uid}`).get()).data();
    assert.equal(stored.technicianId, technician.uid); assert.equal(stored.requestId, requestId); assert.equal(stored.customerId, customer.uid);
    assert.equal(stored.rating, 1); assert.equal(stored.comment, "The repair still needs attention."); assert.equal(stored.customerName, "Nimal Bandara");
    assert.ok(stored.createdAt.toMillis() > Date.UTC(2025, 0, 1)); assert.equal(stored.photoPaths, undefined);
    const updated = received[1].at(-1);
    assert.equal(updated.reviews[0].id, `${requestId}_${customer.uid}`); assert.equal(updated.summary.count, 44);
    assert.ok(Math.abs(updated.summary.average - (43 * 4 + 1) / 44) < 1e-10);
    assert.equal(received[2].at(-1).summary.count, 0); assert.equal(received[2].at(-1).reviews.length, 0);
    let pages = syncPaging.rebaseReviewPages({ head: head.reviews, headCursor: head.cursor, extra: second.reviews, cursor: second.cursor }, updated.reviews, updated.cursor);
    assert.equal(pages.head.length + pages.extra.length, 41);
    const final = await technician.service.technician.getTechnicianReviewsPage(technician.uid, pages.cursor);
    const all = [...pages.head, ...pages.extra, ...final.reviews];
    assert.equal(all.length, 44); assert.equal(new Set(all.map((review) => review.id)).size, 44);
    await denied(customer.service.review.submitServiceReview({ requestId, customerId: customer.uid, rating: 5, comment: "duplicate" }));
    // Add a legacy record outside the dated window. Focus must explicitly refresh
    // aggregates without any change event from the limited head query.
    await admin.doc("service_reviews/sync-new-legacy").set({ requestId: "sync-old", customerId: customer.uid, technicianId: technician.uid, rating: 2, comment: "Legacy" });
    technician.service.technician.refreshTechnicianReviews(technician.uid);
    await waitFor(() => received[1].at(-1)?.summary.count === 45);
    assert.equal(received[1].at(-1).cursor.includeUndated, true);
    await denied(getDoc(doc(technician.db, "users", customer.uid)));
    await denied(updateDoc(doc(technician.db, "users", technician.uid), { averageRating: 5, reviewCount: 2000 }));
    assert.equal((await admin.doc(`users/${technician.uid}`).get()).data().reviewCount, 999);
  } finally { stops.forEach((stop) => stop()); await Promise.all(sessions.map(({ auth }) => signOut(auth))); }
});
