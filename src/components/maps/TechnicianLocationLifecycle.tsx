import { useEffect } from "react";
import { AppState } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/src/firebase/config";
import { subscribeToUserProfile } from "@/src/services/user.service";
import { foregroundSharing } from "@/src/services/foreground-location.service";
import { syncOwnMapProfile } from "@/src/services/location.service";
import { accountSessionDenial } from "@/functions/src/domain/accountSession";

export function TechnicianLocationLifecycle() {
  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let alive = true, generation = 0;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!alive) return;
      const version = ++generation;
      let revision = 0;
      const current = () => alive && version === generation && auth.currentUser === user;
      unsubscribeProfile?.();
      void foregroundSharing.setSession(undefined);
      if (user) unsubscribeProfile = subscribeToUserProfile(user.uid, async (profile) => {
        const event = ++revision;
        if (!current()) return;
        const eligible = profile?.role === "technician" && profile.technicianApprovalStatus === "approved" &&
          !accountSessionDenial(profile, Number.POSITIVE_INFINITY) && user.emailVerified;
        if (eligible) {
          // Re-enabling an account never revives its revoked login or consent.
          if (profile.sessionRevokedAt !== undefined) {
            try {
              const result = await user.getIdTokenResult();
              if (!current() || event !== revision) return;
              if (accountSessionDenial(profile, result.claims.auth_time as number | undefined)) {
                void foregroundSharing.cleanup().catch(() => undefined); return;
              }
            } catch { if (current() && event === revision) void foregroundSharing.cleanup().catch(() => undefined); return; }
          }
          if (!current() || event !== revision) return;
          void foregroundSharing.setSession(user.uid);
          void syncOwnMapProfile(user.uid).catch((cause) => {
            if (__DEV__) console.warn("Technician map profile sync failed", { code: cause?.code ?? "unknown" });
          });
        }
        else void foregroundSharing.cleanup().catch(() => undefined);
      }, () => { if (current()) { revision++; void foregroundSharing.cleanup().catch(() => undefined); } });
    });
    void foregroundSharing.setActive(AppState.currentState === "active");
    const listener = AppState.addEventListener("change", (state) => { void foregroundSharing.setActive(state === "active"); });
    return () => {
      alive = false; generation++;
      listener.remove();
      unsubscribeAuth();
      unsubscribeProfile?.();
      void foregroundSharing.cleanup().catch(() => undefined);
    };
  }, []);
  return null;
}
