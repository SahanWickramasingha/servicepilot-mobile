import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
const { getFirestore: adminFirestore } = functionsRequire("firebase-admin/firestore");
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
  // Use the host realm: Firestore validates plain-object prototypes when writing.
  const evaluate = new Function("exports", "require", "__DEV__", output);
  evaluate(exports, (id) => deps[id] ?? sdk[id] ?? rootRequire(id), false);
  return exports;
}
const authorUi = loadTs("src/utils/reviewAuthor.ts");

function services(db, uid, authenticatedSession) {
  const config = { db, auth: authenticatedSession ?? { currentUser: uid ? { uid } : null } };
  const user = loadTs("src/services/user.service.ts", {
    "@/src/firebase/config": config,
    "@/src/utils/registrationDebug": {},
    "@/functions/src/domain/mapProjection": functionsRequire("./lib/domain/mapProjection.js"),
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
    }),
  };
}
const reviewData = (requestId, overrides = {}) => ({
  requestId, customerId: "customer", technicianId: "technician", customerName: "Bandara",
  rating: 4, comment: "Verry good service", createdAt, ...overrides,
});
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
});

after(async () => {
  await Promise.all([...clients.values()].map((db) => terminate(db)));
  await Promise.all(clientApps.map(deleteApp));
  await admin.terminate();
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
    const data = reviewData("names", { customerName: name });
    if (name === undefined) delete data.customerName;
    await denied(setDoc(reviewRef(db, "names"), data));
  }
  await request("placeholder", { customerId: "placeholder" });
  await denied(setDoc(reviewRef(client("placeholder"), "placeholder", "placeholder"),
    reviewData("placeholder", { customerId: "placeholder", customerName: "Customer" })));
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
  await setDoc(reviewRef(db, "current"), reviewData("current"));
  await admin.doc("service_requests/legacy").set({ customerId: "customer", assignedTechnicianId: "technician", status: "completed" });
  await setDoc(reviewRef(db, "legacy"), reviewData("legacy"));
  for (const [id, extra] of [["missing", { technicianId: null }], ["conflicting", { assignedTechnicianId: "other-tech" }], ["incomplete", { status: "in_progress" }]]) {
    await request(id, extra);
    await denied(setDoc(reviewRef(db, id), reviewData(id)));
  }
  await request("forged");
  await denied(setDoc(reviewRef(db, "forged"), reviewData("forged", { technicianId: "other-tech" })));
  for (const rating of [0, 6, 4.5, "4"]) await denied(setDoc(reviewRef(db, "forged"), reviewData("forged", { rating })));
});

test("concurrent duplicate submissions allow one create and preserve its value", async () => {
  const db = client("customer");
  await request("concurrent");
  const results = await Promise.allSettled([3, 5].map((rating) => setDoc(reviewRef(db, "concurrent"), reviewData("concurrent", { rating }))));
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
