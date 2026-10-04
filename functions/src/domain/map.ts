import boundaries from "./district-boundaries.json";

export const LOCATION_FRESH_MS = 2 * 60 * 1000;
export type Coordinate = { latitude: number; longitude: number };
type Polygon = number[][][];
type Geometry = { type: string; coordinates: Polygon | Polygon[] };
export type District = { id: string; name: string; bounds: number[]; geometry: Geometry };

export const DISTRICTS: District[] = boundaries.features.map((feature) => {
  const name = feature.name.replace(/ District$/, "");
  const geometry = feature.geometry as Geometry;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates as Polygon] : geometry.coordinates as Polygon[];
  const points = polygons.flatMap((polygon) => polygon.flat());
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"), name, geometry,
    bounds: [Math.min(...points.map((p) => p[1])), Math.min(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0]))],
  };
}).sort((a, b) => a.name.localeCompare(b.name));

export function validCoordinate(value: Coordinate): boolean {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude) &&
    value.latitude >= -90 && value.latitude <= 90 && value.longitude >= -180 && value.longitude <= 180;
}

export function approximateCoordinate(latCell: number, lngCell: number): Coordinate {
  return { latitude: Math.min(90, (latCell + 0.5) / 100), longitude: Math.min(180, (lngCell + 0.5) / 100) };
}

export function locationIsFresh(updatedAtMs: number | undefined, now = Date.now()): boolean {
  return typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs) &&
    updatedAtMs <= now + 5000 && now - updatedAtMs <= LOCATION_FRESH_MS;
}

/** Haversine great-circle distance in km; never a route distance or ETA. */
export function distanceKm(a: Coordinate, b: Coordinate): number | undefined {
  if (!validCoordinate(a) || !validCoordinate(b)) return undefined;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat = radians(b.latitude - a.latitude), lng = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function browsingDistanceKm(customer?: Coordinate & { updatedAtMs?: number }, technician?: Coordinate & { updatedAtMs?: number }, now = Date.now()): number | undefined {
  if (!customer || !technician || !locationIsFresh(customer.updatedAtMs, now) || !locationIsFresh(technician.updatedAtMs, now)) return undefined;
  return distanceKm(customer, technician);
}

export function districtIdForName(value: string): string | undefined {
  const name = value.trim().toLowerCase().replace(/\s+district$/, "").replace(/\s+/g, "-");
  const alias = name === "nuwaraeliya" ? "nuwara-eliya" : name === "moneragala" ? "monaragala" : name;
  return DISTRICTS.find((district) => district.id === alias)?.id;
}

export function resolveServiceDistrictIds(profile: {
  serviceDistrictIds?: unknown; serviceDivision?: unknown; serviceAreas?: unknown;
}): string[] {
  // Explicit coverage is authoritative, including an explicitly empty selection.
  if (profile.serviceDistrictIds !== undefined) {
    return Array.isArray(profile.serviceDistrictIds)
      ? [...new Set(profile.serviceDistrictIds.filter((id): id is string =>
        typeof id === "string" && DISTRICTS.some((district) => district.id === id)))] : [];
  }
  // Exact service-area labels only. Never infer coverage from an address or current GPS.
  const labels = [profile.serviceDivision, profile.serviceAreas].filter((value): value is string => typeof value === "string");
  return [...new Set(labels.flatMap((value) => value.split(/[,;|]/)).map(districtIdForName).filter((id): id is string => !!id))];
}

function inRing(point: Coordinate, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > point.latitude) !== (yj > point.latitude) &&
      point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInDistrict(point: Coordinate, district: District): boolean {
  const polygons = district.geometry.type === "Polygon" ? [district.geometry.coordinates as Polygon] : district.geometry.coordinates as Polygon[];
  return polygons.some((rings) => inRing(point, rings[0]) && !rings.slice(1).some((ring) => inRing(point, ring)));
}
