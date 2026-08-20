import { router } from "expo-router";
import {
    Bell,
    ChevronRight,
    CircleHelp,
    FileText,
    Globe2,
    Info,
    LogOut,
    Moon,
    ShieldCheck,
    Smartphone,
    UserRound,
} from "lucide-react-native";
import { useState } from "react";
import {
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);

  const handleLogout = () => {
    // Firebase logout will be connected later.
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

        {/* Preferences */}
        <Text style={styles.sectionTitle}>Preferences</Text>

        <View style={styles.card}>
          <SwitchRow
            icon={<Bell size={20} color="#F59E0B" />}
            title="Notifications"
            subtitle="Receive app notifications"
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />

          <View style={styles.divider} />

          <SwitchRow
            icon={<Moon size={20} color="#60A5FA" />}
            title="Dark Mode"
            subtitle="Use dark appearance"
            value={darkModeEnabled}
            onValueChange={setDarkModeEnabled}
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<Globe2 size={20} color="#22D3EE" />}
            title="Language"
            subtitle="English"
          />
        </View>

        {/* Privacy */}
        <Text style={styles.sectionTitle}>Privacy & Legal</Text>

        <View style={styles.card}>
          <MenuRow
            icon={<ShieldCheck size={20} color="#22C55E" />}
            title="Privacy Policy"
            subtitle="How your data is handled"
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<FileText size={20} color="#60A5FA" />}
            title="Terms & Conditions"
            subtitle="ServicePilot usage terms"
          />
        </View>

        {/* Support */}
        <Text style={styles.sectionTitle}>Support</Text>

        <View style={styles.card}>
          <MenuRow
            icon={<CircleHelp size={20} color="#38BDF8" />}
            title="Help Center"
            subtitle="FAQs and support information"
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<Smartphone size={20} color="#A78BFA" />}
            title="Contact Support"
            subtitle="Get help from ServicePilot"
          />
        </View>

        {/* About */}
        <Text style={styles.sectionTitle}>About</Text>

        <View style={styles.card}>
          <MenuRow
            icon={<Info size={20} color="#94A3B8" />}
            title="About ServicePilot"
            subtitle="Field Service Management"
          />

          <View style={styles.divider} />

          <View style={styles.versionRow}>
            <View style={styles.iconBox}>
              <Smartphone size={20} color="#64748B" />
            </View>

            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>App Version</Text>

              <Text style={styles.rowSubtitle}>Version 1.0.0</Text>
            </View>
          </View>
        </View>

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

function SwitchRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.menuRow}>
      <View style={styles.iconBox}>{icon}</View>

      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>

        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: "#334155",
          true: "#2563EB",
        }}
        thumbColor="#FFFFFF"
      />
    </View>
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
