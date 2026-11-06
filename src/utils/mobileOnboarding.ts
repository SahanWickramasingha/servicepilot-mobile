import { technicianCategory } from "@/functions/src/domain/serviceCategories";
import type { UserProfile } from "@/src/services/user.service";

/** A missing document needs setup; an existing malformed document needs support.
 * Neither can authorize a dashboard. Legacy optional policy/date fields remain
 * under their existing gates and are never silently repaired here. */
export function mobileProfileIsComplete(profile: UserProfile, identity: { uid: string; email: string | null }): boolean {
  if (profile.uid !== identity.uid || profile.email !== identity.email?.trim().toLowerCase()) return false;
  if (![profile.fullName, profile.phone, profile.address].every(value => typeof value === "string" && !!value.trim())) return false;
  if (typeof profile.emailVerified !== "boolean") return false;
  if (profile.role === "technician") return !!technicianCategory(profile) &&
    ["pending", "approved", "rejected"].includes(profile.technicianApprovalStatus ?? "") &&
    // These were optional in legacy UserProfile records. Canonical districts do
    // not require recreating legacy free-text area/qualification fields.
    [profile.experience, profile.qualifications, profile.certifications, profile.serviceAreas, profile.serviceDivision].every(value => value === undefined || typeof value === "string");
  return profile.role === "customer";
}
