# Android release preparation — 2026-10-25

Preparation only. No APK/native project generation, EAS remote build, deployment,
production endpoint probe, billing change or production-data operation was run.

## Actual local requirements

The installed Expo SDK is 54 (`expo` 54.0.36); React Native is 0.81.5 and React
19.1.0. New Architecture is enabled. Existing native integrations include maps
1.20.1, SVG 15.12.1, Reanimated ~4.1.1/Worklets 0.5.1, gesture handler ~2.28,
screens ~4.16, safe-area context ~5.6, image-picker ~17.0.11,
image-manipulator ~14.0.8, location ~19.0.8 and date/time picker 8.4.4. The
selected native-library declarations match the installed SDK's
`node_modules/expo/bundledNativeModules.json`. No native package was upgraded.

The installed React Native `gradle/libs.versions.toml` specifies **minSdk 24
(Android 7.0)**, compile/target SDK 36, Android Gradle Plugin 8.11.0 and Kotlin
2.1.20. There is no app override raising the minimum. API 24 is the source-derived
minimum, subject to a future merged-manifest/build check, not a tested device
support claim. RN 0.81 requires Node >=20.19.4; this validation host uses Node
22.17.0. Plan a supported JDK 17/Android SDK 36 build toolchain and verify it before
building. The current Java 24 emulator runtime produced shutdown/Unsafe warnings;
it is not evidence that an Android Gradle release build is ready.

Primary references: [RN 0.81 Android 16 and Node requirements](https://reactnative.dev/blog/2025/08/12/react-native-0.81),
[Expo version support](https://docs.expo.dev/faq/), and
[Expo push development-build requirement](https://docs.expo.dev/push-notifications/faq/).
Installed version-specific package/Gradle files take precedence over a latest-SDK
documentation redirect when assessing this checkout.

## Permissions and interaction review

- Camera/gallery: `app.json` uses the existing image-picker plugin and explains
  service evidence/review photos. `microphonePermission:false` avoids audio capture
  permission. `pickJobPhotos` requests camera permission only for Take photo;
  denial/cancel leaves gallery usable. Review the generated merged manifest and
  Android photo-picker behavior before release, including legacy storage entries
  inherited from native libraries; do not request broad storage/audio access just
  for the current still-photo flows.
- Location: plugin flags disable Android background location and foreground
  location services; only foreground coarse/fine location is intended.
  Technician tracking is opt-in, session/foreground scoped. Customer distance uses
  its explicit permission action; denial preserves browsing. Android approximate
  permission may reduce accuracy and must be exercised on devices. No address
  geocoding/GPS substitution is introduced.
- Notifications: no OS push SDK/channel/permission-registration path exists.
  Firestore in-app notifications do not require Android notification permission.
  The proposed push implementation must create a channel and request Android 13+
  POST_NOTIFICATIONS only from explained opt-in; no exact-alarm permission is
  required for server push. Denial must leave in-app history usable. See
  `ANDROID_PUSH_DESIGN.md` for the remaining authorization/build dependencies.
- Layout: the evidence form already uses SafeAreaView, a keyboard-avoiding
  ScrollView, a bounded responsive width, 44px-or-larger buttons, and a signature
  pad with canonical aspect ratio. Drawing disables parent scroll and release or
  termination restores it; relayout starts a new stroke. Native small-screen,
  large-font, keyboard, edge-to-edge, navigation-bar, touch/responder and bitmap
  marker checks remain NOT RUN. Fixed-height legacy cards/text elsewhere have not
  been certified for all font scales. This task did not redesign those screens.

## Missing APK/release configuration

No `eas.json` or generated tracked Android project exists. `app.config.ts` accepts
`EXPO_ANDROID_PACKAGE` and `GOOGLE_MAPS_ANDROID_API_KEY`; neither has an invented
fallback. The release owner must select the real package ID, versionCode/signing
ownership, Expo/EAS project ownership if using EAS, development/preview/production
profiles, distribution type and credential storage. Maps key restrictions must
match the eventual package/signing certificate. Public mobile environment values
are bundled into the app; Admin/SMTP/FCM private credentials never belong there.

For later review, an EAS profile would use internal distribution plus
`android.buildType: "apk"` for preview, a development-client profile for native
debugging once its SDK package is approved, and a separate signed production
profile/version policy. Do not run `eas build`, Gradle assemble or Expo prebuild
under this task's authorization. No build configuration is marked verified.

Production mobile scheduling requires HTTPS `EXPO_PUBLIC_BOOKING_API_URL`. Missing
or untrusted endpoint configuration fails closed; acceptance must not fall back
to direct Firestore writes. Normal production sessions must NOT set
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=1, and must never infer Auth Emulator usage from
the device being an Android emulator. `src/firebase/config.ts` keeps production
Firebase configuration separate from explicitly opted-in development demo mode.
No production endpoint availability or deployed Rules state was checked.

## Backend, Rules/indexes and safe rollout

The trusted scheduler is part of the existing standalone Node dispatcher host;
it is not exported as a required deployed Cloud Function. Before rollout configure
`DISPATCHER_MODE=production`, `GOOGLE_CLOUD_PROJECT=servicepilot-756d9`, protected
Application Default Credentials, an HTTPS reverse proxy, exact HTTPS
DISPATCHER_ADMIN_ORIGIN and (if using browser booking) BOOKING_WEB_ORIGIN. Configure
PORT/DISPATCHER_BIND_ADDRESS for the host. The current combined entrypoint also
requires DISPATCHER_SMTP_HOST/PORT/USER/PASSWORD/FROM for dispatcher invitations,
with TLS; keep those server-side. The separate OTP/auth hosting configuration
must continue to use its approved settings; this task did not change it.

The default `firebase.json` already points at `firestore.rules`,
`firestore.indexes.json` and `storage.rules`. Existing scheduling identity/status
indexes, notification audience/status/createdAt/ID indexes and receipt indexes
must be deployed and ready. No new index or Rules change was needed here.

Commands prepared for a later explicitly authorized deployment:

```powershell
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9 --config firebase.json
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9 --config firebase.json
firebase.cmd deploy --only storage --project servicepilot-756d9 --config firebase.json
```

Suggested rollout order for review:

1. Finish device/staging checks and baseline build/type/lint remediation; establish
   rollback artifacts, release owners and approved credentials/configuration.
2. Deploy indexes and wait for readiness. Stage the trusted HTTPS Node host and
   verify token/account/role checks on disposable staging data; do not probe real
   customer records as a smoke test.
3. Coordinate a booking-acceptance maintenance/cutover window and compatible
   clients with endpoint configuration. Deploy compatible clients and enforcement
   Rules as one controlled cutover; prevent old direct-accepting clients from
   bypassing overlap enforcement during that transition. Operational maintenance
   controls need release-owner planning; this checkout adds no unapproved live
   maintenance switch.
4. Confirm Rules/Storage compatibility, then reopen booking acceptance and monitor
   bounded errors without logging private payloads. Rollback must preserve the
   reservation boundary, not reopen direct overlapping acceptance.
5. Enable push only under its separate approved design, start cursor and native
   delivery test plan. Do not replay all historical notifications.

Old clients with direct acceptance fail under the prepared Rules. New requests
require explicit intervals; notes/timer audits and completion evidence require
compatible client writes. Legacy active jobs require participant review before
new conflicting acceptance; no automatic migration or default duration is safe.
Existing completed reviews/evidence and older district-only profiles remain
readable. No migration script is necessary for this continuation.

## Two Android devices/emulators — NOT RUN

Use one Metro server, two SDK-54-compatible Expo Go installations for current UI
testing, and a fresh disposable demo project. OS push later needs an approved
development build; Expo Go cannot verify Android remote push.

Terminal 1, repository root:

```powershell
$env:DEBUG = ''
firebase.cmd emulators:start --project demo-servicepilot-review-author --config firebase.review-author-test.json --only auth,firestore,storage
```

Terminal 2, seed/backend:

```powershell
$env:DISPATCHER_MODE = 'emulator'
$env:GOOGLE_CLOUD_PROJECT = 'demo-servicepilot-review-author'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
$env:DISPATCHER_ADMIN_ORIGIN = 'http://localhost:5173'
$env:BOOKING_WEB_ORIGIN = 'http://localhost:8081'
npm.cmd --prefix functions run build
node scripts/seed-booking-emulator.mjs
npm.cmd --prefix functions run dispatcher:serve
```

Terminal 3, one Metro:

```powershell
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1'
$env:EXPO_PUBLIC_BOOKING_API_URL = 'http://127.0.0.1:8789'
npx.cmd expo start --localhost --port 8081
```

Terminal 4, substitute actual serials reported by adb:

```powershell
$workflowAdb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $workflowAdb devices -l
foreach ($workflowDevice in @('emulator-5554', 'emulator-5556')) {
  foreach ($workflowPort in @(8081, 8187, 9197, 9297, 8789)) {
    & $workflowAdb -s $workflowDevice reverse "tcp:$workflowPort" "tcp:$workflowPort"
  }
  & $workflowAdb -s $workflowDevice shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
}
```

Demo-only login identities are `booking-tech@example.test` and
`booking-customer-a@example.test`; the seed script declares their disposable test
password. Do not reuse production accounts or copy actual credentials into logs.
Set technician availability to Available. The seed includes an old assigned job:
explicitly review its interval with the technician so it cannot block the new
scenario; no guessed legacy duration should be injected.

1. Technician: Personal Information → Kandy → Peradeniya → Save → reopen. Check an
   older district-only profile and Other validation, then restart and check saved
   state. Customer chooses that technician directly and an explicit future Colombo
   start/duration; technician accepts and starts.
2. Save before photos → service notes → after photos → actual drawn customer
   signature → pause/resume → complete → customer review. Check real reviewer name,
   rating count/state and both users' intended in-app notices. Capture strokes at
   the pad center/edges at narrow/wide dimensions; relayout, clear, save/reopen and
   compare proportions. Draw with keyboard open and large fonts; verify scrolling
   resumes and safe-area controls remain reachable.
3. Navigate away/restart while timer runs and while paused. Check persisted time
   and evidence, concurrent pause/completion, disabled/completed-job edits and
   incomplete evidence denial. Interrupt a save/offline/reconnect and retry without
   losing selections, creating duplicate bookings or duplicate notices.
4. Using only local demo fixtures, create >40 personal and system notices, with
   equal timestamps. Load earlier pages, add arrivals across boundaries, change
   retained read state, delete/withdraw a retained system message, test navigation,
   Mark all across unloaded history, total invalidation/retry, offline recovery and
   direct account replacement. Old-session callbacks/actions must not affect the
   new account.
5. Competing technician sessions: accept overlapping intervals concurrently (one
   succeeds); adjacent intervals succeed. Race reschedule approval with acceptance,
   retain the original accepted interval until approval, retry the identical legacy
   review without another notice, and reject a different legacy rewrite.
6. Technician mock GPS: use the verified test-only Kandy/Walapane fixtures in
   `SERVICE_AREA_MAP_VALIDATION.md`, Android Extended Controls → Location. Share ON
   in Kandy and confirm saved state. Customer chooses Kandy and sees list plus blue
   wrench; tap for name/declared area/rating/freshness/profile/request IDs. Move GPS
   to Walapane and allow throttling: Kandy service eligibility stays, GPS stays near
   Walapane, outside-district note and Show location work. No selected town may move
   the GPS marker. Keep fixture coordinates in test documentation only.
7. Grant customer foreground permission and verify approximate straight-line
   distance; repeat denied permission with browsing usable. Sharing OFF removes the
   marker. A stale local-demo approximate fix is grey plus Stale text and has no
   distance; no GPS keeps the technician in the list with Location unavailable.
   Test background/foreground, logout, direct SDK account replacement and revoked
   approval/reactivation; sharing must stay OFF for the new/reactivated session.
8. OS push, foreground/background/cold launch and permission-channel delivery are
   BLOCKED pending the push design/native build. Do not count Firestore cards as
   real push. Record device model/API level, font scale, scenario, screenshot and
   observed outcome before claiming any native success.
