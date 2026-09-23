import { router, useLocalSearchParams } from "expo-router";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
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

import { registerUser } from "@/src/services/auth.service";
import { createUserProfile } from "@/src/services/user.service";

type UserRole = "customer" | "technician" | "dispatcher" | "admin";

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ role?: UserRole }>();
  const selectedRole = params.role;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const getRoleLabel = () => {
    switch (selectedRole) {
      case "customer":
        return "Customer";

      case "technician":
        return "Technician";

      case "dispatcher":
        return "Dispatcher";

      case "admin":
        return "Super Admin";

      default:
        return null;
    }
  };

  const handleRegister = async () => {
    const cleanFullName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanAddress = address.trim();

    if (!cleanFullName) {
      Alert.alert("Missing Information", "Please enter your full name.");
      return;
    }

    if (!cleanEmail) {
      Alert.alert("Missing Information", "Please enter your email address.");
      return;
    }

    if (!cleanPhone) {
      Alert.alert("Missing Information", "Please enter your phone number.");
      return;
    }

    if (!cleanAddress) {
      Alert.alert("Missing Information", "Please enter your address.");
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        "Weak Password",
        "Your password must contain at least 6 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        "Password Mismatch",
        "Password and confirm password do not match."
      );
      return;
    }

    if (!acceptTerms) {
      Alert.alert(
        "Terms Required",
        "Please accept the Terms & Conditions and Privacy Policy."
      );
      return;
    }

    try {
      setLoading(true);

      // 1. Create Firebase Authentication account
      const credential = await registerUser(cleanEmail, password);

      // 2. Save additional user profile data in Firestore
      await createUserProfile({
        uid: credential.user.uid,
        fullName: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        address: cleanAddress,
        role: selectedRole ?? "customer",
      });

      // 3. Continue to email verification screen
      router.replace({
        pathname: "/verify-email" as never,
        params: {
          email: cleanEmail,
          role: selectedRole ?? "customer",
        },
      });
    } catch (error: any) {
      console.error("Registration error:", error);

      switch (error?.code) {
        case "auth/email-already-in-use":
          Alert.alert(
            "Account Already Exists",
            "This email address is already registered."
          );
          break;

        case "auth/invalid-email":
          Alert.alert(
            "Invalid Email",
            "Please enter a valid email address."
          );
          break;

        case "auth/weak-password":
          Alert.alert(
            "Weak Password",
            "Please choose a stronger password."
          );
          break;

        case "auth/network-request-failed":
          Alert.alert(
            "Network Error",
            "Please check your internet connection and try again."
          );
          break;

        case "permission-denied":
          Alert.alert(
            "Permission Error",
            "Your account was created, but the profile could not be saved."
          );
          break;

        default:
          Alert.alert(
            "Registration Failed",
            error?.message ??
              "Unable to create your account. Please try again."
          );
      }
    } finally {
      setLoading(false);
    }
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
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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

        {/* Selected Role */}
        {selectedRole && (
          <TouchableOpacity
            style={styles.roleBadge}
            onPress={() => router.push("/role-selection")}
            disabled={loading}
          >
            <View style={styles.roleIndicator} />

            <Text style={styles.roleText}>
              Registering as {getRoleLabel()}
            </Text>

            <Text style={styles.changeRole}>Change</Text>
          </TouchableOpacity>
        )}

        {/* Heading */}
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>

          <Text style={styles.subtitle}>
            Enter your details to get started
          </Text>
        </View>

        {/* Full Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name</Text>

          <View style={styles.inputContainer}>
            <UserRound size={20} color="#64748B" />

            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your full name"
              placeholderTextColor="#64748B"
              style={styles.input}
              editable={!loading}
            />
          </View>
        </View>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>

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
              editable={!loading}
            />
          </View>
        </View>

        {/* Phone */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone Number</Text>

          <View style={styles.inputContainer}>
            <Phone size={20} color="#64748B" />

            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter your phone number"
              placeholderTextColor="#64748B"
              keyboardType="phone-pad"
              style={styles.input}
              editable={!loading}
            />
          </View>
        </View>

        {/* Address */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Address</Text>

          <View style={styles.inputContainer}>
            <MapPin size={20} color="#64748B" />

            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Enter your address"
              placeholderTextColor="#64748B"
              style={styles.input}
              editable={!loading}
            />
          </View>
        </View>

        {/* Password */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>

          <View style={styles.inputContainer}>
            <LockKeyhole size={20} color="#64748B" />

            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Create a password"
              placeholderTextColor="#64748B"
              secureTextEntry={!showPassword}
              style={styles.input}
              editable={!loading}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() =>
                setShowPassword((current) => !current)
              }
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

        {/* Confirm Password */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Confirm Password</Text>

          <View style={styles.inputContainer}>
            <LockKeyhole size={20} color="#64748B" />

            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              placeholderTextColor="#64748B"
              secureTextEntry={!showConfirmPassword}
              style={styles.input}
              editable={!loading}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() =>
                setShowConfirmPassword((current) => !current)
              }
              disabled={loading}
            >
              {showConfirmPassword ? (
                <Eye size={20} color="#94A3B8" />
              ) : (
                <EyeOff size={20} color="#94A3B8" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Terms */}
        <TouchableOpacity
          style={styles.termsRow}
          onPress={() =>
            setAcceptTerms((current) => !current)
          }
          activeOpacity={0.8}
          disabled={loading}
        >
          <View
            style={[
              styles.checkbox,
              acceptTerms && styles.checkboxActive,
            ]}
          >
            {acceptTerms && (
              <Text style={styles.checkMark}>✓</Text>
            )}
          </View>

          <Text style={styles.termsText}>
            I agree to the{" "}
            <Text style={styles.linkText}>
              Terms & Conditions
            </Text>{" "}
            and{" "}
            <Text style={styles.linkText}>
              Privacy Policy
            </Text>
          </Text>
        </TouchableOpacity>

        {/* Register Button */}
        <TouchableOpacity
          style={[
            styles.registerButton,
            (!acceptTerms || loading) &&
              styles.registerButtonDisabled,
          ]}
          activeOpacity={0.85}
          disabled={!acceptTerms || loading}
          onPress={handleRegister}
        >
          <Text style={styles.registerButtonText}>
            {loading
              ? "Creating Account..."
              : "Create Account"}
          </Text>
        </TouchableOpacity>

        {/* Login */}
        <View style={styles.loginRow}>
          <Text style={styles.loginQuestion}>
            Already have an account?
          </Text>

          <TouchableOpacity
            disabled={loading}
            onPress={() =>
              router.push({
                pathname: "/login",
                params: selectedRole
                  ? { role: selectedRole }
                  : undefined,
              })
            }
          >
            <Text style={styles.loginText}>
              Login
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

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 50,
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
    top: -160,
    right: -120,
  },

  glowBottom: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
    bottom: -180,
    left: -160,
  },

  brandArea: {
    alignItems: "center",
    marginBottom: 26,
  },

  logoOuter: {
    width: 68,
    height: 68,
    borderRadius: 21,
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  logoInner: {
    width: 53,
    height: 53,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-8deg" }],
  },

  logoSymbol: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
    transform: [{ rotate: "8deg" }],
  },

  brandRow: {
    flexDirection: "row",
  },

  brandWhite: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },

  brandBlue: {
    color: "#3B82F6",
    fontSize: 20,
    fontWeight: "800",
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
    marginBottom: 30,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 8,
  },

  fieldGroup: {
    marginBottom: 17,
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

  eyeButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },

  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 3,
    marginBottom: 24,
  },

  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
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

  termsText: {
    flex: 1,
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 19,
    marginLeft: 10,
  },

  linkText: {
    color: "#3B82F6",
    fontWeight: "600",
  },

  registerButton: {
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

  registerButtonDisabled: {
    opacity: 0.45,
  },

  registerButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
  },

  loginQuestion: {
    color: "#94A3B8",
    fontSize: 13,
  },

  loginText: {
    color: "#3B82F6",
    marginLeft: 5,
    fontSize: 13,
    fontWeight: "700",
  },
});
