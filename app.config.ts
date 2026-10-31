import { ConfigContext, ExpoConfig } from "expo/config";
import { assertReleaseEnvironment } from "./scripts/lib/release-config.cjs";

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.SERVICEPILOT_RELEASE === "1" || process.env.NODE_ENV === "production" || process.env.EAS_BUILD === "true" ||
    ["preview", "production"].includes(process.env.EAS_BUILD_PROFILE ?? "")) assertReleaseEnvironment(process.env);
  return {
  ...config,
  name: config.name ?? "ServicePilot",
  slug: config.slug ?? "servicepilot-mobile",
  ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
  extra: { ...config.extra, ...(process.env.EXPO_EAS_PROJECT_ID ? { eas: { ...config.extra?.eas, projectId: process.env.EXPO_EAS_PROJECT_ID } } : {}) },
  android: { ...config.android,
    ...(process.env.EXPO_ANDROID_PACKAGE ? { package: process.env.EXPO_ANDROID_PACKAGE } : {}),
    config: { ...config.android?.config,
      ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY ? { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } } : {}),
    },
  },
  };
};
