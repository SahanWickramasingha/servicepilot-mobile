import { router } from "expo-router";
import {
  CheckCircle2,
  Clock3,
} from "lucide-react-native";
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function TechnicianPendingScreen() {
  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.content}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Text style={styles.logoSymbol}>S</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.iconWrapper}>
            <Clock3
              size={48}
              color="#F59E0B"
              strokeWidth={1.8}
            />
          </View>

          <View style={styles.verifiedRow}>
            <CheckCircle2
              size={18}
              color="#22C55E"
            />
            <Text style={styles.verifiedText}>
              Email verified successfully
            </Text>
          </View>

          <Text style={styles.title}>
            Registration Submitted
          </Text>

          <Text style={styles.description}>
            Your technician profile is now under review.
          </Text>

          <Text style={styles.instructions}>
            Please wait while our team checks your
            qualifications. You will be able to sign in
            once your account has been approved.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={() =>
              router.replace({
                pathname: "/login",
                params: { role: "technician" },
              })
            }
          >
            <Text style={styles.primaryButtonText}>
              Back to Login
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
  },

  glowTop: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    top: -150,
    right: -130,
  },

  glowBottom: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
    bottom: -190,
    left: -170,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },

  logoOuter: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    alignSelf: "center",
  },

  logoInner: {
    width: 55,
    height: 55,
    borderRadius: 17,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-8deg" }],
  },

  logoSymbol: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    transform: [{ rotate: "8deg" }],
  },

  card: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 30,
    alignItems: "center",
  },

  iconWrapper: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(245, 158, 11, 0.11)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 16,
  },

  verifiedText: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: "700",
  },

  title: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
    textAlign: "center",
  },

  description: {
    color: "#CBD5E1",
    fontSize: 14,
    marginTop: 13,
    textAlign: "center",
  },

  instructions: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 16,
  },

  primaryButton: {
    width: "100%",
    height: 54,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 26,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
