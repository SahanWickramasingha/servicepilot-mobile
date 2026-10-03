import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import * as firestore from "firebase/firestore";
const rootRequire = createRequire(import.meta.url), require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp: initAdmin } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");
const { buildMapProfile } = require("./lib/domain/mapProjection.js");
const ts = rootRequire("typescript"), projectId = "demo-servicepilot-review-author";
for (const value of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(value ?? "")) throw new Error("Local emulators only");
}
const app = initAdmin({ projectId }, "map-admin-boundary"), db = getFirestore(app), clients = [];
after(async () => { for (const session of clients) { await firestore.terminate(session.db); await deleteApp(session.app); } await db.terminate(); });
async function session(uid, role) {
  const email = `${uid}@example.test`, password = "Only-for-map-emulator-42";
  await getAdminAuth(app).createUser({ uid, email, password, emailVerified: true });
  await db.doc(`users/${uid}`).set({ uid, role, fullName: uid, accountStatus: "active", emailVerified: true });
  const clientApp = initializeApp({ projectId, apiKey: "emulator-only" }, uid), auth = getAuth(clientApp), clientDb = firestore.getFirestore(clientApp);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  firestore.connectFirestoreEmulator(clientDb, host, Number(port));
  await signInWithEmailAndPassword(auth, email, password);
  const result = { app: clientApp, db: clientDb }; clients.push(result); return result;
}
test("actual Admin lifecycle service atomically disables/enables projection, audits and location access", async () => {
  const actorUid = "map-lifecycle-admin", technicianId = "map-lifecycle-tech", customerId = "map-lifecycle-customer";
  const actor = await session(actorUid, "super_admin"), customer = await session(customerId, "customer");
  const source = { uid: technicianId, role: "technician", fullName: "Lifecycle Technician", accountStatus: "active", technicianApprovalStatus: "approved", serviceDistrictIds: ["matara"], specialization: "Electrical" };
  await db.doc(`users/${technicianId}`).set(source);
  await db.doc(`technician_map_profiles/${technicianId}`).set({ ...buildMapProfile(technicianId, source), updatedAt: Timestamp.now() });
  await db.doc(`technician_locations/${technicianId}`).set({ technicianId, sharingEnabled: true, latitude: 7.290612, longitude: 80.633701, updatedAt: Timestamp.now() });
  await db.doc(`service_requests/map-lifecycle-job`).set({ customerId, technicianId, status: "accepted" });
  await db.doc(`technician_location_access/${technicianId}/customers/${customerId}`).set({ customerId, technicianId, requestId: "map-lifecycle-job" });
  const exports = {}, code = ts.transpileModule(readFileSync(new URL("../../admin-web/src/services/accountLifecycleService.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const deps = { "firebase/firestore": firestore, "../firebase/config": { db: actor.db }, "../../../functions/src/domain/mapProjection": { buildMapProfile } };
  new Function("exports", "require", code)(exports, (id) => deps[id] ?? rootRequire(id));
  const locationRef = firestore.doc(customer.db, "technician_locations", technicianId);
  assert.equal((await firestore.getDocFromServer(locationRef)).exists(), true);
  await assert.rejects(firestore.updateDoc(firestore.doc(actor.db, "users", technicianId), { accountStatus: "disabled", disabledBy: actorUid, disabledAt: firestore.serverTimestamp(), updatedAt: firestore.serverTimestamp() }), (e) => e.code === "permission-denied");
  for (const action of ["disable", "enable"]) {
    await exports.updateManagedAccountLifecycle({ actorUid, target: { uid: technicianId, role: "technician" }, action });
    assert.equal((await db.doc(`technician_map_profiles/${technicianId}`).get()).data().approved, action === "enable");
    if (action === "disable") await assert.rejects(firestore.getDocFromServer(locationRef), (e) => e.code === "permission-denied");
    else assert.equal((await firestore.getDocFromServer(locationRef)).exists(), true);
  }
  assert.equal((await db.collection("audit_logs").where("targetUid", "==", technicianId).get()).size, 2);
});
