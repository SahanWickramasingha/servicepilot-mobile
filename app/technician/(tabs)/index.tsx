import { router } from "expo-router";
import {
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DollarSign,
  MapPin,
  Navigation,
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

export default function TechnicianDashboard() {
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
        <View style={styles.header}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <UserRound
                size={24}
                color="#FFFFFF"
              />
            </View>

            <View>
              <Text style={styles.greeting}>
                Good morning,
              </Text>

              <Text style={styles.name}>
                Alex Smith 👋
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />

              <Text style={styles.onlineText}>
                Online
              </Text>
            </View>

            <TouchableOpacity
              style={styles.notificationButton}
              activeOpacity={0.8}
            >
              <Bell
                size={20}
                color="#FFFFFF"
              />

              <View style={styles.notificationDot} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Overview */}
        <Text style={styles.sectionTitle}>
          Today's Overview
        </Text>

        <View style={styles.statsGrid}>
          <StatCard
            value="5"
            label="Today's Jobs"
            color="#F59E0B"
          />

          <StatCard
            value="2"
            label="In Progress"
            color="#3B82F6"
          />

          <StatCard
            value="1"
            label="Upcoming"
            color="#22D3EE"
          />

          <StatCard
            value="12"
            label="Completed"
            color="#22C55E"
          />
        </View>

        {/* Earnings */}
        <View style={styles.earningsCard}>
          <View>
            <Text style={styles.earningsLabel}>
              Earnings This Month
            </Text>

            <Text style={styles.earningsValue}>
              Rs. 62,000
            </Text>

            <Text style={styles.earningsGrowth}>
              ↑ 12% from last month
            </Text>
          </View>

          <View style={styles.ratingBox}>
            <Star
              size={20}
              color="#F59E0B"
              fill="#F59E0B"
            />

            <Text style={styles.ratingValue}>
              4.8
            </Text>

            <Text style={styles.ratingLabel}>
              Rating
            </Text>
          </View>
        </View>

        {/* Next Job */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Next Job
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/technician/jobs")}
          >
            <Text style={styles.viewAll}>
              See All
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.nextJobCard}>
          <View style={styles.jobHeader}>
            <View style={styles.jobIcon}>
              <Wrench
                size={23}
                color="#60A5FA"
              />
            </View>

            <View style={styles.jobHeaderContent}>
              <Text style={styles.jobTime}>
                10:00 AM
              </Text>

              <Text style={styles.jobTitle}>
                AC Repair
              </Text>

              <Text style={styles.jobId}>
                REQ-2026-0012
              </Text>
            </View>

            <View style={styles.highBadge}>
              <Text style={styles.highText}>
                High
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.customerRow}>
            <View style={styles.smallAvatar}>
              <UserRound
                size={17}
                color="#CBD5E1"
              />
            </View>

            <View style={styles.customerContent}>
              <Text style={styles.infoLabel}>
                Customer
              </Text>

              <Text style={styles.customerName}>
                Emma Johnson
              </Text>
            </View>
          </View>

          <View style={styles.locationRow}>
            <MapPin
              size={17}
              color="#64748B"
            />

            <Text style={styles.locationText}>
              123, Main Street, Colombo 07
            </Text>
          </View>

          <View style={styles.jobActions}>
            <TouchableOpacity
              style={styles.detailsButton}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: "/technician/job-details",
                  params: {
                    id: "REQ-2026-0012",
                  },
                })
              }
            >
              <Text style={styles.detailsButtonText}>
                View Details
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navigationButton}
              activeOpacity={0.8}
              onPress={() =>
                router.push("/technician/navigation")
              }
            >
              <Navigation
                size={17}
                color="#FFFFFF"
              />

              <Text style={styles.navigationButtonText}>
                Navigate
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Today's Jobs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Today's Jobs
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/technician/jobs")}
          >
            <Text style={styles.viewAll}>
              View All
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.jobsCard}>
          <DashboardJob
            time="12:30 PM"
            service="Washing Machine Repair"
            location="Nawala Road, Nugegoda"
            status="Accepted"
            color="#22C55E"
          />

          <View style={styles.jobDivider} />

          <DashboardJob
            time="03:00 PM"
            service="Electrical Installation"
            location="Galle Road, Colombo 03"
            status="In Progress"
            color="#3B82F6"
          />

          <View style={styles.jobDivider} />

          <DashboardJob
            time="05:00 PM"
            service="Refrigerator Repair"
            location="Dehiwala, Colombo"
            status="Upcoming"
            color="#F59E0B"
          />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>
          Quick Actions
        </Text>

        <View style={styles.quickActions}>
          <QuickAction
            icon={
              <BriefcaseBusiness
                size={21}
                color="#60A5FA"
              />
            }
            label="My Jobs"
            onPress={() => router.push("/technician/jobs")}
          />

          <QuickAction
            icon={
              <Navigation
                size={21}
                color="#22C55E"
              />
            }
            label="Navigation"
            onPress={() =>
              router.push("/technician/navigation")
            }
          />

          <QuickAction
            icon={
              <CheckCircle2
                size={21}
                color="#A78BFA"
              />
            }
            label="Completed"
            onPress={() =>
              router.push("/technician/history")
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}

function StatCard({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text
        style={[
          styles.statValue,
          { color },
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

function DashboardJob({
  time,
  service,
  location,
  status,
  color,
}: {
  time: string;
  service: string;
  location: string;
  status: string;
  color: string;
}) {
  return (
    <TouchableOpacity
      style={styles.dashboardJob}
      activeOpacity={0.8}
    >
      <View style={styles.dashboardJobIcon}>
        <Wrench
          size={18}
          color="#94A3B8"
        />
      </View>

      <View style={styles.dashboardJobContent}>
        <Text style={styles.dashboardJobTime}>
          {time}
        </Text>

        <Text style={styles.dashboardJobTitle}>
          {service}
        </Text>

        <Text style={styles.dashboardJobLocation}>
          {location}
        </Text>
      </View>

      <View>
        <View
          style={[
            styles.smallStatusBadge,
            {
              backgroundColor: `${color}15`,
              borderColor: `${color}35`,
            },
          ]}
        >
          <Text
            style={[
              styles.smallStatusText,
              { color },
            ]}
          >
            {status}
          </Text>
        </View>

        <ChevronRight
          size={17}
          color="#475569"
          style={styles.jobChevron}
        />
      </View>
    </TouchableOpacity>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.quickAction}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={styles.quickActionIcon}>
        {icon}
      </View>

      <Text style={styles.quickActionLabel}>
        {label}
      </Text>
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

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 27,
  },

  profileRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  greeting: {
    color: "#64748B",
    fontSize: 10,
  },

  name: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  onlineBadge: {
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.19)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
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

  notificationButton: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    right: 8,
    top: 8,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 11,
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 18,
  },

  statCard: {
    width: "48.5%",
    minHeight: 90,
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
    fontSize: 10,
    marginTop: 5,
  },

  earningsCard: {
    minHeight: 108,
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 25,
  },

  earningsLabel: {
    color: "#64748B",
    fontSize: 9,
  },

  earningsValue: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 4,
  },

  earningsGrowth: {
    color: "#22C55E",
    fontSize: 9,
    marginTop: 6,
  },

  ratingBox: {
    width: 76,
    height: 76,
    borderRadius: 16,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
  },

  ratingValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 3,
  },

  ratingLabel: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 2,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  viewAll: {
    color: "#22C55E",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 11,
  },

  nextJobCard: {
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 15,
    marginBottom: 25,
  },

  jobHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  jobIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  jobHeaderContent: {
    flex: 1,
  },

  jobTime: {
    color: "#F59E0B",
    fontSize: 9,
    fontWeight: "700",
  },

  jobTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },

  jobId: {
    color: "#475569",
    fontSize: 8,
    marginTop: 3,
  },

  highBadge: {
    height: 28,
    borderRadius: 9,
    backgroundColor: "rgba(249,115,22,0.08)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.22)",
    paddingHorizontal: 8,
    justifyContent: "center",
  },

  highText: {
    color: "#F97316",
    fontSize: 8,
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginVertical: 14,
  },

  customerRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  smallAvatar: {
    width: 37,
    height: 37,
    borderRadius: 19,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  customerContent: {
    flex: 1,
  },

  infoLabel: {
    color: "#64748B",
    fontSize: 8,
  },

  customerName: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
  },

  locationText: {
    color: "#94A3B8",
    fontSize: 10,
    marginLeft: 7,
  },

  jobActions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 15,
  },

  detailsButton: {
    flex: 1,
    height: 45,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#26364D",
    alignItems: "center",
    justifyContent: "center",
  },

  detailsButtonText: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "700",
  },

  navigationButton: {
    flex: 1,
    height: 45,
    borderRadius: 11,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  navigationButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },

  jobsCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    overflow: "hidden",
    marginBottom: 25,
  },

  dashboardJob: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 12,
  },

  dashboardJobIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  dashboardJobContent: {
    flex: 1,
  },

  dashboardJobTime: {
    color: "#64748B",
    fontSize: 8,
  },

  dashboardJobTitle: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  dashboardJobLocation: {
    color: "#475569",
    fontSize: 8,
    marginTop: 3,
  },

  smallStatusBadge: {
    minHeight: 25,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    justifyContent: "center",
  },

  smallStatusText: {
    fontSize: 8,
    fontWeight: "700",
  },

  jobChevron: {
    alignSelf: "flex-end",
    marginTop: 9,
  },

  jobDivider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 66,
  },

  quickActions: {
    flexDirection: "row",
    gap: 9,
  },

  quickAction: {
    flex: 1,
    minHeight: 104,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },

  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
  },

  quickActionLabel: {
    color: "#CBD5E1",
    fontSize: 9,
    fontWeight: "600",
    marginTop: 8,
  },
});