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
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react-native";

export default function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [updated, setUpdated] = useState(false);

  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword;

  const hasMinimumLength = newPassword.length >= 8;

  const canSubmit =
    currentPassword.trim().length > 0 &&
    hasMinimumLength &&
    passwordsMatch;

  const handleUpdatePassword = () => {
    if (!canSubmit) {
      return;
    }

    /*
      Firebase password update will be added later.

      Future:
      1. Re-authenticate user with current password
      2. Validate new password
      3. updatePassword()
      4. Show success feedback
    */

    setUpdated(true);

    setTimeout(() => {
      router.back();
    }, 1200);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerText}>
            <Text style={styles.title}>
              Change Password
            </Text>

            <Text style={styles.subtitle}>
              Keep your account secure
            </Text>
          </View>
        </View>

        {/* Security Icon */}
        <View style={styles.iconSection}>
          <View style={styles.securityIcon}>
            <ShieldCheck
              size={44}
              color="#3B82F6"
              strokeWidth={1.8}
            />
          </View>

          <Text style={styles.securityTitle}>
            Update Your Password
          </Text>

          <Text style={styles.securityDescription}>
            Choose a strong password that you don&apos;t use anywhere else.
          </Text>
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>
          {/* Current Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Current Password
            </Text>

            <View style={styles.inputContainer}>
              <LockKeyhole
                size={20}
                color="#64748B"
              />

              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                placeholderTextColor="#64748B"
                secureTextEntry={!showCurrentPassword}
                style={styles.input}
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() =>
                  setShowCurrentPassword((current) => !current)
                }
              >
                {showCurrentPassword ? (
                  <Eye size={20} color="#94A3B8" />
                ) : (
                  <EyeOff size={20} color="#94A3B8" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* New Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              New Password
            </Text>

            <View style={styles.inputContainer}>
              <LockKeyhole
                size={20}
                color="#64748B"
              />

              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new password"
                placeholderTextColor="#64748B"
                secureTextEntry={!showNewPassword}
                style={styles.input}
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() =>
                  setShowNewPassword((current) => !current)
                }
              >
                {showNewPassword ? (
                  <Eye size={20} color="#94A3B8" />
                ) : (
                  <EyeOff size={20} color="#94A3B8" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm New Password */}
          <View style={styles.fieldGroupLast}>
            <Text style={styles.label}>
              Confirm New Password
            </Text>

            <View style={styles.inputContainer}>
              <LockKeyhole
                size={20}
                color="#64748B"
              />

              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor="#64748B"
                secureTextEntry={!showConfirmPassword}
                style={styles.input}
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() =>
                  setShowConfirmPassword((current) => !current)
                }
              >
                {showConfirmPassword ? (
                  <Eye size={20} color="#94A3B8" />
                ) : (
                  <EyeOff size={20} color="#94A3B8" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Password Rules */}
        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>
            Password Requirements
          </Text>

          <Rule
            text="At least 8 characters"
            valid={hasMinimumLength}
          />

          <Rule
            text="New passwords must match"
            valid={passwordsMatch}
          />

          <Rule
            text="Use a strong and unique password"
            valid={newPassword.length >= 10}
          />
        </View>

        {/* Success */}
        {updated && (
          <View style={styles.successBox}>
            <CheckCircle2
              size={19}
              color="#22C55E"
            />

            <Text style={styles.successText}>
              Password updated successfully.
            </Text>
          </View>
        )}

        {/* Update Button */}
        <TouchableOpacity
          style={[
            styles.updateButton,
            !canSubmit && styles.updateButtonDisabled,
          ]}
          disabled={!canSubmit || updated}
          activeOpacity={0.85}
          onPress={handleUpdatePassword}
        >
          <ShieldCheck
            size={19}
            color="#FFFFFF"
          />

          <Text style={styles.updateButtonText}>
            Update Password
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelText}>
            Cancel
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Rule({
  text,
  valid,
}: {
  text: string;
  valid: boolean;
}) {
  return (
    <View style={styles.ruleRow}>
      <View
        style={[
          styles.ruleDot,
          valid && styles.ruleDotValid,
        ]}
      />

      <Text
        style={[
          styles.ruleText,
          valid && styles.ruleTextValid,
        ]}
      >
        {text}
      </Text>
    </View>
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
    backgroundColor: "rgba(37,99,235,0.06)",
    top: -150,
    right: -120,
  },

  glowBottom: {
    position: "absolute",
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(37,99,235,0.04)",
    bottom: -190,
    left: -170,
  },

  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 50,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
  },

  iconSection: {
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 28,
  },

  securityIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(37,99,235,0.11)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },

  securityTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
  },

  securityDescription: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },

  formCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },

  fieldGroup: {
    marginBottom: 19,
  },

  fieldGroupLast: {
    marginBottom: 0,
  },

  label: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },

  inputContainer: {
    height: 55,
    borderRadius: 12,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
  },

  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    marginLeft: 12,
    height: "100%",
  },

  eyeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  rulesCard: {
    backgroundColor: "#0A1625",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 18,
  },

  rulesTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 11,
  },

  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 7,
  },

  ruleDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#475569",
    marginRight: 9,
  },

  ruleDotValid: {
    backgroundColor: "#22C55E",
  },

  ruleText: {
    color: "#64748B",
    fontSize: 11,
  },

  ruleTextValid: {
    color: "#86EFAC",
  },

  successBox: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 17,
  },

  successText: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: "600",
  },

  updateButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  updateButtonDisabled: {
    opacity: 0.45,
  },

  updateButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  cancelButton: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 7,
  },

  cancelText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
});