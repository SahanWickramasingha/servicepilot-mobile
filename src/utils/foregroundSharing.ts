import { Coordinate, validCoordinate } from "@/functions/src/domain/map";
import { LocationSharingError, LocationStep, locationSharingError } from "./locationSharingError";

export type DeviceFix = Coordinate & { sampledAt: number; accuracy?: number | null };
export const MIN_LOCATION_WRITE_MS = 60000;
export const LOCATION_HEARTBEAT_MS = 90000;
export const LOCATION_MOVEMENT_METRES = 100;
export type SharingState = { enabled: boolean; status: "off" | "starting" | "sharing" | "paused" | "stopping" | "error"; error: string; revokeFailed: boolean };
export type SharingAdapter = {
  permission: (prompt: boolean) => Promise<boolean>;
  servicesEnabled: () => Promise<boolean>;
  prepare?: (uid: string) => Promise<void>;
  current: (signal?: AbortSignal) => Promise<DeviceFix>;
  watch: (next: (point: DeviceFix) => void, error: (cause?: unknown) => void) => Promise<() => void>;
  publish: (uid: string, point?: DeviceFix) => Promise<void>;
  every: (callback: () => void, interval: number) => () => void;
  after?: (callback: () => void, delay: number) => () => void;
  now: () => number;
};

function metres(a: Coordinate, b: Coordinate): number {
  const radians = Math.PI / 180;
  const x = (a.longitude - b.longitude) * Math.cos((a.latitude + b.latitude) / 2 * radians);
  return Math.hypot(a.latitude - b.latitude, x) * 111320;
}

/** One foreground session; serial writes prevent a queued GPS fix undoing OFF. */
export class ForegroundSharing {
  private state: SharingState = { enabled: false, status: "off", error: "", revokeFailed: false };
  private listeners = new Set<() => void>();
  private uid?: string;
  private generation = 0;
  private active = true;
  private optedIn = false;
  private acquisition?: AbortController;
  private removeWatch?: () => void;
  private removeHeartbeat?: () => void;
  private removePendingWrite?: () => void;
  private latest?: DeviceFix;
  private last?: DeviceFix;
  private lastWrite = -Infinity;
  private tail: Promise<void> = Promise.resolve();

  constructor(private adapter: SharingAdapter) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(values: Partial<SharingState>) {
    this.state = { ...this.state, ...values };
    this.listeners.forEach((listener) => listener());
  }
  private cancelLocal() {
    this.generation++;
    this.acquisition?.abort();
    this.acquisition = undefined;
    this.removeWatch?.();
    this.removeWatch = undefined;
    this.removeHeartbeat?.();
    this.removeHeartbeat = undefined;
    this.removePendingWrite?.();
    this.removePendingWrite = undefined;
    this.latest = undefined;
  }
  private revoke(uid: string): Promise<void> {
    const operation = this.tail.catch(() => undefined).then(() => this.adapter.publish(uid));
    this.tail = operation;
    return operation;
  }
  async setSession(uid?: string): Promise<void> {
    if (this.uid === uid) return;
    this.cancelLocal();
    const generation = this.generation;
    this.uid = uid;
    this.optedIn = false;
    this.last = undefined;
    this.lastWrite = -Infinity;
    this.update({ enabled: false, status: "off", error: "", revokeFailed: false });
    // Start every login opted out; clear a marker left by a terminated prior process.
    if (uid) {
      try { await this.revoke(uid); }
      catch { if (generation === this.generation) this.update({ status: "error", revokeFailed: true, error: "Unable to clear the previous sharing session. Retry with a connection." }); }
    }
  }
  private async fail(cause: unknown, generation: number, step: LocationStep) {
    if (generation !== this.generation) return;
    const failure = locationSharingError(cause, step);
    const message = failure.message;
    if (typeof __DEV__ !== "undefined" && __DEV__) console.warn("Technician sharing failed", { step: failure.step, code: failure.code });
    const uid = this.uid;
    this.cancelLocal();
    this.optedIn = false;
    const stoppedGeneration = this.generation;
    this.update({ enabled: false, status: "error", error: message });
    if (uid) {
      try { await this.revoke(uid); }
      catch { if (stoppedGeneration === this.generation) this.update({ revokeFailed: true, error: `${message} Server removal failed; retry. The location expires after two minutes.` }); }
    }
  }
  private async offer(point: DeviceFix, generation: number): Promise<void> {
    if (generation !== this.generation || !this.active || !this.optedIn || !this.uid) return;
    if (this.latest && Number.isFinite(point.sampledAt) && point.sampledAt < this.latest.sampledAt) return;
    if (!validCoordinate(point) || !Number.isFinite(point.sampledAt) ||
        this.adapter.now() - point.sampledAt > 60000 || point.sampledAt > this.adapter.now() + 5000 ||
        (point.accuracy != null && point.accuracy > 2000)) {
      throw new LocationSharingError("acquisition", "location/invalid-fix", "A recent, usable GPS fix is unavailable. Check location services and retry.");
    }
    // Android can deliver an older fused/cached callback after a newer GPS fix.
    this.latest = point;
    const uid = this.uid;
    const operation = this.tail.catch(() => undefined).then(async () => {
      if (generation !== this.generation || !this.active || !this.optedIn) return;
      const candidate = this.latest!;
      const elapsed = this.adapter.now() - this.lastWrite;
      const moved = !this.last || metres(this.last, candidate) >= LOCATION_MOVEMENT_METRES;
      if (elapsed < MIN_LOCATION_WRITE_MS || (!moved && elapsed < LOCATION_HEARTBEAT_MS)) {
        // Retain movement seen during an in-flight first save, without a write per callback.
        if (moved && !this.removePendingWrite) {
          const callback = () => {
            this.removePendingWrite = undefined;
            const latest = this.latest;
            if (generation !== this.generation || !latest || this.adapter.now() - latest.sampledAt > 60000) return;
            void this.offer(latest, generation).catch((cause) => this.fail(cause, generation, "publish"));
          };
          const delay = Math.max(1, MIN_LOCATION_WRITE_MS - elapsed);
          if (this.adapter.after) this.removePendingWrite = this.adapter.after(callback, delay);
          else { const timer = setTimeout(callback, delay); this.removePendingWrite = () => clearTimeout(timer); }
        }
        return;
      }
      if (this.adapter.now() - candidate.sampledAt > 60000) throw new LocationSharingError("acquisition", "location/stale-fix", "The GPS fix is no longer recent. Retry.");
      this.removePendingWrite?.(); this.removePendingWrite = undefined;
      try { await this.adapter.publish(uid, candidate); }
      catch (cause) { throw locationSharingError(cause, "publish"); }
      if (generation === this.generation) {
        this.last = candidate;
        this.lastWrite = this.adapter.now();
        this.update({ enabled: true, status: "sharing", error: "", revokeFailed: false });
      }
    });
    this.tail = operation;
    await operation;
  }
  async enable(prompt = true): Promise<void> {
    if (!this.uid) { this.update({ status: "error", error: "Sign in as an approved Technician to share." }); return; }
    this.cancelLocal();
    this.optedIn = true;
    const generation = this.generation;
    this.lastWrite = -Infinity;
    this.update({ enabled: false, status: "starting", error: "", revokeFailed: false });
    if (!this.active) { this.update({ status: "paused" }); return; }
    let step: LocationStep = "permission";
    try {
      if (!await this.adapter.permission(prompt)) throw new LocationSharingError(step, "location/permission-refused", "Location permission was refused. Enable it in device Settings, then retry.");
      if (generation !== this.generation) return;
      step = "services";
      if (!await this.adapter.servicesEnabled()) throw new LocationSharingError(step, "location/services-off", "Device location services are off. Enable GPS, then retry.");
      if (generation !== this.generation) return;
      step = "publish";
      await this.adapter.prepare?.(this.uid);
      if (generation !== this.generation) return;
      step = "acquisition";
      this.acquisition = new AbortController();
      const point = await this.adapter.current(this.acquisition.signal);
      if (generation !== this.generation) return;
      this.latest = point;
      step = "watch";
      const remove = await this.adapter.watch((point) => {
        if (!["starting", "sharing"].includes(this.state.status)) return;
        void this.offer(point, generation).catch((error) => this.fail(error, generation, "publish"));
      }, (cause) => { void this.fail(cause, generation, "watch"); });
      if (generation !== this.generation) { remove(); return; }
      this.removeWatch = remove;
      step = "publish";
      await this.offer(this.latest ?? point, generation);
      if (generation !== this.generation) return;
      this.removeHeartbeat = this.adapter.every(() => {
        void this.adapter.current(this.acquisition?.signal).then((point) => this.offer(point, generation))
          .catch((cause) => this.fail(cause, generation, "acquisition"));
      }, LOCATION_HEARTBEAT_MS);
    } catch (error) {
      await this.fail(error, generation, step);
    }
  }
  async stop(): Promise<void> {
    const uid = this.uid;
    this.cancelLocal();
    this.optedIn = false;
    const generation = this.generation;
    this.update({ enabled: false, status: "stopping", error: "", revokeFailed: false });
    try {
      if (uid) await this.revoke(uid);
      if (generation === this.generation) this.update({ status: "off" });
    } catch {
      if (generation === this.generation) this.update({ status: "error", revokeFailed: true, error: "Sharing stopped on this device, but server removal failed. Retry; the location expires after two minutes." });
      throw new Error("Unable to remove shared location. Please retry before signing out.");
    }
  }
  async setActive(active: boolean): Promise<void> {
    if (active === this.active) return;
    this.active = active;
    if (!active) {
      this.cancelLocal();
      const generation = this.generation;
      if (this.optedIn) {
        this.update({ enabled: false, status: "paused" });
        if (this.uid) {
          try { await this.revoke(this.uid); }
          catch { if (generation === this.generation) this.update({ error: "Sharing is paused. Server removal failed; the location expires after two minutes.", revokeFailed: true }); }
        }
      }
    } else if (this.optedIn) await this.enable(false);
  }
  async cleanup(): Promise<void> {
    const stopped = this.stop();
    const generation = this.generation;
    try { await stopped; } finally { if (generation === this.generation) this.uid = undefined; }
  }
}
