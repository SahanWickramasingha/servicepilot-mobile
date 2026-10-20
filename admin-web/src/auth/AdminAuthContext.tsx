import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
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
import { accountSessionDenial } from "../../../functions/src/domain/accountSession";
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

async function validateWebPortalProfile(user: User, profile: UserRecord | null) {
  // Status is checked before waiting on token metadata, and again with auth_time.
  const immediate = accountSessionDenial(profile, Number.POSITIVE_INFINITY);
  if (immediate) throw new Error(immediate);
  const token = profile?.sessionRevokedAt === undefined ? null : await user.getIdTokenResult();
  const denial = accountSessionDenial(profile, token?.claims.auth_time as number | undefined);
  if (denial) throw new Error(denial);
  if (!profile || !["super_admin", "dispatcher"].includes(profile.role ?? "")) throw new Error("Access denied.");
  if (auth.currentUser !== user) throw new Error("Your session changed. Please sign in again.");
  if (profile.role === "dispatcher" && profile.invitationStatus === "pending") {
    await updateDoc(doc(db, "users", user.uid), { invitationStatus: "accepted", updatedAt: serverTimestamp() });
    profile.invitationStatus = "accepted";
  }
  if (auth.currentUser !== user) throw new Error("Your session changed. Please sign in again.");
  return profile;
}

async function loadWebPortalProfile(user: User) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  return validateWebPortalProfile(user, snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as UserRecord : null);
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
    let mounted = true, generation = 0;
    let stopProfile: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      if (!mounted) return;
      stopProfile?.();
      stopProfile = undefined;
      const version = ++generation;
      let revision = 0;
      const current = () => mounted && version === generation && auth.currentUser === user;
      setLoading(true);
      setFirebaseUser(user);
      setProfile(null);
      if (!user) { setLoading(false); return; }
      stopProfile = onSnapshot(doc(db, "users", user.uid), async (snapshot) => {
        const event = ++revision;
        if (!current()) return;
        // Close the route gate while validating each authoritative status update.
        setLoading(true);
        setProfile(null);
        try {
          const next = await validateWebPortalProfile(user,
            snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as UserRecord : null);
          if (!current() || event !== revision) return;
          setProfile(next);
          setAccessDenied("");
        } catch (error) {
          if (!current() || event !== revision) return;
          setAccessDenied(error instanceof Error ? error.message : "Unable to verify account access.");
          await signOut(auth).catch(() => undefined);
        } finally {
          if (current() && event === revision) setLoading(false);
        }
      }, () => {
        if (!current()) return;
        setProfile(null);
        setLoading(false);
        setAccessDenied("Unable to verify account access. Reconnect and sign in again.");
        void signOut(auth).catch(() => undefined);
      });
    });
    return () => { mounted = false; generation++; stopProfile?.(); stopAuth(); };
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
          const adminProfile = await loadWebPortalProfile(credential.user);

          // Only the live, revision-guarded profile listener opens AdminRoute.
          // A slower one-shot sign-in read must not override a newer denial.
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
