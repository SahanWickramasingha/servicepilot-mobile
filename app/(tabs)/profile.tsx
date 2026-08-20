import { router } from "expo-router";
import {
  Bell,
  ChevronRight,
  HelpCircle,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Settings,
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

export default function ProfileScreen() {
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
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Profile</Text>
            <Text style={styles.pageSubtitle}>
              Manage your account and preferences
            </Text>
          </View>

          <TouchableOpacity
            style={styles.notificationButton}
            activeOpacity={0.8}
          >
            <Bell size={20} color="#FFFFFF" />

            <View style={styles.notificationDot} />
          </TouchableOpacity>
        </View>

        {/* Main Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarOuter}>
            <View style={styles.avatar}>
              <UserRound size={42} color="#FFFFFF" strokeWidth={1.8} />
            </View>

            <TouchableOpacity
              style={styles.editAvatarButton}
              activeOpacity={0.8}
            >
              <Pencil size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>Sahan Wickramasingha</Text>

          <Text style={styles.role}>Customer</Text>

          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Active Account</Text>
          </View>

          <TouchableOpacity
            style={styles.editProfileButton}
            activeOpacity={0.85}
            onPress={() => router.push("/edit-profile")}
          >
            <Pencil size={17} color="#FFFFFF" />

            <Text style={styles.editProfileText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Contact Information */}
        <Text style={styles.sectionTitle}>Contact Information</Text>

        <View style={styles.sectionCard}>
          <InfoRow
            icon={<Mail size={19} color="#60A5FA" />}
            label="Email"
            value="sahan@example.com"
          />

          <View style={styles.divider} />

          <InfoRow
            icon={<Phone size={19} color="#22D3EE" />}
            label="Phone"
            value="+94 71 234 5678"
          />

          <View style={styles.divider} />

          <InfoRow
            icon={<MapPin size={19} color="#A78BFA" />}
            label="Address"
            value="Kandy, Sri Lanka"
          />
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.sectionCard}>
          <MenuRow
            icon={<LockKeyhole size={20} color="#60A5FA" />}
            title="Change Password"
            onPress={() => router.push("/change-password")}
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<ShieldCheck size={20} color="#A78BFA" />}
            title="Privacy & Security"
          />

          <View style={styles.divider} />
<View style={styles.divider} />

<MenuRow
  icon={<Settings size={20} color="#94A3B8" />}
  title="Settings"
  onPress={() => router.push("/settings")}
/>
        </View>

        {/* Support */}
        <Text style={styles.sectionTitle}>Support</Text>

        <View style={styles.sectionCard}>
          <MenuRow
            icon={<HelpCircle size={20} color="#38BDF8" />}
            title="Help & Support"
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<Bell size={20} color="#F59E0B" />}
            title="Notifications"
          />
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

        <Text style={styles.versionText}>ServicePilot v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>

      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>

        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function MenuRow({
  icon,
  title,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.menuRow}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <View style={styles.menuIcon}>{icon}</View>

      <Text style={styles.menuTitle}>{title}</Text>

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
    paddingBottom: 120,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  pageTitle: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "800",
  },

  pageSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
  },

  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#EF4444",
    borderWidth: 1,
    borderColor: "#06101D",
  },

  profileCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 22,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 24,
    marginBottom: 28,
  },

  avatarOuter: {
    position: "relative",
    marginBottom: 16,
  },

  avatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(59,130,246,0.20)",
  },

  editAvatarButton: {
    position: "absolute",
    right: -2,
    bottom: 1,
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: "#3B82F6",
    borderWidth: 3,
    borderColor: "#0D1B2A",
    alignItems: "center",
    justifyContent: "center",
  },

  name: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
  },

  role: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 5,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    height: 28,
    borderRadius: 20,
    backgroundColor: "rgba(34,197,94,0.08)",
    marginTop: 11,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#22C55E",
    marginRight: 6,
  },

  statusText: {
    color: "#86EFAC",
    fontSize: 11,
    fontWeight: "600",
  },

  editProfileButton: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 22,
  },

  editProfileText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    marginLeft: 2,
  },

  sectionCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 17,
    overflow: "hidden",
    marginBottom: 25,
  },

  infoRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },

  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    color: "#64748B",
    fontSize: 11,
  },

  infoValue: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 70,
  },

  menuRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },

  menuIcon: {
    width: 38,
    alignItems: "flex-start",
  },

  menuTitle: {
    flex: 1,
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "600",
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
  },

  logoutText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "700",
  },

  versionText: {
    color: "#475569",
    fontSize: 10,
    textAlign: "center",
    marginTop: 22,
  },
});
