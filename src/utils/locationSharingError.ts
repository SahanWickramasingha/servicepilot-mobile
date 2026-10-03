export type LocationStep = "permission" | "services" | "acquisition" | "watch" | "publish";

export class LocationSharingError extends Error {
  constructor(public readonly step: LocationStep, public readonly code: string, message: string) {
    super(message);
    this.name = "LocationSharingError";
  }
}

export function locationSharingError(cause: unknown, step: LocationStep): LocationSharingError {
  if (cause instanceof LocationSharingError) return cause;
  const rawCode = (cause as { code?: unknown })?.code;
  const code = typeof rawCode === "string" ? rawCode : "unknown";
  if (step === "publish") {
    if (code.endsWith("permission-denied") || code.endsWith("unauthenticated")) return new LocationSharingError(step, code,
      "Location saving was denied. Sign in as an active, verified, approved Technician and retry.");
    if (code === "location/publish-timeout") return new LocationSharingError(step, code,
      "Location save timed out. Check your connection and retry. Sharing has not been confirmed.");
    if (code.endsWith("unavailable") || code.endsWith("network-request-failed")) return new LocationSharingError(step, code,
      "Unable to connect to save your location. Check your connection and retry.");
    return new LocationSharingError(step, code, "Unable to save your location. Please retry.");
  }
  if (/UNAUTHORIZED|PERMISSION/i.test(code)) return new LocationSharingError(step, code,
    "Location permission is unavailable. Enable it in device Settings, then retry.");
  if (/SETTINGS_UNSATISFIED/i.test(code)) return new LocationSharingError(step, code,
    "Device location settings do not support this request. Enable location services and retry.");
  const messages: Record<Exclude<LocationStep, "publish">, string> = {
    permission: "Unable to check location permission. Please retry.",
    services: "Unable to check device location services. Please retry.",
    acquisition: "The device could not obtain a GPS fix. Check location services and retry.",
    watch: "GPS updates could not be started or were interrupted. Retry location sharing.",
  };
  return new LocationSharingError(step, code, messages[step]);
}
