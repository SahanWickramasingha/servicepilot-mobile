export type MapServiceFailureKind = "access" | "network" | "service";
type DataError = { code?: string };

export class MapServiceError extends Error {
  constructor(public readonly kind: MapServiceFailureKind, public readonly code: string) {
    super("Technician map service request failed.");
    this.name = "MapServiceError";
  }
}

export async function classifyMapServiceError(cause: unknown): Promise<MapServiceError> {
  if (cause instanceof MapServiceError) return cause;
  const code = typeof (cause as DataError)?.code === "string" ? (cause as DataError).code! : "unknown";
  if (code.endsWith("unauthenticated") || code.endsWith("permission-denied") || code.startsWith("auth/") && !code.endsWith("network-request-failed")) {
    return new MapServiceError("access", code);
  }
  if (code.endsWith("network-request-failed") || code.endsWith("unavailable") || code.endsWith("deadline-exceeded")) {
    return new MapServiceError("network", code);
  }
  return new MapServiceError("service", code);
}

export function mapServiceErrorMessage(error: unknown, scope: "directory" | "job" = "directory"): string {
  const kind = error instanceof MapServiceError ? error.kind : "service";
  if (kind === "access") return scope === "directory"
    ? "Map access requires an active, verified Customer account. Please sign in again."
    : "Shared location requires a verified Customer account and your accepted or in-progress request.";
  if (kind === "network") return "Unable to connect. Check your connection and retry.";
  return scope === "directory" ? "Unable to load Technicians. Please retry." : "Unable to load shared location. Please retry.";
}
