import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { auth } from "@/src/firebase/config";
import { waitForAuthReady } from "@/src/firebase/authPersistence";
import { LiveAccountGate } from "./LiveAccountGate";

export function AuthSessionGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => {
    let active = true;
    waitForAuthReady(auth).then(() => {
      if (active) setReady(true);
    }).catch(() => {
      if (active) setErrorMessage("Unable to restore sign-in. Check available device storage, then close and reopen the app.");
    });
    return () => { active = false; };
  }, []);

  if (!ready) {
    return (
      <View style={styles.container}>
        {errorMessage ? <Text style={styles.error} accessibilityRole="alert">{errorMessage}</Text>
          : <ActivityIndicator color="#3B82F6" accessibilityLabel="Restoring sign-in" />}
      </View>
    );
  }
  return <LiveAccountGate>{children}</LiveAccountGate>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#06101D", padding: 24 },
  error: { color: "#FCA5A5", textAlign: "center" },
});
