import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

export const supportsLockedScreenSharing = Platform.OS === "android" || Platform.OS === "ios";
const name = "servicepilot-technician-location";
type Handler = (point: Location.LocationObject) => void | Promise<void>;
let listener: Handler | undefined;
let tail = Promise.resolve();

if (supportsLockedScreenSharing) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(name, async ({ data, error }) => {
    // Never publish from an OS restart without the approved, opted-in session in memory.
    if (error || !listener) return;
    const latest = data?.locations.reduce<Location.LocationObject | undefined>(
      (point, sample) => !point || sample.timestamp > point.timestamp ? sample : point, undefined);
    if (latest) return listener(latest);
  });
}

function serialize(work: () => Promise<void>) {
  const operation = tail.catch(() => undefined).then(work);
  tail = operation;
  return operation;
}

export function stopTechnicianBackgroundWatch() {
  listener = undefined;
  return serialize(async () => {
    if (supportsLockedScreenSharing && await Location.hasStartedLocationUpdatesAsync(name)) {
      await Location.stopLocationUpdatesAsync(name);
    }
  });
}

export async function startTechnicianBackgroundWatch(next: Handler) {
  await serialize(async () => {
    await Location.startLocationUpdatesAsync(name, {
      accuracy: Location.Accuracy.High,
      timeInterval: 30000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "ServicePilot location sharing",
        notificationBody: "Your location is being shared. Open ServicePilot to turn it off.",
        killServiceOnDestroy: true,
      },
    });
    listener = next;
  });
  return () => {
    if (listener === next) void stopTechnicianBackgroundWatch().catch(() => undefined);
  };
}
