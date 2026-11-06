import { router, useLocalSearchParams } from "expo-router";
import { TermsAcceptance } from "@/src/components/legal/TermsAcceptance";
import { ServiceCategoryPicker } from "@/src/components/technicians/ServiceCategoryPicker";
import { SERVICE_CATEGORY_DEFINITIONS } from "@/functions/src/domain/serviceCategories";
import {
  Eye,
  EyeOff,
  BriefcaseBusiness,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
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
import { completeVerifiedRegistration, registerAccount } from "@/src/services/registration.service";
import { getOnboardingDraft } from "@/src/services/onboarding-draft.service";
import { auth } from "@/src/firebase/config";
import { useAccountSession } from "@/src/components/auth/AccountSessionContext";
import { onboardingFailureFeedback } from "@/src/utils/onboardingFeedback";
import {
  isPublicRegistrationRole,
} from "@/src/services/user.service";
import type {
  PublicRegistrationRole,
  UserProfileData,
} from "@/src/services/user.service";
import {
  getFirebaseErrorCode,
  getFirebaseErrorMessage,
  logRegistrationError,
} from "@/src/utils/registrationDebug";

type RegistrationAlert = {
  title: string;
  message: string;
};

function isNetworkOrOfflineError(error: any): boolean {
  const code = getFirebaseErrorCode(error);
  const message =
    getFirebaseErrorMessage(error)?.toLowerCase() ?? "";

  return (
    code === "auth/network-request-failed" ||
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    message.includes("client is offline") ||
    message.includes("offline") ||
    message.includes("network")
  );
}

function isProfileCreationFailure(error: any): boolean {
  const code = getFirebaseErrorCode(error);

  return (
    error?.partialAuthAccount === true ||
    error?.registrationStep === "createUserProfile" ||
    code === "firestore/profile-write-failed" ||
    code === "firestore/profile-create-failed"
  );
}

function getRegistrationAlert(error: any): RegistrationAlert {
  if (error?.registrationStep === "recovery-authentication") {
    return { title: "Recovery Sign-In Failed", message: error.message };
  }
  if (["firestore/profile-role-mismatch", "firestore/profile-identity-mismatch", "firestore/profile-schema-invalid", "firestore/profile-account-inactive", "firestore/profile-session-revoked"].includes(error?.code)) {
    return { title: "Saved Profile Requires Attention", message: error.message };
  }
  if (error?.profileWriteCommitted === true) {
    return {
      title: "Profile Saved, Confirmation Interrupted",
      message: "The server acknowledged your profile save, but setup could not finish. Your profile has been kept. Reconnect and recover registration with the original account. Recovery checks the saved profile without overwriting it.",
    };
  }
  if (error?.code === "auth/email-already-in-use") {
    return {
      title: "Account Already Exists",
      message:
        "This email already has an account. Sign in to continue setup, or recover registration with your original password. Use Forgot Password if needed.",
    };
  }

  if (error?.code === "auth/invalid-email") {
    return {
      title: "Invalid Email",
      message: "Please enter a valid email address.",
    };
  }

  if (error?.code === "auth/weak-password") {
    return {
      title: "Weak Password",
      message: "Please choose a stronger password.",
    };
  }

  if (
    error?.code === "auth/network-request-failed" &&
    !isProfileCreationFailure(error)
  ) {
    return {
      title: "Network Error",
      message:
        "Please check your internet connection and try again.",
    };
  }

  if (
    isProfileCreationFailure(error) &&
    isNetworkOrOfflineError(error)
  ) {
    return {
      title: "Profile Save Not Confirmed",
      message:
        "Your account exists, but the profile save could not be confirmed. It may already be saved. Reconnect and choose Recover incomplete registration with the original email and password; recovery checks the server before creating anything.",
    };
  }

  if (
    isProfileCreationFailure(error) &&
    error?.code === "permission-denied"
  ) {
    return {
      title: "Profile Permission Denied",
      message:
        "Profile setup could not be authorized. Your account has been kept. Contact support for help.",
    };
  }

  if (error?.code === "firestore/profile-already-exists") {
    return {
      title: "Profile Already Exists",
      message:
        "A profile already exists for this authenticated account. Sign in instead, or contact support if you did not create it.",
    };
  }

  if (isProfileCreationFailure(error)) {
    return {
      title: "Profile Setup Failed",
      message:
        "Your account setup could not be confirmed. Keep the original account and choose Recover incomplete registration with the same email and password. Recovery validates any saved profile without overwriting it.",
    };
  }

  if (error?.code === "auth/verification-email-failed") {
    return {
      title: "Verification Email Failed",
      message:
        "Your account was created, but we could not send the verification email. Please sign in and use Verify Email.",
    };
  }

  return {
    title: "Registration Failed",
    message:
      error?.code === "registration/invalid-profile" ? error.message :
      "Unable to finish registration. Retry, or sign in to continue with your existing account.",
  };
}

export default function RegisterScreen({ setup = false, initialRole }: { setup?: boolean; initialRole?: PublicRegistrationRole } = {}) {
  const { retry } = useAccountSession();
  const params = useLocalSearchParams<{ role?: string }>();
  const draft = setup ? getOnboardingDraft() : undefined;
  const selectedRole = initialRole ?? draft?.role ?? (isPublicRegistrationRole(params.role)
    ? params.role
    : undefined);
  const registrationRole: PublicRegistrationRole =
    selectedRole ?? "customer";

  const [fullName, setFullName] = useState(draft?.fullName ?? "");
  const [email, setEmail] = useState(setup ? auth.currentUser?.email ?? "" : "");
  const [phone, setPhone] = useState(draft?.phone ?? "");
  const [address, setAddress] = useState(draft?.address ?? "");
  const [specialization, setSpecialization] =
    useState(draft?.serviceCategoryId ?? "");
  const [experience, setExperience] = useState(draft?.experience ?? "");
  const [qualifications, setQualifications] =
    useState(draft?.qualifications ?? "");
  const [certifications, setCertifications] =
    useState(draft?.certifications ?? "");
  const [serviceAreas, setServiceAreas] =
    useState(draft?.serviceAreas ?? "");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [acceptTerms, setAcceptTerms] = useState(draft?.policyAccepted === true);
  const [termsError, setTermsError] = useState("");
  const [loading, setLoading] = useState(false);
  const isSubmittingRef = useRef(false);
  const mounted = useRef(true);
  const setupOwner = useRef(setup ? auth.currentUser : null);
  if (!setupOwner.current && auth.currentUser) setupOwner.current = auth.currentUser;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const getRoleLabel = () => {
    switch (registrationRole) {
      case "customer":
        return "Customer";

      case "technician":
        return "Technician";
    }
  };

  const handleRegister = async (recover = false) => {
    if (isSubmittingRef.current) {
      return;
    }
    if (!acceptTerms) { setTermsError("Please agree to the Terms and acknowledge the Privacy Policy."); return; }

    const cleanFullName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanAddress = address.trim();
    const cleanSpecialization =
      specialization.trim();
    const cleanExperience = experience.trim();
    const cleanQualifications =
      qualifications.trim();
    const cleanCertifications =
      certifications.trim();
    const cleanServiceAreas = serviceAreas.trim();

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

    if (registrationRole === "technician") {
      if (!SERVICE_CATEGORY_DEFINITIONS.some(category => category.id === cleanSpecialization)) {
        Alert.alert(
          "Missing Information",
          "Please select your service category."
        );
        return;
      }

      if (!cleanExperience) {
        Alert.alert(
          "Missing Information",
          "Please enter your experience."
        );
        return;
      }

      if (!cleanQualifications) {
        Alert.alert(
          "Missing Information",
          "Please enter your qualifications."
        );
        return;
      }

      if (!cleanServiceAreas) {
        Alert.alert(
          "Missing Information",
          "Please enter your service area."
        );
        return;
      }
    }

    if (!setup && password.length < 8) {
      Alert.alert(
        "Weak Password",
        "Your password must contain at least 8 characters."
      );
      return;
    }

    if (!setup && password !== confirmPassword) {
      Alert.alert(
        "Password Mismatch",
        "Password and confirm password do not match."
      );
      return;
    }

    if (
      params.role &&
      !isPublicRegistrationRole(params.role)
    ) {
      Alert.alert(
        "Registration Not Available",
        "Only Customer and Technician accounts can be created from the mobile app."
      );
      return;
    }

    try {
      isSubmittingRef.current = true;
      setLoading(true);

      const profilePayload: Omit<UserProfileData, "uid"> = {
        fullName: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        address: cleanAddress,
        role: registrationRole,
        policyAccepted: acceptTerms,
        ...(registrationRole === "technician"
          ? {
              serviceCategoryId: cleanSpecialization,
              experience: cleanExperience,
              qualifications:
                cleanQualifications,
              certifications:
                cleanCertifications,
              serviceAreas:
                cleanServiceAreas,
              serviceDivision:
                cleanServiceAreas,
            }
          : {}),
      };

      const result = setup ? await completeVerifiedRegistration(profilePayload) : await registerAccount(cleanEmail, password, profilePayload, recover);
      if (!mounted.current) return;
      setPassword(""); setConfirmPassword("");
      if (setup) retry();

      // Authenticated recovery resumes the authoritative saved profile's flow.
      router.replace({
        pathname: `/${result.next}` as never,
        params: {
          email: cleanEmail,
          role: result.role,
          ...(result.accessMessage ? { accessMessage: result.accessMessage } : {}),
          ...(result.verificationRequested === false ? { verificationRequested: "false" } : {}),
        },
      });
    } catch (error: any) {
      if (!mounted.current) return;
      if (auth.currentUser) {
        Alert.alert("Continue Account Setup", setup ? onboardingFailureFeedback(error).message : "Your account has been kept. Continue verification or retry setup with your signed-in account.", [
          { text: "Keep editing", style: "cancel" },
          { text: "Continue setup", onPress: () => router.push(auth.currentUser?.emailVerified ? "/profile-setup" as never : "/verify-email") },
        ]);
        return;
      }
      logRegistrationError({
        step: "register-screen:registration:error",
        uid:
          typeof error?.uid === "string"
            ? error.uid
            : null,
        firebaseErrorCode: getFirebaseErrorCode(error),
        firebaseErrorMessage:
          getFirebaseErrorMessage(error),
        registrationStep:
          error?.registrationStep ?? "unknown",
      });

      const alert = getRegistrationAlert(error);
      const blockedRecovery = ["firestore/profile-already-exists", "firestore/profile-role-mismatch", "firestore/profile-identity-mismatch", "firestore/profile-schema-invalid", "firestore/profile-account-inactive", "firestore/profile-session-revoked"].includes(error?.code);
      Alert.alert(alert.title, alert.message, error?.code === "auth/email-already-in-use" || (isProfileCreationFailure(error) && !blockedRecovery) ? [
        { text: "Cancel", style: "cancel" },
        { text: "Recover incomplete registration", onPress: () => { void handleRegister(true); } },
      ] : undefined);
    } finally {
      isSubmittingRef.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  if (setupOwner.current && auth.currentUser !== setupOwner.current || !setup && auth.currentUser || setup && !auth.currentUser) {
    return <View style={{ flex: 1, backgroundColor: "#06101D", padding: 24, justifyContent: "center", gap: 20 }}>
      <Text style={{ color: "white", fontSize: 20 }}>{auth.currentUser ? "Continue with your signed-in account" : "Sign in to continue setup"}</Text>
      <Text style={{ color: "#CBD5E1" }}>Your account has been kept. Continue verification or setup without creating another account.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.replace(!auth.currentUser || setup ? "/" : auth.currentUser.emailVerified ? "/profile-setup" as never : "/verify-email")}>
        <Text style={{ color: "#60A5FA", padding: 16 }}>Continue setup</Text>
      </TouchableOpacity>
    </View>;
  }

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
        {selectedRole && !setup && (
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
          <Text style={styles.title}>{setup ? "Complete Profile Setup" : "Create Account"}</Text>

          <Text style={styles.subtitle}>
            {setup ? "Finish your saved account. Your street address stays private." : "Verify your email, then we will save your profile."}
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
              editable={!loading && !setup}
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

        {registrationRole === "technician" && (
          <>
            <View style={styles.technicianSection}>
              <Text style={styles.technicianSectionTitle}>
                Technician Information
              </Text>
              <Text style={styles.technicianSectionText}>
                This information will be reviewed before
                dashboard access is enabled.
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Service category
              </Text>

              <ServiceCategoryPicker value={specialization} onChange={setSpecialization} disabled={loading} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Experience</Text>

              <View style={styles.inputContainer}>
                <BriefcaseBusiness
                  size={20}
                  color="#64748B"
                />

                <TextInput
                  value={experience}
                  onChangeText={setExperience}
                  placeholder="Example: 3 years"
                  placeholderTextColor="#64748B"
                  style={styles.input}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Qualifications
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  styles.multilineInputContainer,
                ]}
              >
                <BriefcaseBusiness
                  size={20}
                  color="#64748B"
                />

                <TextInput
                  value={qualifications}
                  onChangeText={setQualifications}
                  placeholder="Training, skills, qualifications"
                  placeholderTextColor="#64748B"
                  style={[
                    styles.input,
                    styles.multilineInput,
                  ]}
                  editable={!loading}
                  multiline
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Certifications
              </Text>

              <View style={styles.inputContainer}>
                <BriefcaseBusiness
                  size={20}
                  color="#64748B"
                />

                <TextInput
                  value={certifications}
                  onChangeText={setCertifications}
                  placeholder="Optional certifications"
                  placeholderTextColor="#64748B"
                  style={styles.input}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Service Area
              </Text>

              <View style={styles.inputContainer}>
                <MapPin size={20} color="#64748B" />

                <TextInput
                  value={serviceAreas}
                  onChangeText={setServiceAreas}
                  placeholder="Cities or areas you cover"
                  placeholderTextColor="#64748B"
                  style={styles.input}
                  editable={!loading}
                />
              </View>
            </View>
          </>
        )}

        {!setup && <>
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

        </>}
        <TermsAcceptance checked={acceptTerms} onChange={(value) => { setAcceptTerms(value); setTermsError(""); }} error={termsError} disabled={loading} />

        {/* Register Button */}
        <TouchableOpacity
          style={[
            styles.registerButton,
            (!acceptTerms || loading) &&
              styles.registerButtonDisabled,
          ]}
          activeOpacity={0.85}
          disabled={loading}
          onPress={() => { void handleRegister(); }}
        >
          <Text style={styles.registerButtonText}>
            {loading
              ? "Please wait..."
              : setup ? "Save Profile" : "Create Account"}
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
    paddingTop: 24,
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

  multilineInputContainer: {
    height: 104,
    alignItems: "flex-start",
    paddingTop: 16,
  },

  multilineInput: {
    height: "100%",
    textAlignVertical: "top",
    paddingTop: 0,
  },

  technicianSection: {
    marginTop: 6,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.18)",
  },

  technicianSectionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  technicianSectionText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
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
