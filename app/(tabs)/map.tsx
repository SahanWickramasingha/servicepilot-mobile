import { router, useFocusEffect } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { MapPinned, Star, Wrench } from "lucide-react-native";
import { DISTRICTS, locationIsFresh, pointInDistrict } from "@/functions/src/domain/map";
import { SERVICE_CATEGORIES } from "@/src/constants/serviceRequests";
import { auth } from "@/src/firebase/config";
import { DistrictPicker } from "@/src/components/maps/DistrictPicker";
import TechnicianMap from "@/src/components/maps/TechnicianMap";
import { getMapTechnicianPage, MapTechnician, SharedMapLocation, subscribeToMapLocation } from "@/src/services/location.service";
import { MAP_MAX_ITEMS } from "@/functions/src/domain/mapProjection";
import { mapServiceErrorMessage } from "@/src/utils/mapServiceError";

function updateLabel(location: SharedMapLocation | undefined, now: number): string {
  if (!location) return "No shared location";
  if (!location.updatedAtMs) return "Update time unavailable • stale";
  const seconds = Math.max(0, Math.floor((now - location.updatedAtMs) / 1000));
  const age = seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : new Date(location.updatedAtMs).toLocaleString();
  return `${locationIsFresh(location.updatedAtMs, now) ? "Updated" : "Stale • last updated"} ${age}`;
}

export default function CustomerMapScreen() {
  const [districtId, setDistrictId] = useState("colombo");
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState<"map" | "list">("map");
  const [technicians, setTechnicians] = useState<MapTechnician[]>([]);
  const [locations, setLocations] = useState<Record<string, SharedMapLocation>>({});
  const [locationErrors, setLocationErrors] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pageCount, setPageCount] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const district = DISTRICTS.find((item) => item.id === districtId)!;

  useFocusEffect(useCallback(() => {
    void retry; // Explicit retry restarts the focused load.
    let alive = true;
    let fetching = false;
    setLoading(true); setError(""); setTechnicians([]); setSelectedId(undefined);
    const load = async () => {
      if (fetching || !auth.currentUser || AppState.currentState !== "active") return;
      fetching = true;
      try {
        const items: MapTechnician[] = [];
        let cursor: string | undefined;
        let more = false;
        for (let page = 0; page < pageCount; page++) {
          const result = await getMapTechnicianPage(districtId, category || undefined, cursor);
          items.push(...result.items); cursor = result.cursor; more = result.hasMore;
          if (!more) break;
        }
        items.sort((a, b) => b.averageRating - a.averageRating || a.fullName.localeCompare(b.fullName));
        if (alive) setHasMore(more && items.length < MAP_MAX_ITEMS);
        if (alive) { setTechnicians(items); setError(""); }
      } catch (cause) {
        if (!alive) return;
        setError(mapServiceErrorMessage(cause));
        setTechnicians([]);
      } finally { fetching = false; if (alive) setLoading(false); }
    };
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) void load();
      else if (alive) { setTechnicians([]); setLoading(false); setError("Please sign in to view the map."); }
    });
    const timer = setInterval(() => { void load(); }, 300000);
    const active = AppState.addEventListener("change", (state) => { if (state === "active") void load(); });
    return () => { alive = false; unsubscribe(); clearInterval(timer); active.remove(); };
  }, [districtId, category, retry, pageCount]));

  const ids = technicians.map((item) => item.uid).join("|");
  useFocusEffect(useCallback(() => {
    void retry; // Restart failed listeners on explicit retry.
    let alive = true;
    setLocations({}); setLocationErrors({});
    let unsubscribes: (() => void)[] = [];
    const stop = () => { unsubscribes.forEach((unsubscribe) => unsubscribe()); unsubscribes = []; };
    const start = () => {
      stop();
      if (AppState.currentState !== "active") return;
      unsubscribes = ids ? ids.split("|").map((uid) => subscribeToMapLocation(uid, (point) => {
      if (!alive) return;
      setLocations((existing) => { const next = { ...existing }; if (point) next[uid] = point; else delete next[uid]; return next; });
      setLocationErrors((existing) => { const next = { ...existing }; delete next[uid]; return next; });
    }, (cause) => {
      if (!alive) return;
      setLocations((existing) => { const next = { ...existing }; delete next[uid]; return next; });
      setLocationErrors((existing) => ({ ...existing, [uid]: mapServiceErrorMessage(cause) }));
    })) : [];
    };
    start();
    const active = AppState.addEventListener("change", (state) => {
      if (state === "active") start(); else { stop(); setLocations({}); }
    });
    return () => { alive = false; stop(); active.remove(); };
  }, [ids, retry]));

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  const points = useMemo(() => technicians.flatMap((technician) => {
    const point = locations[technician.uid];
    return point ? [{ ...point, id: technician.uid, title: technician.fullName, stale: !locationIsFresh(point.updatedAtMs, now) }] : [];
  }), [technicians, locations, now]);
  const selected = technicians.find((technician) => technician.uid === selectedId);
  const refresh = () => setRetry((value) => value + 1);

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#06101D" />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><MapPinned size={32} color="#60A5FA" /><View style={{ flex: 1 }}>
        <Text style={styles.title}>Find a Technician</Text><Text style={styles.subtitle}>Approved professionals serving your district</Text>
      </View></View>
      <DistrictPicker selected={[districtId]} onChange={(values) => { if (values[0]) { setPageCount(1); setDistrictId(values[0]); } }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {["", ...SERVICE_CATEGORIES].map((value) => <Pressable key={value} style={[styles.chip, category === value && styles.active]}
          onPress={() => { setPageCount(1); setCategory(value); }}><Text style={styles.chipText}>{value || "All services"}</Text></Pressable>)}
      </ScrollView>
      <View style={styles.switcher}>{(["map", "list"] as const).map((value) => <Pressable key={value}
        style={[styles.mode, mode === value && styles.active]} onPress={() => setMode(value)}>
        <Text style={styles.chipText}>{value === "map" ? "Map" : "List"}</Text></Pressable>)}</View>
      <Text style={styles.notice}>District filters show where Technicians serve. Markers show an approximate shared area, which may be elsewhere. Grey markers show stale locations.</Text>
      {loading ? <View style={styles.state}><ActivityIndicator color="#60A5FA" /><Text style={styles.subtitle}>Loading approved Technicians…</Text></View> : error ?
        <View style={styles.state}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable style={styles.button} onPress={refresh}><Text style={styles.buttonText}>Retry</Text></Pressable></View> : <>
          <View style={styles.summary}><Text style={styles.subtitle}>{technicians.length} serving {district.name} • {points.length} shared locations</Text>
            <Pressable onPress={refresh}><Text style={styles.link}>Refresh</Text></Pressable></View>
          {Object.keys(locationErrors).length > 0 && <View style={styles.warning}><Text style={styles.error}>{Object.values(locationErrors)[0]} Your Technician list is still available.</Text>
            <Pressable onPress={refresh}><Text style={styles.link}>Retry locations</Text></Pressable></View>}
        </>}
      {mode === "map" && <>
        <TechnicianMap district={district} points={points} selectedId={selectedId} onSelect={setSelectedId} />
        <Pressable onPress={() => { void Linking.openURL("https://www.geoboundaries.org/"); }}><Text style={styles.attribution}>District boundaries: geoBoundaries / © OpenStreetMap contributors (ODbL)</Text></Pressable>
        {!loading && !error && !points.length && <Text style={styles.notice}>No usable shared markers. Technicians can still serve this district; view the list below.</Text>}
        {!loading && !error && selected && <TechnicianCard technician={selected} location={locations[selected.uid]} now={now} districtId={districtId} />}
      </>}
        {!loading && !error && <>
          {technicians.length === 0 ? <View style={styles.state}><Wrench size={30} color="#64748B" />
            <Text style={styles.cardTitle}>No matching Technicians</Text><Text style={styles.subtitle}>Try another district or service category.</Text></View> :
            (mode === "list" || !points.length) && <View style={styles.list}>{technicians.map((technician) =>
              <TechnicianCard key={technician.uid} technician={technician} location={locations[technician.uid]} now={now} districtId={districtId} />)}</View>}
          {mode === "map" && points.length > 0 && <Pressable style={styles.button} onPress={() => setMode("list")}><Text style={styles.buttonText}>View all {technicians.length} Technicians</Text></Pressable>}
          {hasMore && <Pressable style={[styles.button, styles.secondary]} onPress={() => setPageCount((count) => count + 1)}><Text style={styles.buttonText}>Load more Technicians</Text></Pressable>}
          {technicians.length >= MAP_MAX_ITEMS && <Text style={styles.notice}>Showing up to {MAP_MAX_ITEMS} matches. Choose a service category to narrow the list.</Text>}
        </>}
    </ScrollView>
  </View>;
}

function TechnicianCard({ technician, location, now, districtId }: { technician: MapTechnician; location?: SharedMapLocation; now: number; districtId: string }) {
  const district = DISTRICTS.find((item) => item.id === districtId)!;
  const service = SERVICE_CATEGORIES.find((value) => value.toLowerCase() === technician.specialization.toLowerCase());
  const outside = location && !pointInDistrict(location, district);
  return <View style={styles.card}>
    <View style={styles.cardHeader}><View style={styles.avatar}><Wrench size={22} color="#60A5FA" /></View><View style={{ flex: 1 }}>
      <Text style={styles.cardTitle}>{technician.fullName}</Text><Text style={styles.subtitle}>{technician.specialization}</Text>
    </View><Star size={15} color="#F59E0B" /><Text style={styles.rating}>{technician.reviewCount > 0 ? technician.averageRating.toFixed(1) : "New"}</Text></View>
    <Text style={styles.subtitle}>{technician.reviewCount} review{technician.reviewCount === 1 ? "" : "s"} • Serves {district.name}</Text>
    <Text style={[styles.subtitle, location && !locationIsFresh(location.updatedAtMs, now) && styles.stale]}>{updateLabel(location, now)}</Text>
    {outside && <Text style={styles.notice}>The approximate {locationIsFresh(location?.updatedAtMs, now) ? "shared" : "last shared"} marker appears outside {district.name}. This Technician serves the selected district.</Text>}
    <View style={styles.actions}><Pressable style={[styles.button, styles.secondary]} onPress={() => router.push({ pathname: "/technician-profile", params: { id: technician.uid } })}>
      <Text style={styles.buttonText}>View Profile</Text></Pressable><Pressable style={styles.button} onPress={() => router.push({ pathname: "/create-request", params: { technicianId: technician.uid, ...(service ? { service } : {}) } })}>
      <Text style={styles.buttonText}>Request Service</Text></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#06101D" }, content: { padding: 18, paddingTop: 55, paddingBottom: 120, maxWidth: 640, width: "100%", alignSelf: "center", gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 }, title: { color: "#FFFFFF", fontSize: 26, fontWeight: "800" },
  subtitle: { color: "#94A3B8", fontSize: 12, lineHeight: 19 }, filters: { gap: 8 }, chip: { padding: 12, borderRadius: 12, backgroundColor: "#0D1B2A" },
  chipText: { color: "#E2E8F0", fontSize: 12, fontWeight: "700" }, active: { backgroundColor: "#2563EB" }, switcher: { flexDirection: "row", backgroundColor: "#0D1B2A", padding: 4, borderRadius: 14 },
  mode: { flex: 1, alignItems: "center", padding: 13, borderRadius: 11 }, notice: { color: "#94A3B8", fontSize: 11, lineHeight: 18 },
  attribution: { color: "#64748B", fontSize: 9, marginTop: -7 }, summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { color: "#60A5FA", fontWeight: "700", fontSize: 12 }, state: { padding: 24, alignItems: "center", gap: 13, backgroundColor: "#0D1B2A", borderRadius: 18 },
  error: { color: "#FCA5A5", fontSize: 12, lineHeight: 20 }, warning: { padding: 13, backgroundColor: "#311A22", borderRadius: 12, gap: 8 },
  card: { backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#17263A", borderRadius: 18, padding: 16, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 }, cardTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "800" },
  avatar: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#16345A", justifyContent: "center", alignItems: "center" },
  rating: { color: "#F8FAFC", fontSize: 13, fontWeight: "800" }, stale: { color: "#FBBF24" }, actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  button: { flexGrow: 1, backgroundColor: "#2563EB", borderRadius: 12, padding: 13, alignItems: "center" }, secondary: { backgroundColor: "#16345A" },
  buttonText: { color: "#F8FAFC", fontSize: 12, fontWeight: "700" }, list: { gap: 12 },
});
