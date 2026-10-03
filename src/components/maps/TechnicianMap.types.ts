import { Coordinate, District } from "@/functions/src/domain/map";
export type MapPoint = Coordinate & { id: string; title: string; stale?: boolean };
export type TechnicianMapProps = { district?: District; points: MapPoint[]; selectedId?: string; onSelect?: (id: string) => void };
