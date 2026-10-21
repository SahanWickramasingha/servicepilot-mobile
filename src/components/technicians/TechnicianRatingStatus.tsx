import { Text, TouchableOpacity, View } from "react-native";
import type { TechnicianRatingLoadState } from "@/src/utils/technicianRating";

/** Shared feedback for screens that already own the shared review hook. */
export function TechnicianRatingStatus({ ratings }: { ratings: TechnicianRatingLoadState & { retry: () => void } }) {
  if (ratings.status !== "stale" && ratings.status !== "error") return null;
  return <View>
    <Text accessibilityRole="alert" style={{ color: "#FCA5A5", fontSize: 12, lineHeight: 18 }}>{ratings.errorMessage}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry reviews" onPress={ratings.retry} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={{ color: "#60A5FA", fontWeight: "700" }}>Retry</Text>
    </TouchableOpacity>
  </View>;
}
