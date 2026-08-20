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
  Camera,
  Mail,
  MapPin,
  Phone,
  Save,
  UserRound,
} from "lucide-react-native";

export default function EditProfileScreen() {
  const [fullName, setFullName] = useState("Sahan Wickramasingha");
  const [email, setEmail] = useState("sahan@example.com");
  const [phone, setPhone] = useState("+94 71 234 5678");
  const [address, setAddress] = useState("Kandy, Sri Lanka");

  const handleSave = () => {
    /*
      Firebase profile update will be added later.

      Future:
      1. Validate fields
      2. Upload profile photo if changed
      3. Update Firestore user profile
      4. Show success message
    */

    router.back();
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
              Edit Profile
            </Text>

            <Text style={styles.subtitle}>
              Update your personal information
            </Text>
          </View>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarOuter}>
            <View style={styles.avatar}>
              <UserRound
                size={48}
                color="#FFFFFF"
                strokeWidth={1.8}
              />
            </View>

            <TouchableOpacity
              style={styles.cameraButton}
              activeOpacity={0.8}
            >
              <Camera
                size={16}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>
            {fullName || "Your Name"}
          </Text>

          <TouchableOpacity activeOpacity={0.8}>
            <Text style={styles.changePhotoText}>
              Change Profile Photo
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Full Name
            </Text>

            <View style={styles.inputContainer}>
              <UserRound
                size={20}
                color="#64748B"
              />

              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor="#64748B"
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Email Address
            </Text>

            <View style={styles.inputContainer}>
              <Mail
                size={20}
                color="#64748B"
              />

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

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Phone Number
            </Text>

            <View style={styles.inputContainer}>
              <Phone
                size={20}
                color="#64748B"
              />

              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter your phone number"
                placeholderTextColor="#64748B"
                keyboardType="phone-pad"
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.fieldGroupLast}>
            <Text style={styles.label}>
              Address
            </Text>

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
        </View>

        {/* Save */}
        <TouchableOpacity
          style={styles.saveButton}
          activeOpacity={0.85}
          onPress={handleSave}
        >
          <Save size={19} color="#FFFFFF" />

          <Text style={styles.saveButtonText}>
            Save Changes
          </Text>
        </TouchableOpacity>

        {/* Cancel */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
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

  avatarSection: {
    alignItems: "center",
    marginBottom: 30,
  },

  avatarOuter: {
    position: "relative",
  },

  avatar: {
    width: 105,
    height: 105,
    borderRadius: 53,
    backgroundColor: "#2563EB",
    borderWidth: 4,
    borderColor: "rgba(59,130,246,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },

  cameraButton: {
    position: "absolute",
    bottom: 1,
    right: -2,
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: "#3B82F6",
    borderWidth: 3,
    borderColor: "#06101D",
    alignItems: "center",
    justifyContent: "center",
  },

  name: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 13,
  },

  changePhotoText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 7,
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

  addressIcon: {
    marginTop: 1,
  },

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
    shadowColor: "#2563EB",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  cancelButton: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },

  cancelText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "600",
  },
});