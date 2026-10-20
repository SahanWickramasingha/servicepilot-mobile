import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthSessionGate } from "@/src/components/auth/AuthSessionGate";

// This layout is shared across all the pages in the app directory
export default function RootLayout() {
  return (
    <>
      <AuthSessionGate>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthSessionGate>
      <StatusBar style="auto" />
    </>
  );
}
