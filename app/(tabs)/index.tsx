import { router } from "expo-router";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  Search,
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

export default function HomeScreen() {
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
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>
              Hello, Sahan 👋
            </Text>

            <Text style={styles.subGreeting}>
              Good morning!
            </Text>
          </View>

          <TouchableOpacity
            style={styles.notificationButton}
            activeOpacity={0.8}
            onPress={() => router.push("/notifications")}
          >
            <Bell size={20} color="#FFFFFF" />

            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                2
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Main Action Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />

          <Text style={styles.heroTitle}>
            What would you like to do today?
          </Text>

          <Text style={styles.heroSubtitle}>
            Book a service and track your technician in real time.
          </Text>

<TouchableOpacity
  style={styles.newRequestButton}
  activeOpacity={0.85}
  onPress={() => router.push("/create-request")}
>
  <Plus
    size={20}
    color="#FFFFFF"
    strokeWidth={2.5}
  />

  <Text style={styles.newRequestButtonText}>
    New Service Request
  </Text>
</TouchableOpacity>
        </View>

        {/* Overview */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Overview
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            value="2"
            label="Pending"
            accent="#F59E0B"
          />

          <StatCard
            value="1"
            label="In Progress"
            accent="#3B82F6"
          />

          <StatCard
            value="3"
            label="Completed"
            accent="#22C55E"
          />

          <StatCard
            value="0"
            label="Cancelled"
            accent="#EF4444"
          />
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Quick Actions
          </Text>
        </View>

        <View style={styles.quickActionsRow}>
          <QuickAction
            icon={<Plus size={22} color="#60A5FA" />}
            title="New Request"
          />

          <QuickAction
            icon={<MapPin size={22} color="#22C55E" />}
            title="Live Tracking"
          />

          <QuickAction
            icon={<Search size={22} color="#A78BFA" />}
            title="Find Service"
          />
        </View>

        {/* Recent Requests */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Recent Requests
          </Text>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push("/bookings")}
          >
            <Text style={styles.viewAllText}>
              View All
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.requestsCard}>
          <RequestRow
            icon={<Wrench size={19} color="#94A3B8" />}
            title="AC Repair"
            subtitle="Today, 10:30 AM"
            status="In Progress"
            statusColor="#22C55E"
            requestId="REQ-2026-0012"
          />

          <View style={styles.divider} />

          <RequestRow
            icon={<Clock3 size={19} color="#94A3B8" />}
            title="Washing Machine Repair"
            subtitle="14 Aug 2026, 02:30 PM"
            status="Assigned"
            statusColor="#3B82F6"
            requestId="REQ-2026-0011"
          />

          <View style={styles.divider} />

          <RequestRow
            icon={<CheckCircle2 size={19} color="#94A3B8" />}
            title="Electrical Installation"
            subtitle="10 Aug 2026"
            status="Completed"
            statusColor="#22C55E"
            requestId="REQ-2026-0010"
          />
        </View>

        {/* Support */}
        <View style={styles.supportCard}>
          <View>
            <Text style={styles.supportTitle}>
              Need help?
            </Text>

            <Text style={styles.supportSubtitle}>
              ServicePilot support is here for you.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.supportButton}
            activeOpacity={0.8}
          >
            <ChevronRight
              size={20}
              color="#3B82F6"
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function StatCard({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text
        style={[
          styles.statValue,
          { color: accent },
        ]}
      >
        {value}
      </Text>

      <Text style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function QuickAction({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <TouchableOpacity
      style={styles.quickActionCard}
      activeOpacity={0.8}
    >
      <View style={styles.quickActionIcon}>
        {icon}
      </View>

      <Text style={styles.quickActionText}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function RequestRow({
  icon,
  title,
  subtitle,
  status,
  statusColor,
  requestId,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status: string;
  statusColor: string;
  requestId: string;
}) {
  return (
    <TouchableOpacity
      style={styles.requestRow}
      activeOpacity={0.78}
    >
      <View style={styles.requestIcon}>
        {icon}
      </View>

      <View style={styles.requestContent}>
        <Text style={styles.requestTitle}>
          {title}
        </Text>

        <Text style={styles.requestId}>
          {requestId}
        </Text>

        <Text style={styles.requestSubtitle}>
          {subtitle}
        </Text>
      </View>

      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor: `${statusColor}18`,
            borderColor: `${statusColor}40`,
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            { color: statusColor },
          ]}
        >
          {status}
        </Text>
      </View>
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

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },

  greeting: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
  },

  subGreeting: {
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

  notificationBadge: {
    position: "absolute",
    top: 6,
    right: 7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },

  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },

  heroCard: {
    minHeight: 180,
    backgroundColor: "#0D1B2A",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#17263A",
    paddingHorizontal: 18,
    paddingVertical: 20,
    overflow: "hidden",
    marginBottom: 26,
  },

  heroGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(37,99,235,0.11)",
    right: -70,
    top: -70,
  },

  heroTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    maxWidth: 260,
  },

  heroSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    maxWidth: 270,
  },

  newRequestButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
  },

  newRequestButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 11,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "800",
  },

  viewAllText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "700",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 26,
  },

  statCard: {
    width: "48.5%",
    minHeight: 88,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },

  statValue: {
    fontSize: 24,
    fontWeight: "800",
  },

  statLabel: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 5,
  },

  quickActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },

  quickActionCard: {
    flex: 1,
    minHeight: 105,
    backgroundColor: "#0D1B2A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  quickActionIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
  },

  quickActionText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 9,
    textAlign: "center",
  },

  requestsCard: {
    backgroundColor: "#0D1B2A",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#17263A",
    overflow: "hidden",
    marginBottom: 24,
  },

  requestRow: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  requestIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  requestContent: {
    flex: 1,
  },

  requestTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
  },

  requestId: {
    color: "#475569",
    fontSize: 9,
    marginTop: 3,
  },

  requestSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 4,
  },

  statusBadge: {
    minHeight: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  statusText: {
    fontSize: 9,
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 72,
  },

  supportCard: {
    minHeight: 82,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },

  supportTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  supportSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 4,
  },

  supportButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(37,99,235,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
});