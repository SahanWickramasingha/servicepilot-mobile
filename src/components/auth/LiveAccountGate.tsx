import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { observeAccountSession } from "@/src/services/account-session.service";
import { logoutRevokedUser } from "@/src/services/auth.service";

export function LiveAccountGate({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const signingOut = useRef(false);
  useEffect(() => observeAccountSession({
    denied: (reason) => {
      setMessage(reason);
      setDenied(true);
      if (!signingOut.current) {
        signingOut.current = true;
        // The backend has already gated the account and removed map sharing.
        void logoutRevokedUser().catch(() => undefined).finally(() => { signingOut.current = false; });
      }
    },
    error: (reason) => { setMessage(reason); setDenied(false); },
    allowed: () => { setMessage(""); setDenied(false); },
  }), [attempt]);
  return <>
    {children}
    <Modal visible={!!message} transparent={false} animationType="none" onRequestClose={() => undefined}>
      <View style={{ flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#06101D", gap: 24 }}>
        <Text accessibilityRole="alert" style={{ color: "#FCA5A5", fontSize: 17 }}>{message}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={async () => {
          if (denied) {
            try { await logoutRevokedUser(); }
            catch { setMessage("Unable to end the revoked session. Retry to finish signing out."); return; }
            setMessage("");
            router.replace({ pathname: "/login", params: { accessMessage: message } });
          } else setAttempt((value) => value + 1);
        }}><Text style={{ color: "#60A5FA", fontSize: 17 }}>{denied ? "Continue to sign in" : "Retry access check"}</Text></TouchableOpacity>
      </View>
    </Modal>
  </>;
}
