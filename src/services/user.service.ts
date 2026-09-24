import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/src/firebase/config";

export type UserRole =
  | "customer"
  | "technician"
  | "dispatcher"
  | "admin"
  | "super_admin";

export type PublicRegistrationRole =
  | "customer"
  | "technician";

export type TechnicianApprovalStatus =
  | "pending"
  | "approved"
  | "rejected";

export interface UserProfileData {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: PublicRegistrationRole;
  specialization?: string;
  experience?: string;
  qualifications?: string;
  certifications?: string;
  serviceAreas?: string;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: UserRole;
  emailVerified?: boolean;
  technicianApprovalStatus?: TechnicianApprovalStatus;
  reviewedBy?: string | null;
  reviewedAt?: unknown;
  rejectionReason?: string | null;
  specialization?: string;
  experience?: string;
  qualifications?: string;
  certifications?: string;
  serviceAreas?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type MobileAccessDecision = {
  allowed: boolean;
  message?: string;
};

export function isPublicRegistrationRole(
  role: unknown
): role is PublicRegistrationRole {
  return role === "customer" || role === "technician";
}

export async function createUserProfile(
  data: UserProfileData
): Promise<void> {
  const userRef = doc(db, "users", data.uid);
  const isTechnician = data.role === "technician";

  await setDoc(userRef, {
    uid: data.uid,
    fullName: data.fullName.trim(),
    email: data.email.trim().toLowerCase(),
    phone: data.phone.trim(),
    address: data.address.trim(),
    role: data.role,
    emailVerified: false,
    ...(isTechnician
      ? {
          technicianApprovalStatus: "pending",
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: null,
          specialization:
            data.specialization?.trim() ?? "",
          experience:
            data.experience?.trim() ?? "",
          qualifications:
            data.qualifications?.trim() ?? "",
          certifications:
            data.certifications?.trim() ?? "",
          serviceAreas:
            data.serviceAreas?.trim() ?? "",
        }
      : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getUserProfile(
  uid: string
): Promise<UserProfile | null> {
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as UserProfile;
}

export async function markUserEmailVerified(
  uid: string
): Promise<void> {
  const userRef = doc(db, "users", uid);

  await updateDoc(userRef, {
    emailVerified: true,
    updatedAt: serverTimestamp(),
  });
}

export async function getPendingTechnicians(): Promise<
  UserProfile[]
> {
  const usersRef = collection(db, "users");
  const pendingTechniciansQuery = query(
    usersRef,
    where("role", "==", "technician")
  );
  const snapshot = await getDocs(pendingTechniciansQuery);

  return snapshot.docs
    .map((item) => item.data() as UserProfile)
    .filter(
      (item) =>
        item.technicianApprovalStatus === "pending"
    );
}

export async function updateTechnicianApprovalStatus({
  technicianUid,
  dispatcherUid,
  status,
  rejectionReason,
}: {
  technicianUid: string;
  dispatcherUid: string;
  status: Exclude<
    TechnicianApprovalStatus,
    "pending"
  >;
  rejectionReason?: string;
}): Promise<void> {
  const technicianRef = doc(db, "users", technicianUid);

  await updateDoc(technicianRef, {
    technicianApprovalStatus: status,
    reviewedBy: dispatcherUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    rejectionReason:
      status === "rejected"
        ? rejectionReason?.trim() ||
          "Application was not approved."
        : deleteField(),
  });
}

export function getDashboardRouteForRole(
  role: UserRole
) {
  switch (role) {
    case "technician":
      return "/technician";
    case "dispatcher":
      return "/dispatcher";
    case "customer":
    default:
      return "/(tabs)";
  }
}

export function getMobileAccessDecision(
  profile: UserProfile
): MobileAccessDecision {
  if (profile.emailVerified !== true) {
    return {
      allowed: false,
      message:
        "Please verify your email before signing in.",
    };
  }

  switch (profile.role) {
    case "customer":
    case "dispatcher":
      return { allowed: true };

    case "technician":
      if (
        profile.technicianApprovalStatus === "approved"
      ) {
        return { allowed: true };
      }

      if (
        profile.technicianApprovalStatus === "rejected"
      ) {
        return {
          allowed: false,
          message: profile.rejectionReason
            ? `Your technician application was not approved. ${profile.rejectionReason}`
            : "Your technician application was not approved. Please contact support if needed.",
        };
      }

      return {
        allowed: false,
        message:
          "Your technician account is still under review. Please wait while we confirm your information. You will be able to sign in after approval.",
      };

    case "admin":
    case "super_admin":
      return {
        allowed: false,
        message:
          "Super Admin access is available on the web portal only.",
      };

    default:
      return {
        allowed: false,
        message:
          "This account role is not supported in the mobile app.",
      };
  }
}
