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
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function TechnicianProfileScreen() {
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
        <Text style={styles.pageTitle}>
          Profile
        </Text>

        <Text style={styles.subtitle}>
          Manage your technician account
        </Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <UserRound
              size={41}
              color="#FFFFFF"
            />
          </View>

          <Text style={styles.name}>
            Alex Smith
          </Text>

          <Text style={styles.role}>
            Senior Service Technician
          </Text>

          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />

            <Text style={styles.onlineText}>
              Available for Jobs
            </Text>
          </View>

          <View style={styles.ratingRow}>
            <Star
              size={17}
              color="#F59E0B"
              fill="#F59E0B"
            />

            <Text style={styles.ratingValue}>
              4.8
            </Text>

            <Text style={styles.ratingCount}>
              • 124 reviews
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            value="124"
            label="Jobs"
          />

          <StatCard
            value="4.8"
            label="Rating"
          />

          <StatCard
            value="96%"
            label="Success"
          />
        </View>

        <Text style={styles.sectionTitle}>
          Technician
        </Text>

        <View style={styles.menuCard}>
          <MenuRow
            icon={
              <Award
                size={19}
                color="#F59E0B"
              />
            }
            title="Performance"
            subtitle="Ratings, completed jobs and statistics"
            onPress={() =>
              router.push("/technician/performance")
            }
          />

          <View style={styles.divider} />

          <MenuRow
            icon={
              <Wrench
                size={19}
                color="#60A5FA"
              />
            }
            title="Skills & Services"
            subtitle="AC, electrical and appliance repairs"
          />
        </View>

        <Text style={styles.sectionTitle}>
          Account
        </Text>

        <View style={styles.menuCard}>
          <MenuRow
            icon={
              <UserRound
                size={19}
                color="#A78BFA"
              />
            }
            title="Personal Information"
            subtitle="Update your technician profile"
          />

          <View style={styles.divider} />

          <MenuRow
            icon={
              <Bell
                size={19}
                color="#F59E0B"
              />
            }
            title="Notifications"
            subtitle="Manage alerts and job notifications"
          />

          <View style={styles.divider} />

          <MenuRow
            icon={
              <ShieldCheck
                size={19}
                color="#22C55E"
              />
            }
            title="Security"
            subtitle="Password and account security"
          />

          <View style={styles.divider} />

          <MenuRow
            icon={
              <Settings
                size={19}
                color="#94A3B8"
              />
            }
            title="Settings"
            subtitle="Application preferences"
          />
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.8}
        >
          <LogOut
            size={18}
            color="#EF4444"
          />

          <Text style={styles.logoutText}>
            Sign Out
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
      <Text style={styles.statValue}>
        {value}
      </Text>

      <Text style={styles.statLabel}>
        {label}
      </Text>
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
      <View style={styles.menuIcon}>
        {icon}
      </View>

      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>
          {title}
        </Text>

        <Text style={styles.menuSubtitle}>
          {subtitle}
        </Text>
      </View>

      <ChevronRight
        size={18}
        color="#475569"
      />
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
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 120,
  },

  pageTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
  },

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
  },

  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
  },

  name: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 14,
  },

  role: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 4,
  },

  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingHorizontal: 9,
    height: 27,
    borderRadius: 9,
    backgroundColor: "rgba(34,197,94,0.07)",
  },

  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: "#22C55E",
    marginRight: 5,
  },

  onlineText: {
    color: "#22C55E",
    fontSize: 8,
    fontWeight: "700",
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
  },

  statValue: {
    color: "#22C55E",
    fontSize: 18,
    fontWeight: "800",
  },

  statLabel: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 4,
  },

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

  menuContent: {
    flex: 1,
  },

  menuTitle: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "700",
  },

  menuSubtitle: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 52,
  },

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

  logoutText: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "700",
  },
});