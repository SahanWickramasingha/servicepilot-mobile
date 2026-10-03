import { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { DISTRICTS, locationIsFresh, resolveServiceDistrictIds, validCoordinate } from "../domain/map";

type Caller = { uid: string; token: { email_verified?: unknown } } | undefined;

async function requireCustomer(db: Firestore, caller: Caller) {
  if (!caller) throw new HttpsError("unauthenticated", "Please sign in.");
  const profile = (await db.doc(`users/${caller.uid}`).get()).data();
  if (caller.token.email_verified !== true || profile?.role !== "customer" ||
      (profile.accountStatus !== undefined && profile.accountStatus !== "active")) {
    throw new HttpsError("permission-denied", "An active, verified Customer account is required.");
  }
  return caller.uid;
}

export async function readMapTechnicians(db: Firestore, caller: Caller, input: { districtId?: unknown; category?: unknown }) {
  await requireCustomer(db, caller);
  if (typeof input.districtId !== "string" || !DISTRICTS.some((district) => district.id === input.districtId) ||
      (input.category !== undefined && (typeof input.category !== "string" || input.category.length > 80))) {
    throw new HttpsError("invalid-argument", "Select a valid service district and category.");
  }
  const snapshot = await db.collection("users").where("role", "==", "technician")
    .where("technicianApprovalStatus", "==", "approved").get();
  const category = typeof input.category === "string" ? input.category.toLowerCase() : "";
  return snapshot.docs.flatMap((document) => {
    const profile = document.data();
    const serviceDistrictIds = resolveServiceDistrictIds(profile);
    if ((profile.accountStatus !== undefined && profile.accountStatus !== "active") ||
        !serviceDistrictIds.includes(input.districtId as string) ||
        (category && !(typeof profile.specialization === "string" && profile.specialization.toLowerCase().includes(category)))) return [];
    // Deliberate allowlist: never return private profile data, addresses, or raw locations.
    return [{ uid: document.id, fullName: typeof profile.fullName === "string" ? profile.fullName : "Service Technician",
      specialization: typeof profile.specialization === "string" ? profile.specialization : "Not provided",
      serviceDistrictIds, averageRating: Number(profile.averageRating ?? 0), reviewCount: Number(profile.reviewCount ?? 0) }];
  }).sort((a, b) => b.averageRating - a.averageRating || a.fullName.localeCompare(b.fullName));
}

export async function readJobTechnicianLocation(db: Firestore, caller: Caller, input: { requestId?: unknown }) {
  const uid = await requireCustomer(db, caller);
  if (typeof input.requestId !== "string" || !input.requestId || input.requestId.includes("/")) {
    throw new HttpsError("invalid-argument", "A valid request is required.");
  }
  // A consistent snapshot prevents a concurrent disable/cancel from authorizing stale data.
  return db.runTransaction(async (transaction) => {
    const request = (await transaction.get(db.doc(`service_requests/${input.requestId}`))).data();
    if (!request || request.customerId !== uid || !["accepted", "assigned", "in_progress"].includes(request.status)) {
      throw new HttpsError("permission-denied", "Location is available only for your accepted or in-progress request.");
    }
    const current = typeof request.technicianId === "string" && request.technicianId.trim() ? request.technicianId : undefined;
    const legacy = typeof request.assignedTechnicianId === "string" && request.assignedTechnicianId.trim() ? request.assignedTechnicianId : undefined;
    const technicianId = current ?? legacy;
    if ((current && legacy && current !== legacy) || !technicianId || technicianId.includes("/")) {
      throw new HttpsError("failed-precondition", "This request has no consistent Technician identity.");
    }
    const technician = (await transaction.get(db.doc(`users/${technicianId}`))).data();
    const location = (await transaction.get(db.doc(`technician_locations/${technicianId}`))).data();
    if (technician?.role !== "technician" || technician.technicianApprovalStatus !== "approved" ||
        (technician.accountStatus !== undefined && technician.accountStatus !== "active")) {
      throw new HttpsError("permission-denied", "The Technician is unavailable.");
    }
    if (!location || location.sharingEnabled !== true) return { status: "not-sharing" as const };
    const updatedAtMs = location.updatedAt?.toMillis();
    if (!locationIsFresh(updatedAtMs) || !validCoordinate({ latitude: location.latitude, longitude: location.longitude })) {
      return { status: "stale" as const }; // No stale precise coordinate is returned.
    }
    return { status: "available" as const, technicianId, latitude: location.latitude as number,
      longitude: location.longitude as number, updatedAtMs: updatedAtMs as number };
  }, { readOnly: true });
}
