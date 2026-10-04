# Map actions and live saved-area updates

This increment preserves the uncommitted implementation present at task start. No production writes, migration, billing changes or deployments were made. Existing Firestore rules/indexes, foreground tracking, private/public coordinate separation and +/− camera controls are retained.

## Cause and changes

The Personal Information save already encodes the district-associated town and atomically updates `users/{uid}` and `technician_map_profiles/{uid}` through `updateUserProfileSafe`. The public projection rules compare the saved area with `getAfter(users/{uid})`. The customer profile screen reads that public projection. The customer map previously fetched directory pages only at focus/refresh and every five minutes; its service banner also kept a copy of the selected label. That produced stale map/card/banner data after a successful town save.

The map now subscribes to the bounded public projection query (8/16/24 maximum), using the existing district/category indexes and server gets to recheck authoritative approval before each result is displayed. It performs no customer reads of private users or precise locations. Listener generations discard superseded results and callbacks after cleanup. Blur/background/logout/account changes clean up the listeners. There is no recurring whole-collection polling.

Service view selection stores only technician ID and action sequence. The marker card and yellow banner derive the area from the same current projection result. Changing the town updates an already-visible banner and reference without logout or Refresh. Malformed/absent town data uses the district-only fallback. Ratings, review counts and profile/request IDs continue to come from the public projection.

**Show location** clears the service overlay and focuses the selected technician's latest valid public approximate GPS sample. It waits if the first location-listener result arrives after the action, then focuses once. Later GPS updates move the wrench without overriding pan/zoom or service-area navigation. The current-location banner displays freshness, including stale status. Sharing OFF, invalid/absent coordinates or a failed location read produce an explicit unavailable state and no substitute pin. The action remains available for technicians without a current marker.

**Show service area** displays a yellow pin/banner at a verified GeoNames postal locality reference for the four curated Kandy entries. It explicitly states that this is a town reference and a service boundary is unavailable. There is no invented coverage radius. Other, district-only and unknown-area profiles use the verified district polygon in yellow, explicitly labelled **District boundary only**. GPS pins remain at their public cell centres during every service view. Neither action writes GPS, service coverage, sharing state or distance data.

[Catalogue provenance and reference limitations](../functions/src/domain/SERVICE_AREA_DATA.md): GeoNames official Sri Lanka postal export, CC BY 4.0; four curated entries only, with source accuracy 4. These references are separate from device samples and are never used in distance calculations. GeoNames attribution appears below the customer map.

## Files changed by this increment

- `app/(tabs)/map.tsx`: bounded directory subscription, identity-only selection, authoritative banner/card state, always-available location action, status and attribution.
- `src/services/location.service.ts`: bounded public directory listener, shared projection mapping and generation guards.
- `src/components/maps/TechnicianMap.native.tsx` / `.types.ts`: one-shot GPS focus with delayed listener support, current-location status, verified yellow town references/district fallback.
- `src/utils/mapViewActions.ts`: references keyed by persisted catalogue IDs.
- `scripts/tests/map-view-actions.test.mjs`, `map-loading.test.mjs`, `map-location.test.mjs`: repeated switches, active town edits, delayed GPS, OFF, bounded reads, stale callback rejection and actual profile-save/subscription integration.
- `functions/src/domain/SERVICE_AREA_DATA.md` and this record: provenance and validation.

All other modified/untracked files at task start, including `AGENTS.md`, were preserved.

## Automated checks (2026-10-03)

- `npm.cmd --prefix functions run build`: passed.
- `node scripts/check-map-types.mjs`: passed.
- Changed-file ESLint: passed, zero errors/warnings.
- Map view, map loading, service-area/distance, customer/device location and foreground-sharing suites: **40 passed**.
- Fresh local Auth/Firestore suite (`map-location`, `map-backfill`, `map-admin`, `reviewer-names`): **29 passed**. Includes repeated Peradeniya → Katugastota → Peradeniya → Katugastota saves received by the same customer subscription, unchanged location documents, private access boundaries, real review-name paths and notifications. Permission-denied diagnostics are expected for rejection assertions.
- `git diff --check`: passed (normal host LF/CRLF conversion notices).

The initial integration run rejected the listener's initial cache/network notification in its test waiter. The waiter was corrected to wait for the authoritative server emission; the fresh suite then passed. A leftover demo Java process holding port 8187 was identified by its project/command line and stopped before rerunning. No product security rule was relaxed.

Repository-wide TypeScript/lint and Admin build were not rerun for this focused increment. Earlier unrelated root failures and Expo dependency/Auth-persistence warnings are recorded in [the prior handoff](SERVICE_AREA_MAP_VALIDATION.md).

## Deployment and repeat procedure

This increment requires **no new rules/index deployment or migration**. The earlier uncommitted broader implementation has separate, unexecuted deployment commands for review:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9
```

Use [the existing two-emulator setup](SERVICE_AREA_MAP_VALIDATION.md#exact-two-emulator-procedure): explicit demo Firebase opt-in, loopback Auth/Firestore, one Metro server on 8084 and two Android emulators. Do not use production accounts for verification.

1. On Technician emulator save Kandy / Peradeniya in Personal Information. Inject the documented Kandy mock GPS and turn sharing ON.
2. On Customer emulator select Kandy, open the marker card and alternate Show service area / Show location at least three times. Expect yellow town reference/banner versus unchanged GPS wrench/freshness. Check +/− in both views.
3. Leave the Customer service-area banner visible. On Technician emulator save Katugastota. Without logout/Refresh, expect Katugastota in the yellow banner and the selected card; its yellow reference should move. Reopen the profile and confirm persistence. Alternate both actions again.
4. Inject the documented Walapane mock GPS; Kandy service results remain. Show location focuses the actual public approximate sample outside Kandy; Show service area returns to the saved town reference. Neither save/action may move the wrench to a town/district centre.
5. Sharing OFF removes the wrench. Show location clears yellow overlays and displays Location unavailable. Service area still works. Repeat for absent and stale local demo fixtures and a district-only/Other profile.

## Running-device verification

Performed on Android emulators **5554 (Technician)** and **5556 (Customer)**, Expo Go/Google Maps, using one demo Metro server on **8084** and only `demo-servicepilot-review-author` loopback Firebase emulators:

1. Signed in to the disposable demo accounts; saved Kandy/Peradeniya through Personal Information and observed success feedback. The customer list showed Peradeniya without logout.
2. Injected the documented Walapane mock GPS using `adb emu geo fix`; enabled foreground sharing through the Technician switch and confirmed saved ON status. The public location used cells `709,8086` and remained outside Kandy; service coverage stayed Kandy.
3. Show service area displayed the yellow Peradeniya reference and banner. Show location removed both and focused the blue wrench near Walapane with freshness. Screenshots were visually inspected; these were distinct camera positions, not inferred from compilation.
4. Alternated the actions repeatedly (at least three times in each direction across the verification), checking +/− in service and GPS views. Wrench coordinates remained at the public cell; no town/district substitution appeared.
5. Left the Customer Peradeniya service banner visible. Saved Katugastota on the Technician emulator. The open Customer banner, yellow reference and card changed immediately to Katugastota without logout, Refresh or closing/reopening the view. A demo document read confirmed the saved Katugastota ID with unchanged public cells `709,8086`. Reopened Personal Information and confirmed persistence. Repeated both map actions after the edit; GPS still focused Walapane.
6. Applied a stale timestamp to the **local demo** public document. Visually verified grey wrench, explicit Stale banner/card text and Distance unavailable. Tapped the wrench; the detail card showed Katugastota, 4.0/3-review fixture state and existing profile/request actions. Its Show service area action dismissed the modal and returned to the yellow reference.
7. Turned sharing OFF through the Technician UI and confirmed saved OFF status. Customer showed zero shared locations and no wrench. Show location cleared the yellow reference and displayed Location unavailable. A demo document read confirmed OFF with no coordinate cells. Show service area still displayed Katugastota while OFF.
8. Cleared the town and saved district-only Kandy through Personal Information while sharing remained OFF. The open Customer service view immediately became a yellow Kandy polygon with **District boundary only** and no town reference pin. Show location again cleared that overlay and kept location unavailable. The demo location document was unchanged by the coverage save.

Screenshots inspected in ignored `.expo/service-area-verification/`: `current-peradeniya.png`, `current-gps.png`, `current-katugastota-live.png`, `current-gps-after-town.png`, `current-stale-gps.png`, `current-off-unavailable.png`, `current-district-only.png`. The native account's aggregate 4.0/3 count is a synthetic demo fixture, not proof of live review rendering. Review/notification integrity and access boundaries passed the separate emulator suites.

**Not tested on a running device for this increment:** iOS/Apple Maps, physical/release devices, other densities/large text/TalkBack, Other/multiple service districts, overlapping technician selection, delayed first GPS arrival, malformed GPS, auth/account-switch races, offline/reconnect behavior, changed-town View Profile/Request Service navigation or submission, review submission/notifications, and distance permission grant/denial/expiry. Relevant core paths have automated coverage, but that is not live-device verification. Kundasale/Gampola references were source-verified and share the tested rendering path; their individual map views were not opened. No production data, rules or index readiness was tested. No paid geocoding or town boundaries are available; references are explicitly approximate locality points.

After verification, sharing was left OFF, the demo apps and task-created Metro/Firebase servers were stopped, and task port forwards were removed. The pre-existing Metro server on 8081 was preserved. Earlier device records in other documents remain historical.
