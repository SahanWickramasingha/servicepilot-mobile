import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

// This layout is shared across all the pages in the app directory
export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </>
  );
}