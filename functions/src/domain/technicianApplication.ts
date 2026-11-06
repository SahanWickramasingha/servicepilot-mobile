import { technicianCategory } from "./serviceCategories";

/** emailVerified is persisted only by Rules validated owning verified ID tokens
 * (validPublicUserCreate / validOwnerUpdate), never by a reviewer. Legacy saved
 * applications use the same invariant; no new client verification flag is used. */
export function isReviewableTechnicianApplication(profile: {
  uid?: unknown; role?: unknown; email?: unknown; emailVerified?: unknown;
  fullName?: unknown; phone?: unknown; address?: unknown; accountStatus?: unknown;
  lifecyclePending?: unknown; technicianApprovalStatus?: unknown;
  specialization?: unknown; serviceCategoryId?: unknown;
}): boolean {
  return profile.role === "technician" && profile.technicianApprovalStatus === "pending" &&
    profile.emailVerified === true && (profile.accountStatus === undefined || profile.accountStatus === "active") &&
    profile.lifecyclePending !== true &&
    [profile.uid, profile.email, profile.fullName, profile.phone, profile.address].every(value => typeof value === "string" && !!value.trim()) &&
    !!technicianCategory(profile);
}
