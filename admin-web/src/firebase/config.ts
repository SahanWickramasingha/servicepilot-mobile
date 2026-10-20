import { initializeApp, getApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyAKPlFn0eosrpqD0v8FxAfk-NsgONd51i4",
  authDomain: "servicepilot-756d9.firebaseapp.com",
  projectId: "servicepilot-756d9",
  storageBucket: "servicepilot-756d9.firebasestorage.app",
  messagingSenderId: "869400470316",
  appId: "1:869400470316:web:3ccdf35ad3cbb368698289",
};

// Explicit local demo mode only; normal web authentication is unchanged.
const settings = (import.meta as ImportMeta & { env: {
  DEV?: boolean; VITE_USE_FIREBASE_EMULATORS?: string;
} }).env;
const demoMode = settings.DEV && settings.VITE_USE_FIREBASE_EMULATORS === "1";
const selectedConfig = demoMode ? { ...firebaseConfig, apiKey: "emulator-only",
  projectId: "demo-servicepilot-review-author", authDomain: "demo-servicepilot-review-author.firebaseapp.com",
  storageBucket: "demo-servicepilot-review-author.appspot.com" } : firebaseConfig;
const firstInitialization = getApps().length === 0;
const app = firstInitialization ? initializeApp(selectedConfig) : getApp();
if (app.options.projectId !== selectedConfig.projectId) throw new Error("Restart the portal when switching Firebase environments.");

export const auth = getAuth(app);
export const db = getFirestore(app);
if (demoMode && firstInitialization) {
  connectAuthEmulator(auth, "http://127.0.0.1:9197", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8187);
}
