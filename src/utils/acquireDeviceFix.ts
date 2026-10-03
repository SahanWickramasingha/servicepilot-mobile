import { validCoordinate } from "@/functions/src/domain/map";
import type { DeviceFix } from "./foregroundSharing";
import { LocationSharingError, locationSharingError } from "./locationSharingError";

type FixSource = {
  now: () => number;
  watch: (next: (fix: DeviceFix) => void, error: (cause?: unknown) => void) => Promise<() => void>;
};

/** A removable foreground GPS subscription, including late native registration. */
export function acquireDeviceFix(source: FixSource, signal?: AbortSignal, timeoutMs = 20000): Promise<DeviceFix> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let remove: (() => void) | undefined;
    const finish = (point?: DeviceFix, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      remove?.();
      if (point) resolve(point); else reject(error);
    };
    const abort = () => finish(undefined, new LocationSharingError("acquisition", "location/cancelled", "Location acquisition was cancelled."));
    const timer = setTimeout(() => finish(undefined, new LocationSharingError("acquisition", "location/acquisition-timeout",
      "Location acquisition timed out. No recent GPS fix arrived. Check location services and retry.")), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    void source.watch((point) => {
      if (!validCoordinate(point) || !Number.isFinite(point.sampledAt) || source.now() - point.sampledAt > 60000 ||
          point.sampledAt > source.now() + 5000 || (point.accuracy != null && point.accuracy > 2000)) return;
      finish(point);
    }, (cause) => finish(undefined, locationSharingError(cause, "acquisition"))).then((cleanup) => {
      if (settled) cleanup(); else remove = cleanup;
    }, (cause) => finish(undefined, locationSharingError(cause, "acquisition")));
  });
}
