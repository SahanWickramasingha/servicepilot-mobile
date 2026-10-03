import { Stack } from "expo-router";
import { ProtectedRoute } from "@/src/components/auth/ProtectedRoute";
import { ServiceProgressProvider } from "../../src/context/ServiceProgressContext";
import { TechnicianLocationLifecycle } from "@/src/components/maps/TechnicianLocationLifecycle";

export default function TechnicianLayout() {
  return (
    <ProtectedRoute allowedRoles={["technician"]}>
      <ServiceProgressProvider>
        <TechnicianLocationLifecycle />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: "#06101D",
            },
          }}
        >
          <Stack.Screen name="(tabs)" />

          <Stack.Screen name="job-details" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="job-action" />
          <Stack.Screen name="navigation" />
          <Stack.Screen name="before-photos" />
          <Stack.Screen name="service-notes" />
          <Stack.Screen name="after-photos" />
          <Stack.Screen name="signature" />
          <Stack.Screen name="performance" />
        </Stack>
      </ServiceProgressProvider>
    </ProtectedRoute>
  );
}
