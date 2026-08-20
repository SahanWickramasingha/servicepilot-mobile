import { router } from "expo-router";
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  MapPin,
  Wrench,
  UserRoundCheck,
} from "lucide-react-native";

export default function OnboardingScreen() {
  const handleNext = () => {
    router.push("/role-selection");
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => router.replace("/role-selection")}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <View style={styles.illustrationWrapper}>
        <View style={styles.glow} />

        <View style={styles.personCircle}>
          <UserRoundCheck
            size={72}
            color="#FFFFFF"
            strokeWidth={1.8}
          />
        </View>

        <View style={[styles.floatingIcon, styles.iconLeft]}>
          <MapPin
            size={28}
            color="#38BDF8"
          />
        </View>

        <View style={[styles.floatingIcon, styles.iconRight]}>
          <Wrench
            size={28}
            color="#2563EB"
          />
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>
          Smart Field Service{"\n"}Management
        </Text>

        <Text style={styles.description}>
          Request, assign, track and complete services with ease.
        </Text>

        {/* Dots */}
        <View style={styles.dots}>
          <View style={[styles.dot, styles.activeDot]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>

      {/* Bottom */}
      <View style={styles.bottomArea}>
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
    paddingHorizontal: 24,
  },

  skipButton: {
    position: "absolute",
    top: 58,
    right: 24,
    zIndex: 20,
  },

  skipText: {
    color: "#3B82F6",
    fontSize: 15,
    fontWeight: "600",
  },

  illustrationWrapper: {
    height: "48%",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 28,
  },

  glow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(37,99,235,0.10)",
    bottom: 10,
  },

  personCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17365E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOpacity: 0.2,
    shadowRadius: 25,
    elevation: 8,
  },

  floatingIcon: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17365E",
    alignItems: "center",
    justifyContent: "center",
  },

  iconLeft: {
    left: 24,
    bottom: 72,
  },

  iconRight: {
    right: 24,
    bottom: 100,
  },

  content: {
    alignItems: "center",
    paddingHorizontal: 12,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 38,
  },

  description: {
    color: "#94A3B8",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 23,
    marginTop: 14,
    maxWidth: 300,
  },

  dots: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 30,
    gap: 8,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 10,
    backgroundColor: "#334155",
  },

  activeDot: {
    width: 20,
    backgroundColor: "#2563EB",
  },

  bottomArea: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 38,
  },

  nextButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },

  nextButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});