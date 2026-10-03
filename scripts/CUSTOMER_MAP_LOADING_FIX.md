# Customer map loading failure: local fix and deployment handoff

> Historical diagnosis. CURRENT mobile data flow no longer calls Functions;
> follow [FIRESTORE_MAP_SETUP.md](./FIRESTORE_MAP_SETUP.md) for rules, indexes,
> migration and emulator verification. No map function deployment is required.

## Confirmed cause (October 2, 2026)

The Customer map calls Firebase `httpsCallable` from
`src/services/location.service.ts`, using the configured Firebase app and
`getFunctions(app, "asia-south1")`. The failing request is:

```text
POST https://asia-south1-servicepilot-756d9.cloudfunctions.net/getMapTechnicians
Content-Type: application/json
{"data":{"districtId":"anuradhapura"}}
```

The optional service filter adds `category` inside `data`.

This URL matches the local backend: `functions/src/index.ts` exports
`getMapTechnicians`, global region is `asia-south1`, and
`functions/package.json` loads `lib/index.js`. The successful TypeScript build
produced that callable export with matching region metadata. `firebase.json`
selects source `functions`, codebase `default`, with build/lint predeploy hooks.
Neither a renamed function nor an incorrect client URL caused this failure.

Read-only verification returned HTTP 404 at that exact endpoint, and
`firebase.cmd functions:list --project servicepilot-756d9` reported
`No functions found in project servicepilot-756d9`. The required endpoint is
undeployed. A read-only authenticated Cloud Billing check using the existing
local Firebase login returned `billingEnabled: false` for this project.
[Firebase requires Blaze billing for Cloud Functions deployment](https://firebase.google.com/docs/functions/get-started).
No billing change, API enablement, deployment, or production write was attempted.
Other deployment IAM/API requirements were not exhaustively checked.

## Local changes

- `src/utils/mapServiceError.ts`: classify callable failures as endpoint, access,
  network, or service failures and provide appropriate directory/job messages.
- `src/services/location.service.ts`: retain Firebase callable transport,
  explicitly name the existing region, and preserve original error codes.
  Firebase maps HTTP 404 to `functions/not-found`. It maps failed fetches and
  server errors to `functions/internal`; only that ambiguous case performs a
  bounded, credential-free reachability probe against the SDK's validated URL.
  Development diagnostics include operation, project, region, URL and safe code;
  they contain no credentials or personal documents.
- `app/(tabs)/map.tsx`: show the appropriate error and keep the real native map
  mounted independently of directory loading, errors, or a successful empty
  result. An unavailable directory is never reported as an empty directory.
- `src/components/maps/JobTechnicianLocation.tsx`: use matching accurate errors
  for the existing private job-location callable.
- `scripts/tests/map-loading.test.mjs`: test the actual Firebase callable SDK
  with intercepted HTTP responses, including the exact request URL/body.
- `scripts/tests/map-location.test.mjs`: load the shared error helper in the
  existing mobile-service test harness; permission assertions are preserved.
- `scripts/CUSTOMER_MAP_SETUP.md` and this file: document verified deployment
  selectors, billing prerequisite, and current verification.

Firestore rules, private location protection, callable authorization, district
and location-sharing logic, request/review/notification fixes and unrelated
uncommitted changes were preserved. No migration or new index is required for
this loading fix. Customers still cannot read private precise location records.

## Checks actually run for this fix

- `npm.cmd --prefix functions run build` and `run lint`: passed. Compiled map
  callable exports have generation 2 / `asia-south1` metadata and no secrets.
- `node scripts/check-map-types.mjs` and focused mobile ESLint: passed.
- `node --test scripts/tests/map-loading.test.mjs`: 5 passed, covering the exact
  endpoint, successful data/empty data, 404, 401/403, failed connections, and
  separation of server errors from access/network errors. Requests were
  intercepted; no production credentials/data were sent by these tests.
- Local Auth/Firestore/Functions emulator suite: 8 passed using real signed-in
  fixture accounts and the actual built callables. Correct approved district/
  category data loaded. Sharing OFF, stale locations, coordinate validation,
  identity spoofing, private browsing denial and Customer A/B job ownership
  boundaries passed. No production test records were created.
- Android emulator / Expo Go against the current production configuration:
  visually verified the new endpoint-unavailable message and real Google map
  tiles with the Colombo district outline despite having zero loaded markers.
  This verifies map rendering independently of directory availability.
- `git diff --check`: passed.

Production Technician data loading remains unavailable until deployment. The
local emulator verifies successful directory data loading separately from the
Android native-map rendering check; no production end-to-end success is claimed.

## Exact deployment commands after enabling billing

Run from `C:\Users\WW\Desktop\servicepilot-mobile` in PowerShell. Build and
lint have passed locally; Firebase also runs these configured predeploy hooks.

For only the directory endpoint needed by the Customer Map tab:

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd deploy --only "functions:default:getMapTechnicians" --project servicepilot-756d9
```

For both the directory and existing accepted-job precise-location endpoints:

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd deploy --only "functions:default:getMapTechnicians,functions:default:getJobTechnicianLocation" --project servicepilot-756d9
```

These selectors were checked with the installed CLI: they explicitly select the
`default` codebase and the named exports, without deploying the email function,
review trigger, hosting, or Admin Web. These map functions require no additional
secret or provider key. Existing local Firebase credentials are used securely.
Deploying unchanged Firestore rules cannot create the missing HTTP endpoint.
Initial location-sharing rules/native provider setup remain documented in
`CUSTOMER_MAP_SETUP.md`; they are separate from resolving this HTTP 404.

After a successful deployment, check:

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd functions:list --project servicepilot-756d9
```

Confirm `getMapTechnicians` is listed in `asia-south1`, then tap Retry in the
signed-in Customer Map screen. An anonymous HTTP call is expected to fail
authentication once deployed; successful directory verification requires an
active, verified Customer. Verify production filters/list/markers and, if the
companion function was deployed, the owning Customer's eligible job location.
An empty approved-Technician result should show the real district map and the
existing empty-list message. No data migration is needed for this incident.

## Follow-up: Technician acquisition and matching Kandy verification

The original Technician error text, `GPS is unavailable. Move to an open area
and retry.`, came specifically from the adapter's 15-second
`getCurrentPositionAsync({ accuracy: Balanced })` timeout. It was not evidence
of a denied Firestore publish. On the observed emulator, fine/coarse permission
was granted, location services were enabled (`location_mode = 3`), the network
provider had no fix, and the last GPS coordinate was old. Device and host clocks
were aligned. Installed Expo Android source maps Balanced to balanced-power
priority, which can avoid GPS; High requests high-accuracy GPS. A usable emulator
fix was not arriving in the original one-shot acquisition before its deadline.

The separate Customer failure was reproduced again using
`{"data":{"districtId":"kandy"}}`: the exact production URL above returned
HTTP 404 with `text/html` and title `404 Page not found`, rather than a callable
JSON response. Functions inventory was still empty and billing still disabled.
A read-only Rules API comparison confirmed that the deployed Firestore rules
already match the local rules, including both location collections. No further
rules deployment is required to resolve these observed failures. A Kandy versus
Kurunegala filter mismatch cannot cause this endpoint-level 404.

### Follow-up files

- `src/utils/acquireDeviceFix.ts` (new): bounded 20-second acquisition using a
  removable foreground subscription. Ignore invalid/stale fixes, abort on
  stop/background/cleanup, and remove even a late native registration.
- `src/utils/locationSharingError.ts` (new): distinct permission, services,
  acquisition, watch and publishing failures, including explicit acquisition
  and publishing timeout messages. Safe diagnostics log only step/code.
- `src/services/foreground-location.service.ts`: request High accuracy for the
  temporary acquisition and throttled persistent watcher. No background tracking
  or fabricated coordinates; both use the actual Expo device location API.
- `src/utils/foregroundSharing.ts`: separate opt-in intent from confirmed saved
  sharing. The UI remains OFF while acquiring/publishing; it turns ON only after
  the first atomic private/public Firestore write succeeds. Preserve serialized
  writes, late-callback guards, logout revocation and foreground cleanup.
- `src/services/location.service.ts`: give the existing 12-second save timeout a
  safe code so a publishing timeout is not confused with acquisition failure.
- `src/components/maps/TechnicianSharingPanel.tsx`: Retry completes any necessary
  server removal and then reruns acquisition/publishing; disable it while busy.
- `scripts/tests/device-location.test.mjs` (new), controller and map security
  tests: verify bounded acquisition/cleanup, saved-only enabled state, Retry,
  publishing denial, and matching Kandy versus Kurunegala service coverage.
- `scripts/seed-map-emulator.mjs`: optional `--sharing-off --kandy-only` fixtures
  start without coordinates and with only Kandy service coverage. Defaults remain
  available for the earlier directory-only demo checks.

### Native end-to-end checks actually completed

Two separate Android / Expo Go devices used only the demo Firebase project:

1. Approved `map-tech` served only Kandy and started sharing OFF, without any
   seeded coordinate. Technician login retained explicit opt-in.
2. Sent latitude `7.290612`, longitude `80.633701` through the same emulator GPS
   provider used by Extended Controls → Location:

   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 emu geo fix 80.633701 7.290612
   ```

   The console command takes **longitude first**. Send a fresh fix after
   enabling sharing or tapping Retry, and while the app is foregrounded.
3. Technician UI changed to `Sharing while the app is active` after native GPS
   acquisition and real Firestore publication. Exact private and coarse public
   documents had the same server update timestamp. The public document contained
   only integer grid cells, identity, sharing flag and timestamp.
4. Customer B, independently signed in on the second device, selected Kandy.
   The real callable loaded the fixture, and the native Google Map displayed
   `1 serving Kandy • 1 shared locations` and the approximate Technician marker.
5. Toggling OFF on the Technician device removed coordinates from both documents.
   Customer B's subscribed map changed to `1 serving Kandy • 0 shared locations`
   with no Technician marker; Google tiles, Kandy boundaries and the listing
   remained visible.
6. Turning device location services OFF produced the specific services-disabled
   message. Restoring services and tapping Retry reacquired a supplied Kandy fix,
   saved it, enabled sharing and restored Customer B's marker. Final toggle OFF
   removed the marker again.

Screenshots are local, ignored verification artifacts:
`.expo/map-verification/kandy-technician-sharing-on.png`,
`kandy-marker-on.png`, and `kandy-marker-off.png`.
The temporary Customer emulator/demo Metro were stopped and the original device
reconnected to the pre-existing Expo server on port 8081. The demo remains OFF;
no production records were created or mutated.

Device-acquisition/controller tests (16) and transport tests (5) passed, along
with Functions build/lint, focused map TypeScript and mobile ESLint. The expanded
security suite (9 passed) verifies Kandy/Kurunegala filtering, precise browsing denial,
Customer A/B job ownership, identity spoofing, coordinate validation, OFF and
stale access. Production end-to-end loading remains pending **billing setup and
the exact function deployment above**; message changes alone do not resolve 404.
