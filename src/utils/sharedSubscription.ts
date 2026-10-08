type SessionScope = { current: () => string | null; watch: (change: () => void) => () => void };

/** Share live work only while consumers exist. No disk cache, TTL or cross-account replay. */
export function createSharedSubscription<Next extends unknown[], Failure extends unknown[] = [Error]>(
  scope: SessionScope, reset: () => Next
) {
  type Consumer = { next: (...value: Next) => void; error: (...value: Failure) => void };
  type Entry = { owner: string | null; alive: boolean; consumers: Set<Consumer>; latest?: Next; failure?: Failure; stop?: () => void };
  const entries = new Map<string, Entry>();
  let stopSession: (() => void) | undefined;
  const close = (key: string, entry: Entry) => {
    entry.alive = false; entry.latest = undefined; entry.failure = undefined; entry.stop?.();
    if (entries.get(key) === entry) entries.delete(key);
  };
  const invalidate = () => {
    for (const [key, entry] of entries) {
      if (entry.owner === scope.current()) continue;
      close(key, entry);
      for (const consumer of entry.consumers) consumer.next(...reset());
      entry.consumers.clear();
    }
    if (!entries.size) { stopSession?.(); stopSession = undefined; }
  };
  return (key: string, connect: (next: (...value: Next) => void, error: (...value: Failure) => void) => () => void,
    next: (...value: Next) => void, error: (...value: Failure) => void): (() => void) => {
    invalidate();
    if (!stopSession) stopSession = scope.watch(invalidate);
    const consumer = { next, error };
    let entry = entries.get(key);
    if (!entry) {
      entry = { owner: scope.current(), alive: true, consumers: new Set([consumer]) };
      entries.set(key, entry);
      const current = entry;
      const valid = () => current.alive && current.owner === scope.current();
      const emit = (...value: Next) => {
        if (!valid()) { invalidate(); return; }
        current.latest = value;
        current.failure = undefined;
        for (const target of current.consumers) target.next(...value);
      };
      const fail = (...value: Failure) => {
        if (!valid()) { invalidate(); return; }
        current.latest = undefined; // A new consumer must never replay data after a failure.
        current.failure = value;
        for (const target of current.consumers) { target.next(...reset()); target.error(...value); }
      };
      try { current.stop = connect(emit, fail); }
      catch (cause) {
        close(key, current);
        if (!entries.size) { stopSession?.(); stopSession = undefined; }
        throw cause;
      }
      // Also handles a synchronous account change while connect was starting.
      if (!current.alive) current.stop();
    } else {
      entry.consumers.add(consumer);
      if (entry.latest) next(...entry.latest);
      else if (entry.failure) { next(...reset()); error(...entry.failure); }
    }
    const subscribed = entry;
    return () => {
      subscribed.consumers.delete(consumer);
      if (!subscribed.consumers.size) close(key, subscribed);
      if (!entries.size) { stopSession?.(); stopSession = undefined; }
    };
  };
}
