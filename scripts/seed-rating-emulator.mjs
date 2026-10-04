// Device validation fixtures only. Never loads credentials or writes production.
import { createRequire } from "node:module";
const projectId = "demo-servicepilot-review-author";
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    throw new Error("Set loopback Firestore and Auth emulator hosts before seeding rating fixtures.");
  }
}
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { buildMapProfile } = require("./lib/domain/mapProjection.js");
const app = initializeApp({ projectId }), db = getFirestore(app), auth = getAuth(app);
try {
  for (const [uid, role, fullName] of [
    ["rating-gihan", "technician", "Gihan"], ["rating-zero", "technician", "Unreviewed Technician"],
    ["rating-bandara", "customer", "Bandara"],
  ]) {
    const email = `${uid}@example.test`;
    const identity = { email, password: "Only-for-rating-emulator-42", emailVerified: true };
    try { await auth.createUser({ uid, ...identity }); }
    catch (error) {
      if (error.code !== "auth/uid-already-exists") throw error;
      await auth.updateUser(uid, identity);
    }
    const profile = { uid, fullName, role, email, emailVerified: true, accountStatus: "active",
      phone: "Emulator fixture", address: "Private emulator fixture",
      ...(role === "technician" ? { technicianApprovalStatus: "approved", serviceDistrictIds: ["kandy"], specialization: "Electrical" } : {}),
    };
    // Deliberately omit private rating aggregates to reproduce the reported bug.
    await db.doc(`users/${uid}`).set(profile);
    if (role === "technician") await db.doc(`technician_map_profiles/${uid}`).set({
      ...buildMapProfile(uid, profile), updatedAt: FieldValue.serverTimestamp(),
    });
  }
  for (let index = 1; index <= 7; index++) {
    const id = `rating-device-request-${index}`;
    await db.doc(`service_requests/${id}`).set({ id, customerId: "rating-bandara", customerName: "Bandara",
      technicianId: "rating-gihan", technicianName: "Gihan", status: "completed", serviceCategory: "Electrical",
      title: `Rating validation service ${index}`, description: "Local rating verification", address: "Private emulator fixture",
      division: "Kandy", preferredDate: "2026-10-04", imageUrls: [], priority: "normal",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  }
  const first = db.doc("service_reviews/rating-device-request-1_rating-bandara");
  if (!(await first.get()).exists) await first.set({ requestId: "rating-device-request-1", customerId: "rating-bandara",
    technicianId: "rating-gihan", customerName: "Bandara", rating: 5, comment: "Excellent service",
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log("Demo rating accounts ready: Gihan, Bandara and an unreviewed technician. Existing reviews preserved; use fresh emulators for a 1-review baseline.");
} finally { await db.terminate(); await deleteApp(app); }
