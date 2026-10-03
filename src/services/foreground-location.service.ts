import * as Location from "expo-location";
import { ForegroundSharing, DeviceFix } from "@/src/utils/foregroundSharing";
import { publishTechnicianLocation, syncOwnMapProfile } from "@/src/services/location.service";
import { acquireDeviceFix } from "@/src/utils/acquireDeviceFix";

function fix(point: Location.LocationObject): DeviceFix {
  return { latitude: point.coords.latitude, longitude: point.coords.longitude,
    accuracy: point.coords.accuracy, sampledAt: point.timestamp };
}

export const foregroundSharing = new ForegroundSharing({
  now: Date.now,
  permission: async (prompt) => {
    const existing = await Location.getForegroundPermissionsAsync();
    return existing.granted || (prompt && (await Location.requestForegroundPermissionsAsync()).granted);
  },
  servicesEnabled: Location.hasServicesEnabledAsync,
  prepare: syncOwnMapProfile,
  current: (signal) => acquireDeviceFix({ now: Date.now, watch: async (next, error) => {
    // High requests Android GPS; Balanced can wait for a network fix even when
    // Extended Controls has supplied a GPS coordinate. No background subscription.
    const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High,
      timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: false }, (point) => next(fix(point)), error);
    return () => watcher.remove();
  } }, signal),
  watch: async (next, onError) => {
    const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High,
      timeInterval: 30000, distanceInterval: 100, mayShowUserSettingsDialog: false }, (point) => next(fix(point)), onError);
    return () => watcher.remove();
  },
  publish: publishTechnicianLocation,
  every: (callback, ms) => { const timer = setInterval(callback, ms); return () => clearInterval(timer); },
});
