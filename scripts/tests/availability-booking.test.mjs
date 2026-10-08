import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { performanceTestDependency } from "../lib/performance-test-deps.mjs";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import * as firestore from "firebase/firestore";
const projectId = "demo-servicepilot-review-author";
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? "")) throw new Error("Loopback demo emulators required; no production writes.");
}
const rootRequire = createRequire(import.meta.url), functionsRequire = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp: initAdmin } = functionsRequire("firebase-admin/app");
const { getFirestore, FieldValue } = functionsRequire("firebase-admin/firestore");
const { getAuth: getAdminAuth } = functionsRequire("firebase-admin/auth");
const projection = functionsRequire("./lib/domain/mapProjection.js"), domain = functionsRequire("./lib/domain/map.js");
const availability = functionsRequire("./lib/domain/availability.js"), areas = functionsRequire("./lib/domain/serviceAreas.js");
const app = initAdmin({ projectId }, "availability-booking"), admin = getFirestore(app), sessions = new Map();
const ts = rootRequire("typescript");
function load(path, deps) {
  const exports = {}, code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("exports", "require", code)(exports, (id) => deps[id] ?? performanceTestDependency(id, deps) ?? rootRequire(id)); return exports;
}
const constants = load("src/constants/serviceRequests.ts", {}), rating = load("src/utils/technicianRating.ts", {});
const mapErrors = load("src/utils/mapServiceError.ts", {});
function services(session, sdk = firestore) {
  const deps = { "firebase/firestore": sdk, "@/src/firebase/config": session,
    "@/functions/src/domain/mapProjection": projection, "@/functions/src/domain/map": domain,
    "@/functions/src/domain/serviceAreas": areas, "@/functions/src/domain/availability": availability,
    "@/src/utils/mapServiceError": mapErrors,
    "@/src/constants/serviceRequests": constants, "@/src/utils/registrationDebug": {}, "@/src/utils/technicianRating": rating };
  const user = load("src/services/user.service.ts", deps), technician = load("src/services/technician.service.ts", deps);
  const notification = load("src/services/notification.service.ts", deps), location = load("src/services/location.service.ts", deps);
  const request = load("src/services/request.service.ts", { ...deps, "@/src/services/technician.service": technician,
    "@/src/services/notification.service": notification });
  return { user, technician, request, location };
}
const tech = () => sessions.get("availability-tech"), customer = () => sessions.get("availability-customer");
const denied = (promise) => assert.rejects(promise, (e) => e.code?.endsWith("permission-denied") || e.code?.endsWith("unauthenticated"));
const techRef = (session = tech()) => firestore.doc(session.db, "users", "availability-tech");
const publicRef = (session = tech()) => firestore.doc(session.db, "technician_map_profiles", "availability-tech");
const setAvailability = (value) => tech().services.user.updateTechnicianAvailability("availability-tech", value);
async function source() { return (await admin.doc("users/availability-tech").get()).data(); }
function requestData(overrides = {}) {
  return { customerId: "availability-customer", customerName: "Availability Customer", customerEmail: "availability-customer@example.test",
    customerPhone: "Private", technicianId: "availability-tech", technicianName: "Availability Technician", serviceCategory: "Electrical",
    title: "Test booking", description: "Local test", address: "Private customer address", serviceArea: "Kandy", division: "Kandy",
    preferredDate: "2026-10-10", preferredTime: "10:00 AM", scheduledAt: firestore.Timestamp.fromDate(new Date("2026-10-10T04:30:00Z")),
    priority: "normal", status: "requested", imageUrls: [], createdAt: firestore.serverTimestamp(), updatedAt: firestore.serverTimestamp(), ...overrides };
}
async function input() {
  return { profile: (await admin.doc("users/availability-customer").get()).data(),
    technician: await customer().services.technician.getApprovedTechnician("availability-tech"), serviceCategory: "Electrical",
    title: "Test booking", description: "Local test", address: "Private customer address", division: "Kandy", preferredDate: "2026-10-10",
    preferredTime: "10:00 AM", scheduledAt: new Date("2026-10-10T04:30:00Z"), priority: "normal" };
}
async function seedJob(id, status = "requested") {
  await admin.doc(`service_requests/${id}`).set({ ...requestData(), status, scheduledAt: new Date("2026-10-10T04:30:00Z"), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}

before(async () => {
  firestore.setLogLevel("silent");
  for (const [uid, role, extra] of [["availability-tech", "technician", { availability: "offline" }],
    ["availability-other-tech", "technician", {}], ["availability-legacy", "technician", {}],
    ["availability-pending", "technician", { technicianApprovalStatus: "pending" }],
    ["availability-disabled", "technician", { accountStatus: "disabled" }],
    ["availability-unverified", "technician", {}], ["availability-customer", "customer", {}],
    ["availability-dispatcher", "dispatcher", {}], ["availability-admin", "super_admin", {}]]) {
    const email = `${uid}@example.test`, password = "Only-for-map-emulator-42", emailVerified = uid !== "availability-unverified";
    try { await getAdminAuth(app).createUser({ uid, email, password, emailVerified }); }
    catch (error) { if (error.code !== "auth/uid-already-exists") throw error; }
    const profile = { uid, role, fullName: uid === "availability-tech" ? "Availability Technician" : "Availability Customer",
      email, phone: "Private phone", address: "Private street", emailVerified, accountStatus: "active",
      ...(role === "technician" ? { technicianApprovalStatus: "approved", specialization: "Electrical", serviceDistrictIds: ["vavuniya"],
        serviceAreasByDistrict: { vavuniya: "other:Local test area" }, averageRating: 4.5, reviewCount: 2 } : {}), ...extra };
    await admin.doc(`users/${uid}`).set(profile);
    if (role === "technician") await admin.doc(`technician_map_profiles/${uid}`).set({ ...projection.buildMapProfile(uid, profile), updatedAt: FieldValue.serverTimestamp() });
    const client = initializeApp({ projectId, apiKey: "emulator-only" }, uid), auth = getAuth(client), db = firestore.getFirestore(client);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":"); firestore.connectFirestoreEmulator(db, host, Number(port));
    await signInWithEmailAndPassword(auth, email, password);
    const session = { app: client, auth, db }; session.services = services(session); sessions.set(uid, session);
  }
});
after(async () => {
  for (const session of sessions.values()) { await firestore.terminate(session.db); await deleteApp(session.app); }
  await admin.terminate();
});

test("all three statuses persist atomically and update live public profiles, lists and map cards", async () => {
  const emitted = { profile: [], list: [], map: [] }, waits = [];
  const receive = (kind, state) => { emitted[kind].push(state); for (const next of waits) next(); };
  const stopProfile = customer().services.technician.subscribeToApprovedTechnician("availability-tech", (item) => receive("profile", item?.availability), assert.fail);
  const stopList = customer().services.technician.subscribeToApprovedTechnicians((items) => receive("list", items.find((i) => i.uid === "availability-tech")?.availability), assert.fail, { division: "Vavuniya" });
  const stopMap = customer().services.location.subscribeToMapTechnicians("vavuniya", "Electrical", 1,
    (page) => receive("map", page.items.find((i) => i.uid === "availability-tech")?.availability), (error) => { if (error.kind !== "network") assert.fail(error); });
  const wait = (value) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing live ${value}: ${JSON.stringify(emitted)}`)), 10000);
    const check = () => { if (Object.values(emitted).every((values) => values.at(-1) === value)) { clearTimeout(timer); resolve(); } };
    waits.push(check); check();
  });
  try {
    for (const value of ["available", "busy", "offline"]) {
      await setAvailability(value); await wait(value);
      assert.equal((await source()).availability, value);
      assert.equal((await admin.doc("technician_map_profiles/availability-tech").get()).data().availability, value);
    }
    assert.equal((await source()).averageRating, 4.5); assert.equal((await source()).reviewCount, 2);
    const publicProfile = (await admin.doc("technician_map_profiles/availability-tech").get()).data();
    for (const field of ["phone", "address", "email", "latitude", "longitude"]) assert.equal(field in publicProfile, false);
    await denied(firestore.getDocFromServer(techRef(customer())));
  } finally { stopProfile(); stopList(); stopMap(); }
});

test("only the owning active verified approved technician can set valid availability; forged profile fields and partial writes are denied", async () => {
  await setAvailability("busy");
  for (const uid of ["availability-customer", "availability-other-tech", "availability-dispatcher", "availability-admin"]) {
    await denied(firestore.updateDoc(techRef(sessions.get(uid)), { availability: "available", updatedAt: firestore.serverTimestamp() }));
    await assert.rejects(sessions.get(uid).services.user.updateTechnicianAvailability("availability-tech", "available"), /own account/);
  }
  for (const uid of ["availability-pending", "availability-disabled", "availability-unverified"]) {
    await assert.rejects(sessions.get(uid).services.user.updateTechnicianAvailability(uid, "available"), /active, verified and approved/);
    await denied(firestore.updateDoc(firestore.doc(sessions.get(uid).db, "users", uid), { availability: "available", updatedAt: firestore.serverTimestamp() }));
  }
  await denied(firestore.updateDoc(techRef(), { availability: "available", updatedAt: firestore.serverTimestamp() }));
  const original = await source();
  for (const extra of [{ availability: true }, { availability: null }, { availability: "Available" }, { availability: firestore.deleteField() },
    { averageRating: 5 }, { reviewCount: 100 }, { technicianApprovalStatus: "pending" }, { role: "super_admin" }, { address: "Changed with availability" }]) {
    const batch = firestore.writeBatch(tech().db);
    batch.update(techRef(), { availability: "available", updatedAt: firestore.serverTimestamp(), ...extra });
    batch.set(publicRef(), { ...projection.buildMapProfile("availability-tech", { ...original, availability: "available" }), updatedAt: firestore.serverTimestamp() });
    await denied(batch.commit());
  }
  await denied(firestore.updateDoc(publicRef(), { availability: "available", updatedAt: firestore.serverTimestamp() }));
  await denied(firestore.updateDoc(publicRef(), { privateAddress: "Leak", updatedAt: firestore.serverTimestamp() }));
  assert.equal((await source()).availability, "busy");
});

test("legacy and malformed availability remain viewable as unknown and block new requests", async () => {
  const legacy = await customer().services.technician.getApprovedTechnician("availability-legacy");
  assert.ok(legacy); assert.equal(legacy.availability, undefined);
  const details = await input();
  await assert.rejects(customer().services.request.createServiceRequest({ ...details, technician: legacy }), /Availability not set/);
  for (const value of [undefined, "available-malformed"]) {
    const original = await source();
    if (value === undefined) delete original.availability; else original.availability = value;
    await admin.doc("users/availability-tech").set(original);
    await admin.doc("technician_map_profiles/availability-tech").set({ ...projection.buildMapProfile("availability-tech", original), updatedAt: FieldValue.serverTimestamp() });
    const item = await customer().services.technician.getApprovedTechnician("availability-tech");
    assert.equal(item.availability, undefined);
    await denied(firestore.setDoc(firestore.doc(customer().db, "service_requests", `availability-legacy-${String(value)}`), requestData()));
    await seedJob("availability-legacy-accept");
    await denied(firestore.updateDoc(firestore.doc(tech().db, "service_requests", "availability-legacy-accept"), { status: "accepted" }));
  }
  await setAvailability("available");
});

test("Available preserves multiple simultaneous jobs; completion keeps manually selected Offline and notifications", async () => {
  await setAvailability("available");
  const details = await input();
  const ids = await Promise.all([customer().services.request.createServiceRequest(details), customer().services.request.createServiceRequest(details)]);
  for (const id of ids) await tech().services.request.updateTechnicianRequestStatus(id, "accepted");
  assert.equal((await source()).availability, "available");
  await setAvailability("offline");
  for (const id of ids) {
    assert.equal((await customer().services.request.getServiceRequest(id)).status, "accepted");
    await tech().services.request.updateTechnicianRequestStatus(id, "in_progress");
    await tech().services.request.updateTechnicianRequestStatus(id, "completed");
    assert.equal((await source()).availability, "offline");
    const notifications = await admin.collection("notifications").where("requestId", "==", id).get();
    assert.deepEqual(notifications.docs.map((d) => d.data().type).sort(), ["new_customer_request", "technician_accepted_request", "job_started", "job_completed"].sort());
  }
});

test("Busy/Offline block stale requests and acceptance at service and rules boundaries; existing reject/cancel/start/complete remain allowed", async () => {
  await setAvailability("available"); const stale = await input();
  for (const value of ["busy", "offline"]) {
    await setAvailability(value); await seedJob(`availability-pending-${value}`);
    await assert.rejects(customer().services.request.createServiceRequest(stale), /New requests require Available/);
    await denied(firestore.setDoc(firestore.doc(customer().db, "service_requests", `availability-bypass-${value}`), requestData()));
    await assert.rejects(tech().services.request.updateTechnicianRequestStatus(`availability-pending-${value}`, "accepted"), /New requests require Available/);
    await denied(firestore.updateDoc(firestore.doc(tech().db, "service_requests", `availability-pending-${value}`), { status: "accepted" }));
    await tech().services.request.updateTechnicianRequestStatus(`availability-pending-${value}`, "rejected", { reason: "Workload" });
    await seedJob(`availability-cancel-${value}`, "accepted");
    await tech().services.request.updateTechnicianRequestStatus(`availability-cancel-${value}`, "cancelled", { reason: "Cannot attend" });
    await seedJob(`availability-work-${value}`, "assigned");
    await tech().services.request.updateTechnicianRequestStatus(`availability-work-${value}`, "in_progress");
    await tech().services.request.updateTechnicianRequestStatus(`availability-work-${value}`, "completed");
    assert.equal((await source()).availability, value);
  }
});

test("authoritative profile blocks a falsely Available public projection and same-batch Offline acceptance rolls back", async () => {
  await setAvailability("offline");
  await admin.doc("technician_map_profiles/availability-tech").update({ availability: "available" });
  await denied(firestore.setDoc(firestore.doc(customer().db, "service_requests", "availability-false-projection"), requestData()));
  await setAvailability("available"); await seedJob("availability-batch-offline");
  const original = await source(), batch = firestore.writeBatch(tech().db);
  batch.update(techRef(), { availability: "offline", updatedAt: firestore.serverTimestamp() });
  batch.set(publicRef(), { ...projection.buildMapProfile("availability-tech", { ...original, availability: "offline" }), updatedAt: firestore.serverTimestamp() });
  batch.update(firestore.doc(tech().db, "service_requests", "availability-batch-offline"), { status: "accepted" });
  await denied(batch.commit());
  assert.equal((await source()).availability, "available");
  assert.equal((await admin.doc("service_requests/availability-batch-offline").get()).data().status, "requested");
});

test("transactions reject an availability change after preflight/read instead of committing a stale create or acceptance", async () => {
  const racing = (session) => {
    let interrupted = false;
    return services(session, { ...firestore, runTransaction: (db, callback) => firestore.runTransaction(db, (transaction) => callback({
      get: async (ref) => {
        const snapshot = await transaction.get(ref);
        if (!interrupted && ref.path === "technician_map_profiles/availability-tech") { interrupted = true; await setAvailability("busy"); }
        return snapshot;
      }, set: transaction.set.bind(transaction), update: transaction.update.bind(transaction),
    })) });
  };
  await setAvailability("available"); const details = await input();
  const before = (await admin.collection("service_requests").where("technicianId", "==", "availability-tech").get()).size;
  await assert.rejects(racing(customer()).request.createServiceRequest(details), (error) => error.code === "permission-denied" || /New requests require Available/.test(error.message));
  assert.equal((await admin.collection("service_requests").where("technicianId", "==", "availability-tech").get()).size, before);
  await setAvailability("available"); await seedJob("availability-race-accept");
  await assert.rejects(racing(tech()).request.updateTechnicianRequestStatus("availability-race-accept", "accepted"), (error) => error.code === "permission-denied" || /New requests require Available/.test(error.message));
  assert.equal((await admin.doc("service_requests/availability-race-accept").get()).data().status, "requested");
});

test("GPS ON/OFF never changes availability and availability updates never change GPS or service areas", async () => {
  await setAvailability("offline"); const original = await source();
  await tech().services.location.publishTechnicianLocation("availability-tech", { latitude: 7.290612, longitude: 80.633701 });
  assert.equal((await source()).availability, "offline");
  const shared = (await admin.doc("technician_map_locations/availability-tech").get()).data();
  const precise = (await admin.doc("technician_locations/availability-tech").get()).data();
  await setAvailability("busy");
  assert.deepEqual((await admin.doc("technician_map_locations/availability-tech").get()).data(), shared);
  assert.deepEqual((await admin.doc("technician_locations/availability-tech").get()).data(), precise);
  assert.deepEqual((await source()).serviceAreasByDistrict, original.serviceAreasByDistrict);
  await tech().services.location.publishTechnicianLocation("availability-tech");
  assert.equal((await source()).availability, "busy");
});

test("signed-out technician cannot change availability or accept jobs", async () => {
  await signOut(tech().auth);
  await assert.rejects(setAvailability("available"), /own account/);
  await denied(firestore.updateDoc(techRef(), { availability: "available", updatedAt: firestore.serverTimestamp() }));
  await assert.rejects(tech().services.request.updateTechnicianRequestStatus("availability-race-accept", "accepted"), /sign in/);
});
