import { router, useFocusEffect } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { MapPinned, Star, Wrench } from "lucide-react-native";
import { browsingDistanceKm, Coordinate, DISTRICTS, locationIsFresh, pointInDistrict } from "@/functions/src/domain/map";
import { declaredServiceAreaLabel } from "@/functions/src/domain/serviceAreas";
import { useCustomerMapLocation } from "@/src/hooks/useCustomerMapLocation";
import { SERVICE_CATEGORIES } from "@/src/constants/serviceRequests";
import { auth } from "@/src/firebase/config";
import { DistrictPicker } from "@/src/components/maps/DistrictPicker";
import TechnicianMap from "@/src/components/maps/TechnicianMap";
import { getLatestMapLocation, MapTechnician, PublicMapLocationSnapshot, SharedMapLocation, subscribeToMapLocation, subscribeToMapTechnicians } from "@/src/services/location.service";
import type { LocationFocus } from "@/src/components/maps/TechnicianMap.types";
import { MAP_MAX_ITEMS } from "@/functions/src/domain/mapProjection";
import { mapServiceErrorMessage } from "@/src/utils/mapServiceError";
import { technicianServiceAreaReference } from "@/src/utils/mapViewActions";

function updateLabel(location: SharedMapLocation | undefined, now: number): string {
  if (!location) return "Location unavailable";
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const mapTop = useRef(0);
  const [selectionIds, setSelectionIds] = useState<string[]>([]);
  const [focusLocation, setFocusLocation] = useState<LocationFocus>();
  const latestLocations = useRef<Record<string, PublicMapLocationSnapshot>>({});
  const locationRevisions = useRef<Record<string, number>>({});
  // Keep selection identity only; never freeze a saved area/name in card or banner state.
  const [serviceAreaSelection, setServiceAreaSelection] = useState<{ id: string; sequence: number }>();
  const viewSequence = useRef(0);
  const customer = useCustomerMapLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(Date.now());
  // Listener updates may arrive between timer ticks; evaluate them against the
  // current clock so a new server timestamp is not briefly labelled stale.
  const now = Math.max(clock, Date.now());
  const [pageCount, setPageCount] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const district = DISTRICTS.find((item) => item.id === districtId)!;
  const receiveLocation = useCallback((uid: string, value: PublicMapLocationSnapshot) => {
    const previous = latestLocations.current[uid];
    if (previous?.updatedAtMs !== undefined && value.updatedAtMs !== undefined && value.updatedAtMs < previous.updatedAtMs) return previous;
    latestLocations.current[uid] = value;
    locationRevisions.current[uid] = (locationRevisions.current[uid] ?? 0) + 1;
    setLocations((existing) => { const next = { ...existing }; if (value.location) next[uid] = value.location; else delete next[uid]; return next; });
    return value;
  }, []);

  useFocusEffect(useCallback(() => {
    void retry; // Explicit retry restarts the focused load.
    let alive = true;
    viewSequence.current++;
    let stopDirectory: (() => void) | undefined;
    const stop = () => { stopDirectory?.(); stopDirectory = undefined; };
    setLoading(true); setError(""); setTechnicians([]); setSelectedId(undefined); setSelectionIds([]); setFocusLocation(undefined); setServiceAreaSelection(undefined);
    const start = () => {
      stop();
      if (!auth.currentUser || AppState.currentState !== "active") return;
      setLoading(true);
      stopDirectory = subscribeToMapTechnicians(districtId, category || undefined, pageCount, (page) => {
        if (!alive) return;
        setTechnicians(page.items); setHasMore(page.hasMore); setError(""); setLoading(false);
      }, (cause) => {
        if (!alive) return;
        setError(mapServiceErrorMessage(cause)); setTechnicians([]); setLoading(false);
      });
    };
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      viewSequence.current++; latestLocations.current = {}; locationRevisions.current = {};
      stop(); setTechnicians([]); setLocations({}); setLocationErrors({});
      setSelectedId(undefined); setDetailsOpen(false); setSelectionIds([]); setFocusLocation(undefined); setServiceAreaSelection(undefined);
      if (user) start();
      else if (alive) { setLoading(false); setError("Please sign in to view the map."); }
    });
    const active = AppState.addEventListener("change", (state) => {
      if (state === "active") start(); else { viewSequence.current++; stop(); }
    });
    return () => { alive = false; viewSequence.current++; stop(); unsubscribe(); active.remove(); };
  }, [districtId, category, retry, pageCount]));

  const ids = technicians.map((item) => item.uid).sort().join("|");
  useFocusEffect(useCallback(() => {
    void retry; // Restart failed listeners on explicit retry.
    let alive = true;
    setLocations({}); setLocationErrors({});
    let unsubscribes: (() => void)[] = [];
    let generation = 0;
    const stop = () => { generation++; unsubscribes.forEach((unsubscribe) => unsubscribe()); unsubscribes = []; };
    const start = () => {
      stop();
      const customerId = auth.currentUser?.uid, version = generation;
      if (AppState.currentState !== "active" || !customerId) return;
      unsubscribes = ids ? ids.split("|").map((uid) => subscribeToMapLocation(uid, (point, updatedAtMs) => {
      if (!alive || generation !== version || auth.currentUser?.uid !== customerId) return;
      receiveLocation(uid, { location: point, updatedAtMs: updatedAtMs ?? point?.updatedAtMs });
      setLocationErrors((existing) => { const next = { ...existing }; delete next[uid]; return next; });
    }, (cause) => {
      if (!alive || generation !== version || auth.currentUser?.uid !== customerId) return;
      setLocations((existing) => { const next = { ...existing }; delete next[uid]; return next; });
      setLocationErrors((existing) => ({ ...existing, [uid]: mapServiceErrorMessage(cause) }));
    })) : [];
    };
    start();
    const active = AppState.addEventListener("change", (state) => {
      if (state === "active") start(); else { stop(); setLocations({}); }
    });
    return () => { alive = false; stop(); active.remove(); };
  }, [ids, retry, receiveLocation]));

  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 10000); return () => clearInterval(timer); }, []);
  const points = useMemo(() => technicians.flatMap((technician) => {
    const point = locations[technician.uid];
    return point ? [{ ...point, id: technician.uid, title: technician.fullName, stale: !locationIsFresh(point.updatedAtMs, now) }] : [];
  }), [technicians, locations, now]);
  const selected = technicians.find((technician) => technician.uid === selectedId);
  const serviceArea = useMemo(() => {
    const technician = technicians.find((item) => item.uid === serviceAreaSelection?.id);
    const reference = technician && technicianServiceAreaReference(technician, districtId);
    return reference && serviceAreaSelection ? { ...reference, sequence: serviceAreaSelection.sequence } : undefined;
  }, [technicians, serviceAreaSelection, districtId]);
  const refresh = () => setRetry((value) => value + 1);
  const showLocation = async (id: string) => {
    const customerId = auth.currentUser?.uid, sequence = ++viewSequence.current;
    const revision = locationRevisions.current[id] ?? 0;
    setDetailsOpen(false); setSelectionIds([]); setServiceAreaSelection(undefined);
    setMode("map"); setSelectedId(id); setFocusLocation({ id, sequence, phase: "checking" });
    const current = () => sequence === viewSequence.current && auth.currentUser?.uid === customerId && AppState.currentState === "active";
    try {
      const result = await getLatestMapLocation(id);
      if (!current()) return;
      // OFF/deletion observed during the read must win over a delayed older ON response.
      const observed = latestLocations.current[id];
      const latest = revision !== (locationRevisions.current[id] ?? 0) && observed &&
        (observed.updatedAtMs === undefined || result.updatedAtMs === undefined) ? observed : receiveLocation(id, result);
      const point = latest.location;
      setFocusLocation({ id, sequence, phase: !point ? "unavailable" : locationIsFresh(point.updatedAtMs) ? "ready" : "stale",
        ...(point ? { point, updatedAtMs: point.updatedAtMs } : {}) });
    } catch {
      if (current()) setFocusLocation({ id, sequence, phase: "error" });
    }
  };
  const showServiceArea = (id: string) => {
    const technician = technicians.find((item) => item.uid === id);
    if (!technician || !technicianServiceAreaReference(technician, districtId)) return;
    setDetailsOpen(false); setSelectionIds([]); setFocusLocation(undefined);
    setMode("map"); setSelectedId(id); setServiceAreaSelection({ id, sequence: ++viewSequence.current });
  };
  useEffect(() => { if ((focusLocation || serviceArea) && mode === "map") requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, mapTop.current - 55), animated: true })); }, [focusLocation, serviceArea, mode]);
  const outsideTechnicians = technicians.filter((technician) => locations[technician.uid] && !pointInDistrict(locations[technician.uid], district));
  const cardProps = { now, districtId, customerLocation: customer.location, onShowLocation: showLocation, onShowServiceArea: showServiceArea,
    onNavigate: () => { setDetailsOpen(false); setSelectionIds([]); } };

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#06101D" />
    <ScrollView ref={scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
      <Text style={styles.notice}>Use your foreground device location to calculate approximate straight-line distance. Browsing works without location permission.</Text>
      <Pressable accessibilityRole="button" disabled={customer.busy} style={[styles.button, styles.secondary]} onPress={() => { void customer.requestLocation(); }}>
        <Text style={styles.buttonText}>{customer.busy ? "Getting your location…" : "Use / refresh my location for distance"}</Text></Pressable>
      {!!customer.message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{customer.message}</Text>}
      {loading ? <View style={styles.state}><ActivityIndicator color="#60A5FA" /><Text style={styles.subtitle}>Loading approved Technicians…</Text></View> : error ?
        <View style={styles.state}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable style={styles.button} onPress={refresh}><Text style={styles.buttonText}>Retry</Text></Pressable></View> : <>
          <View style={styles.summary}><Text style={styles.subtitle}>{technicians.length} serving {district.name} • {points.length} shared locations</Text>
            <Pressable onPress={refresh}><Text style={styles.link}>Refresh</Text></Pressable></View>
          {Object.keys(locationErrors).length > 0 && <View style={styles.warning}><Text style={styles.error}>{Object.values(locationErrors)[0]} Your Technician list is still available.</Text>
            <Pressable onPress={refresh}><Text style={styles.link}>Retry locations</Text></Pressable></View>}
        </>}
      {mode === "map" && <>
        <View onLayout={(event) => { mapTop.current = event.nativeEvent.layout.y; }}>
          <TechnicianMap district={district} points={points} selectedId={selectedId} focusLocation={focusLocation}
            focusLocationStatus={focusLocation ? `${selected?.fullName ?? "Technician"}: ${focusLocation.phase === "checking" ? "Verifying the latest shared approximate GPS…" :
              focusLocation.phase === "error" ? "Unable to verify the latest shared GPS. Check your connection and retry." :
              focusLocation.phase === "stale" ? "Last shared GPS is stale. No fresh location is available; retry Show location." :
              focusLocation.phase === "unavailable" ? "Location unavailable. Sharing is off or no valid shared GPS is available." : updateLabel(locations[focusLocation.id], now)}` : undefined}
            serviceArea={serviceArea} onClearServiceArea={() => { viewSequence.current++; setServiceAreaSelection(undefined); setFocusLocation(undefined); }} onSelect={(ids) => {
            viewSequence.current++; setFocusLocation(undefined);
            if (ids.length === 1) { setSelectedId(ids[0]); setDetailsOpen(true); } else setSelectionIds(ids);
          }} />
        </View>
        <Pressable onPress={() => { void Linking.openURL("https://www.geoboundaries.org/"); }}><Text style={styles.attribution}>District boundaries: geoBoundaries / © OpenStreetMap contributors (ODbL)</Text></Pressable>
        <Pressable onPress={() => { void Linking.openURL("https://www.geonames.org/"); }}><Text style={styles.attribution}>Town references: GeoNames (CC BY 4.0)</Text></Pressable>
        {!loading && !error && !points.length && <Text style={styles.notice}>No usable shared markers. Technicians can still serve this district; view the list below.</Text>}
        {!loading && !error && outsideTechnicians.length > 0 && <View style={styles.list}>
          <Text style={styles.notice}>Serving {district.name} with current shared locations outside this district:</Text>
          {outsideTechnicians.map((technician) => <TechnicianCard key={technician.uid}
            technician={technician} location={locations[technician.uid]} {...cardProps} />)}
        </View>}
      </>}
        {!loading && !error && <>
          {technicians.length === 0 ? <View style={styles.state}><Wrench size={30} color="#64748B" />
            <Text style={styles.cardTitle}>No matching Technicians</Text><Text style={styles.subtitle}>Try another district or service category.</Text></View> :
            (mode === "list" || !points.length) && <View style={styles.list}>{technicians.map((technician) =>
              <TechnicianCard key={technician.uid} technician={technician} location={locations[technician.uid]} {...cardProps} />)}</View>}
          {mode === "map" && points.length > 0 && <Pressable style={styles.button} onPress={() => setMode("list")}><Text style={styles.buttonText}>View all {technicians.length} Technicians</Text></Pressable>}
          {hasMore && <Pressable style={[styles.button, styles.secondary]} onPress={() => setPageCount((count) => count + 1)}><Text style={styles.buttonText}>Load more Technicians</Text></Pressable>}
          {technicians.length >= MAP_MAX_ITEMS && <Text style={styles.notice}>Showing up to {MAP_MAX_ITEMS} matches. Choose a service category to narrow the list.</Text>}
        </>}
    </ScrollView>
    <Modal visible={selectionIds.length > 0} transparent animationType="slide" onRequestClose={() => setSelectionIds([])}>
      <View style={styles.overlay}><View style={styles.sheet}><Text accessibilityRole="header" style={styles.cardTitle}>Technicians at overlapping locations</Text>
        <ScrollView>{technicians.filter((t) => selectionIds.includes(t.uid)).map((technician) =>
          <Pressable accessibilityRole="button" accessibilityLabel={`Select ${technician.fullName}`} key={technician.uid} style={styles.card}
            onPress={() => { setSelectedId(technician.uid); setSelectionIds([]); setDetailsOpen(true); }}>
            <Text style={styles.cardTitle}>{technician.fullName}</Text><Text style={styles.subtitle}>{technician.specialization} • {updateLabel(locations[technician.uid], now)}</Text>
          </Pressable>)}</ScrollView>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setSelectionIds([])}><Text style={styles.buttonText}>Close</Text></Pressable>
      </View></View>
    </Modal>
    <Modal visible={detailsOpen && !!selected && !loading && !error} transparent animationType="slide" onRequestClose={() => setDetailsOpen(false)}>
      <View style={styles.overlay}><View style={styles.sheet}>
        <ScrollView>{selected && <TechnicianCard technician={selected} location={locations[selected.uid]} {...cardProps} />}</ScrollView>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setDetailsOpen(false)}><Text style={styles.buttonText}>Close</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

function TechnicianCard({ technician, location, now, districtId, customerLocation, onShowLocation, onShowServiceArea, onNavigate }: {
  technician: MapTechnician; location?: SharedMapLocation; now: number; districtId: string;
  customerLocation?: Coordinate & { updatedAtMs: number }; onShowLocation: (id: string) => void; onNavigate: () => void;
  onShowServiceArea: (id: string) => void;
}) {
  const district = DISTRICTS.find((item) => item.id === districtId)!;
  const service = SERVICE_CATEGORIES.find((value) => value.toLowerCase() === technician.specialization.toLowerCase());
  const outside = location && !pointInDistrict(location, district);
  const distance = browsingDistanceKm(customerLocation, location, now);
  return <View style={styles.card} accessibilityLiveRegion="polite">
    <View style={styles.cardHeader}><View style={styles.avatar}><Wrench size={22} color="#60A5FA" /></View><View style={{ flex: 1 }}>
      <Text style={styles.cardTitle}>{technician.fullName}</Text><Text style={styles.subtitle}>{technician.specialization}</Text>
    </View><Star size={15} color="#F59E0B" /><Text style={styles.rating}>{technician.reviewCount > 0 ? technician.averageRating.toFixed(1) : "New"}</Text></View>
    <Text style={styles.subtitle}>{technician.reviewCount} review{technician.reviewCount === 1 ? "" : "s"} • Serves {declaredServiceAreaLabel(districtId, technician.serviceAreasByDistrict)}</Text>
    <Text style={[styles.subtitle, location && !locationIsFresh(location.updatedAtMs, now) && styles.stale]}>{updateLabel(location, now)}</Text>
    {location?.updatedAtMs && <Text style={styles.subtitle}>Last updated: {new Date(location.updatedAtMs).toLocaleString()}</Text>}
    <Text style={styles.subtitle}>{distance === undefined ? "Distance unavailable" : `Approximately ${distance.toFixed(1)} km away`}</Text>
    {outside && <Text style={styles.notice}>Serves {district.name}; {locationIsFresh(location?.updatedAtMs, now) ? "current shared location is" : "last shared location was"} outside this district.</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Show service area for ${technician.fullName}`} style={[styles.button, styles.serviceAreaButton]}
      onPress={() => onShowServiceArea(technician.uid)}><Text style={styles.buttonText}>Show service area</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Show shared location for ${technician.fullName}`} style={[styles.button, styles.secondary]}
      onPress={() => onShowLocation(technician.uid)}><Text style={styles.buttonText}>Show location</Text></Pressable>
    <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel={`View profile for ${technician.fullName}`} style={[styles.button, styles.secondary]} onPress={() => { onNavigate(); router.push({ pathname: "/technician-profile", params: { id: technician.uid } }); }}>
      <Text style={styles.buttonText}>View Profile</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Request service from ${technician.fullName}`} style={styles.button} onPress={() => { onNavigate(); router.push({ pathname: "/create-request", params: { technicianId: technician.uid, ...(service ? { service } : {}) } }); }}>
      <Text style={styles.buttonText}>Request Service</Text></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0D1B2A", maxHeight: "75%", padding: 20, gap: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
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
  serviceAreaButton: { backgroundColor: "#5C4218", minHeight: 48, justifyContent: "center" },
});
