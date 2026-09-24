import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";

import { auth } from "@/src/firebase/config";
import {
  getDashboardRouteForRole,
  getMobileAccessDecision,
  getUserProfile,
} from "@/src/services/user.service";

export default function Index() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          router.replace("/login");
          return;
        }

        try {
          const profile = await getUserProfile(user.uid);

          if (!profile) {
            router.replace({
              pathname: "/login",
              params: {
                email: user.email ?? "",
                accessMessage:
                  "User profile not found. Please contact support.",
              },
            });
            return;
          }

          const accessDecision =
            getMobileAccessDecision(profile);

          if (!accessDecision.allowed) {
            router.replace({
              pathname: "/login",
              params: {
                email: profile.email ?? user.email ?? "",
                needsVerification:
                  profile.emailVerified !== true
                    ? "true"
                    : "false",
                accessMessage:
                  accessDecision.message ?? "",
              },
            });
            return;
          }

          router.replace(
            getDashboardRouteForRole(profile.role) as never
          );
        } catch (error) {
          console.error(
            "Startup auth check failed:",
            error
          );

          router.replace("/login");
        }
      }
    );

    return unsubscribe;
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#3B82F6" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06101D",
  },
});
