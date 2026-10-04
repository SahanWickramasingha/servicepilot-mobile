# GPS coordinate trace and Show location verification

Validated locally on 2026-10-03. This increment preserves the existing dirty working tree. No deployment, production write, production migration, billing change or production diagnostic session was performed. It supersedes the listener-only and stale-focus behavior described in the earlier [map action record](MAP_ACTIONS_SYNC_VALIDATION.md).

## Confirmed defects and limits of the diagnosis

The foreground publisher ignored watch callbacks while its status was `starting`. A fresh watch fix could therefore arrive after acquisition but before the initial save and be discarded. A regression test failed on the original implementation: it published the acquisition position instead of the newer watch position. Movement received during an in-flight initial save also needed to survive the write throttle; older callbacks could previously regress the saved position.

The customer location action previously focused the point already in subscription state and consumed its camera action sequence. If that point was an older Kandy sample, the later Walapane update moved the marker without recentering the camera. The map intentionally avoids automatic camera movement on GPS listener updates. An explicit action now verifies the selected technician's server document before focusing once.

Final review also isolated sharing-session bookkeeping: completion of a previous account's in-flight publication now cannot update the new session's last-fix/write clock and suppress its first save. This is covered by a deterministic account-change regression, not attributed to the reported phone incident.

These are confirmed local defects that can explain an old-location symptom. **The specific physical-phone incident is not confirmed.** Only `emulator-5554` and `emulator-5556` were connected, and no response identifying the physical sharing device was available during this run. The phone's fix, active account, publication and production documents were not observed. The available trace does not establish whether the phone has a stale fix, is backgrounded, is running an older bundle, is sharing under another UID, or is competing with another signed-in device.

Source inspection found no Kandy/Walapane fixture in the production foreground acquisition/publisher/camera path and no last-known-position or service-area GPS fallback. Test-only coordinates remain in guarded demo seed scripts and tests. GeoNames references in `mapViewActions.ts` apply exclusively to the separate service overlay.

## End-to-end flow and changes

| Stage | Coordinate source and identity |
| --- | --- |
| Device | `expo-location` foreground High-accuracy watchers, `LocationObject.coords` plus the original sample timestamp. Acquisition accepts a valid sample at most 60 seconds old, with the existing accuracy/future-time limits. |
| Foreground service | `ForegroundSharing` keeps the newest valid timestamp, accepts watch fixes during startup, serializes writes, and retains pending movement. One cancellable timer publishes still-recent movement at the next allowed interval; the existing 60-second minimum, 100-metre movement and 90-second heartbeat remain. OFF/background/account cleanup cancels pending work. |
| Private document | `technician_locations/{auth.uid}` receives the original precise point and sampledAt. It remains restricted by the existing authoritative request rules. |
| Public document | The same atomic batch writes `technician_map_locations/{auth.uid}` with `floor(latitude * 100)` / `floor(longitude * 100)` integer cells and a server update timestamp. No precise coordinate is copied into the public document. |
| Customer subscription | Reads only the selected public documents. The decoder checks document ID against `technicianId`, sharing ON, integer cell types/ranges and valid reconstructed coordinates. OFF/missing/invalid documents produce null. Newer timestamped states cannot be replaced by an older response. |
| Selected action | The card supplies its projection `uid`. Show location clears the service overlay, enters checking, and makes one bounded `getDocFromServer` public read with a 12-second timeout. No cached fallback on network failure. Sharing OFF observed during a delayed read wins. Selection, service navigation, blur, background and account changes cancel pending action results. |
| Camera | A verified fresh point is captured in the explicit action. The native component accepts only a ready action with a still-available, non-stale shared marker. It focuses once at that approximate point. Stale/OFF/invalid/error states show feedback and issue no camera animation. Later updates move the marker without overriding deliberate pan, zoom or service viewing. |

The common freshness threshold remains 120 seconds. A stale public sample can remain a grey historical marker with text; it cannot be presented or focused as a fresh current location. A failed or stale location action leaves the previous camera position in place and replaces the service banner with explicit unavailable/stale feedback. Thus a camera still over Kandy with an unavailable banner does not represent a Kandy GPS fallback.

## Runtime verification performed

Both Android emulators used one Metro server on port 8084 and a disposable `demo-servicepilot-review-author` Firebase Auth/Firestore project on loopback ports 9197/8187. Seeding used `--sharing-off --kandy-only`; location documents were subsequently written by the foreground app, rather than by an ON seed fixture. The technician and customer used distinct disposable accounts.

Temporary diagnostics ran only with development mode and explicit Firebase-emulator/trace flags. They reported public grid cells, sample/update ages, demo technician IDs, phase and Expo's mocked flag. They never printed credentials, tokens or precise coordinates. Private/public document comparison computed cells in memory and emitted only coarse cells and equality. Actual settled camera centre was read through `getCamera`, quantized before logging. All temporary diagnostic calls, their helper module and the temporary document-reading helper were removed after verification.

| Runtime observation | Result |
| --- | --- |
| Initial mock Kandy device fix and foreground save | Device/acquisition/publication cell `[729,8063]`; both documents used `map-tech`, sharing ON, and matching derived/public cells. |
| Mock movement to Walapane | Device fix and successful publication changed to `[709,8086]`. Private-derived public cells matched the public document. Kandy eligibility was retained. |
| Customer action and actual native camera | Subscription, explicit server read, selected technician, camera request and settled camera all reported `[709,8086]` for `map-tech`. A settled screenshot visibly showed the wrench near Walapane. |
| Service overlay without a saved town | Yellow Kandy polygon/banner explicitly said district boundary only. The wrench retained its Walapane coordinates. |
| Saving Katugastota with the service overlay open | Customer banner/reference and card updated immediately without logout or Refresh. The GPS document pair remained in Walapane. |
| Repeated action switches after the town save | Three fresh service/location cycles returned to the Walapane wrench; repeated stale cycles displayed unavailable without camera animation. New mock fixes restored fresh focus. |
| Stale state | A sample aged past 120 seconds during testing. Show location reported no fresh GPS and emitted no camera request/settled trace; the existing service view position was retained. |
| Sharing OFF | Private/public payloads both became OFF with coordinates absent. Customer showed zero shared locations and retained the eligible technician card. Show location reported unavailable and performed no GPS focus. |
| Zoom | Both existing + and − controls were exercised in the district-only service view. |

These are **Android emulator mock-location tests**, injected through `adb emu geo fix` (the Extended Controls location mechanism), not physical-phone GPS tests. Expo reported `mocked: false` on the emulator fixes; this flag is not proof of real GPS. Android source inspection also identified the devices as emulators. Initial and settled screenshots differed while Google tiles loaded, so the settled camera trace and settled screenshot were used for the conclusion.

## Checks

- Focused map/profile/request TypeScript check: passed.
- ESLint for changed application files and foreground tests: passed.
- Functions TypeScript build: passed.
- 46 distinct focused tests passed across customer foreground location, device acquisition, sharing lifecycle, area validation, distance/freshness, public location loading and native/screen map actions. The final timer/account-race tests and tightened native action contract were checked in their relevant test subsets.
- 29 Firestore/Auth emulator tests: passed, including selected-UID public server reads, ON/OFF decoding, rejected pending-technician access, private/public pairing, precise request access, spoofing/range/type/approval checks, profile-save projections, reviewer names and notification permissions.
- `git diff --check`: passed.

Commands used:

```powershell
node scripts/check-map-types.mjs
npm.cmd --prefix functions run build
npx.cmd eslint 'app/(tabs)/map.tsx' src/components/maps/TechnicianMap.native.tsx src/components/maps/TechnicianMap.types.ts src/services/location.service.ts src/services/foreground-location.service.ts src/utils/foregroundSharing.ts scripts/tests/foreground-sharing.test.mjs
node --test scripts/tests/customer-map-location.test.mjs scripts/tests/service-areas-distance.test.mjs scripts/tests/map-loading.test.mjs scripts/tests/foreground-sharing.test.mjs scripts/tests/device-location.test.mjs scripts/tests/map-view-actions.test.mjs
firebase.cmd emulators:exec --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json "node --test scripts/tests/map-location.test.mjs scripts/tests/map-backfill.test.mjs scripts/tests/map-admin.test.mjs scripts/tests/reviewer-names.test.mjs"
```

Repository-wide TypeScript/lint and Admin Web build were not rerun in this focused increment. Previously recorded unrelated root TypeScript/lint failures and Expo package/Auth-persistence warnings remain documented in [the earlier validation](SERVICE_AREA_MAP_VALIDATION.md). The permission-denied log from the emulator security suite is an expected rejected-write assertion, not a failing test.

## Remaining device verification and repeat instructions

1. Start the local Firebase emulators and one explicitly emulator-configured Metro server, following [the existing two-emulator instructions](MAP_ACTIONS_SYNC_VALIDATION.md). Seed with sharing OFF so location comes from the app.
2. On the technician emulator inject the documented Kandy mock, enable sharing while foreground, and confirm save success. On the customer emulator choose Kandy and inspect the wrench/card.
3. Inject Walapane on the technician emulator. Allow the minimum write interval and supply a fresh fix if necessary. Confirm the public cell becomes `[709,8086]`, then repeatedly switch Show service area / Show location.
4. Save Peradeniya or Katugastota in Personal Information while the customer service banner is open. Confirm the projection/banner changes without logout and the public GPS cell does not change.
5. Check stale, absent and OFF conditions; an explicit location action must show status without focusing a town or district centre. Test denied customer permission and distance browsing using the existing procedure.

The existing documented fixture coordinates are Kandy latitude `7.290612`, longitude `80.633701` and Walapane latitude `7.0955`, longitude `80.8615`; longitude comes first for `adb emu geo fix`. They are test inputs only. Catalogue sources and coverage limitations remain in [SERVICE_AREA_DATA.md](../functions/src/domain/SERVICE_AREA_DATA.md); no catalogue additions were made here.

Physical-phone verification still needs the actual phone, its current foreground technician UID/build, and a safe read-only comparison of the public document and customer selection. To test a physical phone without production writes, connect a disposable demo build to the local Firebase emulators over the development network and grant foreground GPS permission outdoors; do not inject emulator fixtures. Compare coarse cells and ages at every stage, with any temporary instrumentation removed afterwards. A second device signed in as the same technician is a possible competing writer; this run did not establish that it occurred.

Not repeated on a running device in this increment: physical-phone GPS, offline/read-timeout behavior, adversarial document IDs, deterministic startup/in-flight races, actual request/review/notification navigation, iOS, and Admin Web. Relevant security/lifecycle/race paths were tested automatically. Existing earlier device verification is not claimed as a new run.

## Files and deployment

Application changes in this increment: `app/(tabs)/map.tsx`, `src/services/location.service.ts`, `src/services/foreground-location.service.ts`, `src/utils/foregroundSharing.ts`, `src/components/maps/TechnicianMap.native.tsx` and `TechnicianMap.types.ts`. Checks changed: `scripts/tests/foreground-sharing.test.mjs`, `map-loading.test.mjs`, `map-view-actions.test.mjs`, `map-location.test.mjs`, and this record. Other existing modifications were preserved.

This increment needs no new Firestore schema, rules, index or migration. Previously prepared service-area rules/index commands remain for separate review; **none were executed**:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9
```

Temporary demo servers and forwards were stopped. No unrelated server process tree was targeted, and no code diagnostic instrumentation remains.
