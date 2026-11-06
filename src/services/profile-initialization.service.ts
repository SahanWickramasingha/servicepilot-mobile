// A local coordination window, never an authorization grant. No profile data is
// persisted here; rules and the live account policy remain authoritative.
export const PROFILE_INITIALIZATION_TIMEOUT_MS = 60_000;
type Identity = { uid: string; email?: string | null };
type Attempt = { email: string; uid?: string; timer: ReturnType<typeof setTimeout> };
let attempt: Attempt | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function beginProfileInitialization(email: string) {
  if (attempt) throw new Error("Account setup is already in progress.");
  const current: Attempt = { email: email.trim().toLowerCase(), timer: setTimeout(() => finish(), PROFILE_INITIALIZATION_TIMEOUT_MS) };
  const finish = () => {
    if (attempt !== current) return;
    clearTimeout(current.timer);
    attempt = undefined;
    notify();
  };
  attempt = current;
  notify();
  return {
    assertCurrent(user: Identity) {
      if (attempt !== current || !isProfileInitializing(user)) throw Object.assign(new Error("Account setup expired or the account changed. Sign in to continue setup."), { code: "auth/registration-account-changed" });
    },
    finish,
  };
}

export function isProfileInitializing(user: Identity | null): boolean {
  if (!attempt || !user) return false;
  if (!attempt.uid && user.email?.toLowerCase() === attempt.email) attempt.uid = user.uid;
  return attempt.uid === user.uid;
}

export function profileInitializationAccountChanged(user: Identity | null) {
  if (!attempt) return;
  if (isProfileInitializing(user)) return;
  // The initial signed-out notification is harmless, but logout or a switch
  // after binding must permanently invalidate this attempt.
  if (user || attempt.uid) {
    clearTimeout(attempt.timer);
    attempt = undefined;
    notify();
  }
}

export function observeProfileInitialization(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
