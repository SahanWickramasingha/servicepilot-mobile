import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import * as firestore from "firebase/firestore";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp: initAdmin } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");
const { buildMapProfile } = require("./lib/domain/mapProjection.js");
const { createAccountLifecycleService } = require("./lib/services/account-lifecycle.service.js");
const projectId = "demo-servicepilot-review-author";
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
  const result = { app: clientApp, db: clientDb, auth }; clients.push(result); return result;
}
test("trusted lifecycle backend updates projection/audit and Enable keeps location sharing off", async () => {
  const actorUid = "map-lifecycle-admin", technicianId = "map-lifecycle-tech", customerId = "map-lifecycle-customer";
  const actor = await session(actorUid, "super_admin"), customer = await session(customerId, "customer");
  const source = { uid: technicianId, role: "technician", fullName: "Lifecycle Technician", accountStatus: "active", technicianApprovalStatus: "approved", serviceDistrictIds: ["matara"], specialization: "Electrical" };
  await getAdminAuth(app).createUser({ uid: technicianId, email: `${technicianId}@example.test`, password: "Only-for-map-emulator-42" });
  await db.doc(`users/${technicianId}`).set(source);
  await db.doc(`technician_map_profiles/${technicianId}`).set({ ...buildMapProfile(technicianId, source), updatedAt: Timestamp.now() });
  await db.doc(`technician_locations/${technicianId}`).set({ technicianId, sharingEnabled: true, latitude: 7.290612, longitude: 80.633701, updatedAt: Timestamp.now() });
  await db.doc(`service_requests/map-lifecycle-job`).set({ customerId, technicianId, status: "accepted" });
  await db.doc(`technician_location_access/${technicianId}/customers/${customerId}`).set({ customerId, technicianId, requestId: "map-lifecycle-job" });
  const backend = createAccountLifecycleService({ auth: getAdminAuth(app), db });
  const authorization = `Bearer ${await actor.auth.currentUser.getIdToken()}`;
  const locationRef = firestore.doc(customer.db, "technician_locations", technicianId);
  assert.equal((await firestore.getDocFromServer(locationRef)).exists(), true);
  await assert.rejects(firestore.updateDoc(firestore.doc(actor.db, "users", technicianId), { accountStatus: "disabled", disabledBy: actorUid, disabledAt: firestore.serverTimestamp(), updatedAt: firestore.serverTimestamp() }), (e) => e.code === "permission-denied");
  for (const action of ["disable", "enable"]) {
    await backend.change(authorization, { targetUid: technicianId, action, requestId: randomUUID() });
    assert.equal((await db.doc(`technician_map_profiles/${technicianId}`).get()).data().approved, action === "enable");
    await assert.rejects(firestore.getDocFromServer(locationRef), (e) => e.code === "permission-denied");
    assert.equal((await db.doc(`technician_locations/${technicianId}`).get()).data().sharingEnabled, false);
  }
  assert.equal((await db.collection("audit_logs").where("targetUid", "==", technicianId).get()).size, 2);
});
