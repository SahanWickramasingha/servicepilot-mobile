import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import type { TechnicianRatingLoadState } from "@/src/utils/technicianRating";

/** Shared feedback for screens that already own the shared review hook. */
export function TechnicianRatingStatus({ ratings }: { ratings: TechnicianRatingLoadState & { retry: () => void } }) {
  if (ratings.updating) return <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
    <ActivityIndicator size="small" color="#94A3B8" />
    <Text accessibilityLiveRegion="polite" style={{ color: "#94A3B8", fontSize: 12 }}>Updating ratings…</Text>
  </View>;
  if (ratings.status !== "stale" && ratings.status !== "error") return null;
  return <View>
    <Text accessibilityRole="alert" style={{ color: "#94A3B8", fontSize: 12, lineHeight: 18 }}>{ratings.summary ? "Showing saved ratings" : "Reviews are temporarily unavailable."}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry reviews" onPress={ratings.retry} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={{ color: "#60A5FA", fontWeight: "700" }}>Retry</Text>
    </TouchableOpacity>
  </View>;
}
