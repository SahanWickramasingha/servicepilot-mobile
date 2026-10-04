import { Coordinate, District } from "@/functions/src/domain/map";
import type { ServiceAreaReference } from "@/src/utils/mapViewActions";
export type MapPoint = Coordinate & { id: string; title: string; stale?: boolean };
export type LocationFocus = { id: string; sequence: number;
  phase: "checking" | "ready" | "stale" | "unavailable" | "error"; point?: Coordinate; updatedAtMs?: number };
export type TechnicianMapProps = { district?: District; points: MapPoint[]; selectedId?: string;
  onSelect?: (ids: string[]) => void; focusLocation?: LocationFocus;
  focusLocationStatus?: string;
  serviceArea?: ServiceAreaReference & { sequence: number }; onClearServiceArea?: () => void };
