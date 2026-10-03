import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { locationIsFresh } from "@/functions/src/domain/map";
import { getJobTechnicianLocation, JobLocation } from "@/src/services/location.service";
import { ServiceRequest } from "@/src/services/request.service";
import TechnicianMap from "./TechnicianMap";
import { mapServiceErrorMessage } from "@/src/utils/mapServiceError";

export function JobTechnicianLocation({ request }: { request: ServiceRequest }) {
  const eligible = ["accepted", "assigned", "in_progress"].includes(request.status);
  const [result, setResult] = useState<JobLocation>();
  const [message, setMessage] = useState("Loading shared location…");
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  useFocusEffect(useCallback(() => {
    // Retry intentionally restarts the focused subscription.
    void retry;
    let alive = true;
    let fetching = false;
    setResult(undefined);
    if (!eligible) return () => { alive = false; };
    const load = async () => {
      if (fetching || AppState.currentState !== "active") return;
      fetching = true;
      try {
        const data = await getJobTechnicianLocation(request.id);
        if (alive && AppState.currentState === "active") { setResult(data); setMessage(data.status === "not-sharing" ? "The Technician is not sharing a location." : data.status === "stale" ? "The last location is stale. Waiting for a recent update." : ""); }
      } catch (error) {
        if (!alive) return;
        setResult(undefined);
        setMessage(mapServiceErrorMessage(error, "job"));
      } finally { fetching = false; if (alive) setNow(Date.now()); }
    };
    void load();
    const timer = setInterval(() => { setNow(Date.now()); void load(); }, 60000);
    const active = AppState.addEventListener("change", (state) => { if (state === "active") void load(); else setResult(undefined); });
    return () => { alive = false; clearInterval(timer); active.remove(); };
  }, [request.id, eligible, retry]));
  if (!eligible) return null;
  const point = result?.status === "available" && locationIsFresh(result.updatedAtMs, now) ? result : undefined;
  return <View style={styles.card}>
    <Text style={styles.title}>Technician location</Text>
    <Text style={styles.text}>Precise sharing is limited to your accepted or in-progress request.</Text>
    {point ? <><TechnicianMap points={[{ ...point, id: point.technicianId, title: request.technicianName || "Your Technician" }]} />
      <Text style={styles.text}>Updated {new Date(point.updatedAtMs).toLocaleTimeString()} • sharing while the Technician app is active</Text></> :
      <Text style={styles.text}>{result?.status === "available" ? "Location update expired. Waiting for a recent update." : message}</Text>}
    <Pressable onPress={() => setRetry((value) => value + 1)}><Text style={styles.link}>Refresh location</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 16, backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#17263A", borderRadius: 18, gap: 12, marginBottom: 14 },
  title: { color: "#F8FAFC", fontWeight: "800", fontSize: 16 }, text: { color: "#94A3B8", fontSize: 12, lineHeight: 19 }, link: { color: "#60A5FA", fontSize: 12, fontWeight: "700" } });
