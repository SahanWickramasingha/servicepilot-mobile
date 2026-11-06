// Local Android/UI fixtures only. Never loads credentials or connects to production.
import { createRequire } from "node:module";
const projectId = "demo-servicepilot-review-author";
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error("Set loopback Auth and Firestore emulator hosts first.");
}
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { buildMapProfile } = require("./lib/domain/mapProjection.js");
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require("./lib/domain/legalPolicy.js");
const { technicianCategory } = require("./lib/domain/serviceCategories.js");
const app = initializeApp({ projectId });
const sharingOff = process.argv.includes("--sharing-off");
const kandyOnly = process.argv.includes("--kandy-only");
const db = getFirestore(app), auth = getAuth(app);
if (process.argv.includes("--reset")) {
  // Explicitly disposable local project only. Clear integration-test leftovers
  // (including deliberately inconsistent approval projections) before UI tests.
  for (const [host, suffix] of [[process.env.FIRESTORE_EMULATOR_HOST, 'databases/(default)/documents'],
    [process.env.FIREBASE_AUTH_EMULATOR_HOST, 'accounts']]) {
    const response = await fetch(`http://${host}/emulator/v1/projects/${projectId}/${suffix}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Unable to reset disposable demo fixtures.');
  }
}
for (const [uid, role, fullName, extra] of [
  ["map-customer-a", "customer", "Customer A", {}], ["map-customer-b", "customer", "Customer B", {}],
  ["map-tech", "technician", "Map Technician", { serviceDistrictIds: kandyOnly ? ["kandy"] : ["colombo", "kandy"], specialization: "Electrical", technicianApprovalStatus: "approved", averageRating: 4, reviewCount: 3 }],
  ["map-plumber", "technician", "Plumbing Technician", { serviceDistrictIds: ["colombo"], specialization: "Plumbing", technicianApprovalStatus: "approved", averageRating: 0, reviewCount: 0 }],
]) {
  try { await auth.createUser({ uid, email: `${uid}@example.test`, password: "Only-for-map-emulator-42", emailVerified: true }); }
  catch (error) { if (error.code !== "auth/uid-already-exists") throw error; }
  // Integration suites may change these disposable accounts. Restore known UI
  // fixture credentials on rerun; the hardcoded demo project/loopback guard above
  // prevents this seed from addressing production accounts.
  await auth.updateUser(uid, { email: `${uid}@example.test`, password: "Only-for-map-emulator-42", emailVerified: true, disabled: false });
  await db.doc(`users/${uid}`).set({ uid, role, fullName, email: `${uid}@example.test`, emailVerified: true,
    accountStatus: "active", phone: "Emulator fixture", address: "Emulator fixture",
    termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    acceptedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    ...(role === "technician" ? { serviceCategoryId: technicianCategory(extra)?.id, experience: "Demo training",
      qualifications: "Demo qualification", certifications: "", serviceAreas: "Kandy", serviceDivision: "Kandy", availability: "available" } : {}), ...extra });
  if (role === "technician") await db.doc(`technician_map_profiles/${uid}`).set({
    ...buildMapProfile(uid, { role, fullName, accountStatus: "active", ...extra }), updatedAt: FieldValue.serverTimestamp(),
  });
}
const batch = db.batch();
const base = { technicianId: "map-tech", sharingEnabled: !sharingOff, updatedAt: FieldValue.serverTimestamp() };
batch.set(db.doc("technician_locations/map-tech"), sharingOff ? base : { ...base,
  latitude: 7.290612, longitude: 80.633701, sampledAt: Timestamp.now() });
batch.set(db.doc("technician_map_locations/map-tech"), sharingOff ? base : { ...base, latCell: 729, lngCell: 8063 });
batch.set(db.doc("service_requests/map-job"), { id: "map-job", customerId: "map-customer-a", customerName: "Customer A",
  technicianId: "map-tech", technicianName: "Map Technician", status: "accepted", serviceCategory: "Electrical",
  title: "Demo electrical service", description: "Local map verification", address: "Emulator fixture, Colombo",
  division: "Colombo", preferredDate: "2026-10-02", imageUrls: [], priority: "normal",
  createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
await batch.commit();
console.log("Demo-only map accounts and fixture job ready. No production data changed.");
await db.terminate();
