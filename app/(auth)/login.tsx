import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Apple, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react-native";

import {
  loginUser,
  logoutUser,
  sendVerificationEmail,
} from "@/src/services/auth.service";
import { auth } from "@/src/firebase/config";
import {
  getDashboardRouteForRole,
  getMobileAccessDecision,
  getUserProfile,
  markUserEmailVerified,
} from "@/src/services/user.service";

export default function LoginScreen() {
  const params = useLocalSearchParams<{
    email?: string;
    needsVerification?: string;
    accessMessage?: string;
  }>();

  const [email, setEmail] = useState(params.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingVerification, setSendingVerification] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState(
    params.accessMessage ||
      (params.needsVerification === "true"
      ? "Please verify your email before signing in."
      : "")
  );
  const [showVerifyRecovery, setShowVerifyRecovery] =
    useState(params.needsVerification === "true");

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();

    setErrorMessage("");
    setShowVerifyRecovery(false);

    if (!cleanEmail || !password) {
      setErrorMessage(
        "Please enter your email and password."
      );
      return;
    }

    try {
      setLoading(true);

      const credential = await loginUser(
        cleanEmail,
        password
      );

      let profile = await getUserProfile(
        credential.user.uid
      );

      if (!profile) {
        setErrorMessage(
          "User profile not found. Please contact support."
        );
        return;
      }

      await credential.user.reload();

      if (
        credential.user.emailVerified &&
        profile.emailVerified !== true
      ) {
        await credential.user.getIdToken(true);

        await markUserEmailVerified(
          credential.user.uid
        );
        profile = {
          ...profile,
          emailVerified: true,
        };
      }

      const accessDecision =
        getMobileAccessDecision(profile);

      if (!accessDecision.allowed) {
        setErrorMessage(
          accessDecision.message ||
            "This account cannot access the mobile app."
        );
        setShowVerifyRecovery(
          profile.emailVerified !== true
        );

        if (profile.emailVerified === true) {
          await logoutUser();
        }

        return;
      }

      router.replace(
        getDashboardRouteForRole(profile.role) as never
      );
    } catch (error: any) {
      console.error("Login error:", error);

      switch (error?.code) {
        case "auth/invalid-email":
          setErrorMessage(
            "Please enter a valid email address."
          );
          break;

        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
          setErrorMessage(
            "Invalid email or password."
          );
          break;

        case "auth/network-request-failed":
          setErrorMessage(
            "Please check your internet connection and try again."
          );
          break;

        default:
          setErrorMessage(
            error?.message ||
              "Unable to sign in. Please try again."
          );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRecovery = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setErrorMessage(
        "Please enter your email address first."
      );
      return;
    }

    try {
      setSendingVerification(true);
      setErrorMessage("");

      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error(
          "Please sign in again before verifying your email."
        );
      }

      await sendVerificationEmail(currentUser);

      router.push({
        pathname: "/verify-email",
        params: {
          email: cleanEmail,
        },
      });
    } catch (error: any) {
      console.error(
        "Verification recovery error:",
        error
      );

      Alert.alert(
        "Unable to Send Code",
        error?.message ||
          "Unable to send verification email."
      );
    } finally {
      setSendingVerification(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#06101D" />

      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={styles.brandArea}>
          <Image
            source={require("../../assets/images/servicepilot-logo.png")}
            style={styles.brandLogo}
            resizeMode="contain"
          />

          <View style={styles.brandRow}>
            <Text style={styles.brandWhite}>SERVICE</Text>
            <Text style={styles.brandBlue}>PILOT</Text>
          </View>

          <Text style={styles.brandSubtitle}>Field Service Management</Text>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back!</Text>

          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>

          <View style={styles.inputContainer}>
            <Mail size={20} color="#64748B" strokeWidth={2} />

            <TextInput
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setErrorMessage("");
                setShowVerifyRecovery(false);
              }}
              placeholder="Enter your email"
              placeholderTextColor="#64748B"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              editable={!loading}
            />
          </View>
        </View>

        {/* Password */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>

          <View style={styles.inputContainer}>
            <LockKeyhole size={20} color="#64748B" strokeWidth={2} />

            <TextInput
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setErrorMessage("");
              }}
              placeholder="Enter your password"
              placeholderTextColor="#64748B"
              secureTextEntry={!showPassword}
              style={styles.input}
              editable={!loading}
            />

            <TouchableOpacity
              onPress={() => setShowPassword((current) => !current)}
              style={styles.eyeButton}
              disabled={loading}
            >
              {showPassword ? (
                <Eye size={20} color="#94A3B8" />
              ) : (
                <EyeOff size={20} color="#94A3B8" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Remember + Forgot */}
        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={styles.rememberContainer}
            onPress={() => setRememberMe((current) => !current)}
            activeOpacity={0.8}
            disabled={loading}
          >
            <View
              style={[styles.checkbox, rememberMe && styles.checkboxActive]}
            >
              {rememberMe && <Text style={styles.checkMark}>✓</Text>}
            </View>

            <Text style={styles.rememberText}>Remember me</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/forgot-password")}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {!!errorMessage && (
          <View style={styles.errorMessage}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>

            {showVerifyRecovery && (
              <TouchableOpacity
                style={styles.verifyRecoveryButton}
                activeOpacity={0.85}
                onPress={handleVerifyRecovery}
                disabled={sendingVerification}
              >
                {sendingVerification ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={styles.verifyRecoveryText}
                  >
                    Verify Email
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Login */}
        <TouchableOpacity
          style={[
            styles.loginButton,
            loading && styles.loginButtonDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color="#FFFFFF"
            />
          ) : (
            <Text style={styles.loginButtonText}>Login</Text>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.divider} />

          <Text style={styles.dividerText}>or continue with</Text>

          <View style={styles.divider} />
        </View>

        {/* Social Login */}
        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.socialButton} activeOpacity={0.8}>
            <Text style={styles.googleText}>G</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.socialButton} activeOpacity={0.8}>
            <Apple size={22} color="#FFFFFF" fill="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.socialButton} activeOpacity={0.8}>
            <View style={styles.microsoftLogo}>
              <View style={styles.microsoftSquare} />
              <View style={styles.microsoftSquare} />
              <View style={styles.microsoftSquare} />
              <View style={styles.microsoftSquare} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Register */}
        <View style={styles.registerRow}>
          <Text style={styles.registerQuestion}>
            Don&apos;t have an account?
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.push("/role-selection")
            }
          >
            <Text style={styles.registerText}>Register</Text>
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

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 50,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },

  glowTop: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    top: -150,
    right: -120,
  },

  glowBottom: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
    bottom: -170,
    left: -160,
  },

  brandArea: {
    alignItems: "center",
    marginBottom: 28,
  },

  brandLogo: {
    width: 78,
    height: 78,
    borderRadius: 20,
    marginBottom: 16,
  },

  brandRow: {
    flexDirection: "row",
  },

  brandWhite: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  brandBlue: {
    color: "#3B82F6",
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  brandSubtitle: {
    color: "#64748B",
    marginTop: 5,
    fontSize: 12,
  },

  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 12,
    height: 45,
    paddingHorizontal: 14,
    marginBottom: 24,
  },

  roleIndicator: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    marginRight: 9,
  },

  roleText: {
    color: "#CBD5E1",
    fontSize: 13,
    flex: 1,
  },

  changeRole: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "700",
  },

  header: {
    alignItems: "center",
    marginBottom: 32,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "800",
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 8,
  },

  fieldGroup: {
    marginBottom: 18,
  },

  label: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },

  inputContainer: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#1E2D42",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },

  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    marginLeft: 12,
    height: "100%",
    outlineStyle: "none",
  } as any,

  eyeButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },

  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 26,
  },

  rememberContainer: {
    flexDirection: "row",
    alignItems: "center",
  },

  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },

  checkboxActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },

  checkMark: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  rememberText: {
    marginLeft: 8,
    color: "#94A3B8",
    fontSize: 12,
  },

  forgotText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "600",
  },

  errorMessage: {
    width: "100%",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },

  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    textAlign: "center",
  },

  verifyRecoveryButton: {
    height: 40,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },

  verifyRecoveryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  loginButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },

  loginButtonDisabled: {
    opacity: 0.65,
  },

  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 28,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#1E293B",
  },

  dividerText: {
    color: "#64748B",
    fontSize: 12,
    paddingHorizontal: 14,
  },

  socialRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
  },

  socialButton: {
    width: 56,
    height: 48,
    borderRadius: 11,
    backgroundColor: "#0A1625",
    borderWidth: 1,
    borderColor: "#1E2D42",
    alignItems: "center",
    justifyContent: "center",
  },

  googleText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 20,
  },

  microsoftLogo: {
    width: 20,
    height: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },

  microsoftSquare: {
    width: 9,
    height: 9,
    backgroundColor: "#3B82F6",
  },

  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 32,
  },

  registerQuestion: {
    color: "#94A3B8",
    fontSize: 13,
  },

  registerText: {
    color: "#3B82F6",
    marginLeft: 5,
    fontSize: 13,
    fontWeight: "700",
  },
});
