import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  CircleAlert,
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

type RequestStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

type FilterType =
  | "all"
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed";

type RequestItem = {
  id: string;
  service: string;
  date: string;
  time: string;
  priority: "Low" | "Medium" | "High" | "Emergency";
  status: RequestStatus;
};

const requestData: RequestItem[] = [
  {
    id: "REQ-2026-0012",
    service: "AC Repair",
    date: "20 May 2026",
    time: "10:00 AM",
    priority: "High",
    status: "in_progress",
  },
  {
    id: "REQ-2026-0011",
    service: "Washing Machine Repair",
    date: "19 May 2026",
    time: "02:30 PM",
    priority: "Medium",
    status: "assigned",
  },
  {
    id: "REQ-2026-0010",
    service: "Electrical Installation",
    date: "18 May 2026",
    time: "10:00 AM",
    priority: "Low",
    status: "completed",
  },
  {
    id: "REQ-2026-0009",
    service: "Plumbing Service",
    date: "16 May 2026",
    time: "08:30 AM",
    priority: "Emergency",
    status: "cancelled",
  },
  {
    id: "REQ-2026-0008",
    service: "Refrigerator Repair",
    date: "22 May 2026",
    time: "11:30 AM",
    priority: "Medium",
    status: "pending",
  },
];

export default function BookingsScreen() {
  const [selectedFilter, setSelectedFilter] =
    useState<FilterType>("all");

  const filteredRequests = useMemo(() => {
    if (selectedFilter === "all") {
      return requestData;
    }

    return requestData.filter(
      (request) => request.status === selectedFilter
    );
  }, [selectedFilter]);

  const handleOpenRequest = (request: RequestItem) => {
    router.push({
      pathname: "/request-details",
      params: {
        id: request.id,
      },
    });
  };

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
          <View>
            <Text style={styles.title}>
              My Requests
            </Text>

            <Text style={styles.subtitle}>
              Track and manage your service requests
            </Text>
          </View>

          <TouchableOpacity
            style={styles.newButton}
            activeOpacity={0.85}
            onPress={() => router.push("/create-request")}
          >
            <Text style={styles.newButtonText}>
              + New
            </Text>
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <SummaryCard
            label="Pending"
            value="1"
            color="#F59E0B"
          />

          <SummaryCard
            label="Assigned"
            value="1"
            color="#3B82F6"
          />

          <SummaryCard
            label="Active"
            value="1"
            color="#22C55E"
          />
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          <FilterButton
            label="All"
            active={selectedFilter === "all"}
            onPress={() => setSelectedFilter("all")}
          />

          <FilterButton
            label="Pending"
            active={selectedFilter === "pending"}
            onPress={() => setSelectedFilter("pending")}
          />

          <FilterButton
            label="Assigned"
            active={selectedFilter === "assigned"}
            onPress={() => setSelectedFilter("assigned")}
          />

          <FilterButton
            label="In Progress"
            active={selectedFilter === "in_progress"}
            onPress={() => setSelectedFilter("in_progress")}
          />

          <FilterButton
            label="Completed"
            active={selectedFilter === "completed"}
            onPress={() => setSelectedFilter("completed")}
          />
        </ScrollView>

        {/* Section Header */}
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>
            Service Requests
          </Text>

          <Text style={styles.resultCount}>
            {filteredRequests.length} request
            {filteredRequests.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {/* Requests */}
        {filteredRequests.length > 0 ? (
          <View style={styles.requestList}>
            {filteredRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onPress={() => handleOpenRequest(request)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Wrench
                size={35}
                color="#64748B"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No Requests Found
            </Text>

            <Text style={styles.emptyText}>
              There are no service requests in this category.
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
      <Text
        style={[
          styles.summaryValue,
          { color },
        ]}
      >
        {value}
      </Text>

      <Text style={styles.summaryLabel}>
        {label}
      </Text>
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
  onPress,
}: {
  request: RequestItem;
  onPress: () => void;
}) {
  const status = getStatusConfig(request.status);
  const priorityColor = getPriorityColor(request.priority);

  return (
    <TouchableOpacity
      style={styles.requestCard}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={styles.requestTopRow}>
        <View style={styles.serviceIcon}>
          {request.status === "completed" ? (
            <CheckCircle2
              size={23}
              color="#22C55E"
            />
          ) : request.status === "cancelled" ? (
            <CircleAlert
              size={23}
              color="#EF4444"
            />
          ) : (
            <Wrench
              size={23}
              color="#60A5FA"
            />
          )}
        </View>

        <View style={styles.requestContent}>
          <Text style={styles.serviceName}>
            {request.service}
          </Text>

          <Text style={styles.requestId}>
            {request.id}
          </Text>
        </View>

        <ChevronRight
          size={20}
          color="#475569"
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.requestInfoRow}>
        <View style={styles.dateRow}>
          <Clock3
            size={15}
            color="#64748B"
          />

          <Text style={styles.dateText}>
            {request.date} • {request.time}
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
            {request.priority}
          </Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: `${status.color}15`,
              borderColor: `${status.color}40`,
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: status.color },
            ]}
          />

          <Text
            style={[
              styles.statusText,
              { color: status.color },
            ]}
          >
            {status.label}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function getStatusConfig(status: RequestStatus) {
  switch (status) {
    case "pending":
      return {
        label: "Pending",
        color: "#F59E0B",
      };

    case "assigned":
      return {
        label: "Assigned",
        color: "#3B82F6",
      };

    case "in_progress":
      return {
        label: "In Progress",
        color: "#22C55E",
      };

    case "completed":
      return {
        label: "Completed",
        color: "#22C55E",
      };

    case "cancelled":
      return {
        label: "Cancelled",
        color: "#EF4444",
      };
  }
}

function getPriorityColor(priority: RequestItem["priority"]) {
  switch (priority) {
    case "Low":
      return "#22C55E";

    case "Medium":
      return "#F59E0B";

    case "High":
      return "#F97316";

    case "Emergency":
      return "#EF4444";
  }
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
    paddingTop: 56,
    paddingBottom: 120,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },

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

  summaryValue: {
    fontSize: 22,
    fontWeight: "800",
  },

  summaryLabel: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 4,
  },

  filterContainer: {
    gap: 8,
    paddingBottom: 24,
  },

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

  filterTextActive: {
    color: "#FFFFFF",
  },

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

  resultCount: {
    color: "#64748B",
    fontSize: 10,
  },

  requestList: {
    gap: 12,
  },

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

  requestContent: {
    flex: 1,
  },

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

  priorityText: {
    fontSize: 9,
    fontWeight: "700",
  },

  statusRow: {
    flexDirection: "row",
    marginTop: 12,
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

  statusText: {
    fontSize: 9,
    fontWeight: "700",
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