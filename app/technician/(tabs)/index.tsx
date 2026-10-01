import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Navigation,
  Star,
  UserRound,
  Wrench,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTechnicianWorkspace } from "@/src/hooks/useTechnicianWorkspace";
import { auth } from "@/src/firebase/config";
import {
  NotificationCenterItem,
  subscribeToNotificationCenter,
} from "@/src/services/notification.service";
import { ServiceRequest } from "@/src/services/request.service";
import {
  getActiveTechnicianRequests,
  getCompletedTechnicianRequests,
  getRequestDisplayTitle,
  getRequestScheduleDate,
  getRequestTimeLabel,
  getRatingLabel,
  getStatusUi,
  getUpcomingTechnicianRequests,
  isCurrentOrFutureRequest,
  isRequestScheduledToday,
  sortRequestsBySchedule,
} from "@/src/utils/technicianRequests";

export default function TechnicianDashboard() {
  const { profile, requests, loading, errorMessage } =
    useTechnicianWorkspace();
  const [notifications, setNotifications] = useState<NotificationCenterItem[]>(
    []
  );

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser || !profile || profile.role !== "technician") {
      return;
    }

    return subscribeToNotificationCenter(
      {
        userId: currentUser.uid,
        role: "technician",
      },
      setNotifications,
      (error, context) =>
        console.error(
          "Technician notification badge error:",
          context.queryType,
          error
        )
    );
  }, [profile]);

  const activeRequests = getActiveTechnicianRequests(requests);
  const todayRequests = sortRequestsBySchedule(
    activeRequests.filter(isRequestScheduledToday)
  );
  const upcomingRequests = getUpcomingTechnicianRequests(requests);
  const nextJobRequests = sortRequestsBySchedule(
    activeRequests.filter(isCurrentOrFutureRequest)
  );
  const completedRequests = getCompletedTechnicianRequests(requests);
  const inProgressCount = requests.filter(
    (request) => request.status === "in_progress"
  ).length;
  const nextJob = nextJobRequests[0] ?? null;
  const pendingRequests = requests.filter(
    (request) => request.status === "requested"
  );
  const unreadCount = notifications.filter((item) => !item.read).length;
  const upcomingSoon = nextJobRequests.find((request) => {
    const scheduleDate = getRequestScheduleDate(request);

    if (!scheduleDate) {
      return false;
    }

    const minutesUntil =
      (scheduleDate.getTime() - Date.now()) / (1000 * 60);
    return minutesUntil > 0 && minutesUntil <= 60;
  });

  if (loading) {
    return <LoadingState />;
  }

  if (errorMessage || !profile) {
    return (
      <ScreenState
        title="Dashboard unavailable"
        message={
          errorMessage ||
          "Unable to load your technician dashboard."
        }
      />
    );
  }

  const ratingLabel = getRatingLabel(
    Number(profile.averageRating ?? 0),
    Number(profile.reviewCount ?? 0)
  );

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
        <View style={styles.header}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              {profile.profilePhotoUrl ? (
                <Image
                  source={{ uri: profile.profilePhotoUrl }}
                  style={styles.avatarImage}
                />
              ) : (
                <UserRound size={24} color="#FFFFFF" />
              )}
            </View>

            <View style={styles.profileText}>
              <Text style={styles.greeting}>Good morning,</Text>

              <Text style={styles.name} numberOfLines={1}>
                {profile.fullName || "Service Technician"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.notificationButton}
            activeOpacity={0.8}
            onPress={() =>
              router.push("/technician/notifications" as never)
            }
          >
            <Bell size={20} color="#FFFFFF" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {pendingRequests.length > 0 && (
          <ReminderCard
            tone="warning"
            title="Request Response Needed"
            message={`${pendingRequests.length} service request${
              pendingRequests.length === 1 ? " is" : "s are"
            } waiting for your response.`}
            buttonLabel="Review Request"
            onPress={() =>
              router.push({
                pathname: "/technician/job-details",
                params: { id: pendingRequests[0].id },
              })
            }
          />
        )}

        {todayRequests.length > 0 && (
          <ReminderCard
            tone="info"
            title="Today's Service Reminder"
            message={`You have a service scheduled for ${getRequestTimeLabel(
              todayRequests[0]
            )} today.`}
            buttonLabel="View Job"
            onPress={() =>
              router.push({
                pathname: "/technician/job-details",
                params: { id: todayRequests[0].id },
              })
            }
          />
        )}

        {upcomingSoon && (
          <ReminderCard
            tone="success"
            title="Upcoming Service"
            message={`Your scheduled service begins in ${Math.max(
              1,
              Math.round(
                ((getRequestScheduleDate(upcomingSoon)?.getTime() ?? Date.now()) -
                  Date.now()) /
                  (1000 * 60)
              )
            )} minutes.`}
            buttonLabel="Open Job"
            onPress={() =>
              router.push({
                pathname: "/technician/job-details",
                params: { id: upcomingSoon.id },
              })
            }
          />
        )}

        <Text style={styles.sectionTitle}>Today&apos;s Overview</Text>

        <View style={styles.statsGrid}>
          <StatCard
            value={String(todayRequests.length)}
            label="Today's Jobs"
            color="#F59E0B"
          />

          <StatCard
            value={String(inProgressCount)}
            label="In Progress"
            color="#3B82F6"
          />

          <StatCard
            value={String(upcomingRequests.length)}
            label="Upcoming"
            color="#22D3EE"
          />

          <StatCard
            value={String(completedRequests.length)}
            label="Completed"
            color="#22C55E"
          />
        </View>

        <View style={styles.ratingCard}>
          <View style={styles.ratingSummary}>
            <Text style={styles.ratingSectionLabel}>
              Technician Rating
            </Text>

            <Text style={styles.ratingSummaryValue}>
              {ratingLabel}
            </Text>

            <Text style={styles.ratingSectionHint}>
              Based on customer reviews
            </Text>
          </View>

          <View style={styles.ratingBox}>
            <Star
              size={20}
              color="#F59E0B"
              fill={
                Number(profile.averageRating ?? 0) > 0
                  ? "#F59E0B"
                  : "transparent"
              }
            />

            <Text style={styles.ratingValue}>
              {Number(profile.averageRating ?? 0) > 0
                ? Number(profile.averageRating).toFixed(1)
                : "0"}
            </Text>

            <Text style={styles.ratingLabel}>Rating</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Next Job</Text>

          <TouchableOpacity
            onPress={() => router.push("/technician/jobs")}
          >
            <Text style={styles.viewAll}>See All</Text>
          </TouchableOpacity>
        </View>

        {nextJob ? (
          <NextJobCard request={nextJob} />
        ) : (
          <EmptyCard message="No upcoming jobs." />
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today&apos;s Jobs</Text>

          <TouchableOpacity
            onPress={() => router.push("/technician/jobs")}
          >
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.jobsCard}>
          {todayRequests.length > 0 ? (
            todayRequests.slice(0, 3).map((request, index) => (
              <View key={request.id}>
                {index > 0 && <View style={styles.jobDivider} />}
                <DashboardJob request={request} />
              </View>
            ))
          ) : (
            <Text style={styles.jobsEmptyText}>
              No jobs scheduled for today.
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <View style={styles.quickActions}>
          <QuickAction
            icon={
              <BriefcaseBusiness size={21} color="#60A5FA" />
            }
            label="My Jobs"
            onPress={() => router.push("/technician/jobs")}
          />

          <QuickAction
            icon={<Navigation size={21} color="#22C55E" />}
            label="Navigation"
            onPress={() =>
              nextJob
                ? router.push({
                    pathname: "/technician/navigation",
                    params: { id: nextJob.id },
                  })
                : router.push("/technician/jobs")
            }
          />

          <QuickAction
            icon={<CheckCircle2 size={21} color="#A78BFA" />}
            label="Completed"
            onPress={() => router.push("/technician/history")}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.stateScreen}>
      <ActivityIndicator color="#22C55E" />
      <Text style={styles.stateText}>Loading dashboard...</Text>
    </View>
  );
}

function ScreenState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={styles.stateScreen}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyCardText}>{message}</Text>
    </View>
  );
}

function NextJobCard({ request }: { request: ServiceRequest }) {
  const priority = request.priority === "urgent" ? "Urgent" : "Normal";

  return (
    <View style={styles.nextJobCard}>
      <View style={styles.jobHeader}>
        <View style={styles.jobIcon}>
          <Wrench size={23} color="#60A5FA" />
        </View>

        <View style={styles.jobHeaderContent}>
          <Text style={styles.jobTime}>
            {getRequestTimeLabel(request)}
          </Text>

          <Text style={styles.jobTitle} numberOfLines={1}>
            {getRequestDisplayTitle(request)}
          </Text>

          <Text style={styles.jobId}>{request.id}</Text>
        </View>

        <View style={styles.highBadge}>
          <Text style={styles.highText}>{priority}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.customerRow}>
        <View style={styles.smallAvatar}>
          <UserRound size={17} color="#CBD5E1" />
        </View>

        <View style={styles.customerContent}>
          <Text style={styles.infoLabel}>Customer</Text>
          <Text style={styles.customerName}>
            {request.customerName || "Customer"}
          </Text>
        </View>
      </View>

      <View style={styles.locationRow}>
        <MapPin size={17} color="#64748B" />

        <Text style={styles.locationText}>
          {request.address || "Address not provided"}
        </Text>
      </View>

      <View style={styles.jobActions}>
        <TouchableOpacity
          style={styles.detailsButton}
          activeOpacity={0.8}
          onPress={() =>
            router.push({
              pathname: "/technician/job-details",
              params: { id: request.id },
            })
          }
        >
          <Text style={styles.detailsButtonText}>View Details</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navigationButton}
          activeOpacity={0.8}
          onPress={() =>
            router.push({
              pathname: "/technician/navigation",
              params: { id: request.id },
            })
          }
        >
          <Navigation size={17} color="#FFFFFF" />
          <Text style={styles.navigationButtonText}>Navigate</Text>
        </TouchableOpacity>
      </View>
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
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DashboardJob({ request }: { request: ServiceRequest }) {
  const status = getStatusUi(request.status);

  return (
    <TouchableOpacity
      style={styles.dashboardJob}
      activeOpacity={0.8}
      onPress={() =>
        router.push({
          pathname: "/technician/job-details",
          params: { id: request.id },
        })
      }
    >
      <View style={styles.dashboardJobIcon}>
        <Wrench size={18} color="#94A3B8" />
      </View>

      <View style={styles.dashboardJobContent}>
        <Text style={styles.dashboardJobTime}>
          {getRequestTimeLabel(request)}
        </Text>

        <Text style={styles.dashboardJobTitle} numberOfLines={1}>
          {getRequestDisplayTitle(request)}
        </Text>

        <Text style={styles.dashboardJobLocation} numberOfLines={1}>
          {request.address || "Address not provided"}
        </Text>
      </View>

      <View>
        <View
          style={[
            styles.smallStatusBadge,
            {
              backgroundColor: `${status.color}15`,
              borderColor: `${status.color}35`,
            },
          ]}
        >
          <Text
            style={[
              styles.smallStatusText,
              { color: status.color },
            ]}
          >
            {status.label}
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
      <View style={styles.quickActionIcon}>{icon}</View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ReminderCard({
  tone,
  title,
  message,
  buttonLabel,
  onPress,
}: {
  tone: "warning" | "info" | "success";
  title: string;
  message: string;
  buttonLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={[styles.reminderCard, getReminderStyle(tone)]}>
      <View style={styles.reminderContent}>
        <Text style={styles.reminderTitle}>{title}</Text>
        <Text style={styles.reminderMessage}>{message}</Text>
      </View>
      <TouchableOpacity style={styles.reminderButton} onPress={onPress}>
        <Text style={styles.reminderButtonText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function getReminderStyle(tone: "warning" | "info" | "success") {
  if (tone === "warning") {
    return styles.reminder_warning;
  }

  if (tone === "success") {
    return styles.reminder_success;
  }

  return styles.reminder_info;
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
    marginBottom: 8,
    textAlign: "center",
  },
  stateText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 27,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  profileText: { flex: 1 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  greeting: { color: "#64748B", fontSize: 10 },
  name: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
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
  notificationBadge: {
    position: "absolute",
    top: 5,
    right: 5,
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
  reminderCard: {
    minHeight: 92,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 14,
  },
  reminder_warning: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.24)",
  },
  reminder_info: {
    backgroundColor: "rgba(59,130,246,0.08)",
    borderColor: "rgba(59,130,246,0.22)",
  },
  reminder_success: {
    backgroundColor: "rgba(34,197,94,0.07)",
    borderColor: "rgba(34,197,94,0.20)",
  },
  reminderContent: { flex: 1 },
  reminderTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  reminderMessage: {
    color: "#CBD5E1",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 5,
  },
  reminderButton: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: "#101F30",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  reminderButtonText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
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
  statValue: { fontSize: 24, fontWeight: "800" },
  statLabel: { color: "#94A3B8", fontSize: 10, marginTop: 5 },
  ratingCard: {
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
    gap: 12,
  },
  ratingSummary: { flex: 1 },
  ratingSectionLabel: { color: "#64748B", fontSize: 9 },
  ratingSummaryValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  ratingSectionHint: {
    color: "#94A3B8",
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
  ratingLabel: { color: "#64748B", fontSize: 8, marginTop: 2 },
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
  emptyCard: {
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 18,
    marginBottom: 25,
  },
  emptyCardText: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
  },
  jobHeader: { flexDirection: "row", alignItems: "center" },
  jobIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  jobHeaderContent: { flex: 1 },
  jobTime: { color: "#F59E0B", fontSize: 9, fontWeight: "700" },
  jobTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  jobId: { color: "#475569", fontSize: 8, marginTop: 3 },
  highBadge: {
    height: 28,
    borderRadius: 9,
    backgroundColor: "rgba(249,115,22,0.08)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.22)",
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  highText: { color: "#F97316", fontSize: 8, fontWeight: "700" },
  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginVertical: 14,
  },
  customerRow: { flexDirection: "row", alignItems: "center" },
  smallAvatar: {
    width: 37,
    height: 37,
    borderRadius: 19,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  customerContent: { flex: 1 },
  infoLabel: { color: "#64748B", fontSize: 8 },
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
    flex: 1,
  },
  jobActions: { flexDirection: "row", gap: 9, marginTop: 15 },
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
  jobsEmptyText: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
    padding: 18,
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
  dashboardJobContent: { flex: 1 },
  dashboardJobTime: { color: "#64748B", fontSize: 8 },
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
  smallStatusText: { fontSize: 8, fontWeight: "700" },
  jobChevron: { alignSelf: "flex-end", marginTop: 9 },
  jobDivider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 66,
  },
  quickActions: { flexDirection: "row", gap: 9 },
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
