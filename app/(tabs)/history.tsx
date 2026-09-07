import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleX,
  Clock3,
  ReceiptText,
  Star,
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

type HistoryStatus = "completed" | "cancelled";

type HistoryFilter = "all" | "completed" | "cancelled";

type HistoryItem = {
  id: string;
  service: string;
  date: string;
  time: string;
  amount: string;
  status: HistoryStatus;
  reviewed?: boolean;
};

const historyData: HistoryItem[] = [
  {
    id: "REQ-2026-0010",
    service: "Electrical Installation",
    date: "18 May 2026",
    time: "02:30 PM",
    amount: "Rs. 8,500",
    status: "completed",
    reviewed: false,
  },
  {
    id: "REQ-2026-0008",
    service: "AC Repair",
    date: "15 May 2026",
    time: "10:00 AM",
    amount: "Rs. 6,500",
    status: "completed",
    reviewed: true,
  },
  {
    id: "REQ-2026-0006",
    service: "Plumbing Service",
    date: "10 May 2026",
    time: "09:30 AM",
    amount: "Rs. 4,200",
    status: "completed",
    reviewed: true,
  },
  {
    id: "REQ-2026-0003",
    service: "TV Repair",
    date: "02 May 2026",
    time: "03:00 PM",
    amount: "Rs. 5,000",
    status: "cancelled",
  },
];

export default function HistoryScreen() {
  const [selectedFilter, setSelectedFilter] =
    useState<HistoryFilter>("all");

  const filteredHistory = useMemo(() => {
    if (selectedFilter === "all") {
      return historyData;
    }

    return historyData.filter(
      (item) => item.status === selectedFilter
    );
  }, [selectedFilter]);

  const completedCount = historyData.filter(
    (item) => item.status === "completed"
  ).length;

  const cancelledCount = historyData.filter(
    (item) => item.status === "cancelled"
  ).length;

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
              Service History
            </Text>

            <Text style={styles.subtitle}>
              View your completed and cancelled services
            </Text>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>
              {historyData.length}
            </Text>

            <Text style={styles.summaryLabel}>
              Total
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text
              style={[
                styles.summaryValue,
                { color: "#22C55E" },
              ]}
            >
              {completedCount}
            </Text>

            <Text style={styles.summaryLabel}>
              Completed
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text
              style={[
                styles.summaryValue,
                { color: "#EF4444" },
              ]}
            >
              {cancelledCount}
            </Text>

            <Text style={styles.summaryLabel}>
              Cancelled
            </Text>
          </View>
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          <FilterButton
            label="All"
            active={selectedFilter === "all"}
            onPress={() => setSelectedFilter("all")}
          />

          <FilterButton
            label="Completed"
            active={selectedFilter === "completed"}
            onPress={() => setSelectedFilter("completed")}
          />

          <FilterButton
            label="Cancelled"
            active={selectedFilter === "cancelled"}
            onPress={() => setSelectedFilter("cancelled")}
          />
        </View>

        {/* Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Previous Services
          </Text>

          <Text style={styles.resultCount}>
            {filteredHistory.length} record
            {filteredHistory.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {/* History */}
        <View style={styles.historyList}>
          {filteredHistory.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
            />
          ))}
        </View>

        {/* Payments Summary */}
        <View style={styles.paymentSummary}>
          <View style={styles.paymentIcon}>
            <ReceiptText
              size={22}
              color="#60A5FA"
            />
          </View>

          <View style={styles.paymentContent}>
            <Text style={styles.paymentTitle}>
              Service Payments
            </Text>

            <Text style={styles.paymentText}>
              Completed service payments and invoices will be available here.
            </Text>
          </View>

          <ChevronRight
            size={19}
            color="#64748B"
          />
        </View>
      </ScrollView>
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

function HistoryCard({
  item,
}: {
  item: HistoryItem;
}) {
  const completed = item.status === "completed";

  return (
    <TouchableOpacity
      style={styles.historyCard}
      activeOpacity={0.8}
      onPress={() =>
        router.push({
          pathname: "/request-details",
          params: {
            id: item.id,
          },
        })
      }
    >
      <View style={styles.topRow}>
        <View
          style={[
            styles.serviceIcon,
            completed
              ? styles.serviceIconCompleted
              : styles.serviceIconCancelled,
          ]}
        >
          {completed ? (
            <CheckCircle2
              size={22}
              color="#22C55E"
            />
          ) : (
            <CircleX
              size={22}
              color="#EF4444"
            />
          )}
        </View>

        <View style={styles.serviceContent}>
          <Text style={styles.serviceName}>
            {item.service}
          </Text>

          <Text style={styles.requestId}>
            {item.id}
          </Text>
        </View>

        <ChevronRight
          size={19}
          color="#475569"
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.detailsRow}>
        <View style={styles.dateRow}>
          <Clock3
            size={15}
            color="#64748B"
          />

          <Text style={styles.dateText}>
            {item.date} • {item.time}
          </Text>
        </View>

        <Text style={styles.amountText}>
          {item.amount}
        </Text>
      </View>

      <View style={styles.bottomRow}>
        <View
          style={[
            styles.statusBadge,
            completed
              ? styles.completedBadge
              : styles.cancelledBadge,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              completed
                ? styles.completedText
                : styles.cancelledText,
            ]}
          >
            {completed ? "Completed" : "Cancelled"}
          </Text>
        </View>

        {completed && !item.reviewed && (
          <TouchableOpacity
            style={styles.reviewButton}
            activeOpacity={0.8}
            onPress={() =>
              router.push({
                pathname: "/review-technician",
                params: {
                  id: item.id,
                },
              })
            }
          >
            <Star
              size={14}
              color="#F59E0B"
            />

            <Text style={styles.reviewButtonText}>
              Review
            </Text>
          </TouchableOpacity>
        )}

        {completed && item.reviewed && (
          <View style={styles.reviewedBadge}>
            <Star
              size={13}
              color="#F59E0B"
              fill="#F59E0B"
            />

            <Text style={styles.reviewedText}>
              Reviewed
            </Text>
          </View>
        )}
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
    paddingTop: 56,
    paddingBottom: 120,
  },

  header: {
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

  summaryRow: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 22,
  },

  summaryCard: {
    flex: 1,
    minHeight: 84,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryValue: {
    color: "#3B82F6",
    fontSize: 22,
    fontWeight: "800",
  },

  summaryLabel: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 4,
  },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },

  filterButton: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 10,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#1E2D42",
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

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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

  historyList: {
    gap: 12,
  },

  historyCard: {
    backgroundColor: "#0D1B2A",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 15,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  serviceIconCompleted: {
    backgroundColor: "rgba(34,197,94,0.08)",
  },

  serviceIconCancelled: {
    backgroundColor: "rgba(239,68,68,0.08)",
  },

  serviceContent: {
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

  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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

  amountText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
  },

  statusBadge: {
    minHeight: 28,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 9,
  },

  completedBadge: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderColor: "rgba(34,197,94,0.22)",
  },

  cancelledBadge: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderColor: "rgba(239,68,68,0.22)",
  },

  statusText: {
    fontSize: 9,
    fontWeight: "700",
  },

  completedText: {
    color: "#22C55E",
  },

  cancelledText: {
    color: "#EF4444",
  },

  reviewButton: {
    marginLeft: "auto",
    minHeight: 31,
    borderRadius: 9,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.22)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 5,
  },

  reviewButtonText: {
    color: "#F59E0B",
    fontSize: 9,
    fontWeight: "700",
  },

  reviewedBadge: {
    marginLeft: "auto",
    minHeight: 31,
    borderRadius: 9,
    backgroundColor: "#101F30",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    gap: 5,
  },

  reviewedText: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "600",
  },

  paymentSummary: {
    minHeight: 86,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginTop: 22,
  },

  paymentIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  paymentContent: {
    flex: 1,
    paddingRight: 10,
  },

  paymentTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
  },

  paymentText: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
  },
});