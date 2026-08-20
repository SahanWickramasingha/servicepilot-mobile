import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ArrowLeft, CheckCircle2, Mail, Send } from "lucide-react-native";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [isSent, setIsSent] = useState(false);

  const handleSendResetLink = () => {
    /*
      Firebase password reset will be added later.

      Future:
      await sendPasswordResetEmail(auth, email);
    */

    if (!email.trim()) {
      return;
    }

    setIsSent(true);
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
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

          <Text style={styles.brandSubtitle}>Field Service Management</Text>
        </View>

        {!isSent ? (
          <>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Forgot Password?</Text>

              <Text style={styles.subtitle}>
                Enter your email address and we’ll send you a link to reset your
                password.
              </Text>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email Address</Text>

              <View style={styles.inputContainer}>
                <Mail size={20} color="#64748B" />

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor="#64748B"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
            </View>

            {/* Send Button */}
            <TouchableOpacity
              style={[
                styles.sendButton,
                !email.trim() && styles.sendButtonDisabled,
              ]}
              disabled={!email.trim()}
              activeOpacity={0.85}
              onPress={handleSendResetLink}
            >
              <Send size={19} color="#FFFFFF" />

              <Text style={styles.sendButtonText}>Send Reset Link</Text>
            </TouchableOpacity>

            {/* Login Link */}
            <View style={styles.bottomRow}>
              <Text style={styles.bottomText}>Remember your password?</Text>

              <TouchableOpacity onPress={() => router.replace("/login")}>
                <Text style={styles.loginText}>Login</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Success State */}
            <View style={styles.successCard}>
              <View style={styles.successIconWrapper}>
                <CheckCircle2 size={52} color="#22C55E" strokeWidth={2} />
              </View>

              <Text style={styles.successTitle}>Check Your Email</Text>

              <Text style={styles.successText}>
                We sent a password reset link to
              </Text>

              <Text style={styles.emailText}>{email}</Text>

              <Text style={styles.successDescription}>
                Open the email and follow the instructions to create a new
                password.
              </Text>
            </View>

            {/* Open Login */}
            <TouchableOpacity
              style={styles.sendButton}
              activeOpacity={0.85}
              onPress={() => router.replace("/login")}
            >
              <Text style={styles.sendButtonText}>Back to Login</Text>
            </TouchableOpacity>

            {/* Resend */}
            <TouchableOpacity
              style={styles.resendButton}
              activeOpacity={0.8}
              onPress={() => setIsSent(false)}
            >
              <Text style={styles.resendText}>
                Didn&apos;t receive the email? Try again
              </Text>
            </TouchableOpacity>
          </>
        )}
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
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
    bottom: -190,
    left: -170,
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
    marginBottom: 34,
  },

  logoOuter: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  logoInner: {
    width: 56,
    height: 56,
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

  header: {
    alignItems: "center",
    marginBottom: 32,
    paddingHorizontal: 10,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "800",
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
    textAlign: "center",
  },

  fieldGroup: {
    marginBottom: 24,
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
  },

  sendButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
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

  sendButtonDisabled: {
    opacity: 0.45,
  },

  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },

  bottomText: {
    color: "#94A3B8",
    fontSize: 13,
  },

  loginText: {
    color: "#3B82F6",
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 5,
  },

  successCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 34,
    alignItems: "center",
    marginBottom: 24,
  },

  successIconWrapper: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "rgba(34, 197, 94, 0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  successTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
  },

  successText: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 12,
  },

  emailText: {
    color: "#3B82F6",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 5,
  },

  successDescription: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 16,
  },

  resendButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },

  resendText: {
    color: "#3B82F6",
    fontSize: 13,
    fontWeight: "600",
  },
});
