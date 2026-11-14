import "@/src/services/technician-background-task";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthSessionGate } from "@/src/components/auth/AuthSessionGate";
import { PolicyAcceptancePrompt } from "@/src/components/legal/PolicyAcceptancePrompt";
import { SafetyProvider } from "@/src/components/legal/Safety";
import { AppViewport } from "@/src/components/layout/AppViewport";

// This layout is shared across all the pages in the app directory
export default function RootLayout() {
  return (
    <>
      <AppViewport><AuthSessionGate>
        <SafetyProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <PolicyAcceptancePrompt />
        </SafetyProvider>
      </AuthSessionGate></AppViewport>
      <StatusBar style="auto" />
    </>
  );
}
