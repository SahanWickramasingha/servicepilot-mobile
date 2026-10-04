import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { buildMapProfile } from "@/functions/src/domain/mapProjection";
import { ServiceAreasByDistrict, StoredServiceAreasByDistrict, encodeServiceAreas } from "@/functions/src/domain/serviceAreas";

import { auth, db } from "@/src/firebase/config";
import {
  getFirebaseErrorCode,
  getFirebaseErrorMessage,
  getSafeProfileDebugValues,
  logRegistrationDebug,
  logRegistrationError,
} from "@/src/utils/registrationDebug";

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
  serviceDivision?: string;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: UserRole;
  accountStatus?: "active" | "disabled" | "deleted" | string;
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
  serviceDivision?: string;
  profilePhotoUrl?: string;
  serviceDistrictIds?: string[];
  serviceAreasByDistrict?: StoredServiceAreasByDistrict;
  averageRating?: number;
  reviewCount?: number;
  completedJobs?: number;
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
  const existingProfile = await getDoc(userRef);

  if (existingProfile.exists()) {
    throw Object.assign(
      new Error(
        "A profile already exists for this authenticated user."
      ),
      {
        code: "firestore/profile-already-exists",
      }
    );
  }

  const serviceArea = data.serviceAreas?.trim() ?? "";
  const serviceDivision =
    data.serviceDivision?.trim() || serviceArea;

  const profilePayload = {
    uid: data.uid,
    fullName: data.fullName.trim(),
    email: data.email.trim().toLowerCase(),
    phone: data.phone.trim(),
    address: data.address.trim(),
    role: data.role,
    accountStatus: "active",
    emailVerified: false,
    ...(isTechnician
      ? {
          technicianApprovalStatus: "pending",
          specialization:
            data.specialization?.trim() ?? "",
          experience:
            data.experience?.trim() ?? "",
          qualifications:
            data.qualifications?.trim() ?? "",
          certifications:
            data.certifications?.trim() ?? "",
          serviceAreas: serviceArea,
          serviceDivision,
        }
      : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const safeProfileDebugValues =
    getSafeProfileDebugValues(profilePayload);

  logRegistrationDebug({
    step: "firestore-profile-payload:created",
    uid: data.uid,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
    path: `users/${data.uid}`,
    ...safeProfileDebugValues,
  });

  logRegistrationDebug({
    step: "setDoc-users-uid:start",
    uid: data.uid,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
    path: `users/${data.uid}`,
    ...safeProfileDebugValues,
  });

  try {
    await setDoc(userRef, profilePayload);
  } catch (error: any) {
    logRegistrationError({
      step: "setDoc-users-uid:error",
      uid: data.uid,
      firebaseErrorCode: getFirebaseErrorCode(error),
      firebaseErrorMessage: getFirebaseErrorMessage(error),
      path: `users/${data.uid}`,
      ...safeProfileDebugValues,
    });

    error.code =
      error?.code || "firestore/profile-write-failed";
    error.registrationStep =
      error?.registrationStep ||
      "setDoc-users-uid";
    throw error;
  }

  logRegistrationDebug({
    step: "setDoc-users-uid:success",
    uid: data.uid,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
    path: `users/${data.uid}`,
    ...safeProfileDebugValues,
  });
}

export function getTechnicianDivision(
  profile: Pick<
    UserProfile,
    "serviceDivision" | "serviceAreas" | "address"
  >
): string {
  return (
    profile.serviceDivision?.trim() ||
    profile.serviceAreas?.trim() ||
    profile.address?.trim() ||
    "Unassigned Division"
  );
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

export function subscribeToUserProfile(
  uid: string,
  onNext: (profile: UserProfile | null) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "users", uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onNext(null);
        return;
      }

      onNext(snapshot.data() as UserProfile);
    },
    onError
  );
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

export async function updateUserProfileSafe(
  uid: string,
  data: {
    fullName: string;
    phone: string;
    address: string;
    serviceDistrictIds?: string[];
    serviceAreasByDistrict?: ServiceAreasByDistrict;
  }
): Promise<void> {
  if (auth.currentUser?.uid !== uid) throw new Error("Update your own account only.");
  if (!data.fullName.trim() || !data.phone.trim() || !data.address.trim()) throw new Error("Full name, phone, and address are required.");
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (transaction) => {
    const profile = (await transaction.get(userRef)).data();
    if (!profile) throw new Error("Profile unavailable.");
    const hasCoverage = data.serviceDistrictIds !== undefined || data.serviceAreasByDistrict !== undefined;
    if (hasCoverage && (profile.role !== "technician" || !data.serviceDistrictIds || !data.serviceAreasByDistrict)) {
      throw new Error("Service areas require a Technician and selected districts.");
    }
    const changes = { fullName: data.fullName.trim(), phone: data.phone.trim(), address: data.address.trim(), updatedAt: serverTimestamp(),
      ...(hasCoverage ? { serviceDistrictIds: data.serviceDistrictIds!, serviceAreasByDistrict: encodeServiceAreas(data.serviceDistrictIds!, data.serviceAreasByDistrict!) } : {}) };
    transaction.update(userRef, changes);
    if (profile?.role === "technician") transaction.set(doc(db, "technician_map_profiles", uid), {
      ...buildMapProfile(uid, { ...profile, ...changes }), updatedAt: serverTimestamp(),
    });
  });
}

export async function getPendingTechnicians(): Promise<
  UserProfile[]
> {
  const usersRef = collection(db, "users");
  const pendingTechniciansQuery = query(
    usersRef,
    where("role", "==", "technician"),
    where("technicianApprovalStatus", "==", "pending")
  );
  const snapshot = await getDocs(pendingTechniciansQuery);

  return snapshot.docs.map(
    (item) => item.data() as UserProfile
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
  const profile = (await getDoc(technicianRef)).data();
  if (!profile) throw new Error("Technician profile unavailable.");
  const batch = writeBatch(db);
  batch.update(technicianRef, {
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
  batch.set(doc(db, "technician_map_profiles", technicianUid), {
    ...buildMapProfile(technicianUid, { ...profile, technicianApprovalStatus: status }), updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export function getDashboardRouteForRole(
  role: UserRole
) {
  switch (role) {
    case "technician":
      return "/technician";
    case "dispatcher":
      return "/login";
    case "customer":
    default:
      return "/(tabs)";
  }
}

export function getMobileAccessDecision(
  profile: UserProfile
): MobileAccessDecision {
  if (profile.accountStatus === "disabled") {
    return {
      allowed: false,
      message:
        "Your ServicePilot account has been disabled. Please contact support.",
    };
  }

  if (profile.accountStatus === "deleted") {
    return {
      allowed: false,
      message:
        "This ServicePilot account is no longer active.",
    };
  }

  if (
    profile.accountStatus &&
    profile.accountStatus !== "active"
  ) {
    return {
      allowed: false,
      message:
        "This ServicePilot account is not active. Please contact support.",
    };
  }

  if (profile.emailVerified !== true) {
    return {
      allowed: false,
      message:
        "Please verify your email before signing in.",
    };
  }

  switch (profile.role) {
    case "customer":
      return { allowed: true };

    case "dispatcher":
      return {
        allowed: false,
        message:
          "Dispatcher access is available through the ServicePilot web portal.",
      };

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

    case "super_admin":
      return {
        allowed: false,
        message:
          "Super Admin access is available on the web portal only.",
      };

    case "admin":
      return {
        allowed: false,
        message:
          "This account role is available through the web portal only.",
      };

    default:
      return {
        allowed: false,
        message:
          "This account role is not supported in the mobile app.",
      };
  }
}
