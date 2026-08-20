import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  ArrowLeft,
  CheckCircle2,
  MailCheck,
  RefreshCw,
} from "lucide-react-native";

type UserRole = "customer" | "technician" | "dispatcher" | "admin";

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{
    email?: string;
    role?: UserRole;
  }>();

  const email = params.email || "your email address";
  const selectedRole = params.role;

  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = () => {
    setIsResending(true);
    setResent(false);

    /*
      Firebase will be added later:

      await sendEmailVerification(auth.currentUser);
    */

    setTimeout(() => {
      setIsResending(false);
      setResent(true);
    }, 1000);
  };

  const handleVerified = () => {
    /*
      Future Firebase flow:

      1. Reload current Firebase user
      2. Check user.emailVerified
      3. Read user's role
      4. Navigate to role dashboard
    */

    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.content}>
        {/* Back */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Brand */}
        <View style={styles.brandArea}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Text style={styles.logoSymbol}>S</Text>
            </View>
          </View>

          <View style={styles.brandRow}>
            <Text style={styles.brandWhite}>SERVICE</Text>
            <Text style={styles.brandBlue}>PILOT</Text>
          </View>

          <Text style={styles.brandSubtitle}>
            Field Service Management
          </Text>
        </View>

        {/* Verification Card */}
        <View style={styles.card}>
          <View style={styles.iconWrapper}>
            <MailCheck
              size={50}
              color="#3B82F6"
              strokeWidth={1.8}
            />
          </View>

          <Text style={styles.title}>
            Verify Your Email
          </Text>

          <Text style={styles.description}>
            We&apos;ve sent a verification link to
          </Text>

          <Text style={styles.emailText}>
            {email}
          </Text>

          <Text style={styles.instructions}>
            Open your email and click the verification link. Then return to
            ServicePilot and continue.
          </Text>

          {resent && (
            <View style={styles.successMessage}>
              <CheckCircle2
                size={17}
                color="#22C55E"
              />

              <Text style={styles.successText}>
                Verification email sent again.
              </Text>
            </View>
          )}

          {/* Verified Button */}
          <TouchableOpacity
            style={styles.verifyButton}
            activeOpacity={0.85}
            onPress={handleVerified}
          >
            <CheckCircle2
              size={19}
              color="#FFFFFF"
            />

            <Text style={styles.verifyButtonText}>
              I&apos;ve Verified My Email
            </Text>
          </TouchableOpacity>

          {/* Resend */}
          <TouchableOpacity
            style={styles.resendButton}
            activeOpacity={0.8}
            disabled={isResending}
            onPress={handleResend}
          >
            {isResending ? (
              <ActivityIndicator
                size="small"
                color="#3B82F6"
              />
            ) : (
              <RefreshCw
                size={17}
                color="#3B82F6"
              />
            )}

            <Text style={styles.resendText}>
              {isResending
                ? "Sending..."
                : "Resend Verification Email"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Login */}
        <View style={styles.loginRow}>
          <Text style={styles.loginQuestion}>
            Wrong email address?
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.replace({
                pathname: "/login",
                params: selectedRole
                  ? { role: selectedRole }
                  : undefined,
              })
            }
          >
            <Text style={styles.loginText}>
              Back to Login
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
    overflow: "hidden",
  },

  glowTop: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    top: -150,
    right: -130,
  },

  glowBottom: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
    bottom: -190,
    left: -170,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 50,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },

  backButton: {
    position: "absolute",
    top: 48,
    left: 24,
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  brandArea: {
    alignItems: "center",
    marginBottom: 32,
  },

  logoOuter: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },

  logoInner: {
    width: 55,
    height: 55,
    borderRadius: 17,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-8deg" }],
  },

  logoSymbol: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    transform: [{ rotate: "8deg" }],
  },

  brandRow: {
    flexDirection: "row",
  },

  brandWhite: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
  },

  brandBlue: {
    color: "#3B82F6",
    fontSize: 21,
    fontWeight: "800",
  },

  brandSubtitle: {
    color: "#64748B",
    marginTop: 5,
    fontSize: 12,
  },

  card: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 34,
    alignItems: "center",
  },

  iconWrapper: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(37, 99, 235, 0.11)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
  },

  description: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 13,
  },

  emailText: {
    color: "#3B82F6",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 5,
  },

  instructions: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 18,
    marginBottom: 25,
  },

  successMessage: {
    width: "100%",
    minHeight: 44,
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.22)",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 18,
  },

  successText: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: "600",
  },

  verifyButton: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    shadowColor: "#2563EB",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },

  verifyButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  resendButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },

  resendText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "600",
  },

  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 27,
  },

  loginQuestion: {
    color: "#94A3B8",
    fontSize: 12,
  },

  loginText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 5,
  },
});