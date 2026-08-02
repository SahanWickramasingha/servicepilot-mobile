import { View, Text, ActivityIndicator } from "react-native";
import { useEffect } from "react";
import { router } from "expo-router";

export default function SplashScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/login");
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0F172A",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontSize: 48,
          color: "#3B82F6",
        }}
      >
        🔧
      </Text>

      <Text
        style={{
          fontSize: 34,
          color: "white",
          fontWeight: "bold",
          marginTop: 20,
        }}
      >
        ServicePilot
      </Text>

      <Text
        style={{
          color: "#CBD5E1",
          marginTop: 8,
          fontSize: 16,
        }}
      >
        Smart Home Services
      </Text>

      <ActivityIndicator
        size="large"
        color="#3B82F6"
        style={{ marginTop: 40 }}
      />
    </View>
  );
}