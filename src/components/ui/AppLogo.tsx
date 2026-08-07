import { View, Text } from "react-native";
// A reusable component that displays the app logo and name
export default function AppLogo() {
  return (
    <View
      style={{
        alignItems: "center",
        marginBottom: 30,
      }}
    >
      <Text
        style={{
          fontSize: 54,
        }}
      >
        🔧
      </Text>

      <Text
        style={{
          fontSize: 32,
          fontWeight: "bold",
          marginTop: 12,
        }}
      >
        ServicePilot
      </Text>

      <Text
        style={{
          marginTop: 6,
          color: "#64748B",
        }}
      >
        Smart Home Services
      </Text>
    </View>
  );
}