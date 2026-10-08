import { StyleSheet, Text, View } from "react-native";
import { availabilityDisplay } from "@/functions/src/domain/availability";

export function AvailabilityBadge({ availability, showDescription = false }: { availability?: unknown; showDescription?: boolean }) {
  const state = availabilityDisplay(availability);
  return <View style={styles.container} accessibilityLiveRegion="polite">
    <View style={[styles.badge, { backgroundColor: state.background }]}>
      <Text style={[styles.label, { color: state.color }]}>{state.label}</Text>
    </View>
    {showDescription && <Text style={styles.description}>{state.description}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 5, marginVertical: 7, alignItems: "flex-start" },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  label: { fontSize: 12, fontWeight: "700" },
  description: { color: "#94A3B8", fontSize: 12, lineHeight: 19 },
});
