import { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "ServicePilot",
  slug: config.slug ?? "servicepilot-mobile",
  android: { ...config.android,
    ...(process.env.EXPO_ANDROID_PACKAGE ? { package: process.env.EXPO_ANDROID_PACKAGE } : {}),
    config: { ...config.android?.config,
      ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY ? { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } } : {}),
    },
  },
});
