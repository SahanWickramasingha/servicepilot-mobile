import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View, Text, Pressable } from "react-native";
import MapView, { Circle, Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import { TechnicianMapProps } from "./TechnicianMap.types";

const darkMap = [
  { elementType: "geometry", stylers: [{ color: "#142638" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94A3B8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#06101D" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#06101D" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#30465B" }] },
];
export default function TechnicianMap({ district, points, selectedId, onSelect }: TechnicianMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const fit = () => {
    if (!ready) return;
    if (points.length === 1) map.current?.animateToRegion({ latitude: points[0].latitude, longitude: points[0].longitude,
      latitudeDelta: 0.035, longitudeDelta: 0.035 }, 400);
    else if (points.length) map.current?.fitToCoordinates(points, { edgePadding: { top: 65, bottom: 65, left: 55, right: 55 }, animated: true });
    else if (district) {
      const [south, west, north, east] = district.bounds;
      map.current?.animateToRegion({ latitude: (south + north) / 2, longitude: (west + east) / 2,
        latitudeDelta: (north - south) * 1.3, longitudeDelta: (east - west) * 1.3 }, 400);
    }
  };
  useEffect(() => { fit(); }, [ready, district?.id, points.map((point) => `${point.id}:${point.latitude}:${point.longitude}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const geometry = district?.geometry;
  const polygons = geometry ? (geometry.type === "Polygon" ? [geometry.coordinates as number[][][]] : geometry.coordinates as number[][][][]) : [];
  const coordinates = (ring: number[][]) => ring.map(([longitude, latitude]) => ({ latitude, longitude }));
  return <View style={styles.container}>
    <MapView ref={map} style={StyleSheet.absoluteFillObject} provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      initialRegion={{ latitude: 7.8, longitude: 80.7, latitudeDelta: 4.2, longitudeDelta: 3.5 }}
      customMapStyle={darkMap} userInterfaceStyle="dark" onMapReady={() => setReady(true)}
      showsUserLocation={false} showsMyLocationButton={false} toolbarEnabled={false}>
      {polygons.map((rings, index) => <Polygon key={`${district?.id}-${index}`} coordinates={coordinates(rings[0])}
        holes={rings.slice(1).map(coordinates)} strokeColor="#60A5FA" strokeWidth={2} fillColor="#2563EB14" />)}
      {points.map((point) => <Marker key={`${point.id}:${point.stale ? "stale" : "fresh"}:${point.id === selectedId}`} identifier={point.id} coordinate={point} title={point.title}
        description={point.stale ? "Last shared location • stale" : "Shared location"}
        anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}
        onPress={() => onSelect?.(point.id)}>
        <View collapsable={false} style={styles.marker}>
          <View style={styles.markerTipOutline} />
          <View style={[styles.markerTip, { borderTopColor: point.stale ? "#64748B" : point.id === selectedId ? "#22D3EE" : "#3B82F6" }]} />
          <View style={[styles.markerHead, { backgroundColor: point.stale ? "#64748B" : point.id === selectedId ? "#22D3EE" : "#3B82F6" }]}><View style={styles.markerDot} /></View>
        </View>
      </Marker>)}
      {district && points.map((point) => <Circle key={`area-${point.id}`} center={point} radius={800}
        strokeColor="#60A5FA60" fillColor="#2563EB15" />)}
    </MapView>
    <Pressable accessibilityRole="button" accessibilityLabel="Fit map to service district or markers" style={styles.fit} onPress={fit}><Text style={styles.text}>Fit map</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ container: { height: 370, backgroundColor: "#0D1B2A", borderRadius: 20, overflow: "hidden" },
  marker: { width: 32, height: 42 },
  markerHead: { position: "absolute", top: 0, left: 1, width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  markerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#173456" },
  markerTipOutline: { position: "absolute", bottom: 0, left: 5, borderLeftWidth: 11, borderRightWidth: 11, borderTopWidth: 20, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FFFFFF" },
  markerTip: { position: "absolute", bottom: 3, left: 8, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 16, borderLeftColor: "transparent", borderRightColor: "transparent" },
  fit: { position: "absolute", right: 12, top: 12, backgroundColor: "#0D1B2A", borderRadius: 12, padding: 12 }, text: { color: "#DBEAFE", fontWeight: "700", fontSize: 12 } });
