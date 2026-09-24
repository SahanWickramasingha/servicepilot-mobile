import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { auth } from "@/src/firebase/config";
import {
  getDashboardRouteForRole,
  getMobileAccessDecision,
  getUserProfile,
  UserRole,
} from "@/src/services/user.service";

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: UserRole[];
};

export function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const [isAllowed, setIsAllowed] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const allowedRoleKey = allowedRoles?.join("|") ?? "";

  useEffect(() => {
    let isMounted = true;
    const requiredRoles = allowedRoleKey
      ? (allowedRoleKey.split("|") as UserRole[])
      : null;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          if (isMounted) {
            setIsAllowed(false);
            setIsChecking(false);
          }

          router.replace("/login");
          return;
        }

        try {
          const profile = await getUserProfile(user.uid);

          if (!profile) {
            if (isMounted) {
              setIsAllowed(false);
              setIsChecking(false);
            }

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
            if (isMounted) {
              setIsAllowed(false);
              setIsChecking(false);
            }

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

          if (
            requiredRoles &&
            !requiredRoles.includes(profile.role)
          ) {
            router.replace(
              getDashboardRouteForRole(
                profile.role
              ) as never
            );

            if (isMounted) {
              setIsAllowed(false);
              setIsChecking(false);
            }

            return;
          }

          if (isMounted) {
            setIsAllowed(true);
            setIsChecking(false);
          }
        } catch (error) {
          console.error(
            "Protected route check failed:",
            error
          );

          if (isMounted) {
            setIsAllowed(false);
            setIsChecking(false);
          }

          router.replace("/login");
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [allowedRoleKey]);

  if (isChecking) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06101D",
  },
});
