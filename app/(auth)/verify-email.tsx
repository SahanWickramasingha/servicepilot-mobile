import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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

import { auth } from "@/src/firebase/config";
import { logoutUser } from "@/src/services/auth.service";
import { completeVerifiedRegistration, requestOnboardingVerification, verificationResendSeconds } from "@/src/services/registration.service";
import { useAccountSession } from "@/src/components/auth/AccountSessionContext";
import { onboardingFailureFeedback } from "@/src/utils/onboardingFeedback";

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{
    email?: string;
    verificationRequested?: string;
  }>();

  const email =
    auth.currentUser?.email ||
    "your email address";

  const [isChecking, setIsChecking] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [verificationConfirmed, setVerificationConfirmed] = useState(false);
  const [resendTimer, setResendTimer] =
    useState(verificationResendSeconds);
  const mounted = useRef(true);
  const pending = useRef(false);
  const owner = useRef(auth.currentUser);
  const { retry } = useAccountSession();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (resendTimer <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendTimer(verificationResendSeconds());
    }, 1000);

    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleCheckVerification = async () => {
    if (pending.current) return;
    setErrorMessage("");
    setSuccessMessage("");

    const currentUser = auth.currentUser;

    if (!currentUser) {
      setErrorMessage(
        "User session not found. Please login again."
      );
      return;
    }

    try {
      pending.current = true;
      setIsChecking(true);
      const result = await completeVerifiedRegistration();
      if (!mounted.current || auth.currentUser !== currentUser) return;
      retry();
      router.replace({ pathname: `/${result.next}` as never, params: result.accessMessage ? { accessMessage: result.accessMessage } : {} });
    } catch (error: any) {
      if (!mounted.current || auth.currentUser !== currentUser) return;
      const feedback = onboardingFailureFeedback(error);
      if (feedback.emailVerified) setVerificationConfirmed(true);
      setErrorMessage(feedback.message);
    } finally {
      pending.current = false;
      if (mounted.current && auth.currentUser === currentUser) setIsChecking(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || pending.current) {
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      setErrorMessage(
        "User session not found. Please login again."
      );
      return;
    }

    try {
      pending.current = true;
      setIsResending(true);
      setErrorMessage("");
      setSuccessMessage("");

      const result =
        await requestOnboardingVerification();
      if (!mounted.current || auth.currentUser !== currentUser) return;

      setVerificationConfirmed(result.alreadyVerified);
      setResendTimer(verificationResendSeconds());
      setSuccessMessage(
        result.alreadyVerified
          ? "Your email is already verified. Continue profile setup with your existing account."
          : "Verification email request accepted. Inbox delivery is not confirmed."
      );
    } catch (error) {
      if (mounted.current && auth.currentUser === currentUser) {
        setErrorMessage(onboardingFailureFeedback(error as { code?: string; registrationStep?: string }, true).message);
        setResendTimer(verificationResendSeconds());
      }
    } finally {
      pending.current = false;
      if (mounted.current && auth.currentUser === currentUser) setIsResending(false);
    }
  };

  if (auth.currentUser !== owner.current) return <View style={[styles.container, { padding: 24, justifyContent: "center", gap: 20 }]}>
    <Text style={{ color: "white" }}>Your account changed. Continue with your current sign-in.</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => router.replace("/")}><Text style={{ color: "#60A5FA", padding: 16 }}>Continue</Text></TouchableOpacity>
  </View>;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios" ? "padding" : undefined
      }
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          disabled={isChecking || isResending}
          onPress={async () => { try { await logoutUser(); router.replace("/login"); } catch { setErrorMessage("Unable to sign out. Retry."); } }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.brandArea}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Text style={styles.logoSymbol}>S</Text>
            </View>
          </View>

          <View style={styles.brandRow}>
            <Text style={styles.brandWhite}>
              SERVICE
            </Text>
            <Text style={styles.brandBlue}>PILOT</Text>
          </View>

          <Text style={styles.brandSubtitle}>
            Field Service Management
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.iconWrapper}>
            <MailCheck
              size={48}
              color="#3B82F6"
              strokeWidth={1.8}
            />
          </View>

          <Text style={styles.title}>
            {verificationConfirmed ? "Email Verified" : "Verify Your Email"}
          </Text>

          <Text style={styles.description}>
            {verificationConfirmed ? "Email verification confirmed for" : params.verificationRequested === "false" ? "Request a verification link for" : "Check the verification email requested for"}
          </Text>

          <Text style={styles.emailText}>{email}</Text>

          <Text style={styles.instructions}>
            {verificationConfirmed ? "Continue profile setup below. Your existing account and any saved profile are kept." :
              "Open the link in your inbox, then return to ServicePilot and tap the button below."}
          </Text>

          {!!errorMessage && (
            <View style={styles.errorMessage}>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          )}

          {!!successMessage && (
            <View style={styles.successMessage}>
              <CheckCircle2
                size={17}
                color="#22C55E"
              />

              <Text accessibilityLiveRegion="polite" style={styles.successText}>
                {successMessage}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.verifyButton,
              isChecking && styles.verifyButtonDisabled,
            ]}
            activeOpacity={0.85}
            onPress={handleCheckVerification}
            disabled={isChecking || isResending}
          >
            {isChecking ? (
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />
            ) : (
              <>
                <CheckCircle2
                  size={19}
                  color="#FFFFFF"
                />

                <Text style={styles.verifyButtonText}>
                  {verificationConfirmed ? "Continue profile setup" : "I've Verified Email"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {!verificationConfirmed && <View style={styles.resendArea}>
            <Text style={styles.resendQuestion}>
              Didn&apos;t receive the email?
            </Text>

            {resendTimer > 0 ? (
              <Text style={styles.timerText}>
                Resend available in {resendTimer}s
              </Text>
            ) : (
              <TouchableOpacity
                style={styles.resendButton}
                activeOpacity={0.8}
                disabled={isResending || isChecking}
                onPress={handleResend}
              >
                {isResending ? (
                  <ActivityIndicator
                    size="small"
                    color="#3B82F6"
                  />
                ) : (
                  <RefreshCw
                    size={16}
                    color="#3B82F6"
                  />
                )}

                <Text style={styles.resendText}>
                  {isResending
                    ? "Sending..."
                    : "Resend Email"}
                </Text>
              </TouchableOpacity>
            )}
          </View>}
        </View>

        <View style={styles.loginRow}>
          <Text style={styles.loginQuestion}>
            Already verified?
          </Text>

          <TouchableOpacity
            disabled={isChecking || isResending}
            onPress={async () => { try { await logoutUser(); router.replace("/login"); } catch { setErrorMessage("Unable to sign out. Retry."); } }}
          >
            <Text style={styles.loginText}>
              Back to Login
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
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
    flexGrow: 1,
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
    marginBottom: 30,
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
    paddingHorizontal: 22,
    paddingVertical: 30,
    alignItems: "center",
  },

  iconWrapper: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(37, 99, 235, 0.11)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
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
    textAlign: "center",
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
    lineHeight: 19,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 22,
  },

  errorMessage: {
    width: "100%",
    minHeight: 42,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.22)",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    marginBottom: 16,
  },

  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    textAlign: "center",
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },

  successText: {
    flex: 1,
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

  verifyButtonDisabled: {
    opacity: 0.65,
  },

  verifyButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  resendArea: {
    alignItems: "center",
    marginTop: 18,
  },

  resendQuestion: {
    color: "#64748B",
    fontSize: 12,
  },

  timerText: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 7,
    fontWeight: "600",
  },

  resendButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 3,
  },

  resendText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "700",
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
