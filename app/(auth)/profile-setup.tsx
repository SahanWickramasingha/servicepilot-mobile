import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import RegisterScreen from "./register";
import { auth } from "@/src/firebase/config";
import { completeVerifiedRegistration } from "@/src/services/registration.service";
import { logoutUser } from "@/src/services/auth.service";
import type { PublicRegistrationRole } from "@/src/services/user.service";
import { useAccountSession } from "@/src/components/auth/AccountSessionContext";
import { getOnboardingDraft } from "@/src/services/onboarding-draft.service";
import { onboardingFailureFeedback } from "@/src/utils/onboardingFeedback";

export default function ProfileSetupScreen() {
  const owner = useRef(auth.currentUser);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [role, setRole] = useState<PublicRegistrationRole>();
  const { retry } = useAccountSession();
  useEffect(() => {
    let active = true;
    const user = auth.currentUser;
    if (!user) { router.replace("/login"); return; }
    setChecking(true); setError("");
    completeVerifiedRegistration().then((result) => {
      if (!active || auth.currentUser !== user) return;
      if (result.next === "profile-setup") { setChecking(false); return; }
      retry();
      router.replace({ pathname: `/${result.next}` as never, params: result.accessMessage ? { accessMessage: result.accessMessage } : {} });
    }).catch((failure) => {
      if (!active || auth.currentUser !== user) return;
      if (failure?.code === "registration/email-not-verified") { router.replace("/verify-email"); return; }
      setChecking(false); setError(onboardingFailureFeedback(failure).message);
    });
    return () => { active = false; };
  }, [attempt, retry]);
  if (auth.currentUser !== owner.current) return <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 20, backgroundColor: "#06101D" }}>
    <Text style={{ color: "white" }}>Your account changed. Continue with your current sign-in.</Text>
    <Pressable accessibilityRole="button" onPress={() => router.replace("/")}><Text style={{ color: "#60A5FA", padding: 16 }}>Continue</Text></Pressable>
  </View>;
  if (!checking && !error && role) return <RegisterScreen setup initialRole={role} />;
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center", gap: 20, backgroundColor: "#06101D" }}>
    {checking ? <ActivityIndicator color="#60A5FA" accessibilityLabel="Checking saved profile" /> : <>
      <Text accessibilityRole="header" style={{ color: "white", fontSize: 24 }}>Complete account setup</Text>
      <Text accessibilityRole={error ? "alert" : "text"} style={{ color: "#CBD5E1" }}>{error || "Your email is verified. Choose your account type and re-enter any unsaved profile details. Your existing Auth account is kept."}</Text>
      {error ? <>
        <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}><Text style={{ color: "#60A5FA", padding: 16 }}>Retry setup</Text></Pressable>
        {!!getOnboardingDraft() && <Pressable accessibilityRole="button" onPress={() => { setRole(getOnboardingDraft()?.role); setError(""); }}><Text style={{ color: "#60A5FA", padding: 16 }}>Edit saved form</Text></Pressable>}
      </> :
        <View style={{ gap: 16 }}>{(["customer", "technician"] as const).map((item) => <Pressable key={item} accessibilityRole="button" onPress={() => setRole(item)} style={{ padding: 18, backgroundColor: "#16345A", borderRadius: 12 }}><Text style={{ color: "white" }}>Continue as {item === "customer" ? "Customer" : "Technician"}</Text></Pressable>)}</View>}
    </>}
    <Pressable accessibilityRole="button" onPress={async () => {
      try { await logoutUser(); router.replace("/login"); } catch { setError("Unable to finish signing out. Retry."); }
    }}><Text style={{ color: "#60A5FA", padding: 16 }}>Sign out</Text></Pressable>
  </ScrollView>;
}
