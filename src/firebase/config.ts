import { initializeApp, getApps, getApp } from "firebase/app";
import { beforeAuthStateChanged, connectAuthEmulator } from "firebase/auth";
import { createAppAuth } from "./authPersistence";
import { installLocationAuthGuard } from "./locationAuthGuard";
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAKPlFn0eosrpqD0v8FxAfk-NsgONd51i4",
  authDomain: "servicepilot-756d9.firebaseapp.com",
  projectId: "servicepilot-756d9",
  storageBucket: "servicepilot-756d9.firebasestorage.app",
  messagingSenderId: "869400470316",
  appId: "1:869400470316:web:3ccdf35ad3cbb368698289",
};

// Explicit development-only demo mode. Never connects a production project to emulators.
const demoMode = __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "1";
const selectedConfig = demoMode ? { ...firebaseConfig, projectId: "demo-servicepilot-review-author",
  authDomain: "demo-servicepilot-review-author.firebaseapp.com", storageBucket: "demo-servicepilot-review-author.appspot.com",
  apiKey: "emulator-only" } : firebaseConfig;
const firstInitialization = getApps().length === 0;
const app = firstInitialization ? initializeApp(selectedConfig) : getApp();
if (app.options.projectId !== selectedConfig.projectId) throw new Error("Restart the app when switching Firebase environments.");

function getConfiguredFirestore(): Firestore {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    return getFirestore(app);
  }
}

export const auth = createAppAuth(app);
// Register once for the Auth singleton, including direct SDK replacement/sign-out.
// Blocking cleanup runs before the old credentials are replaced. A failed cleanup
// rejects the switch; never try to revoke account A using account B's credentials.
installLocationAuthGuard(auth, beforeAuthStateChanged,
  async () => (await import("@/src/services/foreground-location.service")).foregroundSharing);
export const db = getConfiguredFirestore();
// All Firestore initialization above uses the default database. Safe diagnostic
// context comes from the initialized app, rather than assuming the CLI target.
export const firebaseRuntimeTarget = { projectId: app.options.projectId, databaseId: "(default)", emulator: demoMode };
export const storage = getStorage(app);
storage.maxUploadRetryTime = 30000;
storage.maxOperationRetryTime = 15000;
if (demoMode && firstInitialization) {
  const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9197`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8187);
  connectStorageEmulator(storage, host, 9297);
  connectFunctionsEmulator(getFunctions(app, "asia-south1"), host, 5007);
}

export default app;
