import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, PixelRatio, Platform, StyleSheet, View, Text, Pressable } from "react-native";
import MapView, { Circle, Marker, Polygon, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { MapPinned, Minus, Plus, Wrench } from "lucide-react-native";
import { MapPoint, TechnicianMapProps } from "./TechnicianMap.types";
import { groupMarkerPoints } from "@/src/utils/technicianMarkerGroups";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, relativeCameraZoom } from "@/src/utils/mapViewActions";

// Maps 1.20.1 under Android's Fabric interop can retain its 100px bitmap
// fallback instead of reporting child size. Keep the whole pin inside it on
// high-density screens. iOS uses the full design size.
const pinScale = Platform.OS === "android" ? Math.min(1, 96 / (56 * PixelRatio.get())) : 1;
const pinSize = (value: number) => value * pinScale;

function districtRegion(district: TechnicianMapProps["district"]): Region {
  if (!district) return { latitude: 7.8, longitude: 80.7, latitudeDelta: 4.2, longitudeDelta: 3.5 };
  const [south, west, north, east] = district.bounds;
  return { latitude: (south + north) / 2, longitude: (west + east) / 2,
    latitudeDelta: (north - south) * 1.3, longitudeDelta: (east - west) * 1.3 };
}

function WrenchPin({ group, selected, onPress }: { group: MapPoint[]; selected: boolean; onPress: () => void }) {
  const marker = useRef<React.ComponentRef<typeof Marker>>(null);
  const [tracking, setTracking] = useState(true);
  const stale = group.every((point) => point.stale);
  const color = stale ? "#64748B" : selected ? "#22D3EE" : "#2563EB";
  // Android snapshots custom children. Allow initial SVG/layout rendering, then
  // stop continuous bitmap tracking. A new freshness/group/selection key remounts.
  useEffect(() => { const timer = setTimeout(() => { marker.current?.redraw(); setTracking(false); }, 500);
    return () => clearTimeout(timer); }, []);
  const title = group.length > 1 ? `${group.length} technicians — choose one` : group[0].title;
  const status = stale ? "Stale — last shared location" : group.some((p) => p.stale) ? "Shared locations — includes stale locations" : "Fresh approximate shared location";
  return <Marker ref={marker} identifier={group[0].id} coordinate={group[0]} title={title}
    style={styles.marker}
    description={status} accessibilityLabel={`${title}. ${status}`} accessibilityRole="button"
    anchor={{ x: 0.5, y: 1 }} tracksViewChanges={tracking} onPress={onPress}>
    <View collapsable={false} style={styles.marker} onLayout={() => marker.current?.redraw()}>
      <View style={styles.markerTipOutline} /><View style={[styles.markerTip, { borderTopColor: color }]} />
      <View style={[styles.markerHead, { backgroundColor: color }]}><Wrench size={pinSize(24)} color="#FFFFFF" strokeWidth={2.5} /></View>
      {group.length > 1 && <View style={styles.badge}><Text style={styles.badgeText}>{group.length}</Text></View>}
    </View>
  </Marker>;
}

const darkMap = [
  { elementType: "geometry", stylers: [{ color: "#142638" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94A3B8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#06101D" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#06101D" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#30465B" }] },
];
export default function TechnicianMap({ district, points, selectedId, onSelect, focusLocation, focusLocationStatus, serviceArea, onClearServiceArea }: TechnicianMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [region, setRegion] = useState(() => districtRegion(district));
  const [width, setWidth] = useState(350);
  const [zoomBusy, setZoomBusy] = useState(false);
  const zoomPending = useRef(false);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cameraVersion = useRef(0);
  const appliedLocationSequence = useRef<number | undefined>(undefined);
  useEffect(() => () => { cameraVersion.current++; if (zoomTimer.current) clearTimeout(zoomTimer.current); }, []);
  const showDistrict = useCallback(() => { cameraVersion.current++; if (ready) map.current?.animateToRegion(districtRegion(district), 400); }, [ready, district]);
  const zoom = async (direction: 1 | -1) => {
    if (!ready || !map.current || zoomPending.current) return;
    const instance = map.current, version = cameraVersion.current;
    zoomPending.current = true; setZoomBusy(true);
    let animated = false;
    try {
      const camera = await instance.getCamera();
      if (map.current !== instance || version !== cameraVersion.current) return;
      const update = relativeCameraZoom(camera, direction);
      if (!update) throw new Error("Camera unavailable");
      instance.animateCamera(update, { duration: 200 });
      animated = true;
      zoomTimer.current = setTimeout(() => { zoomPending.current = false; setZoomBusy(false); }, 250);
    } catch {
      if (map.current === instance) AccessibilityInfo.announceForAccessibility("Zoom unavailable. Use pinch to zoom.");
    } finally {
      if (!animated) { zoomPending.current = false; if (map.current === instance) setZoomBusy(false); }
    }
  };
  const fit = () => {
    if (!ready) return;
    cameraVersion.current++; onClearServiceArea?.();
    if (points.length === 1 && !district) map.current?.animateToRegion({ latitude: points[0].latitude, longitude: points[0].longitude,
      latitudeDelta: 0.035, longitudeDelta: 0.035 }, 400);
    else if (points.length) {
      const bounds = district?.bounds;
      const corners = bounds ? [{ latitude: bounds[0], longitude: bounds[1] }, { latitude: bounds[2], longitude: bounds[3] }] : [];
      map.current?.fitToCoordinates([...points, ...corners], { edgePadding: { top: 65, bottom: 65, left: 55, right: 55 }, animated: true });
    } else showDistrict();
  };
  useEffect(showDistrict, [showDistrict]);
  const selectedPoint = points.find((point) => point.id === focusLocation?.id);
  const focusPoint = focusLocation?.point;
  useEffect(() => {
    if (focusLocation?.phase !== "ready" || !selectedPoint || selectedPoint.stale) return;
    if (!ready || !focusPoint || !focusLocation || serviceArea || appliedLocationSequence.current === focusLocation.sequence) return;
    cameraVersion.current++;
    appliedLocationSequence.current = focusLocation.sequence;
    map.current?.animateToRegion({ latitude: focusPoint.latitude, longitude: focusPoint.longitude, latitudeDelta: 0.035, longitudeDelta: 0.035 }, 400);
  }, [ready, focusLocation, focusPoint, selectedPoint, serviceArea]); // Verified action moves the camera once; subsequent GPS updates move only the marker.
  useEffect(() => {
    cameraVersion.current++;
    if (ready && serviceArea) map.current?.animateToRegion(serviceArea.townReference ? {
      ...serviceArea.townReference, latitudeDelta: 0.055, longitudeDelta: 0.055,
    } : districtRegion(serviceArea.district), 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Follow saved-area changes, not unrelated GPS/rating updates.
  }, [ready, serviceArea?.sequence, serviceArea?.district.id, serviceArea?.label, serviceArea?.townReference?.latitude, serviceArea?.townReference?.longitude]);
  const groups = groupMarkerPoints(points, region.latitudeDelta, region.longitudeDelta, width, 370);
  const geometry = district?.geometry;
  const polygons = geometry ? (geometry.type === "Polygon" ? [geometry.coordinates as number[][][]] : geometry.coordinates as number[][][][]) : [];
  const serviceGeometry = !serviceArea?.townReference ? serviceArea?.district.geometry : undefined;
  const servicePolygons = serviceGeometry ? (serviceGeometry.type === "Polygon" ? [serviceGeometry.coordinates as number[][][]] : serviceGeometry.coordinates as number[][][][]) : [];
  const coordinates = (ring: number[][]) => ring.map(([longitude, latitude]) => ({ latitude, longitude }));
  return <View style={styles.container} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    <MapView ref={map} style={StyleSheet.absoluteFillObject} provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      initialRegion={districtRegion(district)} onRegionChangeComplete={setRegion}
      minZoomLevel={MAP_MIN_ZOOM} maxZoomLevel={MAP_MAX_ZOOM} zoomControlEnabled={false}
      customMapStyle={darkMap} userInterfaceStyle="dark" onMapReady={() => setReady(true)}
      showsUserLocation={false} showsMyLocationButton={false} toolbarEnabled={false}>
      {polygons.map((rings, index) => <Polygon key={`${district?.id}-${index}`} coordinates={coordinates(rings[0])}
        holes={rings.slice(1).map(coordinates)} strokeColor="#60A5FA" strokeWidth={2} fillColor="#2563EB14" />)}
      {servicePolygons.map((rings, index) => <Polygon key={`service-${serviceArea?.technicianId}-${index}`} coordinates={coordinates(rings[0])}
        holes={rings.slice(1).map(coordinates)} strokeColor="#F59E0B" strokeWidth={3} fillColor="#F59E0B22" />)}
      {serviceArea?.townReference && <Marker key={`service-town-${serviceArea.label}`} coordinate={serviceArea.townReference}
        pinColor="#F59E0B" title={serviceArea.label} description={serviceArea.detail}
        accessibilityLabel={`${serviceArea.label}. ${serviceArea.detail}`} />}
      {groups.map((group) => <WrenchPin key={group.map((point) => `${point.id}:${point.stale}:${point.id === selectedId}`).join("|")}
        group={group} selected={group.some((p) => p.id === selectedId)} onPress={() => onSelect?.(group.map((p) => p.id))} />)}
      {district && points.map((point) => <Circle key={`area-${point.id}`} center={point} radius={800}
        strokeColor="#60A5FA60" fillColor="#2563EB15" />)}
    </MapView>
    <Pressable accessibilityRole="button" accessibilityLabel="Fit map to service district and shared locations" style={styles.fit} onPress={fit}><Text style={styles.text}>Fit map</Text></Pressable>
    <Pressable accessibilityRole="button" style={[styles.fit, { top: 60 }]} onPress={() => { onClearServiceArea?.(); showDistrict(); }}><Text style={styles.text}>Show district</Text></Pressable>
    {serviceArea && <View pointerEvents="none" accessibilityLiveRegion="polite" style={styles.serviceArea}>
      <View style={styles.serviceAreaHeading}><MapPinned size={16} color="#FBBF24" /><Text style={styles.serviceAreaLabel}>{serviceArea.label}</Text></View>
      <Text style={styles.serviceAreaDetail}>{serviceArea.detail}</Text>
    </View>}
    {focusLocation && !serviceArea && <View pointerEvents="none" accessibilityLiveRegion="polite"
      style={[styles.serviceArea, styles.locationStatus]}>
      <Text style={styles.locationStatusText}>{focusLocation.phase === "checking" ? "Checking shared GPS location" :
        focusLocation.phase !== "ready" || !selectedPoint || selectedPoint.stale ? "Current location unavailable" : "Approximate shared GPS location"}</Text>
      <Text style={styles.locationStatusText}>{focusLocationStatus ?? (focusPoint ?
        (selectedPoint?.stale ? "Stale — last shared location" : "Fresh shared location") : "Sharing is off or no valid shared GPS is available.")}</Text>
    </View>}
    <View style={styles.zoomControls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" accessibilityHint="Zoom in at the current map position"
        accessibilityState={{ disabled: !ready || zoomBusy }} disabled={!ready || zoomBusy} style={styles.zoomButton} onPress={() => { void zoom(1); }}><Plus size={20} color="#F8FAFC" /></Pressable>
      <View style={styles.zoomDivider} />
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" accessibilityHint="Zoom out at the current map position"
        accessibilityState={{ disabled: !ready || zoomBusy }} disabled={!ready || zoomBusy} style={styles.zoomButton} onPress={() => { void zoom(-1); }}><Minus size={20} color="#F8FAFC" /></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({ container: { height: 370, backgroundColor: "#0D1B2A", borderRadius: 20, overflow: "hidden" },
  marker: { width: pinSize(56), height: pinSize(56) },
  markerHead: { position: "absolute", top: pinSize(3), left: pinSize(7), width: pinSize(42), height: pinSize(42), borderRadius: pinSize(21), borderWidth: pinSize(3), borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  markerTipOutline: { position: "absolute", bottom: 0, left: pinSize(17), borderLeftWidth: pinSize(11), borderRightWidth: pinSize(11), borderTopWidth: pinSize(20), borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FFFFFF" },
  markerTip: { position: "absolute", bottom: pinSize(3), left: pinSize(20), borderLeftWidth: pinSize(8), borderRightWidth: pinSize(8), borderTopWidth: pinSize(16), borderLeftColor: "transparent", borderRightColor: "transparent" },
  badge: { position: "absolute", top: 0, right: 0, backgroundColor: "#FFFFFF", borderRadius: pinSize(9), minWidth: pinSize(18), alignItems: "center" }, badgeText: { color: "#06101D", fontSize: pinSize(11), fontWeight: "800" },
  serviceArea: { position: "absolute", top: 12, left: 12, right: 128, padding: 10, borderRadius: 10, backgroundColor: "#332710F2", borderWidth: 1, borderColor: "#F59E0B", gap: 5 },
  serviceAreaHeading: { flexDirection: "row", gap: 6, alignItems: "flex-start" }, serviceAreaLabel: { flex: 1, color: "#FDE68A", fontSize: 11, fontWeight: "700" }, serviceAreaDetail: { color: "#FDE68A", fontSize: 10, lineHeight: 14 },
  locationStatus: { backgroundColor: "#0D1B2AF2", borderColor: "#64748B" }, locationStatusText: { color: "#DBEAFE", fontSize: 11, lineHeight: 15 },
  // Reserve the lower 36dp for provider legal text/logo; controls remain inside
  // the map, with top-right Fit/Show district and bottom navigation separate.
  zoomControls: { position: "absolute", right: 12, bottom: 36, backgroundColor: "#0D1B2A", borderRadius: 12, borderWidth: 1, borderColor: "#30465B", overflow: "hidden" },
  zoomButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, zoomDivider: { height: 1, backgroundColor: "#30465B" },
  fit: { position: "absolute", right: 12, top: 12, backgroundColor: "#0D1B2A", borderRadius: 12, padding: 12 }, text: { color: "#DBEAFE", fontWeight: "700", fontSize: 12 } });
