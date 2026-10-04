import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import * as firestore from "firebase/firestore";
const PROJECT = "demo-servicepilot-review-author";
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST, process.env.FIREBASE_EMULATOR_HUB]) {
  if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error("Only run with the configured loopback emulators.");
}
const requireRoot = createRequire(new URL("../../package.json", import.meta.url));
const requireFunctions = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp: initAdmin } = requireFunctions("firebase-admin/app");
const { getAuth: getAdminAuth } = requireFunctions("firebase-admin/auth");
const { getFirestore: getAdminDb, Timestamp } = requireFunctions("firebase-admin/firestore");
const domain = requireFunctions("./lib/domain/map.js");
const projection = requireFunctions("./lib/domain/mapProjection.js");
const trustedApp = initAdmin({ projectId: PROJECT });
const admin = getAdminDb(trustedApp);
const accounts = new Map();
const ts = requireRoot("typescript");
const errorExports = {};
new Function("exports", ts.transpileModule(readFileSync(new URL("../../src/utils/mapServiceError.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(errorExports);

function loadService(session) {
  const output = ts.transpileModule(readFileSync(new URL("../../src/services/location.service.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  const deps = { "firebase/firestore": firestore,
    "@/src/firebase/config": { default: session.app, auth: session.auth, db: session.db }, "@/functions/src/domain/map": domain,
    "@/src/utils/mapServiceError": errorExports };
  deps["@/functions/src/domain/mapProjection"] = projection;
  deps["@/functions/src/domain/serviceAreas"] = requireFunctions("./lib/domain/serviceAreas.js");
  new Function("exports", "require", "__DEV__", output)(exports, (id) => deps[id] ?? requireRoot(id), false);
  return exports;
}
const denied = (promise) => assert.rejects(promise, (error) => error.code?.endsWith("permission-denied") || error.code?.endsWith("unauthenticated"));
const point = { latitude: 7.290612, longitude: 80.633701 };
const customer = () => accounts.get("map-customer-a");
const other = () => accounts.get("map-customer-b");
const tech = () => accounts.get("map-tech");

async function maliciousBatch(session, uid, raw = point, cells = {}) {
  const updatedAt = firestore.serverTimestamp();
  const base = { technicianId: uid, sharingEnabled: true, updatedAt };
  const batch = firestore.writeBatch(session.db);
  batch.set(firestore.doc(session.db, "technician_locations", uid), { ...base, sampledAt: firestore.Timestamp.now(), ...raw });
  batch.set(firestore.doc(session.db, "technician_map_locations", uid), { ...base,
    latCell: Math.floor(point.latitude * 100), lngCell: Math.floor(point.longitude * 100), ...cells });
  return batch.commit();
}
async function job(id, data = {}) {
  await admin.doc(`service_requests/${id}`).set({ customerId: "map-customer-a", technicianId: "map-tech", status: "accepted", ...data });
}

before(async () => {
  firestore.setLogLevel("silent");
  for (const [uid, role, fullName, extra] of [
    ["map-customer-a", "customer", "Customer A", {}], ["map-customer-b", "customer", "Customer B", {}],
    ["map-tech", "technician", "Map Technician", { serviceDistrictIds: ["colombo", "gampaha", "kandy"], specialization: "Electrical" }],
    ["map-legacy", "technician", "Legacy Technician", { serviceDivision: "Colombo District", specialization: "Electrical" }],
    ["map-plumber", "technician", "Plumber", { serviceDistrictIds: ["colombo"], specialization: "Plumbing" }],
    ["map-pending", "technician", "Pending", { serviceDistrictIds: ["colombo"], technicianApprovalStatus: "pending" }],
    ["map-disabled", "technician", "Disabled", { serviceDistrictIds: ["colombo"], accountStatus: "disabled" }],
    ["map-unknown", "technician", "Missing coverage", { address: "Colombo", serviceAreas: "Katunayake" }],
    ["map-dispatcher", "dispatcher", "Dispatcher", {}], ["map-unverified", "customer", "Unverified", {}],
    ["map-disabled-customer", "customer", "Disabled Customer", { accountStatus: "disabled" }],
  ]) {
    const email = `${uid}@example.test`, password = "Only-for-map-emulator-42";
    await getAdminAuth(trustedApp).createUser({ uid, email, password, emailVerified: uid !== "map-unverified" });
    await admin.doc(`users/${uid}`).set({ uid, role, fullName, accountStatus: "active", emailVerified: true,
      ...(role === "technician" ? { technicianApprovalStatus: "approved", averageRating: 4, reviewCount: 3 } : {}),
      email, phone: "private", address: "private", ...extra });
    const app = initializeApp({ projectId: PROJECT, apiKey: "emulator-only" }, uid);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    const db = firestore.getFirestore(app);
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
    firestore.connectFirestoreEmulator(db, host, Number(port));
    await signInWithEmailAndPassword(auth, email, password);
    const session = { app, auth, db };
    session.service = loadService(session);
    accounts.set(uid, session);
    if (role === "technician") {
      if (extra.accountStatus === "disabled" || extra.technicianApprovalStatus === "pending") {
        const profile = (await admin.doc(`users/${uid}`).get()).data();
        await admin.doc(`technician_map_profiles/${uid}`).set({ ...projection.buildMapProfile(uid, profile), updatedAt: Timestamp.now() });
      } else await session.service.syncOwnMapProfile(uid);
    }
  }
});
after(async () => {
  await Promise.all([...accounts.values()].map(async ({ auth, db, app }) => { await signOut(auth); await firestore.terminate(db); await deleteApp(app); }));
  await admin.terminate();
});

test("25 unique districts, known boundaries, and deliberate legacy coverage", () => {
  assert.equal(domain.DISTRICTS.length, 25);
  assert.equal(new Set(domain.DISTRICTS.map((d) => d.id)).size, 25);
  assert.deepEqual(domain.resolveServiceDistrictIds({ serviceDivision: "Colombo", serviceAreas: "Gampaha; Nuwara Eliya" }), ["colombo", "gampaha", "nuwara-eliya"]);
  assert.deepEqual(domain.resolveServiceDistrictIds({ address: "Colombo", serviceAreas: "Katunayake" }), []);
  assert.deepEqual(domain.resolveServiceDistrictIds({ serviceDistrictIds: [], serviceDivision: "Colombo" }), []);
  const colombo = domain.DISTRICTS.find((d) => d.id === "colombo");
  assert.equal(domain.pointInDistrict({ latitude: 6.9271, longitude: 79.8612 }, colombo), true);
  assert.equal(domain.pointInDistrict(point, colombo), false);
});

test("real Firestore query: district/category filtering returns only approved safe projections, including no-GPS Technicians", async () => {
  const directory = await customer().service.getMapTechnicians("colombo", "Electrical");
  assert.deepEqual(directory.map((t) => t.uid).sort(), ["map-legacy", "map-tech"]);
  assert.equal(directory.find((t) => t.uid === "map-tech").averageRating, 4);
  for (const profile of directory) assert.deepEqual(Object.keys(profile).sort(), ["uid", "fullName", "specialization", "serviceDistrictIds", "averageRating", "reviewCount"].sort());
  assert.deepEqual((await customer().service.getMapTechnicians("gampaha")).map((t) => t.uid), ["map-tech"]);
  assert.deepEqual(await customer().service.getMapTechnicians("jaffna"), []);
  for (const uid of ["map-dispatcher", "map-tech", "map-unverified", "map-disabled-customer"]) await denied(accounts.get(uid).service.getMapTechnicians("colombo"));
});

test("sharing ON publishes exact private and coarse public data; OFF removes both coordinates", async () => {
  await tech().service.publishTechnicianLocation("map-tech", point);
  const publicRef = firestore.doc(customer().db, "technician_map_locations", "map-tech");
  const data = (await firestore.getDoc(publicRef)).data();
  assert.equal(data.latCell, 729); assert.equal(data.lngCell, 8063);
  assert.equal(data.sharingEnabled, true);
  assert.ok(data.updatedAt.toMillis() > Date.now() - 10000);
  assert.ok(!Object.hasOwn(data, "latitude") && !Object.hasOwn(data, "longitude"));
  const mapped = await new Promise((resolve, reject) => {
    const unsubscribe = customer().service.subscribeToMapLocation("map-tech", (location) => { if (location) { unsubscribe(); resolve(location); } }, (error) => { if (error.kind !== "network") reject(error); });
  });
  assert.equal(mapped.latitude, 7.295); assert.equal(mapped.longitude, 80.635);
  assert.notEqual(mapped.latitude, point.latitude);
  const explicit = await customer().service.getLatestMapLocation("map-tech");
  assert.deepEqual(explicit.location, mapped);
  assert.equal(explicit.updatedAtMs, data.updatedAt.toMillis());
  await denied(other().service.getLatestMapLocation("map-pending"));
  await tech().service.publishTechnicianLocation("map-tech");
  assert.equal((await firestore.getDoc(publicRef)).data().sharingEnabled, false);
  const raw = (await admin.doc("technician_locations/map-tech").get()).data();
  assert.ok(!Object.hasOwn(raw, "latitude") && !Object.hasOwn(raw, "longitude"));
  const hidden = await new Promise((resolve, reject) => {
    const unsubscribe = customer().service.subscribeToMapLocation("map-tech", (location) => { if (!location) { unsubscribe(); resolve(location); } }, (error) => { if (error.kind !== "network") reject(error); });
  });
  assert.equal(hidden, null);
  const stopped = await customer().service.getLatestMapLocation("map-tech");
  assert.equal(stopped.location, null); assert.ok(stopped.updatedAtMs >= explicit.updatedAtMs);
});

test("matching Kandy filter includes the approved Technician; Kurunegala does not, and OFF hides its marker", async () => {
  assert.deepEqual((await customer().service.getMapTechnicians("kandy", "Electrical")).map((t) => t.uid), ["map-tech"]);
  assert.deepEqual(await customer().service.getMapTechnicians("kurunegala"), []);
  await tech().service.publishTechnicianLocation("map-tech", point);
  const publicRef = firestore.doc(customer().db, "technician_map_locations", "map-tech");
  assert.equal((await firestore.getDoc(publicRef)).data().sharingEnabled, true);
  await denied(firestore.getDoc(firestore.doc(customer().db, "technician_locations", "map-tech")));
  await tech().service.publishTechnicianLocation("map-tech");
  assert.equal((await firestore.getDoc(publicRef)).data().sharingEnabled, false);
  assert.deepEqual((await customer().service.getMapTechnicians("kandy")).map((t) => t.uid), ["map-tech"]);
});

test("identity spoofing, wrong roles, broad queries, and precise browsing are denied", async () => {
  await denied(maliciousBatch(tech(), "map-legacy"));
  await denied(maliciousBatch(customer(), "map-customer-a"));
  await denied(maliciousBatch(accounts.get("map-pending"), "map-pending"));
  await denied(maliciousBatch(accounts.get("map-disabled"), "map-disabled"));
  for (const session of [customer(), other(), accounts.get("map-dispatcher")]) {
    await denied(firestore.getDoc(firestore.doc(session.db, "technician_locations", "map-tech")));
    await denied(firestore.getDocs(firestore.collection(session.db, "technician_locations")));
  }
  await denied(firestore.getDocs(firestore.collection(customer().db, "technician_map_locations")));
});

test("coordinate range/type, integer grid, private-field injection, pairing, and server timestamps are enforced", async () => {
  for (const raw of [{ latitude: 91, longitude: 80 }, { latitude: 7, longitude: -181 }, { latitude: "7", longitude: 80 }, { latitude: null, longitude: 80 }]) await denied(maliciousBatch(tech(), "map-tech", raw));
  // A queued offline fix cannot receive a fresh server timestamp hours later.
  await denied(maliciousBatch(tech(), "map-tech", { ...point, sampledAt: firestore.Timestamp.fromMillis(Date.now() - 180000) }));
  await denied(maliciousBatch(tech(), "map-tech", { ...point, sampledAt: firestore.Timestamp.fromMillis(Date.now() + 60000) }));
  for (const cells of [{ latCell: 729.0612 }, { lngCell: 9000 }, { latitude: point.latitude }, { updatedAt: firestore.Timestamp.fromMillis(0) }]) await denied(maliciousBatch(tech(), "map-tech", point, cells));
  await denied(firestore.setDoc(firestore.doc(tech().db, "technician_locations", "map-tech"), { technicianId: "map-tech", sharingEnabled: true, ...point, updatedAt: firestore.serverTimestamp() }));
  await tech().service.publishTechnicianLocation("map-tech", point);
});

test("Firestore precise reads allow only Customer A's eligible job and stop on completion/cancellation", async () => {
  await tech().service.publishTechnicianLocation("map-tech", point);
  await job("map-job");
  const result = await customer().service.getJobTechnicianLocation("map-job");
  assert.equal(result.status, "available"); assert.equal(result.latitude, point.latitude); assert.equal(result.technicianId, "map-tech");
  await denied(other().service.getJobTechnicianLocation("map-job"));
  await denied(accounts.get("map-dispatcher").service.getJobTechnicianLocation("map-job"));
  for (const status of ["requested", "completed", "cancelled", "rejected"]) {
    await admin.doc("service_requests/map-job").update({ status });
    await denied(customer().service.getJobTechnicianLocation("map-job"));
    await denied(firestore.getDocFromServer(firestore.doc(customer().db, "technician_locations", "map-tech")));
  }
  await admin.doc("service_requests/map-job").update({ status: "in_progress" });
  assert.equal((await customer().service.getJobTechnicianLocation("map-job")).status, "available");
  await denied(firestore.setDoc(firestore.doc(other().db, "technician_location_access", "map-tech", "customers", "map-customer-b"), {
    requestId: "map-job", customerId: "map-customer-b", technicianId: "map-tech", updatedAt: firestore.serverTimestamp(),
  }));
  await denied(firestore.getDocFromServer(firestore.doc(other().db, "technician_locations", "map-tech")));
});

test("precise access stops immediately on OFF and expiry; legacy request identities remain safe", async () => {
  await tech().service.publishTechnicianLocation("map-tech");
  assert.deepEqual(await customer().service.getJobTechnicianLocation("map-job"), { status: "not-sharing" });
  await denied(firestore.getDocFromServer(firestore.doc(customer().db, "technician_locations", "map-tech")));
  await admin.doc("technician_locations/map-tech").set({ technicianId: "map-tech", sharingEnabled: true, ...point, updatedAt: Timestamp.fromMillis(Date.now() - 180000) });
  await admin.doc("technician_map_locations/map-tech").set({ technicianId: "map-tech", sharingEnabled: true, latCell: 729, lngCell: 8063, updatedAt: Timestamp.fromMillis(Date.now() - 180000) });
  assert.deepEqual(await customer().service.getJobTechnicianLocation("map-job"), { status: "stale" });
  await denied(firestore.getDocFromServer(firestore.doc(customer().db, "technician_locations", "map-tech")));
  assert.equal(domain.locationIsFresh(Date.now() - 180000), false);
  await tech().service.publishTechnicianLocation("map-tech", point);
  await admin.doc("service_requests/map-legacy-job").set({ customerId: "map-customer-a", assignedTechnicianId: "map-tech", status: "assigned" });
  assert.equal((await customer().service.getJobTechnicianLocation("map-legacy-job")).status, "available");
  await job("map-conflict", { assignedTechnicianId: "map-legacy" });
  await assert.rejects(customer().service.getJobTechnicianLocation("map-conflict"), (e) => e.code.endsWith("failed-precondition"));
});

test("projection fields are validated against authoritative approval, identity, categories, districts and ratings", async () => {
  const profile = (await admin.doc("users/map-tech").get()).data();
  const trusted = projection.buildMapProfile("map-tech", profile);
  for (const forged of [{ technicianId: "map-legacy" }, { averageRating: 5 }, { reviewCount: 999 },
    { fullName: "Another Technician" }, { serviceCategory: "Plumbing" }, { serviceDistrictIds: ["jaffna"] },
    { latitude: point.latitude }, { phone: "private" }]) {
    await denied(firestore.setDoc(firestore.doc(tech().db, "technician_map_profiles", "map-tech"), {
      ...trusted, ...forged, updatedAt: firestore.serverTimestamp(),
    }));
  }
  await denied(firestore.setDoc(firestore.doc(tech().db, "technician_map_profiles", "map-legacy"), { ...trusted, updatedAt: firestore.serverTimestamp() }));
  const pending = accounts.get("map-pending");
  await denied(firestore.setDoc(firestore.doc(pending.db, "technician_map_profiles", "map-pending"), {
    ...projection.buildMapProfile("map-pending", (await admin.doc("users/map-pending").get()).data()), approved: true, updatedAt: firestore.serverTimestamp(),
  }));
  await denied(firestore.updateDoc(firestore.doc(pending.db, "users", "map-pending"), { technicianApprovalStatus: "approved" }));
});

test("bounded query pagination and verified gets work; broad/unconstrained queries and stale approval are denied", async () => {
  for (let index = 0; index < 9; index++) {
    const uid = `map-page-${index}`, profile = { role: "technician", fullName: uid, accountStatus: "active", technicianApprovalStatus: "approved", serviceDistrictIds: ["kegalle"], specialization: "Electrical" };
    await admin.doc(`users/${uid}`).set(profile);
    await admin.doc(`technician_map_profiles/${uid}`).set({ ...projection.buildMapProfile(uid, profile), updatedAt: Timestamp.now() });
  }
  const first = await customer().service.getMapTechnicianPage("kegalle");
  assert.equal(first.items.length, 8); assert.equal(first.hasMore, true);
  const last = await customer().service.getMapTechnicianPage("kegalle", undefined, first.cursor);
  assert.equal(last.items.length, 1); assert.equal(last.hasMore, false);
  assert.equal(new Set([...first.items, ...last.items].map((t) => t.uid)).size, 9);
  const directory = firestore.collection(customer().db, "technician_map_profiles");
  await denied(firestore.getDocs(firestore.query(directory, firestore.limit(8))));
  await denied(firestore.getDocs(firestore.query(directory, firestore.where("approved", "==", true), firestore.limit(25))));
  // Even a trusted out-of-band change cannot leave a revoked Technician readable.
  await admin.doc("users/map-page-0").update({ technicianApprovalStatus: "rejected" });
  await denied(firestore.getDocFromServer(firestore.doc(customer().db, "technician_map_profiles", "map-page-0")));
  await denied(customer().service.getMapTechnicianPage("kegalle"));
});

test("only Technicians can store valid service district identifiers", async () => {
  await tech().service.updateServiceDistricts("map-tech", ["kandy", "colombo"]);
  assert.deepEqual((await admin.doc("users/map-tech").get()).data().serviceDistrictIds, ["kandy", "colombo"]);
  await denied(firestore.updateDoc(firestore.doc(tech().db, "users", "map-tech"), { serviceDistrictIds: ["imaginary"] }));
  await denied(firestore.updateDoc(firestore.doc(customer().db, "users", "map-customer-a"), { serviceDistrictIds: ["colombo"] }));
  await assert.rejects(tech().service.updateServiceDistricts("map-legacy", ["colombo"]), /own account/);
});

test("actual Admin Web Dispatcher service publishes approval/rejection snapshots atomically; private Customers stay protected", async () => {
  const dispatcher = accounts.get("map-dispatcher");
  const source = (await admin.doc("users/map-pending").get()).data();
  const changes = { technicianApprovalStatus: "approved", reviewedBy: "map-dispatcher", reviewedAt: firestore.serverTimestamp(), updatedAt: firestore.serverTimestamp() };
  await denied(firestore.updateDoc(firestore.doc(dispatcher.db, "users", "map-pending"), changes));
  const output = ts.transpileModule(readFileSync(new URL("../../admin-web/src/services/technicianApprovalService.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {}, deps = { "firebase/firestore": firestore, "../firebase/config": { db: dispatcher.db }, "../../../functions/src/domain/mapProjection": projection };
  new Function("exports", "require", output)(exports, (id) => deps[id] ?? requireRoot(id));
  await exports.reviewTechnicianApplication({ technicianUid: "map-pending", dispatcherUid: "map-dispatcher", status: "approved" });
  assert.equal((await firestore.getDocFromServer(firestore.doc(customer().db, "technician_map_profiles", "map-pending"))).data().approved, true);
  await admin.doc("users/map-rejection").set({ ...source, uid: "map-rejection" });
  await assert.rejects(exports.reviewTechnicianApplication({ technicianUid: "map-rejection", dispatcherUid: "map-dispatcher", status: "rejected" }), /valid application review/);
  await exports.reviewTechnicianApplication({ technicianUid: "map-rejection", dispatcherUid: "map-dispatcher", status: "rejected", rejectionReason: "Fixture rejection" });
  assert.equal((await admin.doc("technician_map_profiles/map-rejection").get()).data().approved, false);
  await denied(firestore.getDocFromServer(firestore.doc(other().db, "users", "map-customer-a")));
});

test("Personal Information persists district areas atomically without changing GPS, sharing, ratings or private access", async () => {
  const areaDomain = requireFunctions("./lib/domain/serviceAreas.js");
  const loadProfileService = (session) => {
    const code = ts.transpileModule(readFileSync(new URL("../../src/services/user.service.ts", import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const exports = {}, deps = { "firebase/firestore": firestore, "@/src/firebase/config": session,
      "@/src/utils/registrationDebug": {}, "@/functions/src/domain/mapProjection": projection, "@/functions/src/domain/serviceAreas": areaDomain };
    new Function("exports", "require", code)(exports, (id) => deps[id] ?? requireRoot(id)); return exports;
  };
  const userService = loadProfileService(tech());
  const peradeniya = areaDomain.SERVICE_AREA_CATALOGUE.kandy.find((a) => a.label === "Peradeniya");
  const privateBefore = (await admin.doc("technician_locations/map-tech").get()).data();
  const publicBefore = (await admin.doc("technician_map_locations/map-tech").get()).data();
  const fields = { fullName: "Map Technician", phone: "private", address: "private", serviceDistrictIds: ["kandy", "colombo"],
    serviceAreasByDistrict: { kandy: peradeniya, colombo: { id: "other", label: "Local town", source: "technician" } } };
  await userService.updateUserProfileSafe("map-tech", fields);
  const reopened = await userService.getUserProfile("map-tech");
  const encoded = areaDomain.encodeServiceAreas(fields.serviceDistrictIds, fields.serviceAreasByDistrict);
  assert.deepEqual(reopened.serviceAreasByDistrict, encoded);
  assert.equal(reopened.averageRating, 4); assert.equal(reopened.reviewCount, 3);
  const directory = await customer().service.getMapTechnicians("kandy");
  assert.deepEqual(directory.find((t) => t.uid === "map-tech").serviceAreasByDistrict, encoded);
  // Keep the customer's subscription open during repeated authoritative profile saves.
  const waiters = [];
  const stop = customer().service.subscribeToMapTechnicians("kandy", "Electrical", 1, (page) => {
    const area = page.items.find((t) => t.uid === "map-tech")?.serviceAreasByDistrict?.kandy;
    for (const waiter of [...waiters]) if (waiter.id === area) waiter.resolve();
  }, (error) => { if (error.kind !== "network") for (const waiter of waiters) waiter.reject(error); });
  const waitFor = (id) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for saved area ${id}`)), 10000);
    waiters.push({ id, resolve: () => { clearTimeout(timer); resolve(); }, reject: (error) => { clearTimeout(timer); reject(error); } });
  });
  try {
    await waitFor(peradeniya.id);
    const katugastota = areaDomain.SERVICE_AREA_CATALOGUE.kandy.find((a) => a.label === "Katugastota");
    for (const area of [katugastota, peradeniya, katugastota]) {
      const received = waitFor(area.id);
      await userService.updateUserProfileSafe("map-tech", { ...fields, serviceAreasByDistrict: { ...fields.serviceAreasByDistrict, kandy: area } });
      await received;
      assert.equal((await userService.getUserProfile("map-tech")).serviceAreasByDistrict.kandy, area.id);
    }
  } finally { stop(); }
  assert.deepEqual((await admin.doc("technician_locations/map-tech").get()).data(), privateBefore);
  assert.deepEqual((await admin.doc("technician_map_locations/map-tech").get()).data(), publicBefore);
  const mapCard = directory.find((t) => t.uid === "map-tech");
  for (const privateField of ["address", "phone", "email", "latitude", "longitude"]) assert.equal(privateField in mapCard, false);
  await denied(firestore.getDocFromServer(firestore.doc(customer().db, "users", "map-tech")));
  await denied(firestore.getDocs(firestore.query(firestore.collection(customer().db, "users"), firestore.where("role", "==", "technician"), firestore.where("technicianApprovalStatus", "==", "approved"))));
  await assert.rejects(userService.updateUserProfileSafe("map-tech", { ...fields, serviceDistrictIds: ["colombo"] }), /selected district/);
  await tech().service.updateServiceDistricts("map-tech", ["colombo"]);
  assert.deepEqual((await userService.getUserProfile("map-tech")).serviceAreasByDistrict, { colombo: encoded.colombo });
  // Old district-only profiles remain valid and can be saved without recreation.
  await userService.updateUserProfileSafe("map-tech", { ...fields, serviceAreasByDistrict: {} });
});

test("rules reject area spoofing, mismatched districts, extra fields and non-Technician area writes", async () => {
  const areaDomain = requireFunctions("./lib/domain/serviceAreas.js");
  const peradeniya = areaDomain.SERVICE_AREA_CATALOGUE.kandy.find((a) => a.label === "Peradeniya");
  const ref = firestore.doc(tech().db, "users", "map-tech");
  for (const areas of [{ colombo: peradeniya.id }, { kandy: "lk-postal-20400-fake" },
    { kandy: { ...peradeniya, latitude: 7 } }, { imaginary: peradeniya },
    { kandy: "other:bad\narea" }, { kandy: "other:  " }, { kandy: "other:" + "x".repeat(81) },
    { kandy: "other:<area>" }, { kandy: "other: Local area" }, { kandy: "other:Local area " }]) {
    await denied(firestore.updateDoc(ref, { serviceAreasByDistrict: areas }));
  }
  await denied(firestore.updateDoc(firestore.doc(customer().db, "users", "map-customer-a"), { serviceAreasByDistrict: {} }));
  const source = (await admin.doc("users/map-tech").get()).data();
  await denied(firestore.setDoc(firestore.doc(tech().db, "technician_map_profiles", "map-tech"), {
    ...projection.buildMapProfile("map-tech", source), serviceAreasByDistrict: { kandy: peradeniya.id }, updatedAt: firestore.serverTimestamp(),
  }));
  // Exercise the largest permitted district map against the rules evaluation budget.
  const serviceDistrictIds = domain.DISTRICTS.map((d) => d.id);
  const serviceAreasByDistrict = Object.fromEntries(serviceDistrictIds.map((id) => [id, "other:Local area"]));
  const batch = firestore.writeBatch(tech().db);
  batch.update(ref, { serviceDistrictIds, serviceAreasByDistrict });
  batch.set(firestore.doc(tech().db, "technician_map_profiles", "map-tech"), {
    ...projection.buildMapProfile("map-tech", { ...source, serviceDistrictIds, serviceAreasByDistrict }), updatedAt: firestore.serverTimestamp(),
  });
  await batch.commit();
});

test("existing customer profile/list actions read only public projections and cannot inject private detail fields", async () => {
  const categories = {};
  new Function("exports", ts.transpileModule(readFileSync(new URL("../../src/constants/serviceRequests.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(categories);
  const code = ts.transpileModule(readFileSync(new URL("../../src/services/technician.service.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {}, deps = { "firebase/firestore": firestore, "@/src/firebase/config": customer(),
    "@/functions/src/domain/map": domain, "@/functions/src/domain/mapProjection": projection,
    "@/functions/src/domain/serviceAreas": requireFunctions("./lib/domain/serviceAreas.js") };
  deps["@/src/constants/serviceRequests"] = categories;
  const rating = {};
  new Function("exports", ts.transpileModule(readFileSync(new URL("../../src/utils/technicianRating.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(rating);
  deps["@/src/utils/technicianRating"] = rating;
  new Function("exports", "require", code)(exports, (id) => deps[id] ?? requireRoot(id));
  const profile = await exports.getApprovedTechnician("map-tech");
  assert.equal(profile.uid, "map-tech"); assert.equal(profile.fullName, "Map Technician");
  assert.equal(profile.averageRating, 4); assert.equal(profile.reviewCount, 3);
  assert.equal(profile.address, ""); assert.equal(profile.phone, ""); assert.equal(profile.email, "");
  const items = await new Promise((resolve, reject) => {
    const stop = exports.subscribeToApprovedTechnicians((items) => { stop(); resolve(items); }, reject, { division: "Kandy" });
  });
  assert.ok(items.some((item) => item.uid === "map-tech"));
  assert.ok(items.every((item) => item.phone === "" && item.address === ""));
  const authoritative = (await admin.doc("users/map-tech").get()).data();
  const trusted = projection.buildMapProfile("map-tech", authoritative);
  await denied(firestore.setDoc(firestore.doc(tech().db, "technician_map_profiles", "map-tech"), {
    ...trusted, publicDetails: { ...trusted.publicDetails, address: "private" }, updatedAt: firestore.serverTimestamp(),
  }));
  const load = (path, extra = {}) => {
    const output = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const result = {};
    new Function("exports", "require", output)(result, (id) => extra[id] ?? deps[id] ?? requireRoot(id));
    return result;
  };
  const notifications = load("src/services/notification.service.ts");
  const requests = load("src/services/request.service.ts", {
    "@/src/services/technician.service": exports, "@/src/services/notification.service": notifications,
  });
  const customerProfile = (await admin.doc("users/map-customer-a").get()).data();
  const requestId = await requests.createServiceRequest({ profile: customerProfile, technician: profile,
    serviceCategory: "Electrical", title: "Local demo request", description: "Test public profile preflight", address: "Customer supplied address",
    division: "Kandy", preferredDate: "2026-10-04", scheduledAt: new Date("2026-10-04T04:30:00Z"), priority: "normal" });
  const request = (await admin.doc(`service_requests/${requestId}`).get()).data();
  assert.equal(request.technicianId, "map-tech"); assert.equal(request.customerId, "map-customer-a");
  assert.equal(request.status, "requested");
  const notification = await admin.collection("notifications").where("requestId", "==", requestId).get();
  assert.ok(notification.docs.some((item) => item.data().userId === "map-tech" && item.data().type === "new_customer_request"));
});
