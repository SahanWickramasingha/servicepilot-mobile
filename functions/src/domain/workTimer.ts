/** Informational service time only. Pauses use committed server timestamps. */
export type TimerStamp = { toMillis(): number };
export type WorkTimer = {
  elapsedMs: number;
  runningSince: TimerStamp;
  pausedAt: TimerStamp | null;
  revision: number;
};

export function workElapsedMs(timer: WorkTimer | undefined, startedAt?: TimerStamp, endedAt?: TimerStamp, now = Date.now()): number {
  const start = (timer?.runningSince ?? startedAt)?.toMillis();
  const end = (timer?.pausedAt ?? endedAt)?.toMillis() ?? now;
  const accumulated = timer?.elapsedMs ?? 0;
  if (!Number.isFinite(accumulated) || accumulated < 0 || start === undefined || !Number.isFinite(start) || !Number.isFinite(end)) return 0;
  // Rules Timestamp.toMillis() truncates sub-millisecond precision as well.
  return Math.max(0, accumulated + Math.max(0, Math.floor(end) - Math.floor(start)));
}
