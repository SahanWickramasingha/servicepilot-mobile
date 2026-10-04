import { encodeServiceAreas, readServiceAreas } from "./serviceAreas";
import type { StoredServiceAreasByDistrict } from "./serviceAreas";

export type MapProfileSource = {
  role?: unknown; fullName?: unknown; specialization?: unknown; accountStatus?: unknown;
  technicianApprovalStatus?: unknown; serviceDistrictIds?: unknown;
  averageRating?: unknown; reviewCount?: unknown; serviceAreasByDistrict?: unknown;
  experience?: unknown; qualifications?: unknown; certifications?: unknown; profilePhotoUrl?: unknown; completedJobs?: unknown;
};

export const MAP_PAGE_SIZE = 8;
export const MAP_MAX_ITEMS = 24;

/** Stable category labels; unknown legacy specializations remain in All services. */
export function mapServiceCategory(value: string): string {
  return ["Electrical", "Plumbing", "Air Conditioning", "Appliance Repair", "IT / Computer Support", "General Maintenance", "Other"]
    .find((label) => value.toLowerCase().includes(label.toLowerCase())) ?? "";
}

/** Display-only projection. Never spread a private user document into this object. */
export function buildMapProfile(technicianId: string, profile: MapProfileSource) {
  if (profile.role !== "technician" || typeof profile.fullName !== "string" || !profile.fullName.trim()) {
    throw new Error("A Technician display name is required.");
  }
  const specialization = typeof profile.specialization === "string" ? profile.specialization : "";
  const averageRating = profile.averageRating ?? 0;
  const reviewCount = profile.reviewCount ?? 0;
  if (typeof averageRating !== "number" || !Number.isFinite(averageRating) || averageRating < 0 || averageRating > 5 ||
      typeof reviewCount !== "number" || !Number.isInteger(reviewCount) || reviewCount < 0) {
    throw new Error("Technician rating fields require validation.");
  }
  return { technicianId, fullName: profile.fullName, specialization,
    serviceCategory: mapServiceCategory(specialization),
    serviceDistrictIds: Array.isArray(profile.serviceDistrictIds) ? profile.serviceDistrictIds : [],
    approved: profile.technicianApprovalStatus === "approved" && (profile.accountStatus === undefined || profile.accountStatus === "active"),
    averageRating, reviewCount,
    publicDetails: {
      experience: typeof profile.experience === "string" ? profile.experience : "",
      qualifications: typeof profile.qualifications === "string" ? profile.qualifications : "",
      certifications: typeof profile.certifications === "string" ? profile.certifications : "",
      profilePhotoUrl: typeof profile.profilePhotoUrl === "string" ? profile.profilePhotoUrl : "",
      completedJobs: typeof profile.completedJobs === "number" ? profile.completedJobs : 0,
    },
    ...(profile.serviceAreasByDistrict !== undefined ? { serviceAreasByDistrict: encodeServiceAreas(
      Array.isArray(profile.serviceDistrictIds) ? profile.serviceDistrictIds : [], readServiceAreas(profile.serviceAreasByDistrict as StoredServiceAreasByDistrict)) } : {}) };
}
