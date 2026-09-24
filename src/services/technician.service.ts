import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

import { ServiceCategory } from "@/src/constants/serviceRequests";
import { db } from "@/src/firebase/config";
import {
  getTechnicianDivision,
  UserProfile,
} from "@/src/services/user.service";

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
}

export interface TechnicianReviewSummary {
  id: string;
  requestId: string;
  customerId: string;
  technicianId: string;
  rating: number;
  comment: string;
  createdAt?: Timestamp;
}

function mapTechnician(
  data: UserProfile
): PublicTechnicianProfile {
  return {
    uid: data.uid,
    fullName: data.fullName || "Service Technician",
    email: data.email || "",
    phone: data.phone || "",
    address: data.address || "",
    profilePhotoUrl: data.profilePhotoUrl,
    specialization: data.specialization || "General Maintenance",
    experience: data.experience || "Not provided",
    qualifications: data.qualifications || "Not provided",
    certifications: data.certifications || "Not provided",
    serviceDivision: getTechnicianDivision(data),
    averageRating: Number(data.averageRating ?? 0),
    reviewCount: Number(data.reviewCount ?? 0),
    completedJobs: Number(data.completedJobs ?? 0),
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

  return technician.serviceDivision === division;
}

export function subscribeToApprovedTechnicians(
  onNext: (technicians: PublicTechnicianProfile[]) => void,
  onError: (error: Error) => void,
  filters?: {
    category?: ServiceCategory | "All" | string;
    division?: string;
  }
) {
  const techniciansQuery = query(
    collection(db, "users"),
    where("role", "==", "technician"),
    where("technicianApprovalStatus", "==", "approved")
  );

  return onSnapshot(
    techniciansQuery,
    (snapshot) => {
      const technicians = snapshot.docs
        .map((item) =>
          mapTechnician(item.data() as UserProfile)
        )
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
    },
    onError
  );
}

export async function getApprovedTechnician(
  technicianId: string
): Promise<PublicTechnicianProfile | null> {
  const snapshot = await getDoc(
    doc(db, "users", technicianId)
  );

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as UserProfile;

  if (
    data.role !== "technician" ||
    data.technicianApprovalStatus !== "approved"
  ) {
    return null;
  }

  return mapTechnician(data);
}

export function subscribeToTechnicianReviews(
  technicianId: string,
  onNext: (reviews: TechnicianReviewSummary[]) => void,
  onError: (error: Error) => void
) {
  const reviewsQuery = query(
    collection(db, "service_reviews"),
    where("technicianId", "==", technicianId)
  );

  return onSnapshot(
    reviewsQuery,
    (snapshot) => {
      const reviews = snapshot.docs
        .map((item) => {
          const data = item.data();

          return {
            id: item.id,
            requestId: String(data.requestId ?? ""),
            customerId: String(data.customerId ?? ""),
            technicianId: String(data.technicianId ?? ""),
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

      onNext(reviews);
    },
    onError
  );
}

