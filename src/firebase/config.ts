import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAKPlFn0eosrpqD0v8FxAfk-NsgONd51i4",
  authDomain: "servicepilot-756d9.firebaseapp.com",
  projectId: "servicepilot-756d9",
  storageBucket: "servicepilot-756d9.firebasestorage.app",
  messagingSenderId: "869400470316",
  appId: "1:869400470316:web:3ccdf35ad3cbb368698289",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;