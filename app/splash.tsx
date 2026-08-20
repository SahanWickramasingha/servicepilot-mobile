import { useEffect } from "react";
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Wrench } from "lucide-react-native";

export default function SplashScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      // Next phase: onboarding screen
      router.replace("/onboarding");
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      {/* Background decorative glow */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      {/* Main Content */}
      <View style={styles.content}>
        {/* ServicePilot Logo */}
        <View style={styles.logoWrapper}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Wrench
                size={42}
                color="#FFFFFF"
                strokeWidth={2.8}
              />
            </View>
          </View>
        </View>

        {/* Brand */}
        <View style={styles.brandRow}>
          <Text style={styles.brandWhite}>SERVICE</Text>
          <Text style={styles.brandBlue}>PILOT</Text>
        </View>

        <Text style={styles.subtitle}>
          Field Service Management
        </Text>

        {/* Loader */}
        <View style={styles.loaderContainer}>
          <ActivityIndicator
            size="large"
            color="#2563EB"
          />
        </View>
      </View>

      {/* Bottom decorative city */}
      <View style={styles.cityContainer}>
        <View style={[styles.building, { height: 40 }]} />
        <View style={[styles.building, { height: 60 }]} />
        <View style={[styles.building, { height: 32 }]} />
        <View style={[styles.building, { height: 75 }]} />
        <View style={[styles.building, { height: 48 }]} />
        <View style={[styles.building, { height: 88 }]} />
        <View style={[styles.building, { height: 55 }]} />
        <View style={[styles.building, { height: 68 }]} />
        <View style={[styles.building, { height: 38 }]} />
        <View style={[styles.building, { height: 58 }]} />
      </View>

      <Text style={styles.versionText}>
        Smart Field Service Management
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },

  content: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    marginBottom: 80,
  },

  glowTop: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    top: -140,
    right: -120,
  },

  glowBottom: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    bottom: -210,
    left: -150,
  },

  logoWrapper: {
    width: 104,
    height: 104,
    borderRadius: 30,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 26,
  },

  logoOuter: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: "#1D4ED8",
    justifyContent: "center",
    alignItems: "center",
    transform: [{ rotate: "-8deg" }],
    shadowColor: "#2563EB",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 14,
  },

  logoInner: {
    width: 64,
    height: 64,
    borderRadius: 19,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  brandWhite: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  brandBlue: {
    color: "#3B82F6",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  subtitle: {
    marginTop: 9,
    color: "#CBD5E1",
    fontSize: 15,
    fontWeight: "400",
    letterSpacing: 0.3,
  },

  loaderContainer: {
    marginTop: 52,
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },

  cityContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    opacity: 0.16,
    paddingHorizontal: 8,
  },

  building: {
    width: "8%",
    backgroundColor: "#2563EB",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },

  versionText: {
    position: "absolute",
    bottom: 24,
    color: "#64748B",
    fontSize: 11,
    letterSpacing: 0.7,
    zIndex: 5,
  },
});