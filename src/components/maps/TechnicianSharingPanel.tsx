import { useSyncExternalStore } from "react";
import { router } from "expo-router";
import { Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { UserProfile } from "@/src/services/user.service";
import { foregroundSharing } from "@/src/services/foreground-location.service";

export function TechnicianSharingPanel({ profile: _profile }: { profile: UserProfile }) {
  const sharing = useSyncExternalStore(foregroundSharing.subscribe, foregroundSharing.getSnapshot, foregroundSharing.getSnapshot);
  const busy = ["starting", "stopping"].includes(sharing.status);
  const toggle = (enabled: boolean) => { void (enabled ? foregroundSharing.enable() : foregroundSharing.stop()).catch(() => undefined); };
  return <View style={styles.card}>
    <Text style={styles.title}>Map & location sharing</Text>
    <Text style={styles.text}>Service districts and towns are saved in Personal Information, separately from current GPS.</Text>
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.push("/technician/personal-information")}>
      <Text style={styles.buttonText}>Edit Service Area</Text></Pressable>
    <View style={styles.toggleRow}><View style={{ flex: 1 }}>
      <Text style={styles.title}>Share current location</Text>
      <Text style={styles.text}>{sharing.status === "sharing" ? "Sharing while the app is active" :
        sharing.status === "paused" ? "Paused while the app is inactive" : busy ? "Updating sharing…" : "Location sharing is off"}</Text>
    </View><Switch accessibilityLabel="Share Technician location" value={sharing.enabled} disabled={busy}
      onValueChange={toggle} trackColor={{ false: "#334155", true: "#2563EB" }} thumbColor="#FFFFFF" /></View>
    <Text style={styles.text}>Customers browsing the map see an approximate area (about 1 km). Only your accepted or in-progress job Customer can view your precise shared location. No background tracking.</Text>
    {!!sharing.error && <>
      <Text accessibilityRole="alert" style={styles.error}>{sharing.error}</Text>
      <View style={styles.actions}><Pressable disabled={busy} style={styles.button} onPress={() => {
        void (async () => {
          if (sharing.revokeFailed) await foregroundSharing.stop();
          await foregroundSharing.enable();
        })().catch(() => undefined);
      }}><Text style={styles.buttonText}>Retry</Text></Pressable>
      <Pressable style={styles.button} onPress={() => { void Linking.openSettings(); }}><Text style={styles.buttonText}>Device settings</Text></Pressable></View>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: "#0D1B2A", borderColor: "#17263A", borderWidth: 1, borderRadius: 18, padding: 16, gap: 12, marginVertical: 18 },
  title: { color: "#F8FAFC", fontSize: 15, fontWeight: "800" }, text: { color: "#94A3B8", fontSize: 12, lineHeight: 19 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: 1, borderColor: "#17263A" },
  button: { paddingVertical: 12, paddingHorizontal: 15, borderRadius: 12, backgroundColor: "#16345A", alignItems: "center" },
  buttonText: { color: "#DBEAFE", fontWeight: "700", fontSize: 12 }, error: { color: "#FCA5A5", fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10 },
});
