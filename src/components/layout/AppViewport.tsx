import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

/** Expo Router owns the SafeAreaProvider. Inset the navigator once so absolute
 * bars, scroll views and signature coordinates share the same usable viewport. */
export function AppViewport({ children }: { children: ReactNode }) {
  return <SafeAreaView style={{ flex: 1, backgroundColor: "#06101D" }}>{children}</SafeAreaView>;
}
