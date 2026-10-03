# Current Firestore map setup

## Files changed for this task

- Rules/indexes: firestore.rules, firestore.indexes.json, firebase.map-test.json.
- Display mapping: functions/src/domain/mapProjection.ts; src/services/location.service.ts,
  src/services/user.service.ts, src/utils/mapServiceError.ts.
- Mobile UI/lifecycle: app/(tabs)/map.tsx; src/components/maps/TechnicianMap.native.tsx,
  TechnicianLocationLifecycle.tsx, JobTechnicianLocation.tsx;
  src/services/foreground-location.service.ts; src/utils/foregroundSharing.ts.
- Actual Admin Web approval/status paths: admin-web/src/pages/dispatcher/DispatcherApplications.tsx;
  admin-web/src/services/technicianApprovalService.ts, accountLifecycleService.ts.
- Migration/fixtures: scripts/backfill-map-profiles.mjs, scripts/lib/map-profile-backfill.mjs,
  scripts/seed-map-emulator.mjs.
- Tests: scripts/tests/map-location.test.mjs, map-loading.test.mjs, map-backfill.test.mjs,
  map-admin.test.mjs, foreground-sharing.test.mjs, device-location.test.mjs;
  reviewer-names.test.mjs adds the shared mapper dependency to its harness.
- Documentation: this file; scripts/CUSTOMER_MAP_SETUP.md and CUSTOMER_MAP_LOADING_FIX.md
  now link here because their previous callable instructions are historical.

Other pre-existing uncommitted files, review/notification fixes, credentials,
dependencies and unrelated Functions were preserved.

Validation completed locally: 26 emulator checks (map permissions/query behavior,
migration idempotence, actual Admin lifecycle writes, review-author and notification
regressions) and 20 transport/GPS/controller checks passed. Focused map TypeScript
and changed-file lint, Functions build/lint and Admin Web build passed. Root
TypeScript still reports unrelated Admin/Vite, old OTP and template alias errors;
root lint has 8 existing select-service/template alias errors. Admin build retains
its existing large-bundle warning.

Android Expo Go / two local Auth accounts verified Kandy GPS → Technician ON →
paired Firestore save → Customer B matching Kandy marker/card → View Profile →
selected-Technician request form (not submitted) → OFF removes marker/coordinates.
Map/List and base map were checked separately. An expired replay fixture verified
the stale caption and grey pin; Android's default pin caching required a static
custom pin snapshot keyed by freshness/selection. No continuous bitmap redraw.
Single-point camera fit keeps surrounding streets visible. Evidence is local in
.expo/map-verification/firestore-*.png. iOS/standalone, production indexes and the
native precise-job screen remain manual checks; its Firestore access was tested.

Mobile directory and accepted-job location now use Firestore, without deployed
Functions. The former endpoint
`https://asia-south1-servicepilot-756d9.cloudfunctions.net/getMapTechnicians`
returned not-found because it was undeployed; deployment was blocked by the
closed billing account. Unrelated Functions/exports remain intact.
No production deployment, migration, billing change or fixture write was performed.

## Data and security

| Path | Contents/access |
| --- | --- |
| users/{uid} | Authoritative private profile, approval/status, ratings and coverage. Existing access preserved. |
| technician_map_profiles/{uid} | Only technicianId, fullName, specialization, canonical serviceCategory, serviceDistrictIds, approved, averageRating, reviewCount, updatedAt. No contacts/GPS. |
| technician_map_locations/{uid} | Sharing flag, server timestamp and integer 0.01-degree grid cells. No raw coordinates. |
| technician_locations/{uid} | Private precise coordinates/sample timestamp. No Customer list access. |
| technician_location_access/{uid}/customers/{customerId} | Owning eligible request reference; no coordinates and no unchecked authorization grant. |

Only the authenticated owner Technician writes paired location documents. ON
requires active/verified current approval, a sample within 60 seconds, valid
coordinate ranges, correct quantization and atomic server timestamps. OFF removes
both coordinate sets and denies new precise reads. Private reads recheck actual
request ownership, canonical Technician, eligible status, current approval,
sharing and 120-second freshness every time. Eligible statuses: accepted,
legacy assigned, in_progress. technicianId and legacy assignedTechnicianId are
supported; missing/conflicting values fail. Completion/cancellation revokes new
reads even when a saved reference remains. Private reads always use the server.

Display writes match authoritative fields via getAfter, preventing fabricated
approval/ratings. Dispatcher approval and Admin Technician account lifecycle
updates publish snapshots atomically; rules require the paired approval/status
write. Login sync, Technician name edits and coverage edits maintain snapshots.
Trusted Admin SDK tools bypass rules and must maintain the snapshot invariant too.

Queries require verified active Customers, approved==true and limit≤8. The app
filters the selected service district/category, pages by document ID up to 24,
then fetches each result through a stricter get checking CURRENT authoritative
approval before display. Firestore cannot prove arbitrary external profile
predicates for all potential query results. Denied follow-up gets remain errors.
An out-of-band Admin SDK update could leave a stale display-only query snapshot;
it cannot authorize any location read. Approximate locations permit only known
approved-ID gets, not list queries. No Customer private-profile access was added.

Grid cells describe an approximate area, not guaranteed anonymity. Unknown or
empty service coverage is not inferred from GPS/address. Legacy serviceDivision /
serviceAreas are normalized only for exact district names when canonical coverage
is absent. Unknown specializations remain under All services. Outside-district
markers explain that service coverage is independent of current location.

The read-only production dry-run for PfeMbXYqeXb4NKg2cNk86P6Bnmt1 confirmed Amila's
legacy service coverage resolves to **kurunegala**, specialization **Electric Item**
(no invented canonical category), and projection rating/count **0/0** from the
source/default aggregate fields, not a recalculation of its existing reviews. Its map
snapshot is missing. The proposed migration copies those values and adds the
canonical district; it does not change the existing review or rating aggregate.
Use Kurunegala / All services for this current production account, or deliberately
edit its real service coverage in Technician Profile if it should serve Kandy.
The separate native demo fixture explicitly serves Kandy.

## Exact setup commands

Build/check first; this does not deploy Functions:

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
npm --prefix functions run build
npm --prefix functions run lint
node scripts/check-map-types.mjs
npm --prefix admin-web run build
```

Ship the updated Admin Web through its existing release process before managing
Technician approval/status with these rules: the previous binary lacks the paired
snapshot write. Root Firebase Hosting points to public/, not admin-web/dist.

Required Firestore deployments when ready:

```powershell
firebase deploy --only firestore:rules --project servicepilot-756d9
firebase deploy --only firestore:indexes --project servicepilot-756d9
```

Wait for the two technician_map_profiles composite indexes: approved +
serviceDistrictIds(CONTAINS), and approved + serviceCategory +
serviceDistrictIds(CONTAINS). Default final document-ID ordering matches cursors.
Existing notification indexes are preserved. Emulator success does not prove
production index readiness.

Existing accounts need snapshots before appearing (eligible login sync or migration):

```powershell
node scripts/backfill-map-profiles.mjs --technician-id PfeMbXYqeXb4NKg2cNk86P6Bnmt1
# Only after reviewing that dry-run:
node scripts/backfill-map-profiles.mjs --technician-id PfeMbXYqeXb4NKg2cNk86P6Bnmt1 --apply --confirm-project servicepilot-756d9
# Alternatively review every proposal before bulk application:
node scripts/backfill-map-profiles.mjs --all
node scripts/backfill-map-profiles.mjs --all --apply --confirm-project servicepilot-756d9
```

Default dry-run reuses existing local Admin credentials securely: explicit
credential-path environment variables, ignored secrets files or ADC. Unset
FIRESTORE_EMULATOR_HOST for this project-scoped CLI. It prints only proposed
display fields, Technician IDs and canonical coverage changes, never credentials,
private contact details or GPS. It creates/replaces the allowlisted projection
and adds users.serviceDistrictIds only when absent. Private timestamps, ratings,
aggregates, requests, IDs, reviews/comments and precise GPS remain unchanged.
Apply re-reads/recomputes under a transaction; rerunning produces no writes when
unchanged. Invalid names, ratings or canonical coverage are skipped for manual
validation. It never enables sharing or manufactures coordinates.

## Emulator checks and Android flow

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
npm --prefix functions run build
firebase emulators:exec --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json "node --test scripts/tests/map-location.test.mjs scripts/tests/map-backfill.test.mjs scripts/tests/map-admin.test.mjs scripts/tests/reviewer-names.test.mjs"
node --test scripts/tests/map-loading.test.mjs scripts/tests/foreground-sharing.test.mjs scripts/tests/device-location.test.mjs
```

For native UI testing, terminal 1:

```powershell
firebase emulators:start --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json
```

Terminal 2 seeds only loopback demo emulators, then starts demo Expo:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8187'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9197'
node scripts/seed-map-emulator.mjs --sharing-off --kandy-only
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS='1'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST='10.0.2.2'
npx expo start --port 8084 --android
```

Use two devices so the Technician stays foreground. Demo logins:
map-tech@example.test and map-customer-b@example.test, password
Only-for-map-emulator-42 (fixtures only). Extended Controls → Location: send
latitude 7.290612, longitude 80.633701. Or longitude FIRST with adb:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 emu geo fix 80.633701 7.290612
```

Inject fresh coordinates while acquisition runs; re-send during stationary emulator
heartbeats because mock GPS may not emit fresh fixes automatically. Technician
Profile → enable sharing → grant permission → ON only after paired save. Retry
reruns permission/services, 20-second acquisition, watcher and save. Permission
refusal, services OFF, timeout, save denial and offline state have distinct errors.
Customer B → Kandy → Electrical/All services → marker → card/name → View Profile /
Request Service existing routes. Kurunegala must not match this fixture. Map/List
share one dataset. OFF removes the marker, retains the serving Technician in the
list and revokes new precise reads. Customer A owns map-job; B must be denied.
Unset both EXPO_PUBLIC emulator variables and restart Metro/app to return to the
production configuration. Demo mode explicitly uses a demo project.

## Usage and provider requirements

Native watcher: 30-second/100-metre callbacks. Publication: at least 60 seconds
and 100 metres movement, or a 90-second stationary heartbeat. Initial ON saves
immediately. Freshness expires after 120 seconds. Watchers stop/revoke on OFF,
background, logout and cleanup. Directory refreshes every 5 minutes only while
focused/active, plus manual/filter/focus changes; pages are bounded to 8/24 total.
Only visible IDs have approximate listeners, stopped on blur/background. Job
detail polls once a minute only while focused/active.

Conservative document-operation budget, including rule-dependent reads:

| Operation | Expected operations |
| --- | --- |
| Location publication | 2 writes + about 3 rule-dependent reads |
| Stationary Technician-hour | 40 publications = 80 writes + about 120 reads, plus initial ON/OFF |
| Moving maximum Technician-hour | 60 publications = 120 writes + about 180 reads |
| Directory page n≤8 | n query reads + n server gets + rule reads: budget 4n+1, or 33 for 8 |
| Marker initial/listener event | 1 location read + caller/Technician rule reads: budget 3 per viewer |
| Customer-hour, 8 stationary markers | about 960 listener reads + 396 directory reads (12×33), plus initial events |
| Eligible job Customer-hour | about 600 reads (60 polls including request/public/private and rule reads), plus first reference write and about 3 dependency reads |

Example: 5 stationary Technicians ×8 hours = about 3,200 writes and 4,800 reads.
5 Customers ×4 hours browsing 8 markers = 19,200 listener reads + 7,920 directory
reads. Combined about 31,920 reads before initial events, retries, jobs, profile
sync and other app flows. 24 markers triple browsing cost and can exceed the free
quota. Moving increases usage. Caching, reconnects, denied reads and dependency
changes affect actual totals; monitor usage instead of assuming unlimited service.

Firestore default database free quota: 50,000 reads /20,000 writes daily, 1 GiB
storage, 10 GiB monthly outbound; reset around midnight Pacific. Rule reads and
listener updates count: [quotas](https://firebase.google.com/docs/firestore/quotas),
[read accounting](https://firebase.google.com/docs/firestore/pricing).

Native provider is react-native-maps 1.20.1: Google Maps Android, default Apple
Maps iOS. Preserve provider logo/attribution and geoBoundaries/OpenStreetMap ODbL
district attribution. Expo Go includes maps without a new app key for testing.
Standalone Android needs Maps SDK for Android enabled, a package/SHA-1 restricted
key, and existing app.config.ts GOOGLE_MAPS_ANDROID_API_KEY / EXPO_ANDROID_PACKAGE
environment values; rebuild using `npx expo run:android` after configuration.
Google requires a billing-enabled Maps project/API key for your own binary; this
is separate from Firebase Functions. No billing change or standalone build was
performed. Provider terms/pricing still apply; no unlimited free tiles promise:
[Expo SDK54](https://docs.expo.dev/versions/v54.0.0/sdk/map-view/),
[Google billing](https://developers.google.com/maps/documentation/android-sdk/usage-and-billing).
Web retains its existing platform fallback; iOS/standalone remain unverified.

Live resolution remains pending rules/index deployment, snapshot migration/login
sync, updated app/Admin release and production verification. Offline OFF cannot
guarantee immediate server deletion; expiry protects stale precise reads. Already
received coordinates cannot be retracted. Existing aggregate mechanisms remain
untouched; rating snapshots refresh through sync/migration, not a new privileged
client rating updater. Legacy map callables need no deployment for this feature.
