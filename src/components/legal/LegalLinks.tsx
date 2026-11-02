import { router, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";
export function LegalLinks() {
  return <View style={{ gap: 4, paddingVertical: 16 }}>
    {Object.entries({ about: "About ServicePilot", terms: "Terms & Conditions", privacy: "Privacy Policy",
      support: "Support & Contact", deletion: "Request account deletion" }).map(([page, label]) =>
      <Pressable key={page} accessibilityRole="button" onPress={() => router.push(`/legal/${page}` as Href)} style={{ minHeight: 48, justifyContent: "center" }}>
        <Text style={{ color: "#60A5FA", fontSize: 15 }}>{label}</Text>
      </Pressable>)}
  </View>;
}
