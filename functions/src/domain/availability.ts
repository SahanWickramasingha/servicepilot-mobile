/** A declared booking preference, independent of GPS, app state and job count. */
export const TECHNICIAN_AVAILABILITIES = ["available", "busy", "offline"] as const;
export type TechnicianAvailability = typeof TECHNICIAN_AVAILABILITIES[number];

/** Legacy/malformed data stays unknown; never silently confirms Available. */
export function readTechnicianAvailability(value: unknown): TechnicianAvailability | undefined {
  return value === "available" || value === "busy" || value === "offline" ? value : undefined;
}

export function availabilityDisplay(value: unknown) {
  switch (readTechnicianAvailability(value)) {
    case "available": return { label: "Available", description: "Accepting new requests", color: "#86EFAC", background: "#133327", canRequest: true };
    case "busy": return { label: "Busy", description: "Temporarily unavailable for new requests", color: "#FCD34D", background: "#382B13", canRequest: false };
    case "offline": return { label: "Offline", description: "Not accepting new requests", color: "#CBD5E1", background: "#263244", canRequest: false };
    default: return { label: "Availability not set", description: "Availability has not been confirmed. New requests are disabled until the technician sets it.", color: "#CBD5E1", background: "#263244", canRequest: false };
  }
}

export function requireAvailableTechnician(value: unknown): void {
  const state = availabilityDisplay(value);
  if (!state.canRequest) throw new Error(`${state.label}: ${state.description}. New requests require Available status.`);
}
