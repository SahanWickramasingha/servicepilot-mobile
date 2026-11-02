import { router } from "expo-router";
import { LegalLinks } from "@/src/components/legal/LegalLinks";
import { logoutUser } from "@/src/services/auth.service";
import {
    ChevronRight,
    LogOut,
    ShieldCheck,
    UserRound,
} from "lucide-react-native";
import {
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function SettingsScreen() {

  const handleLogout = async () => {
    await logoutUser();
    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#06101D" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>

          <Text style={styles.subtitle}>
            Manage your ServicePilot preferences
          </Text>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.card}>
          <MenuRow
            icon={<UserRound size={20} color="#60A5FA" />}
            title="Profile"
            subtitle="View and manage your profile"
            onPress={() => router.push("./edit-profile")}
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<ShieldCheck size={20} color="#A78BFA" />}
            title="Security"
            subtitle="Password and account security"
            onPress={() => router.push("./change-password")}
          />
        </View>

        <Text style={styles.rowSubtitle}>Job alerts remain available in Notifications. Manage location sharing in its feature screen and device permissions in device settings.</Text>

        <Text style={styles.sectionTitle}>About, Support & Privacy</Text>
        <View style={styles.card}><LegalLinks /></View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.85}
          onPress={handleLogout}
        >
          <LogOut size={19} color="#EF4444" />

          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          ServicePilot • Field Service Management
        </Text>
      </ScrollView>
    </View>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.menuRow}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <View style={styles.iconBox}>{icon}</View>

      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>

        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>

      <ChevronRight size={19} color="#64748B" />
    </TouchableOpacity>
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
    paddingTop: 58,
    paddingBottom: 60,
  },

  header: {
    marginBottom: 30,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "800",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 5,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    marginLeft: 2,
  },

  card: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 17,
    overflow: "hidden",
    marginBottom: 25,
  },

  menuRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },

  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  rowContent: {
    flex: 1,
  },

  rowTitle: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "600",
  },

  rowSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 70,
  },

  versionRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },

  logoutButton: {
    height: 54,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.28)",
    backgroundColor: "rgba(239,68,68,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 6,
  },

  logoutText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "700",
  },

  footerText: {
    color: "#475569",
    fontSize: 10,
    textAlign: "center",
    marginTop: 24,
  },
});
