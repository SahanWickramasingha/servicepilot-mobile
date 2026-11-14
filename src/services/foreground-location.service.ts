import * as Location from "expo-location";
import { ForegroundSharing, DeviceFix } from "@/src/utils/foregroundSharing";
import { publishTechnicianLocation, syncOwnMapProfile } from "@/src/services/location.service";
import { acquireDeviceFix } from "@/src/utils/acquireDeviceFix";

import { startTechnicianBackgroundWatch, stopTechnicianBackgroundWatch, supportsLockedScreenSharing } from "./technician-background-task";
import { LocationSharingError } from "@/src/utils/locationSharingError";

function fix(point: Location.LocationObject): DeviceFix {
  return { latitude: point.coords.latitude, longitude: point.coords.longitude,
    accuracy: point.coords.accuracy, sampledAt: point.timestamp };
}

export const foregroundSharing = new ForegroundSharing({
  now: Date.now,
  background: supportsLockedScreenSharing,
  stopBackground: stopTechnicianBackgroundWatch,
  permission: async (prompt) => {
    const existing = await Location.getForegroundPermissionsAsync();
    if (!existing.granted && !(prompt && (await Location.requestForegroundPermissionsAsync()).granted)) return false;
    if (!supportsLockedScreenSharing) return true;
    const background = await Location.getBackgroundPermissionsAsync();
    if (background.granted || (prompt && (await Location.requestBackgroundPermissionsAsync()).granted)) return true;
    throw new LocationSharingError("permission", "location/background-permission",
      "To keep sharing when your phone locks, allow location access all the time in device Settings.");
  },
  servicesEnabled: Location.hasServicesEnabledAsync,
  prepare: syncOwnMapProfile,
  current: (signal) => acquireDeviceFix({ now: Date.now, notBefore: Date.now(), watch: async (next, error) => {
    // High requests Android GPS; Balanced can wait for a network fix even when
    // Extended Controls has supplied a GPS coordinate. No background subscription.
    const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High,
      timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: false }, (point) => next(fix(point)), error);
    return () => watcher.remove();
  } }, signal),
  watch: async (next, onError) => {
    if (supportsLockedScreenSharing) return startTechnicianBackgroundWatch((point) => next(fix(point)));
    const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High,
      timeInterval: 30000, distanceInterval: 100, mayShowUserSettingsDialog: false }, (point) => next(fix(point)), onError);
    return () => watcher.remove();
  },
  publish: publishTechnicianLocation,
  every: (callback, ms) => { const timer = setInterval(callback, ms); return () => clearInterval(timer); },
  after: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
});
