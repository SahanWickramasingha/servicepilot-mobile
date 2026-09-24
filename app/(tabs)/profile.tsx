import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react-native";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { auth } from "@/src/firebase/config";
import { logoutUser } from "@/src/services/auth.service";
import {
  getUserProfile,
  UserProfile,
} from "@/src/services/user.service";

export default function ProfileScreen() {
  const [profile, setProfile] =
    useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setErrorMessage("Please sign in again.");
      setLoading(false);
      return;
    }

    getUserProfile(currentUser.uid)
      .then((item) => {
        if (!item) {
          setErrorMessage("Profile not found.");
          return;
        }

        setProfile(item);
      })
      .catch((error) => {
        console.error("Profile load error:", error);
        setErrorMessage("Unable to load profile.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    router.replace("/login");
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.pageTitle}>Profile</Text>
            <Text style={styles.pageSubtitle}>
              Manage your account and preferences
            </Text>
          </View>

          <TouchableOpacity
            style={styles.notificationButton}
            activeOpacity={0.8}
            onPress={() => router.push("/notifications")}
          >
            <Bell size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <UserRound
              size={42}
              color="#FFFFFF"
              strokeWidth={1.8}
            />
          </View>

          <Text style={styles.name}>
            {profile?.fullName || "Customer"}
          </Text>
          <Text style={styles.role}>
            {profile?.role || "customer"}
          </Text>

          <View style={styles.statusBadge}>
            <CheckCircle2 size={14} color="#22C55E" />
            <Text style={styles.statusText}>
              {profile?.emailVerified
                ? "Email Verified"
                : "Email Not Verified"}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.editProfileButton}
            activeOpacity={0.85}
            onPress={() => router.push("/edit-profile")}
          >
            <Pencil size={17} color="#FFFFFF" />
            <Text style={styles.editProfileText}>
              Edit Profile
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>
          Contact Information
        </Text>
        <View style={styles.sectionCard}>
          <InfoRow
            icon={<Mail size={19} color="#60A5FA" />}
            label="Email"
            value={profile?.email || "Not available"}
          />
          <View style={styles.divider} />
          <InfoRow
            icon={<Phone size={19} color="#22D3EE" />}
            label="Phone"
            value={profile?.phone || "Not available"}
          />
          <View style={styles.divider} />
          <InfoRow
            icon={<MapPin size={19} color="#A78BFA" />}
            label="Address"
            value={profile?.address || "Not available"}
          />
        </View>

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
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.85}
          onPress={handleLogout}
        >
          <LogOut size={19} color="#EF4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
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
    paddingTop: 58,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 12,
  },
  headerText: { flex: 1 },
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
  avatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  role: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 5,
    textTransform: "capitalize",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    height: 28,
    borderRadius: 20,
    backgroundColor: "rgba(34,197,94,0.08)",
    marginTop: 11,
    gap: 6,
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
  infoContent: { flex: 1 },
  infoLabel: { color: "#64748B", fontSize: 11 },
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
  menuIcon: { width: 38, alignItems: "flex-start" },
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
});
