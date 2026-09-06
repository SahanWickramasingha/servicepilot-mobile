import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  Phone,
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

export default function RequestDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string;
  }>();

  const requestId = params.id ?? "REQ-2026-0012";

  const request = {
    id: requestId,
    service: "AC Repair",
    status: "In Progress",
    priority: "High",
    date: "20 May 2026",
    time: "10:00 AM",
    location: "123, Main Street, Colombo 07",
    description:
      "AC is not cooling properly. Please check gas level and clean the filters.",
    technician: {
      name: "Alex Smith",
      rating: "4.8",
      role: "Technician",
    },
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerText}>
            <Text style={styles.title}>
              Request Details
            </Text>

            <Text style={styles.subtitle}>
              {request.id}
            </Text>
          </View>
        </View>

        {/* Main Job Card */}
        <View style={styles.mainCard}>
          <View style={styles.mainTopRow}>
            <View style={styles.serviceIcon}>
              <Wrench
                size={25}
                color="#60A5FA"
              />
            </View>

            <View style={styles.serviceContent}>
              <Text style={styles.serviceLabel}>
                Service
              </Text>

              <Text style={styles.serviceName}>
                {request.service}
              </Text>
            </View>

            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />

              <Text style={styles.statusText}>
                {request.status}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <InfoRow
            icon={
              <CalendarDays
                size={18}
                color="#60A5FA"
              />
            }
            label="Date"
            value={request.date}
          />

          <InfoRow
            icon={
              <Clock3
                size={18}
                color="#A78BFA"
              />
            }
            label="Time"
            value={request.time}
          />

          <InfoRow
            icon={
              <MapPin
                size={18}
                color="#22D3EE"
              />
            }
            label="Location"
            value={request.location}
          />
        </View>

        {/* Priority */}
        <View style={styles.priorityCard}>
          <View>
            <Text style={styles.priorityLabel}>
              Priority
            </Text>

            <Text style={styles.priorityValue}>
              {request.priority}
            </Text>
          </View>

          <View style={styles.priorityBadge}>
            <Text style={styles.priorityBadgeText}>
              HIGH PRIORITY
            </Text>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.sectionTitle}>
          Description
        </Text>

        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionText}>
            {request.description}
          </Text>
        </View>

        {/* Technician */}
        <Text style={styles.sectionTitle}>
          Assigned Technician
        </Text>

        <View style={styles.technicianCard}>
          <View style={styles.avatar}>
            <UserRound
              size={28}
              color="#FFFFFF"
            />
          </View>

          <View style={styles.technicianInfo}>
            <Text style={styles.technicianName}>
              {request.technician.name}
            </Text>

            <Text style={styles.technicianRole}>
              {request.technician.role}
            </Text>

            <View style={styles.ratingRow}>
              <Star
                size={14}
                color="#F59E0B"
                fill="#F59E0B"
              />

              <Text style={styles.ratingText}>
                {request.technician.rating}
              </Text>
            </View>
          </View>

          <View style={styles.contactActions}>
            <TouchableOpacity
              style={styles.contactButton}
              activeOpacity={0.8}
            >
              <Phone
                size={18}
                color="#22C55E"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contactButton}
              activeOpacity={0.8}
            >
              <MessageCircle
                size={18}
                color="#3B82F6"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Timeline */}
        <Text style={styles.sectionTitle}>
          Status Timeline
        </Text>

        <View style={styles.timelineCard}>
          <TimelineItem
            title="Request Created"
            subtitle="20 May 2026, 08:40 AM"
            completed
          />

          <TimelineItem
            title="Assigned to Technician"
            subtitle="20 May 2026, 09:45 AM"
            completed
          />

          <TimelineItem
            title="Technician En Route"
            subtitle="20 May 2026, 10:05 AM"
            completed
          />

          <TimelineItem
            title="Service In Progress"
            subtitle="20 May 2026, 10:45 AM"
            active
          />

          <TimelineItem
            title="Completed"
            subtitle="Pending"
            last
          />
        </View>

        {/* Track Live */}
        <TouchableOpacity
          style={styles.trackButton}
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: "/live-tracking",
              params: {
                id: request.id,
              },
            })
          }
        >
          <MapPin
            size={19}
            color="#FFFFFF"
          />

          <Text style={styles.trackButtonText}>
            Track Technician Live
          </Text>
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity
          style={styles.cancelButton}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelButtonText}>
            Cancel Request
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        {icon}
      </View>

      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>
          {label}
        </Text>

        <Text style={styles.infoValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function TimelineItem({
  title,
  subtitle,
  completed = false,
  active = false,
  last = false,
}: {
  title: string;
  subtitle: string;
  completed?: boolean;
  active?: boolean;
  last?: boolean;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineVisual}>
        <View
          style={[
            styles.timelineDot,
            completed && styles.timelineDotCompleted,
            active && styles.timelineDotActive,
          ]}
        >
          {completed && (
            <CheckCircle2
              size={14}
              color="#22C55E"
            />
          )}
        </View>

        {!last && (
          <View
            style={[
              styles.timelineLine,
              completed && styles.timelineLineCompleted,
            ]}
          />
        )}
      </View>

      <View style={styles.timelineContent}>
        <Text
          style={[
            styles.timelineTitle,
            active && styles.timelineTitleActive,
          ]}
        >
          {title}
        </Text>

        <Text style={styles.timelineSubtitle}>
          {subtitle}
        </Text>
      </View>
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
    paddingBottom: 70,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 26,
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 4,
  },

  mainCard: {
    backgroundColor: "#0D1B2A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 16,
    marginBottom: 18,
  },

  mainTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  serviceContent: {
    flex: 1,
  },

  serviceLabel: {
    color: "#64748B",
    fontSize: 9,
  },

  serviceName: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 3,
  },

  statusBadge: {
    minHeight: 28,
    borderRadius: 9,
    backgroundColor: "rgba(34,197,94,0.10)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.24)",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: "#22C55E",
    marginRight: 6,
  },

  statusText: {
    color: "#22C55E",
    fontSize: 9,
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginVertical: 15,
  },

  infoRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
  },

  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    color: "#64748B",
    fontSize: 9,
  },

  infoValue: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },

  priorityCard: {
    minHeight: 78,
    borderRadius: 16,
    backgroundColor: "rgba(249,115,22,0.06)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.18)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 24,
  },

  priorityLabel: {
    color: "#64748B",
    fontSize: 9,
  },

  priorityValue: {
    color: "#F97316",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 3,
  },

  priorityBadge: {
    minHeight: 30,
    borderRadius: 9,
    backgroundColor: "rgba(249,115,22,0.10)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.30)",
    justifyContent: "center",
    paddingHorizontal: 9,
  },

  priorityBadgeText: {
    color: "#FB923C",
    fontSize: 8,
    fontWeight: "800",
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
    marginLeft: 2,
  },

  descriptionCard: {
    minHeight: 110,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 16,
    padding: 15,
    marginBottom: 24,
  },

  descriptionText: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 20,
  },

  technicianCard: {
    minHeight: 100,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 24,
  },

  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  technicianInfo: {
    flex: 1,
  },

  technicianName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  technicianRole: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3,
  },

  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },

  ratingText: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "700",
    marginLeft: 5,
  },

  contactActions: {
    flexDirection: "row",
    gap: 8,
  },

  contactButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#101F30",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },

  timelineCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 17,
    paddingHorizontal: 16,
    paddingVertical: 17,
    marginBottom: 22,
  },

  timelineRow: {
    flexDirection: "row",
    minHeight: 62,
  },

  timelineVisual: {
    width: 30,
    alignItems: "center",
  },

  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#475569",
    backgroundColor: "#0D1B2A",
    alignItems: "center",
    justifyContent: "center",
  },

  timelineDotCompleted: {
    borderColor: "#22C55E",
  },

  timelineDotActive: {
    backgroundColor: "#2563EB",
    borderColor: "#60A5FA",
  },

  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#243247",
    marginVertical: 4,
  },

  timelineLineCompleted: {
    backgroundColor: "#22C55E",
  },

  timelineContent: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 10,
  },

  timelineTitle: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },

  timelineTitleActive: {
    color: "#60A5FA",
  },

  timelineSubtitle: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 4,
  },

  trackButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  trackButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  cancelButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.30)",
    backgroundColor: "rgba(239,68,68,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },

  cancelButtonText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "700",
  },
});