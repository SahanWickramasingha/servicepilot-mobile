import { setTimeout, clearTimeout } from "node:timers";

/** Bounded, cached dependency checks. Public probes expose only a boolean.
 * A timed-out provider call remains single-flight until it settles, preventing
 * overlapping SDK retries when a provider is down. No booking writes occur.
 */
export function createBookingReadiness(check: () => Promise<void>, {
  now = Date.now, ttlMs = 60000, timeoutMs = 4000,
}: { now?: () => number; ttlMs?: number; timeoutMs?: number } = {}) {
  let cached: { ready: boolean; expires: number } | undefined;
  let pending: Promise<boolean> | undefined;
  return async () => {
    if (cached && now() < cached.expires) return cached.ready;
    if (!pending) {
      pending = Promise.resolve().then(check).then(() => true, () => false).then((ready) => {
        cached = { ready, expires: now() + ttlMs };
        pending = undefined;
        return ready;
      });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([pending, new Promise<boolean>((resolve) => {
        timer = setTimeout(() => { cached = { ready: false, expires: now() + ttlMs }; resolve(false); }, timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  };
}
