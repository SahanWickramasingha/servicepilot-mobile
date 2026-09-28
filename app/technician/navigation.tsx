import { router } from "expo-router";
import {
  ArrowLeft,
  Clock3,
  MapPin,
  Navigation,
  Phone,
  Route,
  UserRound,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTechnicianRequest } from "@/src/hooks/useTechnicianRequest";

export default function TechnicianNavigationScreen() {
  const { request, requestId, loading, errorMessage } =
    useTechnicianRequest();

  if (loading) {
    return (
      <View style={styles.stateScreen}>
        <ActivityIndicator color="#22C55E" />
        <Text style={styles.stateText}>Loading navigation details...</Text>
      </View>
    );
  }

  if (errorMessage || !request) {
    return (
      <View style={styles.stateScreen}>
        <Text style={styles.stateTitle}>Navigation unavailable</Text>
        <Text style={styles.stateText}>
          {errorMessage || "Unable to load this service request."}
        </Text>
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View>
            <Text style={styles.title}>Navigation</Text>
            <Text style={styles.requestId}>{request.id}</Text>
          </View>
        </View>

        <View style={styles.routeStatus}>
          <View style={styles.routeIcon}>
            <Navigation size={22} color="#22C55E" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.routeTitle}>Route to Customer</Text>
            <Text style={styles.routeSubtitle}>
              Route metrics are not connected yet.
            </Text>
          </View>

          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>REQUEST</Text>
          </View>
        </View>

        <View style={styles.map}>
          <View style={[styles.road, styles.roadOne]} />
          <View style={[styles.road, styles.roadTwo]} />
          <View style={[styles.road, styles.roadThree]} />

          <View style={styles.routeLineOne} />
          <View style={styles.routeLineTwo} />

          <View style={styles.currentMarker}>
            <Navigation size={19} color="#FFFFFF" fill="#FFFFFF" />
          </View>

          <View style={styles.customerMarker}>
            <MapPin size={23} color="#FFFFFF" fill="#EF4444" />
          </View>

          <View style={styles.etaBubble}>
            <Text style={styles.etaValue}>--</Text>
            <Text style={styles.etaText}>ETA</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <MetricCard
            icon={<Clock3 size={19} color="#F59E0B" />}
            value="--"
            label="Estimated Time"
          />

          <MetricCard
            icon={<Route size={19} color="#60A5FA" />}
            value="--"
            label="Distance"
          />
        </View>

        <Text style={styles.sectionTitle}>Customer</Text>

        <View style={styles.customerCard}>
          <View style={styles.avatar}>
            <UserRound size={23} color="#FFFFFF" />
          </View>

          <View style={styles.customerInfo}>
            <Text style={styles.customerName}>
              {request.customerName || "Customer"}
            </Text>
            <Text style={styles.customerAddress}>
              {request.address || "Address not provided"}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.callButton}
            onPress={() =>
              Alert.alert(
                "Call Customer",
                request.customerPhone ||
                  "No customer phone number is available."
              )
            }
          >
            <Phone size={18} color="#22C55E" />
          </TouchableOpacity>
        </View>

        <View style={styles.destinationCard}>
          <MapPin size={21} color="#3B82F6" />

          <View style={styles.destinationContent}>
            <Text style={styles.destinationLabel}>Destination</Text>
            <Text style={styles.destinationText}>
              {request.address || "Address not provided"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.mapsButton}
          activeOpacity={0.85}
          onPress={() =>
            Alert.alert(
              "Navigation",
              "Route navigation is not connected yet."
            )
          }
        >
          <Navigation size={19} color="#FFFFFF" />
          <Text style={styles.mapsButtonText}>Open Navigation</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.arrivedButton}
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: "/technician/job-details",
              params: { id: requestId },
            })
          }
        >
          <MapPin size={18} color="#22C55E" />
          <Text style={styles.arrivedButtonText}>I&apos;ve Arrived</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function MetricCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.metricCard}>
      {icon}
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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
    paddingBottom: 60,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  requestId: { color: "#64748B", fontSize: 9, marginTop: 3 },
  routeStatus: {
    minHeight: 82,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    marginBottom: 13,
  },
  routeIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  routeTitle: { color: "#F8FAFC", fontSize: 11, fontWeight: "700" },
  routeSubtitle: { color: "#64748B", fontSize: 8, marginTop: 4 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    height: 25,
    borderRadius: 8,
    backgroundColor: "rgba(34,197,94,0.07)",
  },
  liveText: { color: "#22C55E", fontSize: 7, fontWeight: "800" },
  map: {
    height: 360,
    borderRadius: 20,
    backgroundColor: "#101C29",
    borderWidth: 1,
    borderColor: "#1E2D42",
    overflow: "hidden",
    marginBottom: 13,
  },
  road: {
    position: "absolute",
    height: 20,
    width: "150%",
    backgroundColor: "#263547",
  },
  roadOne: { top: 85, left: -90, transform: [{ rotate: "18deg" }] },
  roadTwo: { top: 210, left: -75, transform: [{ rotate: "-14deg" }] },
  roadThree: { top: 285, left: -60, transform: [{ rotate: "25deg" }] },
  routeLineOne: {
    position: "absolute",
    width: 8,
    height: 190,
    backgroundColor: "#22C55E",
    left: "45%",
    top: 115,
    transform: [{ rotate: "29deg" }],
    borderRadius: 10,
  },
  routeLineTwo: {
    position: "absolute",
    width: 8,
    height: 105,
    backgroundColor: "#22C55E",
    left: "61%",
    top: 54,
    transform: [{ rotate: "-30deg" }],
    borderRadius: 10,
  },
  currentMarker: {
    position: "absolute",
    left: "31%",
    bottom: 47,
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
  },
  customerMarker: {
    position: "absolute",
    right: "24%",
    top: 50,
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  etaBubble: {
    position: "absolute",
    right: 13,
    bottom: 13,
    backgroundColor: "#07111F",
    borderWidth: 1,
    borderColor: "#223249",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  etaValue: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  etaText: { color: "#64748B", fontSize: 7, marginTop: 2 },
  metricsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  metricCard: {
    flex: 1,
    height: 88,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 5,
  },
  metricLabel: { color: "#64748B", fontSize: 8, marginTop: 2 },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  customerCard: {
    minHeight: 86,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    marginBottom: 11,
  },
  avatar: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  customerInfo: { flex: 1 },
  customerName: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  customerAddress: { color: "#64748B", fontSize: 8, marginTop: 4 },
  callButton: {
    width: 41,
    height: 41,
    borderRadius: 13,
    backgroundColor: "rgba(34,197,94,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  destinationCard: {
    minHeight: 72,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 15,
  },
  destinationContent: { flex: 1, marginLeft: 10 },
  destinationLabel: { color: "#64748B", fontSize: 8 },
  destinationText: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
  },
  mapsButton: {
    height: 54,
    borderRadius: 12,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  mapsButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  arrivedButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
    backgroundColor: "rgba(34,197,94,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 10,
  },
  arrivedButtonText: { color: "#22C55E", fontSize: 11, fontWeight: "700" },
});
