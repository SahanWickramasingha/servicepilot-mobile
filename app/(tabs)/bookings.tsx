import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
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
  getPriorityColor,
  getPriorityLabel,
  getRequestStatusColor,
  getRequestStatusLabel,
  RequestStatus,
} from "@/src/constants/serviceRequests";
import { auth } from "@/src/firebase/config";
import {
  formatRequestDate,
  ServiceRequest,
  subscribeToCustomerRequests,
} from "@/src/services/request.service";

type FilterType =
  | "all"
  | "requested"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed"
  | "cancelled";

export default function BookingsScreen() {
  const [selectedFilter, setSelectedFilter] =
    useState<FilterType>("all");
  const [requests, setRequests] = useState<
    ServiceRequest[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setErrorMessage("Please sign in again.");
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToCustomerRequests(
      currentUser.uid,
      (items) => {
        setRequests(items);
        setLoading(false);
      },
      (error) => {
        console.error(
          "Requests subscription error:",
          error
        );
        setErrorMessage(
          "Unable to load your service requests."
        );
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const filteredRequests = useMemo(() => {
    if (selectedFilter === "all") {
      return requests;
    }

    if (selectedFilter === "requested") {
      return requests.filter((request) =>
        ["requested", "pending"].includes(request.status)
      );
    }

    if (selectedFilter === "accepted") {
      return requests.filter((request) =>
        ["accepted", "assigned"].includes(request.status)
      );
    }

    return requests.filter(
      (request) => request.status === selectedFilter
    );
  }, [requests, selectedFilter]);

  const counts = useMemo(() => {
    return {
      pending: requests.filter(
        (item) =>
          item.status === "requested" ||
          item.status === "pending"
      ).length,
      active: requests.filter((item) =>
        ["accepted", "assigned", "in_progress"].includes(
          item.status
        )
      ).length,
      completed: requests.filter(
        (item) => item.status === "completed"
      ).length,
    };
  }, [requests]);

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
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>My Requests</Text>
            <Text style={styles.subtitle}>
              Track and manage your service requests
            </Text>
          </View>

          <TouchableOpacity
            style={styles.newButton}
            activeOpacity={0.85}
            onPress={() => router.push("/create-request")}
          >
            <Text style={styles.newButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={styles.summaryRow}>
          <SummaryCard
            label="Pending"
            value={String(counts.pending)}
            color="#F59E0B"
          />
          <SummaryCard
            label="Active"
            value={String(counts.active)}
            color="#3B82F6"
          />
          <SummaryCard
            label="Completed"
            value={String(counts.completed)}
            color="#22C55E"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {[
            ["all", "All"],
            ["requested", "Requested"],
            ["accepted", "Accepted"],
            ["in_progress", "In Progress"],
            ["completed", "Completed"],
            ["cancelled", "Cancelled"],
            ["rejected", "Rejected"],
          ].map(([value, label]) => (
            <FilterButton
              key={value}
              label={label}
              active={selectedFilter === value}
              onPress={() =>
                setSelectedFilter(value as FilterType)
              }
            />
          ))}
        </ScrollView>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>
            Service Requests
          </Text>
          <Text style={styles.resultCount}>
            {filteredRequests.length} request
            {filteredRequests.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {filteredRequests.length > 0 ? (
          <View style={styles.requestList}>
            {filteredRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Wrench size={35} color="#64748B" />
            </View>
            <Text style={styles.emptyTitle}>
              No Requests Found
            </Text>
            <Text style={styles.emptyText}>
              No service requests match this filter.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push("/create-request")}
            >
              <Text style={styles.emptyButtonText}>
                Create Service Request
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color }]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function FilterButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.filterButton,
        active && styles.filterButtonActive,
      ]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterText,
          active && styles.filterTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function RequestCard({
  request,
}: {
  request: ServiceRequest;
}) {
  const statusColor = getRequestStatusColor(request.status);
  const priorityColor = getPriorityColor(request.priority);
  const icon = getRequestIcon(request.status);

  return (
    <TouchableOpacity
      style={styles.requestCard}
      activeOpacity={0.8}
      onPress={() =>
        router.push({
          pathname: "/request-details",
          params: { id: request.id },
        })
      }
    >
      <View style={styles.requestTopRow}>
        <View style={styles.serviceIcon}>{icon}</View>
        <View style={styles.requestContent}>
          <Text style={styles.serviceName}>
            {request.title}
          </Text>
          <Text style={styles.requestId}>
            {request.serviceCategory}
          </Text>
        </View>
        <ChevronRight size={20} color="#475569" />
      </View>

      <View style={styles.divider} />

      <View style={styles.requestInfoRow}>
        <View style={styles.dateRow}>
          <Clock3 size={15} color="#64748B" />
          <Text style={styles.dateText}>
            {request.preferredDate}
            {request.preferredTime
              ? ` • ${request.preferredTime}`
              : ""}
          </Text>
        </View>
        <View
          style={[
            styles.priorityBadge,
            {
              backgroundColor: `${priorityColor}15`,
              borderColor: `${priorityColor}40`,
            },
          ]}
        >
          <Text
            style={[
              styles.priorityText,
              { color: priorityColor },
            ]}
          >
            {getPriorityLabel(request.priority)}
          </Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: `${statusColor}15`,
              borderColor: `${statusColor}40`,
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: statusColor },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: statusColor },
            ]}
          >
            {getRequestStatusLabel(request.status)}
          </Text>
        </View>
        <Text style={styles.createdText}>
          Created {formatRequestDate(request.createdAt)}
        </Text>
      </View>

      <Text style={styles.technicianText}>
        {request.assignedTechnicianName
          ? `Technician: ${request.assignedTechnicianName}`
          : request.technicianName
            ? `Technician: ${request.technicianName}`
            : "Technician unavailable"}
      </Text>
    </TouchableOpacity>
  );
}

function getRequestIcon(status: RequestStatus) {
  if (status === "completed") {
    return <CheckCircle2 size={23} color="#22C55E" />;
  }

  if (status === "cancelled") {
    return <CircleAlert size={23} color="#EF4444" />;
  }

  return <Wrench size={23} color="#60A5FA" />;
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
    paddingTop: 56,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
    gap: 12,
  },
  headerText: { flex: 1 },
  title: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 5,
  },
  newButton: {
    minWidth: 72,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  newButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
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
  summaryRow: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryValue: { fontSize: 22, fontWeight: "800" },
  summaryLabel: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 4,
  },
  filterContainer: { gap: 8, paddingBottom: 24 },
  filterButton: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E2D42",
    backgroundColor: "#0D1B2A",
    alignItems: "center",
    justifyContent: "center",
  },
  filterButtonActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  filterText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  filterTextActive: { color: "#FFFFFF" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "800",
  },
  resultCount: { color: "#64748B", fontSize: 10 },
  requestList: { gap: 12 },
  requestCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 17,
    padding: 15,
  },
  requestTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  requestContent: { flex: 1 },
  serviceName: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  requestId: {
    color: "#475569",
    fontSize: 9,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginVertical: 13,
  },
  requestInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dateText: {
    color: "#64748B",
    fontSize: 10,
    marginLeft: 6,
  },
  priorityBadge: {
    minHeight: 27,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityText: { fontSize: 9, fontWeight: "700" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 10,
  },
  statusBadge: {
    height: 29,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    marginRight: 6,
  },
  statusText: { fontSize: 9, fontWeight: "700" },
  createdText: {
    color: "#475569",
    fontSize: 9,
    flex: 1,
    textAlign: "right",
  },
  technicianText: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 10,
  },
  emptyCard: {
    minHeight: 300,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 7,
  },
  emptyButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
