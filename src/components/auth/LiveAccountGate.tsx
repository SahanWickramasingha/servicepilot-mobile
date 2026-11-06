import { AppModal as Modal } from "@/src/components/layout/AppModal";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StatusBar, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { observeAccountSession } from "@/src/services/account-session.service";
import { logoutRevokedUser } from "@/src/services/auth.service";
import { AccountSessionContext, type AccountSessionState } from "./AccountSessionContext";
import { getMobileAccessDecision } from "@/src/services/user.service";
import { mobileProfileIsComplete } from "@/src/utils/mobileOnboarding";
import { AccountSetupLoading } from "./AccountSetupLoading";

export function LiveAccountGate({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const signingOut = useRef(false);
  const retainDenial = useRef(false);
  const [state, setState] = useState<AccountSessionState>({ phase: "checking" });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => observeAccountSession({
    denied: (reason) => {
      retainDenial.current = true;
      setState({ phase: "denied", message: reason });
      setPending(false);
      setMessage(reason);
      setDenied(true);
      if (!signingOut.current) {
        signingOut.current = true;
        // The backend has already gated the account and removed map sharing.
        void logoutRevokedUser().catch(() => undefined).finally(() => { signingOut.current = false; });
      }
    },
    pending: (user) => {
      retainDenial.current = false;
      // Keep the last server-confirmed subtree mounted during a same-session
      // check. The opaque modal blocks touches/accessibility; remounting it here
      // would reset forms and revoke foreground GPS during an ordinary save.
      setState(previous => previous.phase === "ready" && previous.user === user ? previous : { phase: "checking" });
      setPending(true); setMessage(""); setDenied(false);
    },
    signedOut: () => { setState({ phase: "signed-out" }); setPending(false); if (!retainDenial.current) { setMessage(""); setDenied(false); } },
    error: (reason) => { retainDenial.current = false; setState({ phase: "error", message: reason }); setPending(false); setMessage(reason); setDenied(false); },
    setupRequired: (user, verified) => {
      setState({ phase: verified ? "profile-setup" : "awaiting-verification", user });
      setPending(false); setMessage(""); setDenied(false);
    },
    allowed: (profile, user, verified) => {
      if (["dispatcher", "admin", "super_admin"].includes(profile.role)) {
        setState({ phase: "denied", user, profile, message: "This account uses the ServicePilot web portal. Sign in there to continue." });
        setPending(false); setMessage(""); setDenied(false); return;
      }
      if (!mobileProfileIsComplete(profile, user)) {
        setState({ phase: "denied", user, profile, message: "Your saved profile needs support review. Contact support to continue." });
        setPending(false); setMessage(""); setDenied(false); return;
      }
      const access = getMobileAccessDecision(profile);
      const phase = !verified || profile.emailVerified !== true ? "awaiting-verification" :
        profile.role === "technician" && profile.technicianApprovalStatus === "pending" ? "approval-pending" : access.allowed ? "ready" : "denied";
      setState({ phase, profile, user, message: access.message });
      setPending(false); setMessage(""); setDenied(false);
    },
  }), [attempt]);
  return <AccountSessionContext.Provider value={{ state, retry }}>
    {/* Android copies the activity's system-bar appearance when a modal opens. */}
    <StatusBar barStyle="light-content" />
    <View style={{ flex: 1 }} pointerEvents={pending || message ? "none" : "auto"} accessibilityElementsHidden={pending || !!message} importantForAccessibility={pending || message ? "no-hide-descendants" : "auto"}>{children}</View>
    <Modal visible={pending || !!message} transparent={false} animationType="none" onRequestClose={() => undefined}>
      {pending ? <AccountSetupLoading /> : <View style={{ flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#06101D", gap: 24 }}>
        <Text accessibilityRole="alert" style={{ color: "#FCA5A5", fontSize: 17 }}>{message}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={async () => {
          if (denied) {
            try { await logoutRevokedUser(); }
            catch { setMessage("Unable to end the revoked session. Retry to finish signing out."); return; }
            setMessage("");
            retainDenial.current = false;
            setDenied(false);
            router.replace({ pathname: "/login", params: { accessMessage: message } });
          } else {
            setPending(true);
            setAttempt((value) => value + 1);
          }
        }}><Text style={{ color: "#60A5FA", fontSize: 17 }}>{denied ? "Continue to sign in" : "Retry access check"}</Text></TouchableOpacity>
      </View>}
    </Modal>
  </AccountSessionContext.Provider>;
}
