import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  Mail,
  MapPin,
  Phone,
  Save,
  UserRound,
} from "lucide-react-native";

import { auth } from "@/src/firebase/config";
import {
  getUserProfile,
  updateUserProfileSafe,
} from "@/src/services/user.service";
import { ProtectedRoute } from "@/src/components/auth/ProtectedRoute";

export default function EditProfileScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setErrorMessage("Please sign in again.");
      setLoading(false);
      return;
    }

    getUserProfile(currentUser.uid)
      .then((profile) => {
        if (!profile) {
          setErrorMessage("Profile not found.");
          return;
        }

        setFullName(profile.fullName ?? "");
        setEmail(profile.email ?? currentUser.email ?? "");
        setPhone(profile.phone ?? "");
        setAddress(profile.address ?? "");
      })
      .catch((error) => {
        console.error("Edit profile load error:", error);
        setErrorMessage("Unable to load profile.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setErrorMessage("Please sign in again.");
      return;
    }

    if (!fullName.trim() || !phone.trim() || !address.trim()) {
      setErrorMessage(
        "Full name, phone, and address are required."
      );
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      await updateUserProfileSafe(currentUser.uid, {
        fullName,
        phone,
        address,
      });
      router.back();
    } catch (error: any) {
      console.error("Edit profile save error:", error);
      setErrorMessage(
        error?.message || "Unable to update profile."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={["customer"]}>
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#3B82F6" />
      </View>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["customer"]}>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Edit Profile</Text>
            <Text style={styles.subtitle}>
              Update safe account fields
            </Text>
          </View>
        </View>

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={styles.formCard}>
          <Field
            icon={<UserRound size={20} color="#64748B" />}
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Enter your full name"
          />

          <Field
            icon={<Mail size={20} color="#64748B" />}
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            editable={false}
          />

          <Field
            icon={<Phone size={20} color="#64748B" />}
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter your phone number"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Address</Text>
          <View style={styles.addressContainer}>
            <MapPin
              size={20}
              color="#64748B"
              style={styles.addressIcon}
            />
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Enter your address"
              placeholderTextColor="#64748B"
              multiline
              textAlignVertical="top"
              style={styles.addressInput}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            saving && styles.saveButtonDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Save size={19} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>
                Save Changes
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </ProtectedRoute>
  );
}

function Field({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  keyboardType,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  editable?: boolean;
  keyboardType?: "default" | "phone-pad";
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputContainer,
          !editable && styles.inputDisabled,
        ]}
      >
        {icon}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#64748B"
          style={styles.input}
          editable={editable}
          keyboardType={keyboardType}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#06101D" },
  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06101D",
  },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 80,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
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
  headerText: { flex: 1 },
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
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    textAlign: "center",
  },
  formCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 20,
    marginBottom: 24,
  },
  fieldGroup: { marginBottom: 19 },
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
  inputDisabled: { opacity: 0.58 },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    marginLeft: 12,
    height: "100%",
  },
  addressContainer: {
    minHeight: 95,
    borderRadius: 12,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 15,
    paddingTop: 16,
  },
  addressIcon: { marginTop: 1 },
  addressInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    marginLeft: 12,
    minHeight: 65,
  },
  saveButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
