import { router } from "expo-router";
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  BriefcaseBusiness,
  Headset,
  ShieldCheck,
  UserRound,
} from "lucide-react-native";

type Role = "customer" | "technician" | "dispatcher" | "admin";

export default function RoleSelectionScreen() {
  const selectRole = (role: Role) => {
    router.push({
      pathname: "/login",
      params: { role },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#06101D" />

      <View style={styles.header}>
        <Text style={styles.title}>Choose Your Role</Text>
        <Text style={styles.subtitle}>
          Select the role that best describes you
        </Text>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => selectRole("customer")}
        >
          <View style={[styles.iconBox, styles.customerIcon]}>
            <UserRound size={34} color="#60A5FA" />
          </View>

          <Text style={styles.roleTitle}>Customer</Text>
          <Text style={styles.roleDescription}>
            Request services and track progress
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => selectRole("technician")}
        >
          <View style={[styles.iconBox, styles.technicianIcon]}>
            <BriefcaseBusiness size={34} color="#22D3EE" />
          </View>

          <Text style={styles.roleTitle}>Technician</Text>
          <Text style={styles.roleDescription}>
            Manage jobs and complete tasks
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => selectRole("dispatcher")}
        >
          <View style={[styles.iconBox, styles.dispatcherIcon]}>
            <Headset size={34} color="#F59E0B" />
          </View>

          <Text style={styles.roleTitle}>Dispatcher</Text>
          <Text style={styles.roleDescription}>
            Assign jobs and manage team
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => selectRole("admin")}
        >
          <View style={[styles.iconBox, styles.adminIcon]}>
            <ShieldCheck size={34} color="#A78BFA" />
          </View>

          <Text style={styles.roleTitle}>Super Admin</Text>
          <Text style={styles.roleDescription}>
            Manage system and users
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.continueButton}
        onPress={() => router.push("/login")}
      >
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
    paddingHorizontal: 24,
    paddingTop: 90,
    paddingBottom: 40,
  },

  header: {
    alignItems: "center",
    marginBottom: 38,
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
    textAlign: "center",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 16,
  },

  card: {
    width: "48%",
    minHeight: 170,
    backgroundColor: "#0D1B2A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#17263A",
    paddingHorizontal: 14,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  customerIcon: {
    backgroundColor: "rgba(37, 99, 235, 0.16)",
  },

  technicianIcon: {
    backgroundColor: "rgba(6, 182, 212, 0.16)",
  },

  dispatcherIcon: {
    backgroundColor: "rgba(245, 158, 11, 0.16)",
  },

  adminIcon: {
    backgroundColor: "rgba(124, 58, 237, 0.16)",
  },

  roleTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  roleDescription: {
    marginTop: 7,
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },

  continueButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "auto",
  },

  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});