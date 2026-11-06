import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { accountSessionDenial } from "@/functions/src/domain/accountSession";
import { auth, db } from "@/src/firebase/config";
import { isProfileInitializing, observeProfileInitialization, profileInitializationAccountChanged } from "./profile-initialization.service";
import type { User } from "firebase/auth";
import type { UserProfile } from "./user.service";
import { clearOnboardingDraftUnless } from "./onboarding-draft.service";

// One own-profile listener, bounded and discarded on every account change.
export function observeAccountSession(callbacks: {
  denied: (message: string) => void;
  error: (message: string) => void;
  allowed: (profile: UserProfile, user: User, verified: boolean) => void;
  setupRequired?: (user: User, verified: boolean) => void;
  pending?: (user: User) => void;
  signedOut?: () => void;
}) {
  let active = true, generation = 0;
  let stopProfile: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let reevaluate = () => {};
  const stopInitialization = observeProfileInitialization(() => reevaluate());
  const stopAuth = onAuthStateChanged(auth, (user) => {
    if (!active) return;
    stopProfile?.();
    stopProfile = undefined;
    clearTimeout(timeout);
    const version = ++generation;
    let revision = 0;
    let listenerTerminated = false, verificationBlocked = false;
    const current = () => active && version === generation && auth.currentUser === user;
    reevaluate = () => {};
    profileInitializationAccountChanged(user);
    clearOnboardingDraftUnless(user);
    if (!user) { callbacks.signedOut?.(); return; }
    callbacks.pending?.(user);
    // The UI-enabled observer checks Auth authority once per session/retry.
    // Existing enforcement-only consumers retain the same minimal API.
    const verifiedSession = callbacks.setupRequired ? user.reload().then(() => user.getIdTokenResult(true)) : null;
    void verifiedSession?.catch(() => undefined);
    const armTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!active || version !== generation) return;
        verificationBlocked = true; revision++;
        callbacks.error(auth.currentUser !== user
          ? "Your sign-in changed during account checks. Retry to continue."
          : "Account checks are taking longer than expected. Retry to continue. Your sign-in has been kept.");
      }, 20_000);
    };
    armTimeout();
    let profile: import("@/functions/src/domain/accountSession").SessionProfile | null = null;
    let received = false;
    const evaluate = async () => {
      const event = ++revision;
      if (!current() || listenerTerminated || verificationBlocked) return;
      if (!received) { callbacks.pending?.(user); return; }
      if (profile) {
        const denial = accountSessionDenial(profile, Number.POSITIVE_INFINITY);
        if (denial) { clearTimeout(timeout); callbacks.denied(denial); return; }
      }
      if (!profile && isProfileInitializing(user)) { callbacks.pending?.(user); return; }
      if (!profile && callbacks.setupRequired) {
        try {
          const token = await verifiedSession;
          if (!current() || listenerTerminated || verificationBlocked || event !== revision) return;
          clearTimeout(timeout);
          callbacks.setupRequired(user, user.emailVerified === true && token?.claims.email_verified === true);
        } catch {
          if (current() && event === revision) { clearTimeout(timeout); callbacks.error("Unable to confirm sign-in. Retry to continue setup."); }
        }
        return;
      }
      const statusDenial = accountSessionDenial(profile, Number.POSITIVE_INFINITY);
      if (statusDenial) { clearTimeout(timeout); callbacks.denied(statusDenial); return; }
      try {
        const token = verifiedSession ? await verifiedSession : profile?.sessionRevokedAt === undefined ? null : await user.getIdTokenResult();
        if (!current() || listenerTerminated || verificationBlocked || event !== revision) return;
        clearTimeout(timeout);
        const denial = accountSessionDenial(profile, token?.claims.auth_time as number | undefined);
        if (denial) callbacks.denied(denial);
        else if (isProfileInitializing(user)) callbacks.pending?.(user);
        else callbacks.allowed(profile as UserProfile, user, user.emailVerified === true && token?.claims.email_verified === true);
      } catch {
        if (current() && !listenerTerminated && event === revision) {
          verificationBlocked = true;
          clearTimeout(timeout);
          revision++;
          callbacks.error("Unable to verify account access. Check your connection and retry. Your sign-in has been kept.");
        }
      }
    };
    reevaluate = () => { void evaluate(); };
    stopProfile = onSnapshot(doc(db, "users", user.uid), { includeMetadataChanges: true }, (snapshot) => {
      if (!current() || listenerTerminated) return;
      revision++;
      // Never treat cache absence as a deleted account or authorization to create.
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
        received = false; armTimeout(); callbacks.pending?.(user); return;
      }
      verificationBlocked = false;
      received = true;
      profile = snapshot.exists() ? snapshot.data() : null;
      armTimeout();
      callbacks.pending?.(user);
      return evaluate();
    }, () => {
      if (!current() || listenerTerminated) return;
      // Firestore error callbacks are terminal. Neither an older token promise
      // nor registration completion may authorize from this dead subscription.
      listenerTerminated = true;
      clearTimeout(timeout);
      verificationBlocked = true;
      revision++;
      received = false;
      profile = null;
      reevaluate = () => {};
      callbacks.error("Unable to verify account access. Check your connection and retry. Your sign-in has been kept.");
    });
  });
  return () => { active = false; generation++; clearTimeout(timeout); stopInitialization(); stopProfile?.(); stopAuth(); };
}
