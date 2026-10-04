import type { MapPoint } from "../components/maps/TechnicianMap.types";

/** Group visually overlapping pins without altering any technician coordinates. */
export function groupMarkerPoints(points: MapPoint[], latitudeSpan: number, longitudeSpan: number, width: number, height: number): MapPoint[][] {
  const groups: MapPoint[][] = [];
  for (const point of points) {
    const group = groups.find(([anchor]) => Math.abs(anchor.latitude - point.latitude) <= latitudeSpan * 40 / Math.max(1, height) &&
      Math.abs(anchor.longitude - point.longitude) <= longitudeSpan * 40 / Math.max(1, width));
    if (group) group.push(point); else groups.push([point]);
  }
  return groups;
}
