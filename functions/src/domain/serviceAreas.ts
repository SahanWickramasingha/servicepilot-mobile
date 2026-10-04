import { DISTRICTS } from "./map";

export type ServiceArea = { id: string; label: string; source: "catalogue" | "technician" };
export type ServiceAreasByDistrict = Record<string, ServiceArea>;
export type StoredServiceAreasByDistrict = Record<string, string>;

// Curated GeoNames postal localities (CC BY 4.0). See SERVICE_AREA_DATA.md.
// These identifiers describe declared coverage, never GPS or a geocoded address.
export const SERVICE_AREA_CATALOGUE: Record<string, ServiceArea[]> = {
  kandy: [
    { id: "lk-postal-20500-gampola", label: "Gampola", source: "catalogue" },
    { id: "lk-postal-20800-katugastota", label: "Katugastota", source: "catalogue" },
    { id: "lk-postal-20168-kundasale", label: "Kundasale", source: "catalogue" },
    { id: "lk-postal-20400-peradeniya", label: "Peradeniya", source: "catalogue" },
  ],
};

/** Compact persisted IDs keep validation of all 25 districts within the Rules budget. */
export function readServiceAreas(value: StoredServiceAreasByDistrict = {}): ServiceAreasByDistrict {
  return Object.fromEntries(Object.entries(value).map(([districtId, id]) => {
    if (typeof id !== "string") throw new Error("Invalid stored service area.");
    if (id.startsWith("other:")) return [districtId, { id: "other", label: id.slice(6), source: "technician" }];
    const area = SERVICE_AREA_CATALOGUE[districtId]?.find((entry) => entry.id === id);
    if (!area) throw new Error("Invalid stored service area identifier.");
    return [districtId, { ...area }];
  }));
}

export function encodeServiceAreas(ids: string[], areas: ServiceAreasByDistrict): StoredServiceAreasByDistrict {
  return Object.fromEntries(Object.entries(validateServiceAreas(ids, areas)).map(([districtId, area]) =>
    [districtId, area.source === "technician" ? `other:${area.label}` : area.id]));
}

export function validateServiceAreas(ids: string[], value: unknown): ServiceAreasByDistrict {
  if (ids.length > 25 || new Set(ids).size !== ids.length || ids.some((id) => !DISTRICTS.some((d) => d.id === id))) {
    throw new Error("Select valid service districts.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Select a valid service area.");
  const result: ServiceAreasByDistrict = {};
  for (const [districtId, raw] of Object.entries(value)) {
    if (!ids.includes(districtId) || !raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Each service area must belong to a selected district.");
    }
    const area = raw as ServiceArea;
    if (Object.keys(area).sort().join(",") !== "id,label,source" || typeof area.label !== "string") {
      throw new Error("Select a valid service area.");
    }
    if (area.source === "catalogue") {
      const known = SERVICE_AREA_CATALOGUE[districtId]?.find((entry) => entry.id === area.id && entry.label === area.label);
      if (!known) throw new Error("This town/area is not in the selected district catalogue.");
      result[districtId] = { ...known };
    } else if (area.source === "technician" && area.id === "other" &&
        area.label.trim().length >= 2 && area.label.length <= 80 &&
        !/[<>]/.test(area.label) && !Array.from(area.label).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
      result[districtId] = { id: "other", label: area.label.trim(), source: "technician" };
    } else throw new Error("Other area must contain 2–80 characters, without control characters or angle brackets.");
  }
  return result;
}

export function retainServiceAreas(ids: string[], areas: ServiceAreasByDistrict = {}): ServiceAreasByDistrict {
  return Object.fromEntries(Object.entries(areas).filter(([id]) => ids.includes(id)));
}

export function declaredServiceAreaLabel(districtId: string, areas?: ServiceAreasByDistrict | StoredServiceAreasByDistrict): string {
  const district = DISTRICTS.find((d) => d.id === districtId)?.name ?? districtId;
  const raw = areas?.[districtId];
  const area = typeof raw === "string" ? readServiceAreas({ [districtId]: raw })[districtId] : raw;
  return area ? `${area.label}, ${district}${area.source === "technician" ? " (technician-provided)" : ""}` : district;
}
