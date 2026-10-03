import { useEffect } from "react";
import { AppState } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/src/firebase/config";
import { subscribeToUserProfile } from "@/src/services/user.service";
import { foregroundSharing } from "@/src/services/foreground-location.service";
import { syncOwnMapProfile } from "@/src/services/location.service";

export function TechnicianLocationLifecycle() {
  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.();
      void foregroundSharing.setSession(undefined);
      if (user) unsubscribeProfile = subscribeToUserProfile(user.uid, (profile) => {
        const eligible = profile?.role === "technician" && profile.technicianApprovalStatus === "approved" &&
          (!profile.accountStatus || profile.accountStatus === "active") && user.emailVerified;
        if (eligible) {
          void foregroundSharing.setSession(user.uid);
          void syncOwnMapProfile(user.uid).catch((cause) => {
            if (__DEV__) console.warn("Technician map profile sync failed", { code: cause?.code ?? "unknown" });
          });
        }
        else void foregroundSharing.cleanup().catch(() => undefined);
      }, () => { void foregroundSharing.cleanup().catch(() => undefined); });
    });
    void foregroundSharing.setActive(AppState.currentState === "active");
    const listener = AppState.addEventListener("change", (state) => { void foregroundSharing.setActive(state === "active"); });
    return () => {
      listener.remove();
      unsubscribeAuth();
      unsubscribeProfile?.();
      void foregroundSharing.cleanup().catch(() => undefined);
    };
  }, []);
  return null;
}
