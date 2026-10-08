import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { TECHNICIAN_AVAILABILITIES, TechnicianAvailability, availabilityDisplay } from "@/functions/src/domain/availability";
import { auth } from "@/src/firebase/config";
import { UserProfile, updateTechnicianAvailability } from "@/src/services/user.service";
import { AvailabilityBadge } from "./AvailabilityBadge";

export function TechnicianAvailabilityPanel({ profile }: { profile: UserProfile }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const operation = useRef(0);
  useEffect(() => {
    operation.current = operation.current + 1;
    setSaving(false); setMessage(""); setError("");
    return () => { operation.current++; };
  }, [profile.uid]);
  const save = async (value: TechnicianAvailability) => {
    const version = ++operation.current;
    const isCurrent = () => operation.current === version && auth.currentUser?.uid === profile.uid;
    setSaving(true); setMessage(""); setError("");
    try {
      await updateTechnicianAvailability(profile.uid, value);
      if (isCurrent()) setMessage(`Saved: ${availabilityDisplay(value).label}`);
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : "Unable to save availability. Please retry.");
    } finally { if (isCurrent()) setSaving(false); }
  };
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>Availability</Text>
    <AvailabilityBadge availability={profile.availability} showDescription />
    <View style={styles.options}>{TECHNICIAN_AVAILABILITIES.map((value) => <Pressable key={value}
      accessibilityRole="radio" accessibilityState={{ checked: profile.availability === value, disabled: saving }}
      accessibilityLabel={`${availabilityDisplay(value).label}: ${availabilityDisplay(value).description}`}
      disabled={saving} onPress={() => { void save(value); }}
      style={[styles.option, profile.availability === value && styles.selected, saving && styles.disabled]}>
      <Text style={styles.optionText}>{availabilityDisplay(value).label}</Text>
    </Pressable>)}</View>
    <Text style={styles.text}>Choose Busy when your workload prevents new requests. Active jobs do not change this choice automatically; existing jobs remain accessible. Completing a job keeps your chosen status.</Text>
    <Text style={styles.text}>Availability is separate from GPS sharing and service areas. Closing or backgrounding the app does not change it.</Text>
    {saving && <View style={styles.saving}><ActivityIndicator color="#60A5FA" /><Text style={styles.text}>Saving availability…</Text></View>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: "#0D1B2A", borderColor: "#17263A", borderWidth: 1, borderRadius: 18, padding: 16, gap: 10, marginVertical: 14 },
  title: { color: "#F8FAFC", fontSize: 16, fontWeight: "800" }, text: { color: "#94A3B8", fontSize: 12, lineHeight: 19 },
  options: { flexDirection: "row", gap: 8 }, option: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#16345A", alignItems: "center" },
  selected: { backgroundColor: "#2563EB" }, disabled: { opacity: 0.5 }, optionText: { color: "#F8FAFC", fontSize: 13, fontWeight: "700" },
  saving: { flexDirection: "row", gap: 10, alignItems: "center" }, error: { color: "#FCA5A5", fontSize: 12 }, success: { color: "#86EFAC", fontSize: 12 },
});
