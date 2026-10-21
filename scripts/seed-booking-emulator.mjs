// Disposable device fixtures only. No credentials, production project or remote hosts.
import { createRequire } from "node:module";
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? "")) throw new Error("Loopback Auth and Firestore emulator hosts are required.");
}
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { buildMapProfile } = require("./lib/domain/mapProjection.js");
const app = initializeApp({ projectId: "demo-servicepilot-review-author" }), auth = getAuth(app), db = getFirestore(app);
try {
  for (const [uid, role, fullName] of [["booking-tech", "technician", "Booking Technician"],
    ["booking-customer-a", "customer", "Booking Customer A"], ["booking-customer-b", "customer", "Booking Customer B"]]) {
    const email = `${uid}@example.test`;
    try { await auth.createUser({ uid, email, password: "Only-for-booking-emulator-42", emailVerified: true }); }
    catch (error) { if (error.code !== "auth/uid-already-exists") throw error; }
    const reference = db.doc(`users/${uid}`);
    if (!(await reference.get()).exists) {
      const profile = { uid, role, fullName, email, phone: "Emulator fixture", address: "Private emulator fixture", accountStatus: "active", emailVerified: true,
        ...(role === "technician" ? { technicianApprovalStatus: "approved", specialization: "Electrical", serviceDistrictIds: ["kandy"], availability: "offline" } : {}) };
      await reference.create(profile);
      if (role === "technician") await db.doc(`technician_map_profiles/${uid}`).set({ ...buildMapProfile(uid, profile), updatedAt: FieldValue.serverTimestamp() });
    }
  }
  const legacy = db.doc("service_requests/booking-legacy-assigned");
  if (!(await legacy.get()).exists) await legacy.create({ customerId: "booking-customer-a", customerName: "Booking Customer A",
    assignedTechnicianId: "booking-tech", assignedTechnicianName: "Booking Technician", status: "assigned", serviceCategory: "Electrical",
    title: "Legacy accepted booking", description: "Local compatibility fixture", address: "Private emulator fixture", serviceArea: "Kandy", division: "Kandy",
    preferredDate: "2020-01-01", preferredTime: "10:00 AM", priority: "normal", imageUrls: [], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  console.log("Booking demo accounts ready. Existing accounts, requests and manual availability were preserved.");
} finally { await db.terminate(); await deleteApp(app); }
