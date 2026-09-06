import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Car,
  Clock3,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Star,
  UserRound,
} from "lucide-react-native";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function LiveTrackingScreen() {
  const params = useLocalSearchParams<{
    id?: string;
  }>();

  const requestId = params.id ?? "REQ-2026-0012";

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
              Live Tracking
            </Text>

            <Text style={styles.subtitle}>
              {requestId}
            </Text>
          </View>
        </View>

        {/* Status Banner */}
        <View style={styles.statusBanner}>
          <View style={styles.statusIcon}>
            <Navigation
              size={20}
              color="#60A5FA"
            />
          </View>

          <View style={styles.statusContent}>
            <Text style={styles.statusLabel}>
              Technician En Route
            </Text>

            <Text style={styles.statusDescription}>
              Your technician is travelling to your location
            </Text>
          </View>

          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              LIVE
            </Text>
          </View>
        </View>

        {/* Map Placeholder */}
        <View style={styles.mapCard}>
          <View style={styles.mapBackground}>
            {/* Fake Roads */}
            <View style={[styles.road, styles.roadOne]} />
            <View style={[styles.road, styles.roadTwo]} />
            <View style={[styles.road, styles.roadThree]} />

            {/* Route Line */}
            <View style={styles.routeSegmentOne} />
            <View style={styles.routeSegmentTwo} />

            {/* Technician Marker */}
            <View style={styles.technicianMarker}>
              <UserRound
                size={20}
                color="#FFFFFF"
              />
            </View>

            {/* Customer Marker */}
            <View style={styles.customerMarker}>
              <MapPin
                size={22}
                color="#FFFFFF"
                fill="#2563EB"
              />
            </View>

            {/* ETA Bubble */}
            <View style={styles.etaBubble}>
              <Text style={styles.etaBubbleValue}>
                12
              </Text>

              <Text style={styles.etaBubbleLabel}>
                min
              </Text>
            </View>
          </View>

          {/* Map Bottom Details */}
          <View style={styles.mapFooter}>
            <View style={styles.mapMetric}>
              <Clock3
                size={17}
                color="#60A5FA"
              />

              <View>
                <Text style={styles.metricLabel}>
                  Estimated Arrival
                </Text>

                <Text style={styles.metricValue}>
                  12 min
                </Text>
              </View>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.mapMetric}>
              <Navigation
                size={17}
                color="#22C55E"
              />

              <View>
                <Text style={styles.metricLabel}>
                  Distance
                </Text>

                <Text style={styles.metricValue}>
                  4.5 km
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Technician */}
        <Text style={styles.sectionTitle}>
          Your Technician
        </Text>

        <View style={styles.technicianCard}>
          <View style={styles.avatar}>
            <UserRound
              size={30}
              color="#FFFFFF"
            />
          </View>

          <View style={styles.technicianInfo}>
            <Text style={styles.technicianName}>
              Alex Smith
            </Text>

            <Text style={styles.technicianRole}>
              Service Technician
            </Text>

            <View style={styles.ratingRow}>
              <Star
                size={14}
                color="#F59E0B"
                fill="#F59E0B"
              />

              <Text style={styles.ratingText}>
                4.8
              </Text>

              <Text style={styles.jobsText}>
                • 124 jobs
              </Text>
            </View>
          </View>

          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />

            <Text style={styles.onlineText}>
              Online
            </Text>
          </View>
        </View>

        {/* Vehicle */}
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleIcon}>
            <Car
              size={22}
              color="#A78BFA"
            />
          </View>

          <View style={styles.vehicleContent}>
            <Text style={styles.vehicleLabel}>
              Vehicle
            </Text>

            <Text style={styles.vehicleValue}>
              WP AB-1234
            </Text>
          </View>

          <View>
            <Text style={styles.vehicleLabel}>
              ETA
            </Text>

            <Text style={styles.vehicleEta}>
              12 min
            </Text>
          </View>
        </View>

        {/* Location */}
        <Text style={styles.sectionTitle}>
          Service Location
        </Text>

        <View style={styles.locationCard}>
          <View style={styles.locationIcon}>
            <MapPin
              size={20}
              color="#3B82F6"
            />
          </View>

          <View style={styles.locationContent}>
            <Text style={styles.locationLabel}>
              Destination
            </Text>

            <Text style={styles.locationValue}>
              123, Main Street, Colombo 07
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.callButton}
            activeOpacity={0.85}
          >
            <Phone
              size={18}
              color="#FFFFFF"
            />

            <Text style={styles.actionText}>
              Call
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.chatButton}
            activeOpacity={0.85}
          >
            <MessageCircle
              size={18}
              color="#FFFFFF"
            />

            <Text style={styles.actionText}>
              Chat
            </Text>
          </TouchableOpacity>
        </View>

        {/* Open Maps */}
        <TouchableOpacity
          style={styles.mapsButton}
          activeOpacity={0.85}
        >
          <Navigation
            size={18}
            color="#3B82F6"
          />

          <Text style={styles.mapsButtonText}>
            Open in Maps
          </Text>
        </TouchableOpacity>

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            Live Location Tracking
          </Text>

          <Text style={styles.infoText}>
            Technician location is shared only while the assigned job is in
            an active tracking state.
          </Text>
        </View>
      </ScrollView>
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
    marginBottom: 22,
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

  statusBanner: {
    minHeight: 74,
    borderRadius: 16,
    backgroundColor: "rgba(37,99,235,0.07)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.22)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 16,
  },

  statusIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "rgba(37,99,235,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  statusContent: {
    flex: 1,
  },

  statusLabel: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
  },

  statusDescription: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 4,
  },

  liveBadge: {
    height: 28,
    borderRadius: 9,
    backgroundColor: "rgba(34,197,94,0.10)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.22)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: "#22C55E",
    marginRight: 5,
  },

  liveText: {
    color: "#22C55E",
    fontSize: 8,
    fontWeight: "800",
  },

  mapCard: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    marginBottom: 24,
  },

  mapBackground: {
    height: 330,
    backgroundColor: "#DDE4DE",
    position: "relative",
    overflow: "hidden",
  },

  road: {
    position: "absolute",
    height: 7,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 6,
  },

  roadOne: {
    width: 430,
    top: 90,
    left: -50,
    transform: [{ rotate: "28deg" }],
  },

  roadTwo: {
    width: 500,
    top: 205,
    left: -60,
    transform: [{ rotate: "-22deg" }],
  },

  roadThree: {
    width: 440,
    top: 160,
    left: -50,
    transform: [{ rotate: "70deg" }],
  },

  routeSegmentOne: {
    position: "absolute",
    width: 150,
    height: 6,
    borderRadius: 6,
    backgroundColor: "#2563EB",
    left: 92,
    top: 188,
    transform: [{ rotate: "-25deg" }],
  },

  routeSegmentTwo: {
    position: "absolute",
    width: 105,
    height: 6,
    borderRadius: 6,
    backgroundColor: "#2563EB",
    left: 205,
    top: 137,
    transform: [{ rotate: "-50deg" }],
  },

  technicianMarker: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#0F172A",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    left: 88,
    top: 183,
  },

  customerMarker: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2563EB",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    right: 87,
    top: 76,
  },

  etaBubble: {
    position: "absolute",
    width: 68,
    height: 68,
    borderRadius: 17,
    backgroundColor: "#07111F",
    alignItems: "center",
    justifyContent: "center",
    top: 110,
    left: "44%",
  },

  etaBubbleValue: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },

  etaBubbleLabel: {
    color: "#94A3B8",
    fontSize: 9,
    marginTop: 1,
  },

  mapFooter: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },

  mapMetric: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  metricDivider: {
    width: 1,
    height: 42,
    backgroundColor: "#17263A",
    marginHorizontal: 12,
  },

  metricLabel: {
    color: "#64748B",
    fontSize: 9,
  },

  metricValue: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
    marginLeft: 2,
  },

  technicianCard: {
    minHeight: 104,
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
    marginLeft: 4,
  },

  jobsText: {
    color: "#64748B",
    fontSize: 9,
    marginLeft: 5,
  },

  onlineBadge: {
    height: 28,
    borderRadius: 9,
    backgroundColor: "rgba(34,197,94,0.08)",
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

  vehicleCard: {
    minHeight: 78,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 24,
  },

  vehicleIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  vehicleContent: {
    flex: 1,
  },

  vehicleLabel: {
    color: "#64748B",
    fontSize: 9,
  },

  vehicleValue: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  vehicleEta: {
    color: "#22C55E",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  locationCard: {
    minHeight: 82,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 20,
  },

  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  locationContent: {
    flex: 1,
  },

  locationLabel: {
    color: "#64748B",
    fontSize: 9,
  },

  locationValue: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
  },

  callButton: {
    flex: 1,
    height: 54,
    borderRadius: 12,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  chatButton: {
    flex: 1,
    height: 54,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  actionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  mapsButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },

  mapsButtonText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "700",
  },

  infoCard: {
    borderRadius: 14,
    backgroundColor: "rgba(37,99,235,0.06)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.16)",
    padding: 14,
    marginTop: 20,
  },

  infoTitle: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
  },

  infoText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 5,
  },
});