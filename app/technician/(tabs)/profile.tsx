import { router } from "expo-router";
import {
  Award,
  Bell,
  ChevronRight,
  LogOut,
  Settings,
  ShieldCheck,
  Star,
  UserRound,
  Wrench,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTechnicianWorkspace } from "@/src/hooks/useTechnicianWorkspace";
import { useTechnicianReviews } from "@/src/hooks/useTechnicianReviews";
import { getTechnicianRatingDisplay } from "@/src/utils/technicianRating";
import { logoutUser } from "@/src/services/auth.service";
import { getCompletedTechnicianRequests } from "@/src/utils/technicianRequests";
import { TechnicianSharingPanel } from "@/src/components/maps/TechnicianSharingPanel";
import { TechnicianAvailabilityPanel } from "@/src/components/technicians/TechnicianAvailabilityPanel";
import { AvailabilityBadge } from "@/src/components/technicians/AvailabilityBadge";
import { resolveServiceDistrictIds } from "@/functions/src/domain/map";
import { declaredServiceAreaLabel } from "@/functions/src/domain/serviceAreas";

export default function TechnicianProfileScreen() {
  const { uid, profile, requests, loading, errorMessage } =
    useTechnicianWorkspace();
  const ratings = useTechnicianReviews(profile ? uid : null);
  const ratingDisplay = getTechnicianRatingDisplay(ratings);
  const completedJobs = getCompletedTechnicianRequests(requests).length;

  const handleLogout = async () => {
    try { await logoutUser(); router.replace("/login"); }
    catch { Alert.alert("Unable to sign out", "Please retry so your shared location can be removed before signing out."); }
  };

  if (loading) {
    return <StateScreen message="Loading profile..." />;
  }

  if (errorMessage || !profile) {
    return (
      <StateScreen
        title="Profile unavailable"
        message={errorMessage || "Unable to load technician profile."}
      />
    );
  }

  const specialization =
    profile.specialization || "Specialization not provided";
  const serviceDivision =
    profile.serviceDistrictIds !== undefined
      ? resolveServiceDistrictIds(profile).map((id) => declaredServiceAreaLabel(id, profile.serviceAreasByDistrict)).join("; ") || "Service districts not set"
      : profile.serviceDivision || profile.serviceAreas || "Division not set";

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
        <Text style={styles.pageTitle}>Profile</Text>

        <Text style={styles.subtitle}>
          Manage your technician account
        </Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            {profile.profilePhotoUrl ? (
              <Image
                source={{ uri: profile.profilePhotoUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <UserRound size={41} color="#FFFFFF" />
            )}
          </View>

          <Text style={styles.name}>
            {profile.fullName || "Service Technician"}
          </Text>

          <Text style={styles.role}>{specialization}</Text>
          <AvailabilityBadge availability={profile.availability} />

          <Text style={styles.divisionText}>{serviceDivision}</Text>

          <View style={styles.ratingRow}>
            <Star
              size={17}
              color="#F59E0B"
              fill={ratingDisplay.hasRatings ? "#F59E0B" : "transparent"}
            />

            <Text style={styles.ratingValue}>{ratingDisplay.value}</Text>

            {ratingDisplay.hasRatings && (
              <Text style={styles.ratingCount}>
                - {ratingDisplay.countLabel}
              </Text>
            )}
          </View>
        </View>

        {ratings.status === "error" && (
          <Text accessibilityRole="alert" style={styles.subtitle}>{ratings.errorMessage}</Text>
        )}

        <View style={styles.statsRow}>
          <StatCard value={String(completedJobs)} label="Jobs" />
          <StatCard value={ratingDisplay.value} label="Rating" />
          <StatCard
            value={profile.experience || "Not set"}
            label="Experience"
          />
        </View>

        <Text style={styles.sectionTitle}>Technician</Text>

        <TechnicianAvailabilityPanel key={profile.uid} profile={profile} />
        <TechnicianSharingPanel profile={profile} />

        <View style={styles.menuCard}>
          <MenuRow
            icon={<Award size={19} color="#F59E0B" />}
            title="Performance"
            subtitle="Ratings, completed jobs and statistics"
            onPress={() => router.push("/technician/performance")}
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<Wrench size={19} color="#60A5FA" />}
            title="Skills & Services"
            subtitle={`${specialization} - ${serviceDivision}`}
          />
        </View>

        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.menuCard}>
          <MenuRow
            icon={<UserRound size={19} color="#A78BFA" />}
            title="Personal Information"
            subtitle={profile.email || "Email not available"}
            onPress={() => router.push("/technician/personal-information")}
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<Bell size={19} color="#F59E0B" />}
            title="Notifications"
            subtitle="Manage alerts and job notifications"
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<ShieldCheck size={19} color="#22C55E" />}
            title="Security"
            subtitle="Password and account security"
          />

          <View style={styles.divider} />

          <MenuRow
            icon={<Settings size={19} color="#94A3B8" />}
            title="Settings"
            subtitle="Application preferences"
          />
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.8}
          onPress={handleLogout}
        >
          <LogOut size={18} color="#EF4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function StateScreen({
  title = "Please wait",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <View style={styles.stateScreen}>
      {!title.includes("unavailable") && (
        <ActivityIndicator color="#22C55E" />
      )}
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

function StatCard({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue} numberOfLines={2}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  subtitle: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.menuRow}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={styles.menuIcon}>{icon}</View>

      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <ChevronRight size={18} color="#475569" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#06101D" },
  stateScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06101D",
    paddingHorizontal: 28,
  },
  stateTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  stateText: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 120,
  },
  pageTitle: { color: "#FFFFFF", fontSize: 27, fontWeight: "800" },
  subtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 4,
    marginBottom: 22,
  },
  profileCard: {
    borderRadius: 20,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    paddingVertical: 25,
    paddingHorizontal: 18,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  name: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 14,
    textAlign: "center",
  },
  role: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
  },
  divisionText: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 4,
    textAlign: "center",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
  },
  ratingValue: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },
  ratingCount: {
    color: "#64748B",
    fontSize: 8,
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 13,
    marginBottom: 26,
  },
  statCard: {
    flex: 1,
    height: 76,
    borderRadius: 14,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  statValue: {
    color: "#22C55E",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  statLabel: { color: "#64748B", fontSize: 8, marginTop: 4 },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 9,
  },
  menuCard: {
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    paddingHorizontal: 13,
    marginBottom: 24,
  },
  menuRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  menuContent: { flex: 1 },
  menuTitle: { color: "#E2E8F0", fontSize: 10, fontWeight: "700" },
  menuSubtitle: { color: "#64748B", fontSize: 8, marginTop: 4 },
  divider: { height: 1, backgroundColor: "#17263A", marginLeft: 52 },
  logoutButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
    backgroundColor: "rgba(239,68,68,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  logoutText: { color: "#EF4444", fontSize: 11, fontWeight: "700" },
});
