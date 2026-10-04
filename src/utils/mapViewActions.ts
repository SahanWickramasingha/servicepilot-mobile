import { DISTRICTS } from "@/functions/src/domain/map";
import type { Coordinate, District } from "@/functions/src/domain/map";
import { declaredServiceAreaLabel } from "@/functions/src/domain/serviceAreas";
import type { StoredServiceAreasByDistrict } from "@/functions/src/domain/serviceAreas";

// react-native-maps 1.20.1 documents this range for min/maxZoomLevel.
// Native providers additionally clamp to the levels supported by their tiles.
export const MAP_MIN_ZOOM = 0;
export const MAP_MAX_ZOOM = 20;

/** Partial camera update preserves the current centre, heading and pitch. */
export function relativeCameraZoom(camera: { zoom?: number; altitude?: number }, direction: 1 | -1): { zoom: number } | { altitude: number } | undefined {
  if (Number.isFinite(camera.zoom)) return { zoom: Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, camera.zoom! + direction)) };
  // Apple Maps exposes camera altitude instead of Google zoom. Its native
  // min/maxZoomLevel constraints clamp the resulting view, including pinch zoom.
  if (Number.isFinite(camera.altitude) && camera.altitude! > 0) return { altitude: camera.altitude! * 2 ** -direction };
  return undefined;
}

export type ServiceAreaReference = { technicianId: string; district: District; label: string; detail: string; townReference?: Coordinate };

// GeoNames LK postal export, CC BY 4.0, verified 2026-10-03. Accuracy=4
// (gazetteer match), not a town boundary or a technician/customer GPS sample.
// See functions/src/domain/SERVICE_AREA_DATA.md for source rows and limitations.
const TOWN_REFERENCES: Record<string, Coordinate> = {
  "lk-postal-20400-peradeniya": { latitude: 7.2622, longitude: 80.5841 },
  "lk-postal-20800-katugastota": { latitude: 7.3276, longitude: 80.6212 },
  "lk-postal-20168-kundasale": { latitude: 7.2737, longitude: 80.7001 },
  "lk-postal-20500-gampola": { latitude: 7.1643, longitude: 80.5696 },
};

/** Use declared coverage only. No GPS, address, town guesses or coverage radius. */
export function technicianServiceAreaReference(technician: {
  uid: string; serviceDistrictIds: string[]; serviceAreasByDistrict?: StoredServiceAreasByDistrict;
}, preferredDistrictId: string): ServiceAreaReference | undefined {
  const id = technician.serviceDistrictIds.includes(preferredDistrictId) ? preferredDistrictId :
    technician.serviceDistrictIds.find((saved) => DISTRICTS.some((district) => district.id === saved));
  const district = DISTRICTS.find((item) => item.id === id);
  if (!district) return undefined;
  let label = district.name;
  try { label = declaredServiceAreaLabel(district.id, technician.serviceAreasByDistrict); } catch { /* Use the verified district for malformed legacy data. */ }
  const townReference = label !== district.name ? TOWN_REFERENCES[technician.serviceAreasByDistrict?.[district.id] ?? ""] : undefined;
  return { technicianId: technician.uid, district, label: `Service area: ${label}`,
    detail: townReference ? "Town reference only (GeoNames); service boundary unavailable." :
      label === district.name ? "District boundary only; no town/area reference available." : "District boundary only; town reference unavailable.",
    ...(townReference ? { townReference: { ...townReference } } : {}) };
}
