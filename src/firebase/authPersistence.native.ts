import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FirebaseApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import type { Auth, Persistence } from "firebase/auth";

// Metro selects Firebase's React Native entry, which exports this public API.
// Firebase 12.19's universal TypeScript entry omits the native-only export.
const { getReactNativePersistence } = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence(storage: Pick<typeof AsyncStorage, "getItem" | "setItem" | "removeItem">): Persistence;
};

let restoring = true;
let restoreStorageFailed = false;
async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    if (restoring) restoreStorageFailed = true;
    // Firebase can log initialization failures. Never forward raw storage data.
    throw new Error("Device authentication storage is unavailable.");
  }
}

const storage = {
  getItem: (key: string) => storageOperation(() => AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) => storageOperation(() => AsyncStorage.setItem(key, value)),
  removeItem: (key: string) => storageOperation(() => AsyncStorage.removeItem(key)),
};
const nativePersistence = getReactNativePersistence(storage);

export function createAppAuth(app: FirebaseApp): Auth {
  try {
    // Always look for an existing saved Firebase session on a cold start.
    return FirebaseAuth.initializeAuth(app, { persistence: nativePersistence });
  } catch (error) {
    if ((error as { code?: string })?.code !== "auth/already-initialized") throw error;
    // Fast Refresh must retain the current user and selected persistence.
    return FirebaseAuth.getAuth(app);
  }
}

export async function waitForAuthReady(auth: Auth): Promise<void> {
  await auth.authStateReady();
  restoring = false;
  // The SDK can silently fall back to memory if native storage is unavailable.
  // Block routing in that case instead of treating a failed restore as logout.
  if (restoreStorageFailed) {
    throw new Error("Unable to restore sign-in from device storage. Check available device storage, then close and reopen the app.");
  }
}

export async function applyLoginPersistence(auth: Auth, rememberMe: boolean): Promise<void> {
  await waitForAuthReady(auth);
  try {
    if (rememberMe) {
      // Check the storage backend before sign-in, even with no current user.
      const probeKey = "@servicepilot/auth-storage-check";
      await storage.setItem(probeKey, "1");
      await storage.removeItem(probeKey);
    }
    // Supported by the installed RN SDK. Switching to memory also removes the
    // old persisted Firebase user; no app-managed token or password storage.
    await FirebaseAuth.setPersistence(auth, rememberMe ? nativePersistence : FirebaseAuth.inMemoryPersistence);
  } catch {
    throw Object.assign(new Error(rememberMe
      ? "Unable to save your sign-in on this device. Check available storage and try again."
      : "Unable to turn off saved sign-in. Please try again before signing in."), {
      code: "auth/persistence-unavailable",
    });
  }
}
