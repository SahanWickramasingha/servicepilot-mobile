import {
  CalendarDays,
  CheckCircle2,
  MapPin,
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

import { useTechnicianWorkspace } from "@/src/hooks/useTechnicianWorkspace";
import { useTechnicianReviews } from "@/src/hooks/useTechnicianReviews";
import { getTechnicianRatingDisplay } from "@/src/utils/technicianRating";
import { ServiceRequest } from "@/src/services/request.service";
import {
  getCompletedTechnicianRequests,
  getHistoryTechnicianRequests,
  getRequestDateLabel,
  getRequestDisplayTitle,
  getRequestTimeLabel,
  getStatusUi,
} from "@/src/utils/technicianRequests";

export default function TechnicianHistoryScreen() {
  const { uid, profile, requests, loading, errorMessage } =
    useTechnicianWorkspace();
  const ratings = useTechnicianReviews(profile ? uid : null);
  const ratingDisplay = getTechnicianRatingDisplay(ratings);
  const historyRequests = getHistoryTechnicianRequests(requests);
  const completedRequests = getCompletedTechnicianRequests(requests);

  if (loading) {
    return <StateScreen message="Loading service history..." />;
  }

  if (errorMessage) {
    return (
      <StateScreen
        title="History unavailable"
        message={errorMessage}
      />
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
          <View>
            <Text style={styles.title}>Service History</Text>

            <Text style={styles.subtitle}>
              Your completed and closed service jobs
            </Text>
          </View>

          <View style={styles.completedIcon}>
            <CheckCircle2 size={23} color="#22C55E" />
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            value={String(completedRequests.length)}
            label="Completed"
            color="#22C55E"
          />

          <StatCard
            value={ratingDisplay.label}
            label="Rating"
            color="#F59E0B"
          />

          <StatCard
            value={String(historyRequests.length)}
            label="Closed"
            color="#60A5FA"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Closed Jobs</Text>

          <Text style={styles.resultText}>
            {historyRequests.length} records
          </Text>
        </View>

        {historyRequests.length > 0 ? (
          <View style={styles.list}>
            {historyRequests.map((job) => (
              <HistoryCard key={job.id} job={job} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <CheckCircle2 size={38} color="#22C55E" />
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptyText}>
              Completed, rejected, or cancelled jobs will appear here.
            </Text>
          </View>
        )}
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

function HistoryCard({ job }: { job: ServiceRequest }) {
  const status = getStatusUi(job.status);

  return (
    <TouchableOpacity style={styles.jobCard} activeOpacity={0.8}>
      <View style={styles.jobHeader}>
        <View style={styles.serviceIcon}>
          <Wrench size={21} color="#60A5FA" />
        </View>

        <View style={styles.jobInfo}>
          <Text style={styles.serviceName} numberOfLines={1}>
            {getRequestDisplayTitle(job)}
          </Text>

          <Text style={styles.requestId}>{job.id}</Text>
        </View>

        <View
          style={[
            styles.completedBadge,
            { backgroundColor: `${status.color}12` },
          ]}
        >
          <CheckCircle2 size={12} color={status.color} />
          <Text style={[styles.completedText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <InfoRow
        icon={<CalendarDays size={15} color="#64748B" />}
        label={`${getRequestDateLabel(job)} - ${getRequestTimeLabel(job)}`}
      />

      <InfoRow
        icon={<MapPin size={15} color="#64748B" />}
        label={job.address || "Address not provided"}
      />

      <View style={styles.bottomRow}>
        <View style={styles.customerArea}>
          <Text style={styles.smallLabel}>Customer</Text>
          <Text style={styles.customerName}>
            {job.customerName || "Customer"}
          </Text>
        </View>

        <View style={styles.rating}>
          <Star size={14} color="#64748B" />
          <Text style={styles.ratingText}>Request closed</Text>
        </View>
      </View>
    </TouchableOpacity>
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
        style={[styles.statValue, { color }]}
        numberOfLines={2}
      >
        {value}
      </Text>

      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View style={styles.infoRow}>
      {icon}
      <Text style={styles.infoText} numberOfLines={1}>
        {label}
      </Text>
    </View>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 23,
  },
  title: { color: "#FFFFFF", fontSize: 27, fontWeight: "800" },
  subtitle: { color: "#64748B", fontSize: 10, marginTop: 4 },
  completedIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(34,197,94,0.07)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: { flexDirection: "row", gap: 9, marginBottom: 26 },
  statCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  statLabel: { color: "#64748B", fontSize: 8, marginTop: 4 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  sectionTitle: { color: "#F8FAFC", fontSize: 14, fontWeight: "800" },
  resultText: { color: "#64748B", fontSize: 9 },
  list: { gap: 12 },
  jobCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 14,
  },
  jobHeader: { flexDirection: "row", alignItems: "center" },
  serviceIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  jobInfo: { flex: 1 },
  serviceName: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  requestId: { color: "#475569", fontSize: 8, marginTop: 4 },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    height: 26,
    borderRadius: 8,
  },
  completedText: { fontSize: 7, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#17263A", marginVertical: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  infoText: { color: "#94A3B8", fontSize: 9, marginLeft: 7, flex: 1 },
  bottomRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  customerArea: { flex: 1 },
  smallLabel: { color: "#475569", fontSize: 7 },
  customerName: {
    color: "#CBD5E1",
    fontSize: 9,
    fontWeight: "600",
    marginTop: 2,
  },
  rating: { flexDirection: "row", alignItems: "center" },
  ratingText: {
    color: "#94A3B8",
    fontSize: 8,
    fontWeight: "700",
    marginLeft: 4,
  },
  emptyCard: {
    minHeight: 240,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 14,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 6,
  },
});
