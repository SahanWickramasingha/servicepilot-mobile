/** Memory-only access-reference hints. Never cache GPS, authorization or query results. */
export function createBoundedSessionCache<T>(scope: {
  current: () => string | null; watch: (change: () => void) => () => void;
}, capacity: number) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Invalid session cache capacity.");
  const values = new Map<string, T>();
  let owner: string | null = null, stopSession: (() => void) | undefined;
  const clear = () => {
    values.clear(); owner = null;
    const stop = stopSession; stopSession = undefined; stop?.();
  };
  const invalidate = () => { if (owner !== scope.current()) clear(); };
  return {
    get(key: string): T | undefined { invalidate(); return values.get(key); },
    set(key: string, value: T) {
      invalidate();
      owner = scope.current();
      if (!owner) return;
      values.delete(key); values.set(key, value);
      if (values.size > capacity) values.delete(values.keys().next().value!);
      if (!stopSession) stopSession = scope.watch(invalidate);
    },
    clear,
  };
}
