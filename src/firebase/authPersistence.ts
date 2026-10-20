import type { FirebaseApp } from "firebase/app";
import {
  type Auth,
  browserLocalPersistence,
  getAuth,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";

// Web fallback for the Expo app only. Admin Web has its own Firebase config.
export function createAppAuth(app: FirebaseApp): Auth {
  return getAuth(app);
}

export async function waitForAuthReady(auth: Auth): Promise<void> {
  await auth.authStateReady();
}

export async function applyLoginPersistence(auth: Auth, rememberMe: boolean): Promise<void> {
  await waitForAuthReady(auth);
  try {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : inMemoryPersistence);
  } catch {
    throw Object.assign(new Error("Unable to apply your saved sign-in preference. Check browser storage settings and try again."), {
      code: "auth/persistence-unavailable",
    });
  }
}
