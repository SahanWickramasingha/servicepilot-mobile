# EAS preview APK preparation — November 2, 2026

Historical preparation snapshot: the missing-variable findings below were
superseded during credentials/build setup. See [current release staging review](PREVIEW_RELEASE_REVIEW.md)
for the current check results and the completed build's provenance limitations.

The preview profile is prepared, but a build is blocked until these EAS preview
variables are supplied:

- `EXPO_ANDROID_PACKAGE`: the owner's permanent Android application ID. It is
  absent from both the preview environment and `app.json`; no ID was invented.
- `GOOGLE_MAPS_ANDROID_API_KEY`: the Android Maps key. It is absent from the
  preview environment and local configuration; no key was created.

Use plaintext for the package ID and sensitive visibility for the Maps key so
local EAS app-config evaluation can use it. A key embedded in an APK is not a
server secret. Restrict it to Maps SDK for Android and the actual package and
preview signing certificate SHA-1. SDK enablement, restrictions and signing
credentials were not verified or changed. No billing was activated.

## Confirmed configuration

Read-only EAS CLI inspection confirmed:

- Project: `@sahanwickramasingha2003/servicepilot-mobile`.
- UUID: `b04d5f66-1b75-4626-b6f0-77d3d7ccf529`.
- Preview project environment contains `EXPO_PUBLIC_BOOKING_API_URL` and
  `EXPO_PUBLIC_PHOTO_API_URL`. Both pass the existing permanent HTTPS-origin
  validation. Values were not printed or written to a local env file. Endpoint
  health/authenticated operations were not tested.
- No account-wide preview variables were returned. No server credential
  variables were found in the preview project environment.

`app.json` already contains the confirmed owner/project linkage; its pre-existing
uncommitted changes were preserved. `app.config.ts` reads Android package and
Maps key from the variables above. The installed Expo Android config plugin
consumes `android.config.googleMaps.apiKey` for the native manifest; the existing
configuration matches installed `react-native-maps` 1.20.1. No provider or library
change is required.

This task changes only `eas.json` and this report. Preview now supplies
`EXPO_OWNER` and `EXPO_EAS_PROJECT_ID` using the confirmed public linkage, because
the existing release guard also requires those environment aliases. Production
configuration and unrelated working tree changes were preserved.

Preview remains `distribution: internal`, `android.buildType: apk`,
`environment: preview`, `credentialsSource: remote`. Its environment explicitly
sets `SERVICEPILOT_RELEASE=1` and `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=0`.
`src/firebase/config.ts` additionally gates demo mode behind `__DEV__` and an
explicit emulator flag of `1`; normal Android/emulator sessions do not
automatically connect to Auth Emulator. The release guard rejects emulator hosts,
temporary/demo API origins, missing identity/Maps inputs and known server-secret
variables.

## Upload boundary and checks

The existing `.easignore` excludes env files (including `.env.local`),
`.dev.vars`, `secrets/`, service-account JSON filename variants, ADC/credentials
files, private keys, keystores, runtime logs, local Firebase/Expo caches, backend
workers, Admin Web and Functions service implementations. It retains the pure
`functions/src/domain` modules imported by the app and the pre-install release
checker. The pnpm workspace/lock files remain excluded so the archive selects
the existing npm lock. No credential or private file was added to the profile.

Executed checks:

- `npm.cmd run release:check:static`: passed.
- `node scripts/check-release-review.mjs`: passed; 18/18 private-file exclusion
  probes and no credential-pattern findings in reviewed nonignored source.
- `node --test scripts/tests/release-readiness.test.mjs`: 5/5 passed.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run lint`: zero errors; existing cleanup-ref warning at
  `app/technician/job-action.tsx:50`.
- Full `scripts/check-release.mjs` with the real preview URLs and updated profile:
  blocked only by `EXPO_ANDROID_PACKAGE` and `GOOGLE_MAPS_ANDROID_API_KEY`.
- `git diff --check`: passed.

These are configuration/source checks, not an inspected EAS upload archive or a
compiled APK. No native prebuild, signing generation, device installation, cloud
build, remote environment mutation, billing activation, commit or push was run.

Once the two missing values and Maps restrictions are configured, rerun the full
release check with the preview environment before requesting a build. The future
build command is prepared here only:

```powershell
npx.cmd eas-cli build --platform android --profile preview
```

Environment behavior: [Expo EAS environment variables](https://docs.expo.dev/eas/environment-variables/usage/).
Maps restrictions: [Expo Android Maps setup](https://docs.expo.dev/versions/latest/sdk/map-view/#android).
The latest Maps documentation redirects to a newer library release; installed
Expo plugin source was used to verify this checkout's configuration field.
