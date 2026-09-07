import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
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

const completedJobs = [
  {
    id: "REQ-2026-0008",
    service: "AC Repair",
    customer: "Nimal Fernando",
    date: "05 Sep 2026",
    time: "02:30 PM",
    duration: "1h 25m",
    location: "Colombo 05",
    rating: "5.0",
  },
  {
    id: "REQ-2026-0007",
    service: "Washing Machine Repair",
    customer: "Kasun Perera",
    date: "04 Sep 2026",
    time: "11:00 AM",
    duration: "55m",
    location: "Nugegoda",
    rating: "4.8",
  },
  {
    id: "REQ-2026-0006",
    service: "Electrical Installation",
    customer: "Amanda Silva",
    date: "03 Sep 2026",
    time: "09:30 AM",
    duration: "2h 10m",
    location: "Rajagiriya",
    rating: "4.9",
  },
];

export default function TechnicianHistoryScreen() {
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
            <Text style={styles.title}>
              Service History
            </Text>

            <Text style={styles.subtitle}>
              Your completed service jobs
            </Text>
          </View>

          <View style={styles.completedIcon}>
            <CheckCircle2
              size={23}
              color="#22C55E"
            />
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            value="12"
            label="Completed"
            color="#22C55E"
          />

          <StatCard
            value="4.8"
            label="Rating"
            color="#F59E0B"
          />

          <StatCard
            value="18h"
            label="Service Time"
            color="#60A5FA"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Completed Jobs
          </Text>

          <Text style={styles.resultText}>
            {completedJobs.length} records
          </Text>
        </View>

        <View style={styles.list}>
          {completedJobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              activeOpacity={0.8}
            >
              <View style={styles.jobHeader}>
                <View style={styles.serviceIcon}>
                  <Wrench
                    size={21}
                    color="#60A5FA"
                  />
                </View>

                <View style={styles.jobInfo}>
                  <Text style={styles.serviceName}>
                    {job.service}
                  </Text>

                  <Text style={styles.requestId}>
                    {job.id}
                  </Text>
                </View>

                <View style={styles.completedBadge}>
                  <CheckCircle2
                    size={12}
                    color="#22C55E"
                  />

                  <Text style={styles.completedText}>
                    Completed
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <InfoRow
                icon={
                  <CalendarDays
                    size={15}
                    color="#64748B"
                  />
                }
                label={`${job.date} • ${job.time}`}
              />

              <InfoRow
                icon={
                  <MapPin
                    size={15}
                    color="#64748B"
                  />
                }
                label={job.location}
              />

              <View style={styles.bottomRow}>
                <View style={styles.customerArea}>
                  <Text style={styles.smallLabel}>
                    Customer
                  </Text>

                  <Text style={styles.customerName}>
                    {job.customer}
                  </Text>
                </View>

                <View style={styles.duration}>
                  <Clock3
                    size={14}
                    color="#94A3B8"
                  />

                  <Text style={styles.durationText}>
                    {job.duration}
                  </Text>
                </View>

                <View style={styles.rating}>
                  <Star
                    size={14}
                    color="#F59E0B"
                    fill="#F59E0B"
                  />

                  <Text style={styles.ratingText}>
                    {job.rating}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
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

      <Text style={styles.infoText}>
        {label}
      </Text>
    </View>
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
    marginBottom: 23,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 4,
  },

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

  statsRow: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 26,
  },

  statCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },

  statValue: {
    fontSize: 19,
    fontWeight: "800",
  },

  statLabel: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 4,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 11,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },

  resultText: {
    color: "#64748B",
    fontSize: 9,
  },

  list: {
    gap: 12,
  },

  jobCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 14,
  },

  jobHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  serviceIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  jobInfo: {
    flex: 1,
  },

  serviceName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  requestId: {
    color: "#475569",
    fontSize: 8,
    marginTop: 4,
  },

  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(34,197,94,0.07)",
  },

  completedText: {
    color: "#22C55E",
    fontSize: 7,
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginVertical: 12,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
  },

  infoText: {
    color: "#94A3B8",
    fontSize: 9,
    marginLeft: 7,
  },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },

  customerArea: {
    flex: 1,
  },

  smallLabel: {
    color: "#475569",
    fontSize: 7,
  },

  customerName: {
    color: "#CBD5E1",
    fontSize: 9,
    fontWeight: "600",
    marginTop: 2,
  },

  duration: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 15,
  },

  durationText: {
    color: "#94A3B8",
    fontSize: 8,
    marginLeft: 5,
  },

  rating: {
    flexDirection: "row",
    alignItems: "center",
  },

  ratingText: {
    color: "#F8FAFC",
    fontSize: 9,
    fontWeight: "700",
    marginLeft: 4,
  },
});