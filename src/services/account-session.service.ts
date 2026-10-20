import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { accountSessionDenial } from "@/functions/src/domain/accountSession";
import { auth, db } from "@/src/firebase/config";

// One own-profile listener, bounded and discarded on every account change.
export function observeAccountSession(callbacks: {
  denied: (message: string) => void;
  error: (message: string) => void;
  allowed: () => void;
}) {
  let active = true, generation = 0;
  let stopProfile: (() => void) | undefined;
  const stopAuth = onAuthStateChanged(auth, (user) => {
    if (!active) return;
    stopProfile?.();
    stopProfile = undefined;
    const version = ++generation;
    let revision = 0;
    const current = () => active && version === generation && auth.currentUser === user;
    if (!user) return;
    stopProfile = onSnapshot(doc(db, "users", user.uid), async (snapshot) => {
      const event = ++revision;
      if (!current()) return;
      const profile = snapshot.exists() ? snapshot.data() : null;
      const statusDenial = accountSessionDenial(profile, Number.POSITIVE_INFINITY);
      if (statusDenial) { callbacks.denied(statusDenial); return; }
      try {
        const token = profile?.sessionRevokedAt === undefined ? null : await user.getIdTokenResult();
        if (!current() || event !== revision) return;
        const denial = accountSessionDenial(profile, token?.claims.auth_time as number | undefined);
        if (denial) callbacks.denied(denial);
        else callbacks.allowed();
      } catch {
        if (current() && event === revision) callbacks.error("Unable to verify account access. Check your connection and retry. Your sign-in has been kept.");
      }
    }, () => {
      if (current()) callbacks.error("Unable to verify account access. Check your connection and retry. Your sign-in has been kept.");
    });
  });
  return () => { active = false; generation++; stopProfile?.(); stopAuth(); };
}
