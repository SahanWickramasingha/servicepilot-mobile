// Disposable local fixtures only. Does not load service-account files.
import { createRequire } from "node:module";
const projectId = "demo-servicepilot-review-author";
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? "")) throw new Error("Loopback Auth and Firestore emulators required.");
}
if ((process.env.GOOGLE_CLOUD_PROJECT ?? projectId) !== projectId ||
  (process.env.GCLOUD_PROJECT ?? projectId) !== projectId) throw new Error("Lifecycle demo project only.");
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { buildMapProfile } = require("./lib/domain/mapProjection.js");
const app = initializeApp({ projectId }), auth = getAuth(app), db = getFirestore(app);
try {
  for (const [suffix, role] of [["admin", "super_admin"], ["other-admin", "super_admin"],
    ["customer", "customer"], ["technician", "technician"], ["dispatcher", "dispatcher"]]) {
    const uid = `lifecycle-demo-${suffix}`, email = `${uid}@example.test`;
    // Existing fixtures, including disabled/deleted accounts, are deliberately preserved.
    if ((await db.doc(`users/${uid}`).get()).exists) continue;
    try { await auth.createUser({ uid, email, password: "Only-for-local-lifecycle-42", emailVerified: true }); }
    catch (error) { if (error.code !== "auth/uid-already-exists") throw error; }
    const profile = { uid, email, role, fullName: `Local ${suffix}`, accountStatus: "active", emailVerified: true,
      phone: "Emulator fixture", address: "Private emulator fixture", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      ...(role === "technician" ? { technicianApprovalStatus: "approved", serviceDistrictIds: ["kandy"], specialization: "Electrical", availability: "offline" } : {}),
      ...(role === "dispatcher" ? { dispatcherId: "DSP-LOCAL-LIFECYCLE", invitationStatus: "accepted" } : {}),
    };
    await db.doc(`users/${uid}`).set(profile);
    if (role === "technician") {
      await db.doc(`technician_map_profiles/${uid}`).set({ ...buildMapProfile(uid, profile), updatedAt: FieldValue.serverTimestamp() });
      for (const collection of ["technician_locations", "technician_map_locations"]) {
        await db.doc(`${collection}/${uid}`).set({ technicianId: uid, sharingEnabled: false, updatedAt: FieldValue.serverTimestamp() });
      }
    }
  }
  console.info("Local lifecycle fixtures ready. Existing account states preserved; no production data changed.");
} finally { await db.terminate(); await deleteApp(app); }
