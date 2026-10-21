import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import * as fsdk from "firebase/firestore";
import { getStorage, connectStorageEmulator, ref, uploadBytes, getMetadata, updateMetadata, deleteObject } from "firebase/storage";
import { performanceTestDependency } from "../lib/performance-test-deps.mjs";

const projectId = "demo-servicepilot-review-author", bucket = `${projectId}.appspot.com`;
const hosts = [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST, process.env.FIREBASE_STORAGE_EMULATOR_HOST];
if (!hosts.every((host) => /^(127\.0\.0\.1|localhost):\d+$/.test(host ?? ""))) throw new Error("Loopback Auth, Firestore and Storage emulators are required. No production access.");
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdminApp } = require("firebase-admin/app");
const { getFirestore: adminFirestore } = require("firebase-admin/firestore");
const { getAuth: adminAuth } = require("firebase-admin/auth");
const trusted = adminApp({ projectId }, "review-storage-tests"), admin = adminFirestore(trusted);
const clients = new Map(), notifications = [];
const jpeg = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==", "base64"));
const attempt = "abcdefghijklmnopqrst";
function load(path, deps = {}) {
  const exports = {}, code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", code)(exports, (id) => {
    if (id in deps) return deps[id];
    const shared = performanceTestDependency(id, deps);
    if (shared) return shared;
    if (id.startsWith("@/src/utils/")) return load(`${id.slice(2)}.ts`);
    if (id.startsWith("@/functions/src/domain/")) return require(`./lib/domain/${id.split("/").at(-1)}.js`);
    if (id === "@/src/constants/serviceRequests") return load("src/constants/serviceRequests.ts");
    throw new Error(`Unexpected test import ${id}`);
  }); return exports;
}
function reviewService(client) {
  return load("src/services/review.service.ts", { "firebase/firestore": fsdk,
    "@/src/firebase/config": { auth: client.auth, db: client.db },
    "@/src/services/notification.service": { createPersonalNotification: async (input) => notifications.push(input) } });
}
const c = (uid) => clients.get(`rs-${uid}`);
async function job(id, extra = {}) {
  await admin.doc(`service_requests/rs-${id}`).set({ customerId: "rs-owner", technicianId: "rs-tech", technicianName: "Gihan",
    title: "Review storage local fixture", status: "completed", ...extra });
}
const path = (id, slot = 0, uploadAttempt = attempt) => `review_photos/rs-owner/rs-${id}_rs-owner/${uploadAttempt}/${slot}.jpg`;
function metadata(id, overrides = {}) {
  return { contentType: "image/jpeg", cacheControl: "private, max-age=0, no-store", customMetadata: {
    customerId: "rs-owner", requestId: `rs-${id}`, reviewId: `rs-${id}_rs-owner`, technicianId: "rs-tech", attemptId: attempt, published: "false", ...overrides } };
}
async function upload(id, client = c("owner"), bytes = jpeg, meta = metadata(id), objectPath = path(id)) {
  return uploadBytes(ref(client.storage, objectPath), bytes, meta);
}
const denied = (promise) => assert.rejects(promise, (error) => ["permission-denied", "storage/unauthorized"].includes(error.code));
async function publish(id) {
  const reference = ref(c("owner").storage, path(id));
  const stored = await getMetadata(reference);
  await updateMetadata(reference, { customMetadata: { ...stored.customMetadata, published: "true" } });
}
async function media(id, client) {
  const headers = client ? { Authorization: `Bearer ${await client.auth.currentUser.getIdToken()}` } : {};
  return fetch(`http://${hosts[2]}/v0/b/${bucket}/o/${encodeURIComponent(path(id))}?alt=media`, { headers });
}
async function publishedReviewList(client) {
  const service = load("src/services/technician.service.ts", { "firebase/firestore": fsdk, "@/src/firebase/config": { auth: client.auth, db: client.db } });
  let stop;
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No confirmed review list")), 15000);
      stop = service.subscribeToTechnicianReviews("rs-tech", (reviews, metadata, summary) => {
        if (!summary || metadata.fromCache || !reviews.some((review) => review.requestId === "rs-photos")) return;
        clearTimeout(timeout); resolve({ reviews, summary });
      }, (error) => { clearTimeout(timeout); reject(error); });
    });
  } finally { stop?.(); }
}
before(async () => {
  fsdk.setLogLevel("silent");
  for (const [short, role, verified = true, active = true] of [
    ["owner", "customer"], ["viewer", "customer"], ["tech", "technician"], ["other-tech", "technician"],
    ["dispatcher", "dispatcher"], ["admin", "super_admin"], ["unverified", "customer", false], ["inactive", "customer", true, false],
  ]) {
    const uid = `rs-${short}`, email = `${uid}@example.test`, password = "Local-review-only-123!";
    await adminAuth(trusted).createUser({ uid, email, password, emailVerified: verified });
    await admin.doc(`users/${uid}`).set({ uid, fullName: short === "owner" ? "Nimal Bandara" : short, role,
      accountStatus: active ? "active" : "disabled", ...(role === "technician" ? { technicianApprovalStatus: "approved" } : {}) });
    const app = initializeApp({ projectId, apiKey: "emulator-only", storageBucket: bucket }, uid);
    const auth = getAuth(app); connectAuthEmulator(auth, `http://${hosts[1]}`, { disableWarnings: true });
    const db = fsdk.getFirestore(app); const [hostname, port] = hosts[0].split(":"); fsdk.connectFirestoreEmulator(db, hostname, Number(port));
    const storage = getStorage(app); const [storageHost, storagePort] = hosts[2].split(":"); connectStorageEmulator(storage, storageHost, Number(storagePort));
    storage.maxUploadRetryTime = 1000; storage.maxOperationRetryTime = 1000;
    await signInWithEmailAndPassword(auth, email, password); clients.set(uid, { app, db, auth, storage });
  }
});
after(async () => {
  await Promise.all([...clients.values()].map(async (client) => { await fsdk.terminate(client.db); await deleteApp(client.app); }));
  await admin.terminate(); await deleteAdminApp(trusted);
});

test("read-only context creates nothing; explicit low-star review without photos derives the technician and commits once", async () => {
  await job("no-photo"); const service = reviewService(c("owner"));
  const context = await service.getCustomerReviewContext("rs-no-photo"); assert.equal(context.existingReview, null);
  assert.equal((await admin.doc("service_reviews/rs-no-photo_rs-owner").get()).exists, false);
  const result = await service.submitServiceReview({ requestId: "rs-no-photo", customerId: "rs-owner", rating: 1, comment: "  Needs improvement  " });
  assert.equal(result.review.technicianId, "rs-tech"); assert.equal(result.review.comment, "Needs improvement");
  assert.equal((await service.getCustomerReviewContext("rs-no-photo")).existingReview.rating, 1);
  await denied(service.submitServiceReview({ requestId: "rs-no-photo", customerId: "rs-owner", rating: 5, comment: "overwrite" }));
  assert.equal(notifications.filter((entry) => entry.requestId === "rs-no-photo").length, 1);
});
test("selected photos upload, publish only after persistence, follow review visibility, and stay immutable", async () => {
  await job("photos"); await upload("photos");
  assert.equal((await media("photos", c("viewer"))).status, 403); assert.equal((await media("photos", c("owner"))).status, 200);
  await denied(publish("photos"));
  await reviewService(c("owner")).submitServiceReview({ requestId: "rs-photos", customerId: "rs-owner", rating: 2,
    comment: "Still leaking", photoPaths: [path("photos")], photoAttemptId: attempt });
  await publish("photos");
  for (const viewer of ["viewer", "tech"]) {
    const { reviews, summary } = await publishedReviewList(c(viewer));
    const submitted = reviews.find((review) => review.requestId === "rs-photos");
    assert.equal(submitted.rating, 2); assert.equal(submitted.comment, "Still leaking");
    assert.equal(submitted.customerName, "Nimal Bandara"); assert.deepEqual(submitted.photoPaths, [path("photos")]);
    assert.deepEqual(summary, { count: 2, average: 1.5 });
    await denied(fsdk.getDoc(fsdk.doc(c(viewer).db, "users", "rs-owner")));
  }
  for (const viewer of ["owner", "viewer", "tech", "admin"]) assert.equal((await media("photos", c(viewer))).status, 200, viewer);
  for (const viewer of ["other-tech", "dispatcher", "unverified", "inactive"]) assert.equal((await media("photos", c(viewer))).status, 403, viewer);
  assert.equal((await media("photos", null)).status, 403);
  await denied(deleteObject(ref(c("owner").storage, path("photos"))));
  await denied(upload("photos", c("owner"), new Uint8Array([255, 216, 255, 1, 2])));
  const changed = jpeg.slice(); changed[100] ^= 1;
  await denied(upload("photos", c("owner"), changed, metadata("photos", { published: "true" })));
  const stored = await getMetadata(ref(c("owner").storage, path("photos")));
  await denied(updateMetadata(ref(c("owner").storage, path("photos")), { customMetadata: { ...stored.customMetadata, technicianId: "rs-other-tech", published: "true" } }));
  await publish("photos"); // Safe, idempotent retry.
  await admin.doc("users/rs-tech").update({ technicianApprovalStatus: "rejected" });
  assert.equal((await media("photos", c("viewer"))).status, 403); assert.equal((await media("photos", c("tech"))).status, 403);
  assert.equal((await media("photos", c("owner"))).status, 200);
  await admin.doc("users/rs-tech").update({ technicianApprovalStatus: "approved" });
  await admin.doc("users/rs-viewer").update({ lifecyclePending: true });
  assert.equal((await media("photos", c("viewer"))).status, 403);
  await admin.doc("users/rs-viewer").update({ lifecyclePending: false, sessionRevokedAt: Math.floor(Date.now() / 1000) + 60 });
  assert.equal((await media("photos", c("viewer"))).status, 403);
});
test("Storage denies wrong owners, incomplete jobs, unsupported MIME, oversized files, publication forgery and private request-photo paths", async () => {
  await job("denials"); await job("incomplete", { status: "in_progress" });
  await denied(upload("denials", c("viewer")));
  await denied(upload("denials", c("inactive")));
  await denied(upload("denials", c("unverified")));
  await denied(upload("incomplete"));
  await denied(upload("denials", c("owner"), jpeg, { ...metadata("denials"), contentType: "image/svg+xml" }));
  await denied(upload("denials", c("owner"), new Uint8Array(5 * 1024 * 1024 + 1)));
  await denied(upload("denials", c("owner"), jpeg, metadata("denials", { published: "true" })));
  await denied(upload("denials", c("owner"), jpeg, metadata("denials", { technicianId: "rs-other-tech" })));
  await denied(upload("denials", c("owner"), jpeg, metadata("denials"), "request_photos/rs-owner/private.jpg"));
  await denied(upload("denials", c("owner"), jpeg, metadata("denials"), path("denials", 5)));
});
test("Firestore enforces comment bounds, explicit rating, ownership, technician identity and photo paths for direct malicious clients", async () => {
  await job("malicious"); const client = c("owner"), id = "rs-malicious_rs-owner";
  const valid = { requestId: "rs-malicious", customerId: "rs-owner", customerName: "Nimal Bandara", technicianId: "rs-tech", rating: 1, comment: "", createdAt: fsdk.serverTimestamp() };
  for (const extra of [{ rating: 0 }, { rating: 4.5 }, { rating: 6 }, { comment: "x".repeat(301) }, { comment: 5 }, { technicianId: "rs-other-tech" },
    { customerId: "rs-viewer" }, { photoPaths: ["request_photos/private.jpg"], photoAttemptId: attempt },
    { photoPaths: [path("malicious")], photoAttemptId: "forged" }, { photoPaths: Array(6).fill(path("malicious")), photoAttemptId: attempt }]) {
    await denied(fsdk.setDoc(fsdk.doc(client.db, "service_reviews", id), { ...valid, ...extra }));
  }
  await denied(fsdk.setDoc(fsdk.doc(c("viewer").db, "service_reviews", "rs-malicious_rs-viewer"), { ...valid, customerId: "rs-viewer", customerName: "viewer" }));
  await assert.rejects(reviewService(client).submitServiceReview({ requestId: "rs-malicious", customerId: "rs-owner", technicianId: "rs-other-tech", rating: 5, comment: "" }), /does not match/);
  await job("not-completed", { status: "accepted" });
  await assert.rejects(reviewService(client).submitServiceReview({ requestId: "rs-not-completed", customerId: "rs-owner", rating: 5, comment: "" }), /completed/);
  assert.equal((await admin.doc(`service_reviews/${id}`).get()).exists, false);
});
test("cleanup deletes only unused attempts; a concurrent winner's committed photo is protected even before publication", async () => {
  await job("cleanup"); await upload("cleanup");
  const loserAttempt = "zyxwvutsrqponmlkjihg", loser = path("cleanup", 0, loserAttempt);
  await upload("cleanup", c("owner"), jpeg, metadata("cleanup", { attemptId: loserAttempt }), loser);
  const service = reviewService(c("owner"));
  const input = { requestId: "rs-cleanup", customerId: "rs-owner", rating: 3, comment: "Honest review", photoPaths: [path("cleanup")], photoAttemptId: attempt };
  const results = await Promise.allSettled([service.submitServiceReview(input), service.submitServiceReview({ ...input, rating: 4 })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  await denied(deleteObject(ref(c("owner").storage, path("cleanup"))));
  await deleteObject(ref(c("owner").storage, loser));
  await job("failed-firestore"); await upload("failed-firestore");
  await denied(service.submitServiceReview({ ...input, requestId: "rs-failed-firestore", photoPaths: [path("failed-firestore")], comment: "x".repeat(301) }).catch((error) => {
    // Client rejects before sending; directly exercise the equivalent server denial.
    assert.match(error.message, /300/);
    return fsdk.setDoc(fsdk.doc(c("owner").db, "service_reviews", "rs-failed-firestore_rs-owner"), {
      ...input, requestId: "rs-failed-firestore", customerName: "Nimal Bandara", photoPaths: [path("failed-firestore")], comment: "x".repeat(301), createdAt: fsdk.serverTimestamp() });
  }));
  await deleteObject(ref(c("owner").storage, path("failed-firestore")));
});
