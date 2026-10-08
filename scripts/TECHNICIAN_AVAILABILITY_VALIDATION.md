# Technician Availability

Availability is a technician's declared booking preference, saved as lowercase `available`, `busy` or `offline` in `users/{uid}` and the existing safe `technician_map_profiles/{uid}` projection. The dashboard and Technician Profile provide the same control, with saving, success and error feedback. Customer home recommendations, technician lists, profiles, map/list cards and marker details use one badge and explanation. Busy/Offline technicians remain visible; new request actions and pending-request acceptance are disabled.

## Policy and compatibility

- **Available:** accepting new requests. **Busy:** temporarily unavailable for new requests. **Offline:** not accepting new requests.
- **Active jobs do not automatically change availability.** Technicians explicitly choose Busy when their workload prevents new bookings, and may stay Available with multiple accepted/in-progress jobs. Inspection found no simultaneous-job cap in the existing services, lifecycle rules or project guidance; no cap/counter was added. Completion, cancellation and rejection preserve the manual choice, including Offline.
- Availability never follows GPS sharing, location freshness, service districts/towns, backgrounding, app termination or logout. Existing job views, permitted job transitions, reviews, notifications and precise-location request authorization retain their existing policy.
- New technician registrations start **Offline** while pending approval. Existing profiles with missing, null, malformed or unrecognized availability display **Availability not set**, remain browsable and cannot create/accept new requests until the approved technician explicitly saves a valid choice. No migration or automatic default-to-Available write is required. Existing accepted/assigned/in-progress jobs still work for legacy profiles.
- Choosing a status publishes the profile and public projection in one transaction; it does not write location or coverage documents. Personal Information, approval/lifecycle operations and projection synchronization preserve availability through the shared projection builder. No private address, contact or precise GPS fields were added to public documents.

## Enforcement and listeners

Only the owning active, email-verified, approved technician can change availability; the write is restricted to `availability` and `updatedAt` and must include the matching public projection at the same server timestamp. Existing Super Admin account lifecycle and Dispatcher application-review permissions remain unchanged; neither role gains an availability-edit permission. Projection writes must match authoritative profile fields, including approval and ratings.

Request creation reads the public projection in a Firestore transaction. Acceptance reads the request, owning technician profile and public projection in a transaction. Rules check authoritative approval/account state and explicit Available in **both** documents at commit, using `getAfter`, including same-batch changes. A concurrent change can cause retry or denial; neither path commits an unavailable booking. Commit-time permission failures explain that availability/approval or request state may have changed. This uses existing client Firestore access; no required Cloud Functions, billing account, paid services or new indexes were added. See [Firebase transaction documentation](https://firebase.google.com/docs/firestore/manage-data/transactions) and [cross-document rules validation](https://firebase.google.com/docs/firestore/security/rules-conditions#access_other_documents).

Existing district/service filters do not filter out Busy/Offline. Map marker colour continues to represent GPS freshness, independently of availability. Customer profile/form use one-document public listeners; existing bounded directory queries remain limited to 8/16/24 items. Cached public profile status cannot confirm Available. Auth changes/unmount stop listeners, clear data and invalidate delayed callbacks in customer home/list/profile/form and technician workspace/job details. Availability stays persisted on logout.

## Changed files

| Area | Files |
| --- | --- |
| Shared state and safe projection | `functions/src/domain/availability.ts`, `functions/src/domain/mapProjection.ts` |
| Reusable control/badge | `src/components/technicians/TechnicianAvailabilityPanel.tsx`, `AvailabilityBadge.tsx` |
| Persistence, public reads, booking | `src/services/user.service.ts`, `technician.service.ts`, `location.service.ts`, `request.service.ts` |
| Account/listener lifecycle | `src/hooks/useTechnicianWorkspace.ts`, `useTechnicianRequest.ts`; customer home/list/profile/form effects |
| Technician screens | `app/technician/(tabs)/index.tsx`, `profile.tsx`, `jobs.tsx`, `app/technician/job-details.tsx` |
| Customer screens | `app/(tabs)/index.tsx`, `technicians.tsx`, `technician-profile.tsx`, `create-request.tsx`, `map.tsx` |
| Rules/tests | `firestore.rules`, two new availability test suites; dependency/fixture updates in existing map, rating and reviewer-name suites |

The initial working tree was clean; only root `AGENTS.md` was found. No unrelated files, live data, billing or deployment configuration were changed. Service-area catalogue and geometry are unchanged; the existing [provenance and coverage limitations](../functions/src/domain/SERVICE_AREA_DATA.md) still apply.

## Automated validation

- **60 unit/lifecycle tests pass:** availability normalization/gates/projection, logout/account-switch late callbacks, existing rating/reviewer display, map view actions, area validation, distance/freshness, GPS acquisition and foreground-sharing throttling/cleanup.
- **40 local Firebase emulator tests pass:** nine availability/booking tests plus map/location/security/backfill/admin and reviewer-name/notification suites. These use only `demo-servicepilot-review-author` on loopback Auth/Firestore. Coverage includes three-status live updates in profile/list/map services, non-owner/customer/Dispatcher/Admin/pending/disabled/unverified attempts, missing/malformed state, forged rating/approval/role/address fields, partial writes, stale and concurrent bookings/acceptance, two simultaneous jobs, Offline completion, notifications and unchanged GPS/coverage.
- Mobile/app and imported domain TypeScript pass using an ignored scoped config in `.expo/availability-mobile-tsconfig.json`; changed-file ESLint passes without warnings.
- `npm.cmd --prefix functions run build` and `npm.cmd --prefix admin-web run build` pass. Admin Web retains its existing large-bundle warning.
- Root `npx.cmd tsc --noEmit` still fails with **24 errors in unchanged files**: Admin Web Vite types/assets/TSX import settings under the mobile root configuration, OTP/Cloudflare test types and Expo template aliases. `npm.cmd run lint` still reports **8 existing errors**: `app/(tabs)/select-service.tsx` unescaped apostrophe and unresolved template imports in `src/components/parallax-scroll-view.tsx`, `themed-text.tsx`, `themed-view.tsx` and `src/hooks/use-theme-color.ts`. None of the remaining errors is in availability implementation files.

Reproduce the tests with built shared modules:

```powershell
npm.cmd --prefix functions run build
node --test scripts/tests/availability.test.mjs scripts/tests/service-areas-distance.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/map-loading.test.mjs scripts/tests/map-view-actions.test.mjs scripts/tests/foreground-sharing.test.mjs scripts/tests/device-location.test.mjs scripts/tests/customer-map-location.test.mjs
firebase.cmd emulators:exec --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json "node --test scripts/tests/availability-booking.test.mjs scripts/tests/map-location.test.mjs scripts/tests/map-backfill.test.mjs scripts/tests/map-admin.test.mjs scripts/tests/reviewer-names.test.mjs"
```

Use fresh demo emulators for the combined suites; device fixtures should be seeded after tests because their records can alter directory-query expectations.

## Deployment for review only

Deploy the rules before releasing clients that expose this control:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9
```

**Not executed.** Indexes are unchanged; no index deployment, Functions deployment or record migration is required. Build/release Admin Web with the shared projection builder alongside the mobile release so subsequent approval/lifecycle writes preserve availability. Older clients that replace a projection while omitting an explicitly saved availability will be rejected by the new rules; upgrade those clients. Legacy technicians must explicitly choose availability in the updated app to resume new bookings.

## Two-emulator procedure

Use the existing [two-emulator setup](SERVICE_AREA_MAP_VALIDATION.md#exact-two-emulator-procedure): one Metro server, explicit demo Firebase opt-in, separate signed-in technician/customer accounts, loopback Auth/Firestore. Never infer Firebase emulator mode from Android device detection.

1. Start `firebase.cmd emulators:start --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json`.
2. Set `$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8187'` and `$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9197'`; run `node scripts/seed-map-emulator.mjs --sharing-off --kandy-only`. Optionally run `node scripts/seed-rating-emulator.mjs` for Gihan/Bandara's test review fixture.
3. Set `$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS='1'` and `$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST='127.0.0.1'`; start **one** `npx.cmd expo start --localhost --port 8084`. If external dependency checks cannot connect, also set `$env:EXPO_OFFLINE='1'` before starting Metro.
4. Reverse ports 8084, 8187 and 9197 on each emulator using `adb -s <device> reverse tcp:<port> tcp:<port>`, then open `exp://127.0.0.1:8084` in Expo Go on both.
5. Log in as `map-tech@example.test` and `map-customer-a@example.test` with `Only-for-map-emulator-42`; or as `rating-gihan@example.test` and `rating-bandara@example.test` with `Only-for-rating-emulator-42`. These are disposable demo accounts. Inspect a legacy technician before saving a status: both roles must show Availability not set and new requests must be disabled.
6. Save Available on the Technician dashboard. On Customer, verify the live badge in list, profile and open map marker details, correct technician IDs, existing rating/reviewer display and enabled Request Service. Open the request form, then change the Technician to Busy and Offline; the mounted form must update and block submission. Attempt stale submissions through the services/rules as covered by the emulator suite.
7. Repeat all three choices without refresh while Customer profile/list/marker details stay open. Reopen Technician Profile to confirm persistence. Existing jobs must remain open in Busy/Offline; start/complete an already accepted job and confirm Offline stays Offline. Reject an existing pending request while unavailable; select Available to accept a pending one. Keep multiple accepted jobs to verify no artificial cap.
8. Set mock GPS using Android Extended Controls and opt into sharing. Use the previously source-verified **test-only** Kandy coordinates `7.290612, 80.633701`. Wrench visibility/freshness and district/area overlays must be independent of all three statuses. Sharing ON must not make a Busy/Offline technician Available; turning OFF removes the wrench and retains the availability badge/list entry. GPS fixture coordinates must never be substituted in production code.
9. Test background/foreground, denied GPS permission, logout and switching accounts while a listener/save is pending. Old callbacks must not restore the previous account's badge or jobs. Verify existing notifications and real reviewer names.
10. Leave sharing OFF and sign out; stop the task's demo services and remove its port forwards. Remove the two `EXPO_PUBLIC` emulator variables and restart Metro/app before returning to normal sessions.

Native device results and any unperformed scenarios are recorded below separately from compilation and emulator-service tests.

## Native checks performed on 2026-10-05

Two Android emulators (`emulator-5554` Technician and `emulator-5556` Customer) used Expo Go, one Metro server on 8084 and the explicit loopback demo backend. Gihan/Bandara were signed in separately. These were local disposable fixtures; production was never contacted for writes.

- Both interfaces initially showed **Availability not set** for Gihan's legacy profile. Saving Available on the Technician dashboard immediately updated the mounted Customer profile and enabled its request action. Opening Request Service retained Gihan as the selected technician.
- Saving Busy and Offline updated the already-open Customer form with the corresponding badge and explanation. Reopening Technician Profile showed the persisted Offline choice alongside the independent, OFF GPS-sharing control.
- An Offline technician opened an accepted job and successfully used **Start Service**; it became In Progress while the dashboard remained Offline. Pending jobs remained visible with the acceptance explanation/control disabled.
- A public-only, explicitly labelled **local map rendering fixture** let the native Android map show its existing grey wrench within the Kandy overlay. The open marker details updated live through Busy, Available and Offline, retained View Profile/Request Service actions for Gihan, and tapping Request Service while Offline left the card open. View Profile opened Gihan's profile with Offline and its existing 5.0/1 review state. This fixture is not evidence that the device published GPS successfully.
- Gihan's Customer review card retained the real reviewer name **Bandara**, rating 5.0/5 and review text after the availability changes.

Both Android clocks were approximately **43 minutes behind the backend**. Actual foreground location publication was denied; the unchanged sampled-at freshness rule requires a sample within 60 seconds of backend time. Clock skew is the likely cause, supported by the measured times and passing automated GPS/security tests, but no complete native GPS success is claimed. The emulator console also rejected `geo fix`; no production coordinate flow or freshness rule was changed to bypass this. The rendering fixture appeared stale with Distance unavailable because its backend timestamp was in the device's future. Existing relative-time text clamped that age to 0 seconds; this pre-existing clock-skew display limitation remains.

Native **successful GPS ON/OFF publication, fresh blue markers, outside-district movement, permission-granted distance, denied-permission navigation, full new-request submission, full job completion, pending-job acceptance/rejection, background/foreground, account switching during a pending save, and notification delivery** were not completed. Relevant service/rules/lifecycle behavior is covered by the automated suites, but those passes do not establish native success. The rating fixture intentionally lacks stored aggregate fields, so its map card shows New/0 while profile review subscription shows 5.0/1; no native aggregate synchronization result is claimed.

Cleanup: the rendering fixture was reset to sharing OFF without coordinates, both accounts signed out to the login screen, and local Metro/Firebase services stopped (no listeners remain on the task ports). Subsequent ADB force-stop/port-forward removal commands timed out, so those two cleanup steps are **not confirmed**. When ADB responds, stop Expo Go and remove each task forward with `adb -s <device> reverse --remove tcp:<port>` for ports 8084, 8187 and 9197 on both devices. No production deployment or migration was performed.
