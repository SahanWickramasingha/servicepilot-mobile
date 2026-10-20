import { router } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "@/src/firebase/config";
import { accountSessionDenial } from "@/functions/src/domain/accountSession";
import { logoutRevokedUser } from "@/src/services/auth.service";
import {
  getDashboardRouteForRole,
  getMobileAccessDecision,
  getUserProfile,
  type UserRole,
} from "@/src/services/user.service";

type AccessState = { checking: boolean; checkedUser: User | null; errorMessage: string };

// Shared startup/protected-route check. Firebase's first auth event follows
// restoration; a failed profile read must not be mistaken for a signed-out user.
export function useMobileSessionAccess(allowedRoleKey = "", goToDashboard = false) {
  const [state, setState] = useState<AccessState>({ checking: true, checkedUser: null, errorMessage: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let revocationMessage = "";
    const requiredRoles = allowedRoleKey ? allowedRoleKey.split("|") as UserRole[] : null;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const version = ++generation;
      const isCurrent = () => active && version === generation && auth.currentUser === user;
      if (!isCurrent()) return;
      setState({ checking: true, checkedUser: null, errorMessage: "" });

      if (!user) {
        router.replace(revocationMessage ? { pathname: "/login", params: { accessMessage: revocationMessage } } : "/login");
        return;
      }
      try {
        const profile = await getUserProfile(user.uid);
        if (!isCurrent()) return;
        if (!profile) {
          router.replace({ pathname: "/login", params: {
            email: user.email ?? "", accessMessage: "User profile not found. Please contact support.",
          } });
          return;
        }

        const token = profile.sessionRevokedAt === undefined ? null : await user.getIdTokenResult();
        if (!isCurrent()) return;
        const sessionDenial = accountSessionDenial(profile, token?.claims.auth_time as number | undefined);
        const accessDecision = sessionDenial ? { allowed: false, message: sessionDenial } : getMobileAccessDecision(profile);
        if (!accessDecision.allowed) {
          const accountIsInactive = !!sessionDenial;
          if (accountIsInactive) {
            // Backend revocation already removed sharing; stop local GPS even
            // when disabled-session rules reject normal cleanup writes.
            revocationMessage = accessDecision.message ?? "Your account is no longer active.";
            await logoutRevokedUser();
            if (!isCurrent()) return;
          }
          router.replace({ pathname: "/login", params: {
            email: profile.email ?? user.email ?? "",
            needsVerification: !accountIsInactive && profile.emailVerified !== true ? "true" : "false",
            accessMessage: accessDecision.message ?? "",
          } });
          return;
        }

        if (goToDashboard || (requiredRoles && !requiredRoles.includes(profile.role))) {
          router.replace(getDashboardRouteForRole(profile.role) as never);
          return;
        }
        setState({ checking: false, checkedUser: user, errorMessage: "" });
      } catch {
        if (!isCurrent()) return;
        // Keep the Firebase session. No protected content until access is checked.
        setState({ checking: false, checkedUser: null,
          errorMessage: "Unable to verify account access. Check your connection and try again. Your sign-in has been kept.",
        });
      }
    });
    return () => { active = false; generation++; unsubscribe(); };
  }, [allowedRoleKey, goToDashboard, attempt]);

  return {
    checking: state.checking,
    allowed: state.checkedUser !== null && state.checkedUser === auth.currentUser,
    errorMessage: state.errorMessage,
    retry: () => {
      setState({ checking: true, checkedUser: null, errorMessage: "" });
      setAttempt((value) => value + 1);
    },
  };
}
