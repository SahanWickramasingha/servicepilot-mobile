import { requirePolicyAcceptance } from "./policy.service";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  runTransaction,
  type DocumentSnapshot,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { accountSessionDenial } from "@/functions/src/domain/accountSession";
import { buildMapProfile } from "@/functions/src/domain/mapProjection";
import { isReviewableTechnicianApplication } from "@/functions/src/domain/technicianApplication";
import { TERMS_VERSION, PRIVACY_POLICY_VERSION, hasCurrentPolicyAcceptance, type PolicyAcceptance } from "@/functions/src/domain/legalPolicy";
import { selectedTechnicianCategory, technicianCategory } from "@/functions/src/domain/serviceCategories";
import { readTechnicianAvailability, TechnicianAvailability } from "@/functions/src/domain/availability";
import { ServiceAreasByDistrict, StoredServiceAreasByDistrict, encodeServiceAreas } from "@/functions/src/domain/serviceAreas";

import { auth, db } from "@/src/firebase/config";
import { createSessionStream } from "./session-subscriptions";
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
  policyAccepted?: boolean;
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: PublicRegistrationRole;
  specialization?: string;
  serviceCategoryId?: string;
  experience?: string;
  qualifications?: string;
  certifications?: string;
  serviceAreas?: string;
  serviceDivision?: string;
}

export interface UserProfile extends PolicyAcceptance {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: UserRole;
  accountStatus?: "active" | "disabled" | "deleted" | string;
  lifecyclePending?: boolean;
  sessionRevokedAt?: number;
  emailVerified?: boolean;
  technicianApprovalStatus?: TechnicianApprovalStatus;
  reviewedBy?: string | null;
  reviewedAt?: unknown;
  rejectionReason?: string | null;
  specialization?: string;
  serviceCategoryId?: string;
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
  availability?: TechnicianAvailability;
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

/** Mirrors required registration form input before creating a partial Auth user. */
export function validateRegistrationProfile(data: Omit<UserProfileData, "uid">): void {
  const invalid = (message: string): never => { throw Object.assign(new Error(message), {
    code: "registration/invalid-profile", registrationStep: "profile-payload-validation",
  }); };
  if (data.policyAccepted !== true) invalid("Agree to the Terms and acknowledge the Privacy Policy before registering.");
  if (!isPublicRegistrationRole(data.role)) invalid("Only Customer and Technician accounts can be registered.");
  for (const field of ["fullName", "email", "phone", "address"] as const) {
    if (typeof data[field] !== "string" || !data[field].trim()) invalid(`Enter your ${field === "fullName" ? "full name" : field}.`);
  }
  if (data.role === "technician") {
    try { selectedTechnicianCategory(data.serviceCategoryId ?? technicianCategory(data)?.id); }
    catch { invalid("Select a valid service category."); }
    for (const field of ["experience", "qualifications", "serviceAreas"] as const) {
      if (typeof data[field] !== "string" || !data[field].trim()) invalid(`Enter your ${field === "serviceAreas" ? "service area" : field}.`);
    }
    for (const field of ["certifications", "serviceDivision"] as const) {
      if (data[field] !== undefined && typeof data[field] !== "string") invalid(`Enter valid ${field}.`);
    }
  }
}

async function profileStage<T>(registrationStep: string, action: () => T | Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    const fallback = registrationStep === "profile-create-transaction" ? "firestore/profile-write-failed" :
      registrationStep === "profile-existence-read" ? "firestore/profile-read-failed" : "firestore/profile-confirmation-failed";
    // Firebase-like objects can cross boundaries without instanceof Error.
    // Preserve their code, but never copy their message/payload into diagnostics.
    throw Object.assign(error instanceof Error ? error : new Error("Unable to confirm account setup. Retry recovery when connected."), {
      code: typeof code === "string" && code ? code : fallback, registrationStep,
    });
  }
}

export type RegistrationProfileConfirmation = {
  role: PublicRegistrationRole;
  technicianApprovalStatus?: TechnicianApprovalStatus;
  policyCurrent: boolean;
  created: boolean;
  emailVerified: boolean;
};

function registrationProfileError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function requireRegistrationAccount(user: User): void {
  if (auth.currentUser !== user) throw registrationProfileError("auth/registration-account-changed", "Your account session changed. Sign in again to recover the saved profile.");
}

function requireServerProfileSnapshot(snapshot: DocumentSnapshot): void {
  if (snapshot.metadata?.fromCache !== false || snapshot.metadata?.hasPendingWrites !== false) {
    throw registrationProfileError("firestore/profile-confirmation-pending", "The server profile is not confirmed yet. Reconnect and retry recovery; your account has been kept.");
  }
}

function resolvedProfileTimestamp(value: unknown): boolean {
  const time = value instanceof Date ? value.getTime() : value && typeof value === "object" &&
    "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : undefined;
  return typeof time === "number" && Number.isFinite(time);
}

async function confirmRegistrationProfile(snapshot: DocumentSnapshot, user: User, expectedRole: PublicRegistrationRole, created: boolean): Promise<RegistrationProfileConfirmation> {
  requireRegistrationAccount(user);
  requireServerProfileSnapshot(snapshot);
  if (!snapshot.exists()) throw registrationProfileError("firestore/profile-confirmation-missing", "The saved profile could not be found on the server. Retry authenticated recovery; do not create another account.");
  const profile = snapshot.data();
  if (profile.uid !== user.uid || typeof profile.email !== "string" || profile.email !== user.email?.trim().toLowerCase()) {
    throw registrationProfileError("firestore/profile-identity-mismatch", "The saved profile identity could not be confirmed. Contact support; it has not been changed.");
  }
  if (profile.role !== expectedRole || !isPublicRegistrationRole(profile.role)) {
    throw registrationProfileError("firestore/profile-role-mismatch", "This account already has a different role. Sign in using its existing role; recovery cannot change it.");
  }
  // Use the same revocation policy as login/live access: a new authenticated
  // session may be newer than sessionRevokedAt. Presence alone is not denial.
  const token = profile.sessionRevokedAt === undefined ? null : await user.getIdTokenResult();
  requireRegistrationAccount(user);
  const denial = accountSessionDenial(profile, token?.claims.auth_time as number | undefined);
  if (denial) throw registrationProfileError(profile.sessionRevokedAt !== undefined && profile.accountStatus === "active" && profile.lifecyclePending !== true ?
    "firestore/profile-session-revoked" : "firestore/profile-account-inactive", denial);
  const invalid = () => { throw registrationProfileError("firestore/profile-schema-invalid", "The saved profile needs support review. Recovery has not changed it. Sign in or contact support."); };
  for (const field of ["fullName", "phone", "address"]) if (typeof profile[field] !== "string" || !profile[field].trim()) invalid();
  if (typeof profile.emailVerified !== "boolean" || (profile.lifecyclePending !== undefined && typeof profile.lifecyclePending !== "boolean")) invalid();
  for (const field of ["createdAt", "updatedAt", "acceptedAt"]) {
    // No equality against serverTimestamp() sentinels, object identity or device
    // clock. Existing legacy missing dates/policy go through normal login gates.
    if ((created || profile[field] !== undefined) && !resolvedProfileTimestamp(profile[field])) invalid();
  }
  if (profile.role === "technician") {
    if (!["pending", "approved", "rejected"].includes(profile.technicianApprovalStatus) || !technicianCategory(profile)) invalid();
    for (const field of ["experience", "qualifications", "certifications", "serviceAreas", "serviceDivision"]) {
      if ((created || profile[field] !== undefined) && typeof profile[field] !== "string") invalid();
    }
  }
  const policyCurrent = hasCurrentPolicyAcceptance(profile);
  if (created && !policyCurrent) invalid();
  return { role: profile.role, ...(profile.role === "technician" ? { technicianApprovalStatus: profile.technicianApprovalStatus } : {}), policyCurrent, created, emailVerified: profile.emailVerified };
}

/** Server-only reconciliation for verification-first setup and legacy recovery.
 * A cached missing snapshot is never permission to create another profile. */
export async function inspectRegistrationProfile(user: User, role?: PublicRegistrationRole) {
  return profileStage("profile-existence-read", async () => {
    const snapshot = await getDocFromServer(doc(db, "users", user.uid));
    requireRegistrationAccount(user);
    requireServerProfileSnapshot(snapshot);
    if (!snapshot.exists()) return null;
    const expected = role ?? snapshot.data().role;
    return confirmRegistrationProfile(snapshot, user, expected, false);
  });
}

export async function createUserProfile(
  data: UserProfileData,
  options: { recoverExisting?: boolean } = {},
): Promise<RegistrationProfileConfirmation> {
  validateRegistrationProfile(data);
  const registeringUser = auth.currentUser;
  if (registeringUser?.uid !== data.uid || !isPublicRegistrationRole(data.role)) throw registrationProfileError("auth/registration-account-changed", "Register your own Customer or Technician profile only.");
  const userRef = doc(db, "users", data.uid);
  const isTechnician = data.role === "technician";
  const existingProfile = await profileStage("profile-existence-read", async () => {
    const snapshot = await getDocFromServer(userRef);
    requireRegistrationAccount(registeringUser);
    requireServerProfileSnapshot(snapshot);
    return snapshot;
  });

  if (existingProfile.exists()) {
    if (options.recoverExisting) return profileStage("profile-existing-validation", () => confirmRegistrationProfile(existingProfile, registeringUser, data.role, false));
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
    emailVerified: registeringUser.emailVerified === true,
    termsVersion: TERMS_VERSION,
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    acceptedAt: serverTimestamp(),
    ...(isTechnician
      ? {
          technicianApprovalStatus: "pending",
          availability: "offline",
          ...selectedTechnicianCategory(data.serviceCategoryId ?? technicianCategory(data)?.id),
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
    const created = await profileStage("profile-create-transaction", () => runTransaction(db, async (transaction) => {
      requireRegistrationAccount(registeringUser);
      const existing = await transaction.get(userRef);
      requireRegistrationAccount(registeringUser);
      if (existing.exists()) {
        if (options.recoverExisting) return false;
        throw Object.assign(new Error("A profile already exists. Sign in instead; contact support if access is blocked."), { code: "firestore/profile-already-exists" });
      }
      transaction.set(userRef, profilePayload);
      return true;
    }));
    try {
      return await profileStage("profile-server-confirmation", async () => {
        let snapshot = await getDocFromServer(userRef);
        requireRegistrationAccount(registeringUser);
        requireServerProfileSnapshot(snapshot);
        if (!snapshot.exists()) {
          // getDocFromServer uses a snapshot listener. Resolve an unexpected
          // post-commit absence with one direct, read-only transaction, never
          // a second write, a cached profile or a timer-based access grant.
          snapshot = await runTransaction(db, async transaction => {
            requireRegistrationAccount(registeringUser);
            const current = await transaction.get(userRef);
            requireRegistrationAccount(registeringUser);
            return current;
          }, { maxAttempts: 1 });
        }
        return confirmRegistrationProfile(snapshot, registeringUser, data.role, created);
      });
    } catch (error) {
      // Transaction acknowledgement is separate from a later read/validation.
      // Never tell recovery to overwrite or delete a committed profile.
      throw Object.assign(error as Error, { profileWriteCommitted: created });
    }
  } catch (error: any) {
    logRegistrationError({
      step: "setDoc-users-uid:error",
      uid: data.uid,
      firebaseErrorCode: getFirebaseErrorCode(error),
      firebaseErrorMessage: getFirebaseErrorMessage(error),
      path: `users/${data.uid}`,
      ...safeProfileDebugValues,
    });

    throw error;
  }

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

const profileStream = createSessionStream<[UserProfile | null]>(() => [null]);
export function subscribeToUserProfile(
  uid: string,
  onNext: (profile: UserProfile | null) => void,
  onError: (error: Error) => void
) {
  return profileStream(uid, (emit, fail) => onSnapshot(
    doc(db, "users", uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        emit(null);
        return;
      }

      emit(snapshot.data() as UserProfile);
    },
    fail
  ), onNext, onError);
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
    serviceCategoryId?: string;
  }
): Promise<void> {
  if (auth.currentUser?.uid !== uid) throw new Error("Update your own account only.");
  await requirePolicyAcceptance();
  if (!data.fullName.trim() || !data.phone.trim() || !data.address.trim()) throw new Error("Full name, phone, and address are required.");
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (transaction) => {
    const profile = (await transaction.get(userRef)).data();
    if (!profile) throw new Error("Profile unavailable.");
    if (auth.currentUser?.uid !== uid) throw new Error("Your account changed. Please try again.");
    if (data.serviceCategoryId !== undefined && profile.role !== "technician") throw new Error("Service categories are for Technician specialties only.");
    const hasCoverage = data.serviceDistrictIds !== undefined || data.serviceAreasByDistrict !== undefined;
    if (hasCoverage && (profile.role !== "technician" || !data.serviceDistrictIds || !data.serviceAreasByDistrict)) {
      throw new Error("Service areas require a Technician and selected districts.");
    }
    const changes = { fullName: data.fullName.trim(), phone: data.phone.trim(), address: data.address.trim(), updatedAt: serverTimestamp(),
      ...(data.serviceCategoryId !== undefined ? selectedTechnicianCategory(data.serviceCategoryId) : {}),
      ...(hasCoverage ? { serviceDistrictIds: data.serviceDistrictIds!, serviceAreasByDistrict: encodeServiceAreas(data.serviceDistrictIds!, data.serviceAreasByDistrict!) } : {}) };
    transaction.update(userRef, changes);
    // Approval, ratings and job totals come from the transaction's authoritative
    // user snapshot, never form values or a potentially stale public projection.
    if (profile?.role === "technician") transaction.set(doc(db, "technician_map_profiles", uid), {
      ...buildMapProfile(uid, { ...profile, ...changes }), updatedAt: serverTimestamp(),
    });
  });
}

/** Only this explicit control changes availability. Jobs and GPS never write it. */
export async function updateTechnicianAvailability(uid: string, availability: TechnicianAvailability): Promise<void> {
  const currentUser = auth.currentUser;
  if (currentUser?.uid !== uid) throw new Error("Change availability for your own account only.");
  if (!readTechnicianAvailability(availability)) throw new Error("Select Available, Busy or Offline.");
  await runTransaction(db, async (transaction) => {
    if (auth.currentUser?.uid !== uid) throw new Error("Your account changed. Please try again.");
    const userRef = doc(db, "users", uid);
    const profile = (await transaction.get(userRef)).data();
    if (!profile || profile.role !== "technician" || profile.technicianApprovalStatus !== "approved" ||
        (profile.accountStatus !== undefined && profile.accountStatus !== "active") || !currentUser.emailVerified) {
      throw new Error("An active, verified and approved technician account is required.");
    }
    transaction.update(userRef, { availability, updatedAt: serverTimestamp() });
    transaction.set(doc(db, "technician_map_profiles", uid), {
      ...buildMapProfile(uid, { ...profile, availability }), updatedAt: serverTimestamp(),
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
    where("technicianApprovalStatus", "==", "pending"),
    where("emailVerified", "==", true),
    limit(50)
  );
  const snapshot = await getDocs(pendingTechniciansQuery);

  return snapshot.docs.map(
    (item) => item.data() as UserProfile
  ).filter(isReviewableTechnicianApplication);
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
  if (!technicianUid || !dispatcherUid || status === "rejected" && (!rejectionReason?.trim() || rejectionReason.trim().length > 2000)) throw new Error("A rejection reason of up to 2,000 characters is required.");
  await runTransaction(db, async (transaction) => {
    const profile = (await transaction.get(technicianRef)).data();
    if (!profile || profile.uid !== technicianUid || !isReviewableTechnicianApplication(profile)) throw new Error("Application already reviewed, unverified or incomplete. Refresh the applications list.");
    const category = technicianCategory(profile);
    const categoryFields = category ? selectedTechnicianCategory(category.id) : {};
    transaction.update(technicianRef, {
      ...categoryFields,
      technicianApprovalStatus: status,
      reviewedBy: dispatcherUid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      rejectionReason:
        status === "rejected"
          ? rejectionReason!.trim()
          : deleteField(),
    });
    transaction.set(doc(db, "technician_map_profiles", technicianUid), {
      ...buildMapProfile(technicianUid, { ...profile, ...categoryFields, technicianApprovalStatus: status }), updatedAt: serverTimestamp(),
    });
  });
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
