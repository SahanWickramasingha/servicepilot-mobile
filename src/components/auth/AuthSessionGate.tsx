import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { auth } from "@/src/firebase/config";
import { waitForAuthReady } from "@/src/firebase/authPersistence";
import { LiveAccountGate } from "./LiveAccountGate";

export function AuthSessionGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      if (active) setErrorMessage("Sign-in restoration is taking longer than expected. Retry to continue.");
    }, 20_000);
    waitForAuthReady(auth).then(() => {
      clearTimeout(timeout);
      if (active) { setErrorMessage(""); setReady(true); }
    }).catch(() => {
      clearTimeout(timeout);
      if (active) setErrorMessage("Unable to restore sign-in. Check available device storage, then close and reopen the app.");
    });
    return () => { active = false; clearTimeout(timeout); };
  }, [attempt]);

  if (!ready) {
    return (
      <View style={styles.container}>
        {errorMessage ? <Text style={styles.error} accessibilityRole="alert">{errorMessage}</Text>
          : <ActivityIndicator color="#3B82F6" accessibilityLabel="Restoring sign-in" />}
        {!!errorMessage && <Pressable accessibilityRole="button" onPress={() => { setErrorMessage(""); setAttempt(value => value + 1); }} style={{ padding: 20 }}><Text style={{ color: "#60A5FA" }}>Retry sign-in restoration</Text></Pressable>}
      </View>
    );
  }
  return <LiveAccountGate>{children}</LiveAccountGate>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#06101D", padding: 24 },
  error: { color: "#FCA5A5", textAlign: "center" },
});
