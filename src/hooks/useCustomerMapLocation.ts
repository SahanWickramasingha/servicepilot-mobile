import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import * as Location from "expo-location";
import { auth } from "@/src/firebase/config";
import { acquireDeviceFix } from "@/src/utils/acquireDeviceFix";
import type { Coordinate } from "@/functions/src/domain/map";

// Android reports background while its permission dialog resolves. Wait for the
// foreground transition before starting a watcher; no GPS is acquired here.
function waitForForeground(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("Cancelled"));
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => { clearTimeout(timer); subscription.remove(); signal.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(); };
    const cancel = () => finish(new Error("Cancelled"));
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") finish(); });
    const timer = setTimeout(() => finish(new Error("App is not foreground")), 5000);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel(); else if (AppState.currentState === "active") finish();
  });
}

/** On-demand foreground fix, held only in memory for approximate browsing distance. */
export function useCustomerMapLocation() {
  const [location, setLocation] = useState<Coordinate & { updatedAtMs: number }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const permissionRequest = useRef<AbortController | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    active.current = AppState.currentState === "active";
    const clear = () => { pending.current?.abort(); pending.current = undefined; permissionRequest.current = undefined; setLocation(undefined); setBusy(false); setMessage(""); };
    const unsubscribe = onAuthStateChanged(auth, clear);
    const subscription = AppState.addEventListener("change", (state) => {
      active.current = state === "active";
      if (!active.current) {
        if (permissionRequest.current) { setLocation(undefined); setMessage(""); }
        else clear();
      }
    });
    return () => { active.current = false; clear(); unsubscribe(); subscription.remove(); };
  }, []));
  const requestLocation = async () => {
    if (pending.current || !active.current || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const controller = new AbortController(); pending.current = controller;
    const current = () => active.current && !controller.signal.aborted && auth.currentUser?.uid === uid;
    setBusy(true); setMessage(""); setLocation(undefined);
    try {
      permissionRequest.current = controller;
      const permission = await Location.requestForegroundPermissionsAsync();
      await waitForForeground(controller.signal);
      if (permissionRequest.current === controller) permissionRequest.current = undefined;
      if (!current()) return;
      if (!permission.granted) { setMessage("Location permission denied. You can still browse all technicians."); return; }
      if (!await Location.hasServicesEnabledAsync()) { if (current()) setMessage("Device location is off. You can still browse technicians."); return; }
      if (!current()) return;
      const point = await acquireDeviceFix({ now: Date.now, watch: async (next, error) => {
        const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0,
          mayShowUserSettingsDialog: false }, (sample) => next({ latitude: sample.coords.latitude, longitude: sample.coords.longitude,
          sampledAt: sample.timestamp, accuracy: sample.coords.accuracy }), error);
        return () => watcher.remove();
      } }, controller.signal);
      if (current()) { setLocation({ latitude: point.latitude, longitude: point.longitude, updatedAtMs: point.sampledAt });
        setMessage("Approximate straight-line distances use your recent device location. Refresh when you move."); }
    } catch { if (current()) setMessage("Customer location unavailable. You can still browse technicians."); }
    finally { if (permissionRequest.current === controller) permissionRequest.current = undefined;
      if (pending.current === controller) { pending.current = undefined; setBusy(false); } }
  };
  return { location, busy, message, requestLocation };
}
