import { declaredServiceAreaLabel } from "../../../../functions/src/domain/serviceAreas";
import { isReviewableTechnicianApplication } from "../../../../functions/src/domain/technicianApplication";
import type { UserRecord } from "../../types";

export type ReviewMode = "view" | "approve" | "reject";
export type ApprovalFilter = "all" | "pending" | "approved" | "rejected";
export const approvalFilters: ApprovalFilter[] = ["all", "pending", "approved", "rejected"];

export function serviceAreaLabel(profile: UserRecord): string {
  if (profile.serviceDistrictIds?.length) return profile.serviceDistrictIds
    .map(id => declaredServiceAreaLabel(id, profile.serviceAreasByDistrict)).join("; ");
  return profile.serviceDivision?.trim() || profile.serviceAreas?.trim() || "Not provided";
}

export function canReviewApplication(profile: UserRecord): boolean {
  return profile.uid === profile.id && isReviewableTechnicianApplication(profile);
}

/** Names already authorized by the portal session; never guess from an audit UID. */
export function reviewerLabel(technician: UserRecord, viewer: UserRecord | null): string {
  return technician.reviewedBy && technician.reviewedBy === (viewer?.uid ?? viewer?.id) && viewer?.fullName?.trim()
    ? viewer.fullName.trim() : "Reviewer unavailable";
}

export function isReviewConflict(error: unknown): boolean {
  return (error as { code?: string })?.code === "aborted" || error instanceof Error &&
    /already reviewed, unverified or incomplete/.test(error.message);
}
