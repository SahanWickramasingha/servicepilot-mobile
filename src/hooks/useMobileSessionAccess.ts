import { router } from "expo-router";
import { useEffect } from "react";
import { auth } from "@/src/firebase/config";
import { useAccountSession } from "@/src/components/auth/AccountSessionContext";
import { getDashboardRouteForRole, type UserRole } from "@/src/services/user.service";

/** Startup and every protected route consume the root observer's decision.
 * They never start competing Auth/profile readers or sign-out operations. */
export function useMobileSessionAccess(allowedRoleKey = "", goToDashboard = false) {
  const { state, retry } = useAccountSession();
  const current = !!state.user && state.user === auth.currentUser;
  const ready = current && state.phase === "ready";
  const role = state.profile?.role;
  const roleAllowed = !allowedRoleKey || !!role && allowedRoleKey.split("|").includes(role);
  useEffect(() => {
    if (state.phase === "checking" || state.phase === "error") return;
    if (state.phase === "signed-out") { router.replace("/login"); return; }
    if (!current) return;
    if (state.phase === "awaiting-verification") { router.replace("/verify-email"); return; }
    if (state.phase === "profile-setup") { router.replace("/profile-setup" as never); return; }
    if (state.phase === "approval-pending") { router.replace("/technician-pending"); return; }
    if (state.phase === "denied") {
      router.replace({ pathname: "/login", params: { accessMessage: state.message ?? "Contact support for help with account access." } }); return;
    }
    if (ready && role && (goToDashboard || !roleAllowed)) router.replace(getDashboardRouteForRole(role as UserRole) as never);
  }, [state, current, ready, role, roleAllowed, goToDashboard]);
  return { checking: state.phase === "checking", allowed: ready && roleAllowed && !goToDashboard,
    errorMessage: state.phase === "error" ? state.message ?? "Unable to confirm access. Retry." :
      state.user && !current ? "Your sign-in changed. Retry to check account access." : "", retry };
}
