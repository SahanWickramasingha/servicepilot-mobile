import {
  FirebaseError,
  getApp,
  getApps,
  initializeApp,
} from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  auth as primaryAuth,
  db as primaryDb,
  firebaseConfig,
} from "../firebase/config";

const SECONDARY_APP_NAME = "dispatcher-provisioning";
const DISPATCHER_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const secondaryApp = getApps().some((app) => app.name === SECONDARY_APP_NAME)
  ? getApp(SECONDARY_APP_NAME)
  : initializeApp(firebaseConfig, SECONDARY_APP_NAME);
const secondaryAuth = getAuth(secondaryApp);
const secondaryPersistenceReady = setPersistence(
  secondaryAuth,
  inMemoryPersistence
);

export type CreateDispatcherInput = {
  fullName: string;
  email: string;
};

export type CreateDispatcherResult = {
  uid: string;
  dispatcherId: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => DISPATCHER_ID_CHARS[byte % DISPATCHER_ID_CHARS.length])
    .join("");
}

export function generateDispatcherId(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  return `DSP-${year}-${generateToken(6)}`;
}

function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `Sp1!${token}`;
}

function getProvisioningMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "An account with this email already exists.";
      case "auth/invalid-email":
        return "Please enter a valid dispatcher email address.";
      case "auth/network-request-failed":
        return "Network error. Please check your connection and try again.";
      case "permission-denied":
        return "You do not have permission to create dispatcher profiles.";
      default:
        return error.message;
    }
  }

  return error instanceof Error
    ? error.message
    : "Unable to create dispatcher account setup link.";
}

export async function createDispatcherInvitation({
  fullName,
  email,
}: CreateDispatcherInput): Promise<CreateDispatcherResult> {
  const superAdmin = primaryAuth.currentUser;
  const cleanName = fullName.trim();
  const cleanEmail = normalizeEmail(email);

  if (!superAdmin) {
    throw new Error("Please sign in as Super Admin first.");
  }

  if (!cleanName) {
    throw new Error("Full name is required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid dispatcher email address.");
  }

  const dispatcherId = generateDispatcherId();
  const temporaryPassword = generateTemporaryPassword();
  let dispatcherUid = "";
  let profileCreated = false;

  try {
    await secondaryPersistenceReady;
    await superAdmin.getIdToken(true);

    const superAdminProfile = await getDoc(
      doc(primaryDb, "users", superAdmin.uid)
    );
    const superAdminData = superAdminProfile.data();

    if (
      !superAdminProfile.exists() ||
      superAdminData?.role !== "super_admin" ||
      superAdminData?.accountStatus !== "active"
    ) {
      throw new Error(
        "Your Super Admin profile must be active before creating dispatchers."
      );
    }

    if (import.meta.env.DEV) {
      console.debug("Dispatcher provisioning auth context", {
        primaryUid: primaryAuth.currentUser?.uid ?? null,
        secondaryUidBeforeCreate: secondaryAuth.currentUser?.uid ?? null,
      });
    }

    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      cleanEmail,
      temporaryPassword
    );
    dispatcherUid = credential.user.uid;

    if (primaryAuth.currentUser?.uid !== superAdmin.uid) {
      throw new Error(
        "Primary Super Admin session changed during dispatcher provisioning."
      );
    }

    if (import.meta.env.DEV) {
      console.debug("Dispatcher provisioning profile write context", {
        primaryUid: primaryAuth.currentUser?.uid ?? null,
        secondaryUidAfterCreate: secondaryAuth.currentUser?.uid ?? null,
        dispatcherUid,
      });
    }

    await setDoc(doc(primaryDb, "users", dispatcherUid), {
      uid: dispatcherUid,
      dispatcherId,
      fullName: cleanName,
      email: cleanEmail,
      role: "dispatcher",
      accountStatus: "active",
      invitationStatus: "pending",
      createdBy: superAdmin.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    profileCreated = true;

    await sendPasswordResetEmail(primaryAuth, cleanEmail, {
      url: `${window.location.origin}/login`,
      handleCodeInApp: false,
    });

    return {
      uid: dispatcherUid,
      dispatcherId,
    };
  } catch (error) {
    const secondaryUser = secondaryAuth.currentUser;
    const cleanupIssues: string[] = [];

    if (profileCreated && dispatcherUid) {
      await deleteDoc(doc(primaryDb, "users", dispatcherUid)).catch(() => {
        cleanupIssues.push("Firestore profile cleanup failed");
      });
    }

    if (secondaryUser) {
      await deleteUser(secondaryUser).catch(() => {
        cleanupIssues.push("Auth user cleanup failed");
      });
    }

    const message = getProvisioningMessage(error);
    throw new Error(
      cleanupIssues.length > 0
        ? `${message} ${cleanupIssues.join("; ")}. Manual cleanup may be required.`
        : message
    );
  } finally {
    await signOut(secondaryAuth).catch(() => undefined);
  }
}
