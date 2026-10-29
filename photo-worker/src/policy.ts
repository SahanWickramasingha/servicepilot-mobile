import { check, reference, type Data, type Identity, type PhotoRecord, type Purpose, type Store } from "./types";

export function active(profile: Data | null, actor: Identity) {
  check(profile && (profile.accountStatus === undefined || profile.accountStatus === "active") && profile.lifecyclePending !== true &&
    (profile.sessionRevokedAt === undefined || typeof profile.sessionRevokedAt === "number" && actor.authTime > profile.sessionRevokedAt));
  return profile;
}
export function technician(job: Data): string {
  const current = job.technicianId || "", legacy = job.assignedTechnicianId || "";
  check(!(current && legacy && current !== legacy) && (current || legacy));
  return current || legacy;
}
export function writable(profile: Data, actor: Identity, request: Data | null, purpose: Purpose) {
  check(actor.verified);
  if (purpose === "request") { check(profile.role === "customer" && !request); return; }
  check(profile.role === "technician" && profile.technicianApprovalStatus === "approved" && request && technician(request) === actor.uid &&
    (purpose === "before" ? ["accepted", "assigned", "in_progress"] : ["in_progress"]).includes(request.status));
}
export async function authorizeWrite(store: Store, actor: Identity, requestId: string, purpose: Purpose) {
  const profile = active(await store.get(`users/${actor.uid}`, actor.token), actor);
  if (purpose === "request") {
    check(profile.role === "customer" && actor.verified);
    const receipt = await store.get(`booking_attempts/${actor.uid}/requests/${requestId}`, actor.token);
    check(!receipt, 409, "already-booked");
    // This service read closes the case of legacy/admin-created requests without receipts.
    writable(profile, actor, await store.get(`service_requests/${requestId}`), purpose);
  } else writable(profile, actor, await store.get(`service_requests/${requestId}`, actor.token), purpose);
}
export function referenced(meta: PhotoRecord, job: Data | null, evidence: Data | null): boolean {
  const ref = reference(meta.id);
  return meta.purpose === "request" ? !!job?.imageUrls?.includes(ref) : !!evidence?.[meta.purpose === "before" ? "beforePhotos" : "afterPhotos"]?.includes(ref);
}
export async function authorizeView(store: Store, actor: Identity, meta: PhotoRecord) {
  const profile = active(await store.get(`users/${actor.uid}`, actor.token), actor);
  check(meta.state === "confirmed");
  if (meta.purpose === "request" && actor.uid === meta.ownerId) {
    // Owners may preview their own pending pre-booking confirmations.
    const receipt = await store.get(`booking_attempts/${actor.uid}/requests/${meta.requestId}`, actor.token);
    if (!receipt) { check(actor.verified && profile.role === "customer" && meta.expiresAt > new Date()); return; }
  }
  const job = await store.get(`service_requests/${meta.requestId}`, actor.token);
  check(job);
  const evidence = meta.purpose === "request" ? null : await store.get(`job_evidence/${meta.requestId}`, actor.token);
  const saved = referenced(meta, job, evidence);
  if (!saved && actor.uid === meta.ownerId && meta.expiresAt > new Date()) { writable(profile, actor, job, meta.purpose); return; }
  check(saved && ((actor.verified && profile.role === "customer" && job.customerId === actor.uid) ||
    (actor.verified && profile.role === "technician" && profile.technicianApprovalStatus === "approved" && technician(job) === actor.uid) ||
    (meta.purpose !== "request" && profile.role === "super_admin")));
}
