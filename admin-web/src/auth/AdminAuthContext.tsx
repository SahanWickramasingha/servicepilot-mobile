import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { updateDoc, serverTimestamp } from "firebase/firestore";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { auth, db } from "../firebase/config";
import { getEffectiveAccountStatus } from "../services/accountLifecycleService";
import type { UserRecord } from "../types";

type AdminAuthState = {
  firebaseUser: User | null;
  profile: UserRecord | null;
  loading: boolean;
  accessDenied: string;
  signIn: (email: string, password: string) => Promise<UserRecord>;
  logout: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function getPortalHomeForRole(role?: string) {
  if (role === "super_admin") {
    return "/admin/dashboard";
  }

  if (role === "dispatcher") {
    return "/dispatcher/dashboard";
  }

  return "/login";
}

async function loadWebPortalProfile(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));

  if (!snapshot.exists()) {
    throw new Error("Admin profile not found.");
  }

  const profile = {
    id: snapshot.id,
    ...snapshot.data(),
  } as UserRecord;

  if (!["super_admin", "dispatcher"].includes(profile.role ?? "")) {
    throw new Error("Access denied.");
  }

  const accountStatus = getEffectiveAccountStatus(profile.accountStatus);

  if (accountStatus === "disabled") {
    throw new Error(
      "Your ServicePilot account has been disabled. Please contact support."
    );
  }

  if (accountStatus === "deleted") {
    throw new Error("This ServicePilot account is no longer active.");
  }

  if (
    profile.role === "dispatcher" &&
    profile.invitationStatus === "pending"
  ) {
    await updateDoc(doc(db, "users", uid), {
      invitationStatus: "accepted",
      updatedAt: serverTimestamp(),
    });

    profile.invitationStatus = "accepted";
  }

  return profile;
}

export function AdminAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setFirebaseUser(user);
      setAccessDenied("");

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const adminProfile = await loadWebPortalProfile(user.uid);
        setProfile(adminProfile);
      } catch (error) {
        setProfile(null);
        setAccessDenied(
          error instanceof Error
            ? error.message
            : "Access denied. This portal is restricted to active Super Admin and Dispatcher accounts."
        );
        await signOut(auth);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const value = useMemo<AdminAuthState>(
    () => ({
      firebaseUser,
      profile,
      loading,
      accessDenied,
      async signIn(email: string, password: string) {
        setLoading(true);
        setAccessDenied("");

        try {
          const credential = await signInWithEmailAndPassword(
            auth,
            email.trim().toLowerCase(),
            password
          );
          const adminProfile = await loadWebPortalProfile(
            credential.user.uid
          );

          setFirebaseUser(credential.user);
          setProfile(adminProfile);
          return adminProfile;
        } catch (error) {
          setProfile(null);
          await signOut(auth).catch(() => undefined);

          if (error instanceof Error) {
            setAccessDenied(
              error.message === "Access denied."
                ? "Access denied. This portal is restricted to active Super Admin and Dispatcher accounts."
                : error.message
            );
            throw error;
          }

          throw error;
        } finally {
          setLoading(false);
        }
      },
      async logout() {
        await signOut(auth);
        setFirebaseUser(null);
        setProfile(null);
      },
    }),
    [accessDenied, firebaseUser, loading, profile]
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error("useAdminAuth must be used inside AdminAuthProvider.");
  }

  return context;
}
