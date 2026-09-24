import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock3,
  ClipboardPlus,
  MapPin,
  Plus,
  Star,
  Wrench,
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

import {
  ACTIVE_REQUEST_STATUSES,
  SERVICE_CATEGORIES,
  getRequestStatusColor,
  getRequestStatusLabel,
} from "@/src/constants/serviceRequests";
import { auth } from "@/src/firebase/config";
import {
  formatRequestDate,
  ServiceRequest,
  subscribeToCustomerRequests,
} from "@/src/services/request.service";
import {
  CustomerNotification,
  subscribeToCustomerNotifications,
} from "@/src/services/notification.service";
import {
  getTechnicianDivision,
  getUserProfile,
  UserProfile,
} from "@/src/services/user.service";
import {
  PublicTechnicianProfile,
  subscribeToApprovedTechnicians,
} from "@/src/services/technician.service";

export default function HomeScreen() {
  const [profile, setProfile] =
    useState<UserProfile | null>(null);
  const [requests, setRequests] = useState<
    ServiceRequest[]
  >([]);
  const [notifications, setNotifications] = useState<
    CustomerNotification[]
  >([]);
  const [technicians, setTechnicians] = useState<
    PublicTechnicianProfile[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setLoading(false);
      setErrorMessage("Please sign in again.");
      return;
    }

    const customerId = currentUser.uid;

    let unsubscribeRequests: (() => void) | undefined;
    let unsubscribeNotifications:
      | (() => void)
      | undefined;
    let unsubscribeTechnicians: (() => void) | undefined;

    async function loadCustomer() {
      try {
        const userProfile = await getUserProfile(
          customerId
        );

        if (!userProfile) {
          setErrorMessage("Customer profile not found.");
          setLoading(false);
          return;
        }

        setProfile(userProfile);

        unsubscribeRequests =
          subscribeToCustomerRequests(
            customerId,
            (items) => {
              setRequests(items);
              setLoading(false);
            },
            (error) => {
              console.error(
                "Dashboard requests subscription error:",
                error
              );
              setErrorMessage(
                "Unable to load service requests."
              );
              setLoading(false);
            }
          );

        unsubscribeNotifications =
          subscribeToCustomerNotifications(
            customerId,
            setNotifications,
            (error) => {
              console.error(
                "Dashboard notifications subscription error:",
                error
              );
            }
          );

        unsubscribeTechnicians =
          subscribeToApprovedTechnicians(
            setTechnicians,
            (error) => {
              console.error(
                "Dashboard technicians subscription error:",
                error
              );
            }
          );
      } catch (error) {
        console.error("Dashboard load error:", error);
        setErrorMessage("Unable to load dashboard.");
        setLoading(false);
      }
    }

    loadCustomer();

    return () => {
      unsubscribeRequests?.();
      unsubscribeNotifications?.();
      unsubscribeTechnicians?.();
    };
  }, []);

  const counts = useMemo(() => {
    return {
      active: requests.filter((request) =>
        ACTIVE_REQUEST_STATUSES.includes(request.status)
      ).length,
      pending: requests.filter(
        (request) =>
          request.status === "requested" ||
          request.status === "pending"
      ).length,
      completed: requests.filter(
        (request) => request.status === "completed"
      ).length,
      cancelled: requests.filter(
        (request) => request.status === "cancelled"
      ).length,
    };
  }, [requests]);

  const unreadCount = notifications.filter(
    (item) => !item.read
  ).length;

  const recentRequests = requests.slice(0, 3);
  const topTechnicians = technicians.slice(0, 3);
  const customerDivision = profile
    ? getTechnicianDivision(profile)
    : "";
  const sameDivisionTechnicians = technicians
    .filter(
      (technician) =>
        technician.serviceDivision === customerDivision
    )
    .slice(0, 3);

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
            <Text style={styles.greeting}>
              Welcome, {profile?.fullName || "Customer"}
            </Text>
            <Text style={styles.subGreeting}>
              Find approved technicians and request service directly.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.notificationButton}
            activeOpacity={0.8}
            onPress={() => router.push("/notifications")}
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

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroTitle}>
            Choose an approved technician for your next service.
          </Text>
          <Text style={styles.heroSubtitle}>
            Browse by category, division, rating, and experience.
          </Text>
          <TouchableOpacity
            style={styles.newRequestButton}
            activeOpacity={0.85}
            onPress={() => router.push("/technicians")}
          >
            <Plus size={20} color="#FFFFFF" />
            <Text style={styles.newRequestButtonText}>
              Browse Technicians
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            value={String(counts.active)}
            label="Active"
            accent="#3B82F6"
          />
          <StatCard
            value={String(counts.pending)}
            label="Requested"
            accent="#F59E0B"
          />
          <StatCard
            value={String(counts.completed)}
            label="Completed"
            accent="#22C55E"
          />
          <StatCard
            value={String(counts.cancelled)}
            label="Cancelled"
            accent="#EF4444"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Service Categories
          </Text>
        </View>
        <View style={styles.categoryGrid}>
          {SERVICE_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={styles.categoryCard}
              activeOpacity={0.82}
              onPress={() =>
                router.push({
                  pathname: "/technicians",
                  params: { category },
                })
              }
            >
              <Wrench size={18} color="#60A5FA" />
              <Text style={styles.categoryText}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TechnicianSection
          title="Top Rated Technicians"
          technicians={topTechnicians}
        />

        <TechnicianSection
          title="Same Division Technicians"
          technicians={sameDivisionTechnicians}
          emptyText="No approved technicians found in your division yet."
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Recent Requests
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push("/bookings")}
          >
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        {recentRequests.length > 0 ? (
          <View style={styles.requestsCard}>
            {recentRequests.map((request, index) => (
              <View key={request.id}>
                <RequestRow request={request} />
                {index < recentRequests.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <ClipboardPlus
              size={34}
              color="#64748B"
            />
            <Text style={styles.emptyTitle}>
              No service requests yet.
            </Text>
            <Text style={styles.emptyText}>
              Need help with something? Create your first
              service request.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              activeOpacity={0.85}
              onPress={() => router.push("/create-request")}
            >
              <Text style={styles.emptyButtonText}>
                Create Request
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
      <Text style={[styles.statValue, { color: accent }]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RequestRow({
  request,
}: {
  request: ServiceRequest;
}) {
  const color = getRequestStatusColor(request.status);

  return (
    <TouchableOpacity
      style={styles.requestRow}
      activeOpacity={0.78}
      onPress={() =>
        router.push({
          pathname: "/request-details",
          params: { id: request.id },
        })
      }
    >
      <View style={styles.requestIcon}>
        {request.status === "completed" ? (
          <CheckCircle2 size={19} color="#22C55E" />
        ) : request.status === "pending" ||
          request.status === "requested" ? (
          <Clock3 size={19} color="#F59E0B" />
        ) : (
          <Wrench size={19} color="#94A3B8" />
        )}
      </View>

      <View style={styles.requestContent}>
        <Text style={styles.requestTitle}>
          {request.title}
        </Text>
        <Text style={styles.requestId}>
          {request.serviceCategory}
        </Text>
        <Text style={styles.requestSubtitle}>
          {formatRequestDate(request.createdAt)}
          {request.technicianName
            ? ` • ${request.technicianName}`
            : request.assignedTechnicianName
              ? ` • ${request.assignedTechnicianName}`
              : " • Technician unavailable"}
        </Text>
      </View>

      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor: `${color}18`,
            borderColor: `${color}40`,
          },
        ]}
      >
        <Text style={[styles.statusText, { color }]}>
          {getRequestStatusLabel(request.status)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function TechnicianSection({
  title,
  technicians,
  emptyText = "Approved technicians will appear here.",
}: {
  title: string;
  technicians: PublicTechnicianProfile[];
  emptyText?: string;
}) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push("/technicians")}
        >
          <Text style={styles.viewAllText}>View All</Text>
        </TouchableOpacity>
      </View>

      {technicians.length > 0 ? (
        <View style={styles.technicianList}>
          {technicians.map((technician) => (
            <TouchableOpacity
              key={technician.uid}
              style={styles.technicianMiniCard}
              activeOpacity={0.82}
              onPress={() =>
                router.push({
                  pathname: "/technician-profile",
                  params: { id: technician.uid },
                })
              }
            >
              <View style={styles.technicianAvatar}>
                <Wrench size={20} color="#FFFFFF" />
              </View>
              <View style={styles.technicianMiniContent}>
                <Text style={styles.technicianMiniName}>
                  {technician.fullName}
                </Text>
                <Text style={styles.technicianMiniMeta}>
                  {technician.specialization}
                </Text>
                <View style={styles.technicianMiniRow}>
                  <MapPin size={12} color="#22D3EE" />
                  <Text style={styles.technicianMiniDivision}>
                    {technician.serviceDivision}
                  </Text>
                </View>
              </View>
              <View style={styles.technicianRating}>
                <Star
                  size={13}
                  color="#F59E0B"
                  fill={
                    technician.averageRating > 0
                      ? "#F59E0B"
                      : "transparent"
                  }
                />
                <Text style={styles.technicianRatingText}>
                  {technician.averageRating > 0
                    ? technician.averageRating.toFixed(1)
                    : "New"}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.technicianEmptyCard}>
          <Text style={styles.technicianEmptyText}>
            {emptyText}
          </Text>
        </View>
      )}
    </>
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
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
    gap: 14,
  },
  headerText: { flex: 1 },
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
  heroCard: {
    minHeight: 178,
    backgroundColor: "#0D1B2A",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#17263A",
    paddingHorizontal: 18,
    paddingVertical: 20,
    overflow: "hidden",
    marginBottom: 22,
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
    maxWidth: 290,
  },
  heroSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    maxWidth: 290,
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
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 26,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 24,
  },
  categoryCard: {
    width: "48.5%",
    minHeight: 78,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  categoryText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 8,
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
  statValue: { fontSize: 24, fontWeight: "800" },
  statLabel: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 5,
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
  requestsCard: {
    backgroundColor: "#0D1B2A",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#17263A",
    overflow: "hidden",
    marginBottom: 24,
  },
  requestRow: {
    minHeight: 94,
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
  requestContent: { flex: 1 },
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
    maxWidth: 116,
  },
  statusText: { fontSize: 9, fontWeight: "700" },
  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 72,
  },
  technicianList: {
    gap: 10,
    marginBottom: 24,
  },
  technicianMiniCard: {
    minHeight: 92,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },
  technicianAvatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  technicianMiniContent: { flex: 1 },
  technicianMiniName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  technicianMiniMeta: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 4,
  },
  technicianMiniRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 5,
  },
  technicianMiniDivision: {
    color: "#64748B",
    fontSize: 9,
    flex: 1,
  },
  technicianRating: {
    width: 56,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
  },
  technicianRatingText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
  technicianEmptyCard: {
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    justifyContent: "center",
    paddingHorizontal: 15,
    marginBottom: 24,
  },
  technicianEmptyText: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
  emptyCard: {
    minHeight: 270,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 14,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 7,
  },
  emptyButton: {
    height: 44,
    borderRadius: 11,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 18,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
