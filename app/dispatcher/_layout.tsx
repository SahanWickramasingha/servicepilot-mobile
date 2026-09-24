import { Stack } from "expo-router";
import { ProtectedRoute } from "@/src/components/auth/ProtectedRoute";

export default function DispatcherLayout() {
  return (
    <ProtectedRoute allowedRoles={["dispatcher"]}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: "#06101D",
          },
        }}
      />
    </ProtectedRoute>
  );
}
