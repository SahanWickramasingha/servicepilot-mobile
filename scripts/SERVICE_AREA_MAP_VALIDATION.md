# Technician service areas and current GPS

This handoff supersedes the earlier map task's validation claims in `FIRESTORE_MAP_SETUP.md`. Only the checks recorded below refer to this change. No production deployment, billing change, Cloud Functions deployment or live record write was performed.

## Implementation and coordinate trace

- Personal Information now provides Service Area → existing multi-district picker → searchable Town / Area for each district. Four verified Kandy entries and an explicitly technician-provided Other option are available. Removing a district clears its area; district-only older profiles remain valid. Saves use the existing profile transaction, publishing the display projection atomically, with loading/error/success feedback.
- Areas never write location documents or enable sharing. Expo's foreground GPS fix is written precisely to `technician_locations/{uid}` and as `floor(latitude*100)` / `floor(longitude*100)` grid cells to `technician_map_locations/{uid}`. Browsing reconstructs cell centres only. There are no district/town/address marker fallbacks.
- Read-only Android `dumpsys location` confirmed emulator-5556's reported GPS was **37.421998, -122.084000** (Googleplex); emulator-5554 reported a Kandy mock fix. This verifies the device-coordinate hypothesis, not the identity/location of any production account in the screenshots.
- Android `react-native-maps` 1.20.1 snapshots custom children into marker bitmaps. The previous 32×42 pin contained a dot and disabled tracking on first render. Pins now contain the existing Lucide wrench, with explicit native dimensions. Native testing exposed a 100-pixel fallback bitmap under Android Fabric interop; the design scales to fit within 96 pixels on dense Android screens, preserving the full outline/tip. Tracking lasts only for initial layout (500 ms), with redraw and remount on visual state changes. Blue means fresh; grey and explicit **Stale** captions identify old locations. The map opens on district bounds and moves outside them only on Fit map / Show location. Overlapping pins group at the current zoom, open an accessible technician chooser and preserve original coordinates.
- Marker cards include name, service, selected declared area/district, genuine aggregate rating state, review count, relative and absolute update times, distance when available, and existing technician-ID profile/request actions. Shared outside-district technicians stay in district results with a note and Show location action. Sharing OFF removes coordinates and markers; no-GPS technicians remain listed as Location unavailable.
- Foreground customer location is requested only from the purpose-labelled distance button and held in memory. The temporary watcher is removed on acquisition, timeout, blur, background and Auth changes. Refusing permission still permits browsing. Haversine distance uses customer GPS and the technician's **public approximate** coordinates, never private coordinates or service centres. Both samples must satisfy the same `LOCATION_FRESH_MS = 120000` threshold (5-second future tolerance); otherwise distance is unavailable. This is straight-line distance, not driving distance or ETA. Refresh customer location when moving.

## Privacy, projections and rollout

The prior customer technician browsing service read whole approved `users` documents, which included home addresses. Customers now use `technician_map_profiles` for directory, View Profile and request preflight. Customer get/list permissions on other `users` profiles were removed. Owner, Dispatcher review and Admin access remain. Existing reviews retain their own real customer-name snapshots and do not read other Customer profiles.

The safe projection adds optional `serviceAreasByDistrict` and `publicDetails` (experience, qualifications, certifications, profile photo URL and completed-job count). Each write must match `getAfter(users/{uid})`; private address/contact/GPS fields and fabricated trusted ratings/approval are rejected. See [catalogue provenance](../functions/src/domain/SERVICE_AREA_DATA.md) for compact area storage. Existing map profiles lacking publicDetails still work with Not provided/zero defaults until login sync or a reviewed backfill refreshes them. No area migration is required.

Location security is unchanged: only an owning approved/active/email-verified Technician publishes paired ON documents; values/grid consistency/server timestamps are checked. Precise reads require an authoritative request owned by the caller, matching technician IDs, `accepted`, `in_progress`, or legitimate legacy `assigned`, sharing ON and 120-second freshness. Broad precise/public-location queries are denied. OFF/background/logout stop foreground sharing under the existing policy.

Map pages remain 8, maximum 24. The general technician directory has bounded 8/16/24 queries with explicit Load more, current-approval server gets and category filtering. The shared display collection now permits at most 24 results. One additional composite index supports approved + category browsing without a district. Original district, category/district and notification indexes are retained. Native GPS publication remains movement/interval-throttled; no callback-per-write or required paid service was added.

Release the updated mobile client before/alongside tightening rules: older clients that query `users` for customer browsing will be denied. Ensure existing approved technicians have safe projections before the rule rollout; technician login/area/name edits and Dispatcher/Admin lifecycle paths already maintain them. The existing idempotent dry-run-first script uses the updated mapper and can populate missing projections/public details. **Prepared commands below were not executed against production.**

```powershell
npm.cmd --prefix functions run build
# Review all proposals (default dry-run); requires authorised local Admin credentials.
node scripts/backfill-map-profiles.mjs --all
# Only after reviewing proposals and authorising production migration:
node scripts/backfill-map-profiles.mjs --all --apply --confirm-project servicepilot-756d9
```

The helper was tested for dry-run, repeat-run idempotence and preservation of private data, reviews, location and aggregate ratings. It does not set service towns, invent coverage from addresses, move GPS or enable sharing. No production dry-run was performed for this task.

Required deployments after review:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9
```

Wait for indexes to finish building. No Functions or billing setup is required for this flow. Emulator tests do not verify production index readiness.

## Local checks

Run from the repository root (PowerShell `.cmd` avoids this host's script execution policy):

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
npm.cmd --prefix functions run build
npm.cmd --prefix functions run lint
node scripts/check-map-types.mjs
npm.cmd --prefix admin-web run build
node --test scripts/tests/customer-map-location.test.mjs scripts/tests/service-areas-distance.test.mjs scripts/tests/map-loading.test.mjs scripts/tests/foreground-sharing.test.mjs scripts/tests/device-location.test.mjs
firebase.cmd emulators:exec --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json "node --test scripts/tests/map-location.test.mjs scripts/tests/map-backfill.test.mjs scripts/tests/map-admin.test.mjs scripts/tests/reviewer-names.test.mjs"
```

Do not inherit a broad DEBUG setting when running Firebase CLI; verbose CLI diagnostics can include environment variables. Use fresh demo emulators for the regression fixtures.

Focused checks cover district/area association, resets/legacy profiles, Other validation, all 25 district areas within the rule-expression budget, persistence with unchanged GPS/sharing, public profile access, forged projection fields, straight-line distance including antipodes/antimeridian, stale/absent/invalid sample gates, overlapping marker identity, throttling/lifecycle and existing review-name/notification/role boundaries.

Root TypeScript has pre-existing Admin/Vite import configuration, old Cloudflare OTP test types and template alias errors. Root lint has eight pre-existing errors in `select-service.tsx` and template theme/parallax imports. These are separate from focused change checks. Admin production build retains its pre-existing bundle-size warning. Expo reports existing package-version compatibility and memory-only Auth persistence warnings; dependencies/Auth persistence were not changed.

## Exact two-emulator procedure

Start two Android AVDs with Expo Go (example serials emulator-5554 and emulator-5556). Use demo fixtures only; keep the Technician app foreground while operating the separate Customer emulator.

Terminal 1:

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd emulators:start --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json
```

Terminal 2, one Metro server:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8187'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9197'
node scripts/seed-map-emulator.mjs --sharing-off --kandy-only
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS='1'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST='127.0.0.1'
npx.cmd expo start --port 8084 --localhost
```

Terminal 3:

```powershell
$taskAdb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $taskAdb -s emulator-5554 reverse tcp:8084 tcp:8084
& $taskAdb -s emulator-5556 reverse tcp:8084 tcp:8084
& $taskAdb -s emulator-5554 reverse tcp:8187 tcp:8187
& $taskAdb -s emulator-5556 reverse tcp:8187 tcp:8187
& $taskAdb -s emulator-5554 reverse tcp:9197 tcp:9197
& $taskAdb -s emulator-5556 reverse tcp:9197 tcp:9197
& $taskAdb -s emulator-5554 shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8084
& $taskAdb -s emulator-5556 shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8084
```

1. Technician: log in on emulator-5554 as `map-tech@example.test`, password `Only-for-map-emulator-42` (disposable demo account). Profile → Personal Information → Service Area → select Kandy; search/select Peradeniya; Save Changes. Verify success and reopen persistence. Try changing/removing districts, invalid/blank Other, multi-district areas and the seeded older profile with no area.
2. Technician Extended Controls (⋮) → Location → Single points: latitude **7.2906**, longitude **80.6336**, Send. This test-only point is GeoNames Kandy feature **1241622**, verified in the official gazetteer export on 2026-10-03. Alternatively longitude FIRST: `& $taskAdb -s emulator-5554 emu geo fix '80.6336' '7.2906'`. Profile → sharing ON → grant foreground permission. Wait for saved ON state. Re-send fresh mock fixes while acquisition runs and during stationary mock heartbeats; the app correctly rejects old samples.
3. Customer: log in on emulator-5556 as `map-customer-b@example.test`, same disposable password. Map → Kandy → All/Electrical. Verify district initial view, list eligibility and blue wrench marker. Zoom when pins overlap; tapping a count pin opens the chooser.
4. Tap wrench → card: Map Technician, Electrical, Peradeniya, Kandy; rating/count state; freshness and last update. View Profile must open `map-tech` with existing review names. Request Service must preselect `map-tech`; submitting a demo request should notify that Technician. Do not submit against production.
5. Move Technician GPS using Extended Controls to latitude **7.09495**, longitude **80.86074**, Send (or `& $taskAdb -s emulator-5554 emu geo fix '80.86074' '7.09495'`). This test-only point is GeoNames Walapane administrative locality feature **11987343**, not a claimed street address/current-town reverse geocode. The official [Sri Lanka gazetteer](https://download.geonames.org/export/dump/LK.zip) labels it Walapane; district boundaries must place the public cell outside Kandy. Allow at least 60 seconds since the last publication and inject another fresh fix to satisfy write throttling. Kandy results must retain the Technician, the outside note must appear, and Show location must move the camera to the approximate Walapane cell. Reopening/changing service area must not alter those coordinates.
6. Set Customer mock GPS to Kandy, then tap Use / refresh my location for distance and grant permission. Verify Approximately X km away, with straight-line wording. Refresh after moving and after 120 seconds. Repeat after denying foreground permission: map/list/profile actions remain usable; distance is unavailable. If Android stops prompting after repeated denials, grant foreground location through Expo Go's App info → Permissions, then retry. Neither customer GPS nor distances are stored remotely.
7. Technician sharing OFF: Customer marker disappears, list stays with Location unavailable. For stale-marker testing, an authorised **local demo emulator** fixture may set public location updatedAt more than 120 seconds old; expect grey pin, Stale text and no distance. Pausing/backgrounding normally revokes sharing under existing policy, so it should remove the marker rather than create a stale fixture.
8. Verify profile persistence and district-only older profiles, existing reviews with real reviewer names, review submission/duplicate handling, personal and broadcast notifications. Verify Customer B cannot view precise location for Customer A's seeded accepted `map-job`, while its owner can; completion/cancellation/OFF revokes precise access.
9. Turn sharing OFF and sign out before stopping demo services. Remove the two EXPO_PUBLIC emulator environment variables and restart Metro/app before returning to normal sessions. Android emulator detection alone never enables Firebase Auth emulation.

Fixture coordinates are confined to documentation and disposable tests. The source catalogue contains no coordinates. GeoNames administrative/locality reference points are test inputs, not evidence of the technician's actual town or precise home location.

## Verification record

Completed on 2026-10-03:

| Check | Result |
| --- | --- |
| Focused map/profile/request TypeScript (`check-map-types.mjs`) | Pass |
| Changed TypeScript/JavaScript files ESLint | Pass, zero errors/warnings |
| Functions TypeScript build and lint | Pass |
| Admin Web production build | Pass; existing >500 kB bundle warning |
| Domain, customer permission lifecycle, device acquisition, transport and sharing tests | 31 passed |
| Fresh local Firestore/Auth emulator regression | 29 passed; expected permission-denied diagnostics from rejection assertions |
| `git diff --check` | Pass; host reports normal LF/CRLF conversion notices |
| Root `tsc --noEmit` | Existing Admin/Vite, Cloudflare OTP test and template alias errors; no changed-path errors |
| Root `npm.cmd run lint` | Eight existing errors in `select-service.tsx` and template theme/parallax imports |

**Performed on two Android emulators using one Metro server and a disposable demo Firebase project:** both logins; older district-only Technician profile; Kandy → Peradeniya save success and reopen persistence; sharing ON from a fresh mock GPS; public Kandy grid cells `729,8063`; Customer Kandy eligibility and visible blue wrench; marker card name/category/area/4.0 rating/3-count/update time; correct View Profile and selected Technician on Request Service; moving mock GPS to Walapane retained the Kandy/Peradeniya declaration while public grid cells became `709,8086`; outside note and Show location zoom near Walapane; denied foreground permission with browsing retained; granted foreground permission with approximately **33.5 km** straight-line distance; local stale fixture with grey complete wrench pin, explicit Stale text and distance unavailable; sharing OFF confirmation with zero Customer markers and the retained Location unavailable list card. Native testing found and fixed Android bitmap clipping and permission-dialog background transitions; automated checks cover their lifecycle paths. The small final Show location scroll-offset adjustment was checked with TypeScript/lint; its status-bar spacing was not recaptured on a device.

Screenshots were inspected locally in ignored `.expo/service-area-verification/` (`kandy-map.png` before the sizing fix, `walapane-pin.png` after it, `stale-pin.png`). All writes were to local demo emulators only. Demo apps and the task's Metro/Firebase servers were stopped after sharing OFF.

**Not performed on a running device:** multi-district/Other validation, the final keyboard-avoidance adjustment in district/town search sheets, overlapping-marker chooser, every service filter/list pagination, creating/submitting a request, actual review submission/reviewer-name rendering and notifications, precise-job owner/nonowner access, account-change/logout/background sharing, and customer-location expiry after 120 seconds. Relevant domain/emulator/lifecycle tests passed, including actual request creation and Technician notification, review names/submission/duplicates and broadcast permissions. The seeded native map account has a synthetic aggregate rating/count and no review rows; viewing its rating is not evidence of live reviews. iOS, other Android densities/release builds, physical devices, production rules/index readiness and production accounts remain unverified. Web retains the existing list-only map fallback.

## Changed files

The pre-existing user edit to root `AGENTS.md` was preserved; no guidance file was replaced.

- Profile screens/routes: `app/(auth)/edit-profile.tsx`, `app/technician/personal-information.tsx` (new), `app/technician/(tabs)/profile.tsx`, `app/technician/_layout.tsx`.
- Customer screens: `app/(tabs)/map.tsx`, `app/(tabs)/technicians.tsx`.
- Map UI/lifecycle: `src/components/maps/ServiceAreaPicker.tsx` (new), `DistrictPicker.tsx`, `TechnicianMap.native.tsx`, `TechnicianMap.types.ts`, `TechnicianSharingPanel.tsx`; `src/hooks/useCustomerMapLocation.ts` (new); `src/utils/technicianMarkerGroups.ts` (new).
- Services/security: `src/services/user.service.ts`, `location.service.ts`, `technician.service.ts`; `firestore.rules`, `firestore.indexes.json`.
- Shared domain/data: `functions/src/domain/serviceAreas.ts` (new), `SERVICE_AREA_DATA.md` (new), `map.ts`, `mapProjection.ts`.
- Checks/handoff: `scripts/check-map-types.mjs`; `scripts/tests/service-areas-distance.test.mjs` (new), `customer-map-location.test.mjs` (new), `map-location.test.mjs`, `map-loading.test.mjs`, `reviewer-names.test.mjs`; this handoff (new).

Existing backfill scripts, Admin Web code, Auth emulator opt-in configuration and foreground Technician controller remain in place. No dependency changes or deployment were made.
