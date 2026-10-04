import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  where,
  Timestamp,
  type SnapshotMetadata,
  limit,
  documentId,
  orderBy,
} from "firebase/firestore";

import { SERVICE_CATEGORIES, ServiceCategory } from "@/src/constants/serviceRequests";
import { db } from "@/src/firebase/config";
import { districtIdForName } from "@/functions/src/domain/map";
import { declaredServiceAreaLabel, StoredServiceAreasByDistrict } from "@/functions/src/domain/serviceAreas";
import { MAP_MAX_ITEMS, MAP_PAGE_SIZE } from "@/functions/src/domain/mapProjection";
import { isEligibleReviewRating } from "@/src/utils/technicianRating";

export interface PublicTechnicianProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  profilePhotoUrl?: string;
  specialization: string;
  experience: string;
  qualifications: string;
  certifications: string;
  serviceDivision: string;
  averageRating: number;
  reviewCount: number;
  completedJobs: number;
  serviceDistrictIds: string[];
}

export interface TechnicianReviewSummary {
  id: string;
  requestId: string;
  customerId: string;
  technicianId: string;
  customerName?: string;
  rating: number;
  comment: string;
  createdAt?: Timestamp;
}

type PublicProjection = {
  technicianId: string; fullName: string; specialization: string; approved: boolean;
  serviceDistrictIds: string[]; serviceAreasByDistrict?: StoredServiceAreasByDistrict;
  averageRating: number; reviewCount: number;
  publicDetails?: { profilePhotoUrl?: string; experience?: string; qualifications?: string; certifications?: string; completedJobs?: number };
};
function mapTechnician(data: PublicProjection): PublicTechnicianProfile {
  const details = data.publicDetails;
  return {
    uid: data.technicianId,
    fullName: data.fullName || "Service Technician",
    email: "", phone: "", address: "",
    profilePhotoUrl: details?.profilePhotoUrl || undefined,
    specialization: data.specialization || "General Maintenance",
    experience: details?.experience || "Not provided",
    qualifications: details?.qualifications || "Not provided",
    certifications: details?.certifications || "Not provided",
    serviceDistrictIds: data.serviceDistrictIds,
    serviceDivision: data.serviceDistrictIds.map((id) => declaredServiceAreaLabel(id, data.serviceAreasByDistrict)).join("; ") || "Service districts not set",
    averageRating: Number(data.averageRating ?? 0),
    reviewCount: Number(data.reviewCount ?? 0),
    completedJobs: Number(details?.completedJobs ?? 0),
  };
}

function matchesCategory(
  technician: PublicTechnicianProfile,
  category?: string
): boolean {
  if (!category || category === "All") {
    return true;
  }

  return technician.specialization
    .toLowerCase()
    .includes(category.toLowerCase());
}

function matchesDivision(
  technician: PublicTechnicianProfile,
  division?: string
): boolean {
  if (!division || division === "All") {
    return true;
  }

  const id = districtIdForName(division);
  return technician.serviceDivision === division || !!id && technician.serviceDistrictIds.includes(id);
}

export function subscribeToApprovedTechnicians(
  onNext: (technicians: PublicTechnicianProfile[]) => void,
  onError: (error: Error) => void,
  filters?: {
    category?: ServiceCategory | "All" | string;
    division?: string;
    pageCount?: number;
    onHasMore?: (hasMore: boolean) => void;
  }
) {
  const count = Math.min(MAP_MAX_ITEMS, Math.max(1, filters?.pageCount ?? 1) * MAP_PAGE_SIZE);
  const districtId = districtIdForName(filters?.division ?? "");
  const category = SERVICE_CATEGORIES.find((value) => value === filters?.category);
  const techniciansQuery = query(collection(db, "technician_map_profiles"), where("approved", "==", true),
    ...(districtId ? [where("serviceDistrictIds", "array-contains", districtId)] : []),
    ...(category ? [where("serviceCategory", "==", category)] : []),
    orderBy(documentId()), limit(count));
  let alive = true, generation = 0;
  const unsubscribe = onSnapshot(
    techniciansQuery,
    (snapshot) => {
      const version = ++generation;
      // Follow-up server gets recheck CURRENT approval; no private profile read.
      void Promise.all(snapshot.docs.map((item) => getDocFromServer(item.ref))).then((verified) => {
        if (!alive || version !== generation) return;
        const technicians = verified
        .map((item) => mapTechnician(item.data() as PublicProjection))
        .filter((technician) =>
          matchesCategory(technician, filters?.category)
        )
        .filter((technician) =>
          matchesDivision(technician, filters?.division)
        )
        .sort((first, second) => {
          if (second.averageRating !== first.averageRating) {
            return second.averageRating - first.averageRating;
          }

          return first.fullName.localeCompare(second.fullName);
        });

        onNext(technicians);
        filters?.onHasMore?.(snapshot.size === count && count < MAP_MAX_ITEMS);
      }, (error) => { if (alive && version === generation) onError(error); });
    },
    onError
  );
  return () => { alive = false; unsubscribe(); };
}

export async function getApprovedTechnician(
  technicianId: string
): Promise<PublicTechnicianProfile | null> {
  const snapshot = await getDocFromServer(
    doc(db, "technician_map_profiles", technicianId)
  );

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as PublicProjection;
  if (data.approved !== true) {
    return null;
  }

  return mapTechnician(data);
}

export function subscribeToTechnicianReviews(
  technicianId: string,
  onNext: (reviews: TechnicianReviewSummary[], metadata: SnapshotMetadata) => void,
  onError: (error: Error) => void
) {
  const reviewsQuery = query(
    collection(db, "service_reviews"),
    where("technicianId", "==", technicianId)
  );

  return onSnapshot(
    reviewsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      const reviews = snapshot.docs
        .filter((item) => isEligibleReviewRating(item.data().rating))
        .map((item) => {
          const data = item.data();

          return {
            id: item.id,
            requestId: String(data.requestId ?? ""),
            customerId: String(data.customerId ?? ""),
            technicianId: String(data.technicianId ?? ""),
            customerName:
              typeof data.customerName === "string"
                ? data.customerName
                : undefined,
            rating: Number(data.rating ?? 0),
            comment: String(data.comment ?? ""),
            createdAt: data.createdAt as Timestamp | undefined,
          };
        })
        .sort((first, second) => {
          const firstMillis =
            first.createdAt?.toMillis() ?? 0;
          const secondMillis =
            second.createdAt?.toMillis() ?? 0;
          return secondMillis - firstMillis;
        });

      onNext(reviews, snapshot.metadata);
    },
    onError
  );
}
