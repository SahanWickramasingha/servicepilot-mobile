import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  ArrowLeft,
  CheckCircle2,
  MailCheck,
  RefreshCw,
} from "lucide-react-native";

type UserRole =
  | "customer"
  | "technician"
  | "dispatcher"
  | "admin";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{
    email?: string;
    role?: UserRole;
  }>();

  const email = params.email || "your email address";
  const selectedRole = params.role;

  const [otp, setOtp] = useState<string[]>(
    Array(OTP_LENGTH).fill("")
  );

  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [resendTimer, setResendTimer] =
    useState(RESEND_SECONDS);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (resendTimer <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendTimer((current) => current - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleOtpChange = (
    value: string,
    index: number
  ) => {
    const numericValue = value.replace(/[^0-9]/g, "");

    if (!numericValue) {
      const newOtp = [...otp];
      newOtp[index] = "";
      setOtp(newOtp);
      return;
    }

    // Supports pasting full OTP
    if (numericValue.length > 1) {
      const pastedCode = numericValue
        .slice(0, OTP_LENGTH)
        .split("");

      const newOtp = Array(OTP_LENGTH).fill("");

      pastedCode.forEach((digit, digitIndex) => {
        newOtp[digitIndex] = digit;
      });

      setOtp(newOtp);

      const lastIndex = Math.min(
        pastedCode.length,
        OTP_LENGTH
      ) - 1;

      inputRefs.current[lastIndex]?.focus();

      setErrorMessage("");

      return;
    }

    const newOtp = [...otp];

    newOtp[index] = numericValue;

    setOtp(newOtp);
    setErrorMessage("");

    if (
      numericValue &&
      index < OTP_LENGTH - 1
    ) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    key: string,
    index: number
  ) => {
    if (
      key === "Backspace" &&
      !otp[index] &&
      index > 0
    ) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");

    setErrorMessage("");
    setSuccessMessage("");

    if (code.length !== OTP_LENGTH) {
      setErrorMessage(
        "Please enter the complete 6-digit verification code."
      );

      return;
    }

    try {
      setIsVerifying(true);

      /*
        Backend integration will be added next.

        Future flow:

        1. Send:
           email
           OTP code

        2. Backend verifies:
           - OTP exists
           - OTP matches
           - OTP not expired
           - OTP belongs to this user

        3. Backend updates:
           users/{uid}.emailVerified = true

        4. Continue to login/dashboard
      */

      // TEMPORARY UI TEST
      await new Promise((resolve) =>
        setTimeout(resolve, 1200)
      );

      setSuccessMessage(
        "Email verified successfully."
      );

      setTimeout(() => {
        router.replace({
          pathname: "/login",
          params: selectedRole
            ? { role: selectedRole }
            : undefined,
        });
      }, 800);
    } catch (error) {
      console.error("OTP verification error:", error);

      setErrorMessage(
        "Invalid or expired verification code."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || isResending) {
      return;
    }

    try {
      setIsResending(true);

      setErrorMessage("");
      setSuccessMessage("");

      /*
        Real backend later:

        await requestNewOtp(email);
      */

      // TEMPORARY UI TEST
      await new Promise((resolve) =>
        setTimeout(resolve, 1000)
      );

      setOtp(Array(OTP_LENGTH).fill(""));

      setResendTimer(RESEND_SECONDS);

      setSuccessMessage(
        "A new verification code has been sent."
      );

      inputRefs.current[0]?.focus();
    } catch (error) {
      console.error("OTP resend error:", error);

      setErrorMessage(
        "Unable to resend the verification code."
      );
    } finally {
      setIsResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >
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
          <ArrowLeft
            size={20}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        {/* Brand */}
        <View style={styles.brandArea}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Text style={styles.logoSymbol}>
                S
              </Text>
            </View>
          </View>

          <View style={styles.brandRow}>
            <Text style={styles.brandWhite}>
              SERVICE
            </Text>

            <Text style={styles.brandBlue}>
              PILOT
            </Text>
          </View>

          <Text style={styles.brandSubtitle}>
            Field Service Management
          </Text>
        </View>

        {/* Verification Card */}
        <View style={styles.card}>
          <View style={styles.iconWrapper}>
            <MailCheck
              size={48}
              color="#3B82F6"
              strokeWidth={1.8}
            />
          </View>

          <Text style={styles.title}>
            Verify Your Email
          </Text>

          <Text style={styles.description}>
            We sent a 6-digit verification code to
          </Text>

          <Text style={styles.emailText}>
            {email}
          </Text>

          <Text style={styles.instructions}>
            Enter the verification code below to
            activate your ServicePilot account.
          </Text>

          {/* OTP */}
          <View style={styles.otpContainer}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[
                  styles.otpInput,
                  digit
                    ? styles.otpInputFilled
                    : null,
                ]}
                value={digit}
                onChangeText={(value) =>
                  handleOtpChange(value, index)
                }
                onKeyPress={({ nativeEvent }) =>
                  handleKeyPress(
                    nativeEvent.key,
                    index
                  )
                }
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
                selectTextOnFocus
                editable={!isVerifying}
              />
            ))}
          </View>

          {/* Error */}
          {!!errorMessage && (
            <View style={styles.errorMessage}>
              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          )}

          {/* Success */}
          {!!successMessage && (
            <View style={styles.successMessage}>
              <CheckCircle2
                size={17}
                color="#22C55E"
              />

              <Text style={styles.successText}>
                {successMessage}
              </Text>
            </View>
          )}

          {/* Verify */}
          <TouchableOpacity
            style={[
              styles.verifyButton,
              isVerifying &&
                styles.verifyButtonDisabled,
            ]}
            activeOpacity={0.85}
            onPress={handleVerifyOtp}
            disabled={isVerifying}
          >
            {isVerifying ? (
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

                <Text
                  style={styles.verifyButtonText}
                >
                  Verify OTP
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <View style={styles.resendArea}>
            <Text style={styles.resendQuestion}>
              Didn&apos;t receive the code?
            </Text>

            {resendTimer > 0 ? (
              <Text style={styles.timerText}>
                Resend in {resendTimer}s
              </Text>
            ) : (
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
                    size={16}
                    color="#3B82F6"
                  />
                )}

                <Text style={styles.resendText}>
                  {isResending
                    ? "Sending..."
                    : "Resend Code"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
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
                  ? {
                      role: selectedRole,
                    }
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
    backgroundColor:
      "rgba(37, 99, 235, 0.06)",
    top: -150,
    right: -130,
  },

  glowBottom: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor:
      "rgba(37, 99, 235, 0.04)",
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
    marginBottom: 30,
  },

  logoOuter: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor:
      "rgba(37, 99, 235, 0.15)",
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
    transform: [
      {
        rotate: "-8deg",
      },
    ],
  },

  logoSymbol: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    transform: [
      {
        rotate: "8deg",
      },
    ],
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
    backgroundColor:
      "rgba(37, 99, 235, 0.11)",
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
  },

  otpContainer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 26,
    marginBottom: 22,
  },

  otpInput: {
    flex: 1,
    maxWidth: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2D42",
    backgroundColor: "#081523",
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "700",
  },

  otpInputFilled: {
    borderColor: "#2563EB",
    backgroundColor:
      "rgba(37, 99, 235, 0.08)",
  },

  errorMessage: {
    width: "100%",
    minHeight: 42,
    backgroundColor:
      "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor:
      "rgba(239, 68, 68, 0.22)",
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
    backgroundColor:
      "rgba(34, 197, 94, 0.08)",
    borderWidth: 1,
    borderColor:
      "rgba(34, 197, 94, 0.22)",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
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