# Customer map and foreground Technician sharing

> CURRENT implementation: see [FIRESTORE_MAP_SETUP.md](./FIRESTORE_MAP_SETUP.md).
> The callable deployment, polling and throttling guidance below is historical.

The mobile Customer Map tab now uses react-native-maps instead of the old static
SVG. All 25 Sri Lankan districts have stable identifiers. Map and List use the
same approved-Technician directory, filtered by service district and optional
category. Marker cards navigate to the existing Technician profile and direct
Customer request creation. No Dispatcher assignment was introduced.

Technician Profile has service-district editing and an explicit sharing switch.
Location permission is requested only when enabling it. Updates run only while
the app is active, with a 15-second minimum, 50-metre movement threshold, and
45-second heartbeat. GPS acquisition uses a removable high-accuracy foreground
subscription with a 20-second timeout, including Android Emulator location fixes.
The switch turns ON only after the first atomic location save is confirmed.
Permission, device-services, acquisition, watcher and publishing failures have
distinct messages; Retry reacquires and republishes after necessary revocation.
Old/unusable GPS fixes are rejected. Watchers stop on OFF,
background/inactive, logout, and cleanup. Foreground resume checks permission
without prompting again. Every fresh login starts opted out.

## Data and security

- `users.serviceDistrictIds`: canonical district slugs, independent of address
  and current location. Technicians may edit only their own valid selections.
- Existing `serviceDivision` / `serviceAreas` are reused **only when they contain
  exact district names** and the canonical field is absent. An explicit empty
  selection stays empty. Unknown coverage is not guessed from an address/GPS.
- `technician_locations/{uid}`: private exact coordinates; Customers cannot get
  or query these documents directly.
- `technician_map_locations/{uid}`: a separate approximate representation with
  integer latitude/longitude grid cells of 0.01 degrees (about 1 km), server
  timestamp, identity, and sharing flag. No raw coordinate fields are allowed.
  Customers read only known approved Technician document IDs; list is denied.
- Rules require both representations to be written atomically by the owning
  approved, verified, active Technician. OFF is permitted to revoke even if the
  Technician subsequently loses approval; it removes both coordinate sets.
  A private GPS sample timestamp must also be within 60 seconds of server time,
  preventing an old offline-queued fix from acquiring a fresh server timestamp.
  Server confirmation times out after 12 seconds with a retry message; an OFF
  write can remain queued until connectivity returns, and freshness still expires.
- `getMapTechnicians` returns an explicit display-field allowlist from approved
  profiles. It does not expose private profiles, phone numbers, addresses, or
  precise location. The existing profile/review permissions were retained.
- `getJobTechnicianLocation` validates the authenticated Customer, persisted
  request ownership, accepted/in-progress status, and canonical Technician in a
  trusted backend. It supports legitimate legacy `assignedTechnicianId` /
  `assigned` requests, denies conflicting identities, and returns exact location
  only when sharing is enabled and its server timestamp is <= 2 minutes old.
  Customer B cannot use Customer A's job ID to obtain precise coordinates.
- The existing Customer request-details screen polls that endpoint every 15
  seconds while focused and active. Completed/cancelled requests stop polling.
  Server authorization stops immediately for subsequent calls after OFF or an
  ineligible request transition; a previously delivered coordinate can remain
  visible until the next poll. Coordinates already delivered cannot be recalled.
- An abrupt process termination or lost network may prevent the OFF write. The
  public marker becomes visibly stale after 2 minutes; precise access expires
  then. OFF errors are surfaced and logout waits for successful revocation.
  No background tracking/service or history is implemented.

There is no availability field in the inspected schema, so availability is not
invented. Technicians without shared GPS still appear in the filtered list.
No automatic production migration is needed or performed. Technicians with
unrecognized legacy coverage should select and save their districts in Profile.
No new Firestore indexes are required: the backend uses the existing
role/approval equality directory query and location reads use document IDs.

## Dependencies and native map setup

Installed Expo SDK 54 compatible `expo-location ~19.0.8` and
`react-native-maps 1.20.1` using npm. Both are included in SDK 54 Expo Go.
Google Maps is used on Android; Apple Maps on iOS. Web shows the same filtered
list and an explicit native-map explanation. Admin Web is unchanged.

See the official [Expo map documentation](https://docs.expo.dev/versions/v54.0.0/sdk/map-view/)
and [location documentation](https://docs.expo.dev/versions/v54.0.0/sdk/location/).
Expo Go needs no project Maps key. A standalone/development Android binary must
enable Maps SDK for Android and provide a key restricted to its Android package
and signing SHA-1. `app.config.ts` reads `GOOGLE_MAPS_ANDROID_API_KEY` and optional
`EXPO_ANDROID_PACKAGE`, configuring the v1.20.1 native Android map setting.
Configure these through your local environment or EAS environment; do not commit
keys. Rebuild an existing native binary after adding these dependencies/config.
Foreground permission text is in `app.json`; background permissions are disabled.
After configuring the Android package/key, a local native development build can
be generated with `npx.cmd expo run:android`. Native folders are already ignored.

District polygons are from geoBoundaries / OpenStreetMap, ODbL 1.0. Attribution
appears below the Customer map. See `functions/src/domain/DISTRICT_DATA_LICENSE.md`
for the pinned source and license. Boundaries are used for map fitting and the
approximate outside-district explanation, not to assign service coverage.

## Install, check, and deploy when ready

Run from the repository root in PowerShell:

```powershell
npm.cmd ci
npm.cmd --prefix functions ci
npm.cmd --prefix functions run build
npm.cmd --prefix functions run lint
node scripts/check-map-types.mjs
node --test scripts/tests/map-loading.test.mjs
node --test scripts/tests/foreground-sharing.test.mjs
node --test scripts/tests/device-location.test.mjs
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd emulators:exec --only firestore,auth,functions --project demo-servicepilot-review-author --config firebase.map-test.json "node --test scripts/tests/map-location.test.mjs"
firebase.cmd emulators:exec --only firestore,auth --project demo-servicepilot-review-author --config firebase.review-author-test.json "node --test scripts/tests/reviewer-names.test.mjs"
```

Windows may leave the Firestore Java process listening on 8187 after emulator
shutdown. If so, stop that verified demo emulator process before the next run;
do not stop unrelated Java processes or production services.

Production deployment has **not** been performed. The October 2 loading-failure
investigation confirmed that production has no deployed functions and billing is
disabled. Enable Blaze billing for `servicepilot-756d9` before deployment; local
emulator tests do not require that upgrade. See
[CUSTOMER_MAP_LOADING_FIX.md](CUSTOMER_MAP_LOADING_FIX.md) for the exact endpoint
trace, verified checks, and remaining production verification.

These scoped commands deploy
the map endpoints and verified rules without deploying the email function or
other Admin Web/hosting changes:

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd deploy --only "functions:default:getMapTechnicians,functions:default:getJobTechnicianLocation" --project servicepilot-756d9
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9
Remove-Item Env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS -ErrorAction SilentlyContinue
Remove-Item Env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST -ErrorAction SilentlyContinue
npx.cmd expo start --android
```

The endpoints run in `asia-south1`. Firebase CLI handles the existing project
credentials; this implementation does not print, copy, or commit credentials.

## Repeat Android checks locally, without production writes

Terminal 1:

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd emulators:start --only firestore,auth,functions --project demo-servicepilot-review-author --config firebase.map-test.json
```

Terminal 2:

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8187"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9197"
node scripts/seed-map-emulator.mjs
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = "1"
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = "10.0.2.2"
npx.cmd expo start --android --localhost --port 8084
```

Demo accounts: `map-customer-a@example.test`, `map-customer-b@example.test`,
`map-tech@example.test`; password for these local fixtures:
`Only-for-map-emulator-42`. These are emulator-only credentials. The opt-in
development configuration always uses `demo-servicepilot-review-author`; it
cannot select the production project. Clear the two `EXPO_PUBLIC_` variables and
restart Expo to return to normal configuration. Release builds ignore demo mode.

Check district/category selection, map/list counts, a marker card, profile and
request links, stale labeling, Technician permission refusal/retry, sharing
ON/OFF, app background/foreground, and logout. Set the emulator's GPS through
Android Emulator Extended Controls. Fixture `map-job` belongs only to Customer A;
the security suite verifies B's precise access is denied. iOS and a signed native
production build still require device verification after configuration/deployment.

For an acquisition test that starts without any seeded coordinate, use:

```powershell
node scripts/seed-map-emulator.mjs --sharing-off --kandy-only
```

The Technician then serves only Kandy. In Android Emulator Extended Controls →
Location, set latitude `7.290612`, longitude `80.633701` and send the location.
While the Technician app is active, enable sharing or tap Retry. The equivalent
emulator-console command is shown in `CUSTOMER_MAP_LOADING_FIX.md`.
Use a separate Customer device/account, select Kandy, and verify ON/OFF marker
changes. Kurunegala should not return this Kandy-only Technician.

## Verification recorded for this implementation

- Map security suite: 9 tests passed using real signed-in Auth emulator accounts,
  actual mobile service mapping, deployed-to-emulator Firestore rules, and real
  Functions-emulator callables. Covers district/category filtering, sharing
  ON/OFF, safe public fields, server timestamps, coordinate validation, spoofing,
  wrong-role/private query denial, A/B job ownership, completion/cancellation,
  stale access, and current/legacy/conflicting request identities.
- Foreground controller suite: 11 tests passed for opt-in, throttling, heartbeat,
  permission/GPS errors, pause/resume, cleanup, late callback/write races,
  failed revocation and logout, and account-session changes.
- Device-acquisition suite: 5 tests passed for injected fixes, bounded timeout,
  stale-fix refusal, abort/late-registration cleanup, and the actual Expo adapter.
- Existing review/notification suite: 12 tests passed in the earlier rules work;
  the GPS follow-up did not change those rules or flows.
- Functions TypeScript build and lint passed. Focused map screen/dependency
  TypeScript and ESLint checks passed. `git diff --check` passed.
- Full-root `npx.cmd tsc --noEmit` remains blocked by pre-existing Admin Web
  Vite/asset imports, old OTP-test types, and template alias imports outside this
  feature. Existing AsyncStorage persistence / Expo patch-version warnings were
  observed and preserved; no authentication rewrite or unrelated upgrade was made.
- Android Pixel 8 / Expo Go: bundle succeeded; verified Google map tiles,
  district polygons, selector, Colombo marker/card, category filter, Map/List
  counts, no-GPS list entry, stale/outside-district explanation, accepted-job
  stale-location rejection, foreground permission refusal and retry prompt, and
  unavailable-GPS messaging with coordinate-free OFF documents.
- Follow-up native Kandy test: two Android devices connected to the local demo
  emulators; injected Kandy GPS, enabled sharing in the Technician UI, confirmed
  atomic private/coarse publication, and Customer B saw the approximate marker
  with Kandy selected. OFF removed that marker while preserving the listing and
  district map. Disabled device location services produced the specific services
  error; restoring services and tapping Retry reacquired and republished, and the
  marker returned. The final state was OFF. High-accuracy acquisition now accepts
  the emulator's supplied GPS fixes; the earlier balanced-acquisition timeout is
  no longer presented as a generic GPS-unavailable error.
- Real-device lifecycle/GPS behavior, iOS, a signed native build, and production
  end-to-end loading after function deployment still require manual verification.
  No production location test records or production migration were performed.

## Feature files

- Customer UI: `app/(tabs)/map.tsx`, `app/(tabs)/request-details.tsx`;
  shared map, district picker, marker/list data, job-location and sharing
  components under `src/components/maps/`.
- Technician UI/lifecycle: `app/technician/(tabs)/profile.tsx`,
  `app/technician/_layout.tsx`, `src/services/foreground-location.service.ts`,
  `src/utils/foregroundSharing.ts`, and logout integration in
  `src/services/auth.service.ts`.
- Data/config: `src/services/location.service.ts`, optional district IDs in
  `src/services/user.service.ts`, explicit demo mode in `src/firebase/config.ts`,
  `app.json`, `app.config.ts`, `package.json`, and npm lockfile.
- Backend/security: `firestore.rules`, callable exports in
  `functions/src/index.ts`, `functions/src/services/map.service.ts`, canonical
  district helpers/geometry/license in `functions/src/domain/`,
  `functions/tsconfig.json`, and generated-output ignore in `functions/.gitignore`.
- Verification/handoff: `firebase.map-test.json`, `scripts/check-map-types.mjs`,
  `scripts/seed-map-emulator.mjs`, `scripts/tests/map-location.test.mjs`,
  `scripts/tests/foreground-sharing.test.mjs`, and this document.

Unrelated Admin Web, Notifications, reviewer-name/backfill, request/review fixes,
and root repository instructions were preserved.
