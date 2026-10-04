# Technician rating consistency

On October 4, 2026, a targeted **read-only** inspection of `servicepilot-756d9` confirmed the reported Gihan case. `users/Z3o2tljh2XS1ubdmOR5lJdrvTfg1` has neither `averageRating` nor `reviewCount`. Its public map projection has `averageRating: 0` and `reviewCount: 0`. The complete technician-scoped review query returns exactly one eligible review: rating `5`, reviewer snapshot `Bandara`, and the same technician ID. No production writes, migrations or deployments were performed.

The customer profile previously subscribed to `service_reviews` using its route ID and calculated the average from that complete result, before showing the latest five cards. Its empty-result fallback used public projection aggregates. The technician workspace subscribes to `users/{authenticatedUid}` and jobs, but previously never subscribed to reviews. Its Profile, Dashboard, Performance and History read the private aggregate fields and defaulted missing values to zero. The optional existing `updateTechnicianReviewAggregate` document-create Cloud Function writes these private fields; its deployment/execution status was not verified. The confirmed cause is missing/stale aggregates combined with two different UI sources, not a technician-ID mismatch or a reviewer-name error.

Both profile screens and the affected technician statistics now use `useTechnicianReviews`, the existing `subscribeToTechnicianReviews` query, and `technicianRating` helpers. The query is scoped by `technicianId`, with no limit or pagination; only integer ratings from 1 through 5 count, matching review-create rules. All eligible reviews contribute to the mean and count; only the rendered customer cards are limited to five. A zero-review result is `{ average: 0, count: 0 }` and displays `No ratings yet` after server confirmation. Cache-only/pending-write snapshots cannot confirm emptiness. A permission error displays an error, not zero reviews.

The hook unsubscribes and clears ratings on account changes, logout, target changes and unmount. Session identity and generation checks reject late callbacks. The customer profile's asynchronous public-profile fetch is also guarded against obsolete accounts and unmounted screens. Rating loading/errors do not block browsing or technician job statistics. Subscriptions use the same complete per-technician query already used by the customer profile, rather than full-collection polling or per-review request/profile lookups. Cost scales with that technician's review history; a bounded review page cannot supply a trustworthy overall average. Existing map/list public-projection aggregates are preserved; this profile/statistics fix does not migrate those projections.

Review submission, real reviewer-name snapshots, completed-request eligibility, canonical/legacy request technician IDs, duplicate protection, notifications and private-profile access remain unchanged. No aggregate writes were added to mobile code. No required Cloud Function, billing account, paid service, rule/index change or migration is introduced.

Files changed for this fix (existing unrelated edits were preserved):

| File | Change |
| --- | --- |
| `src/services/technician.service.ts` | Existing complete review subscription adds snapshot metadata and filters invalid ratings. Public map/profile behavior is preserved. |
| `src/hooks/useTechnicianReviews.ts` | Shared, auth-scoped live rating/review state with cleanup and server confirmation. |
| `src/utils/technicianRating.ts` | Eligible-star validation, complete-result summary, consistent loading/empty/error formatting. |
| `app/(tabs)/technician-profile.tsx` | Uses shared ratings, preserves reviewer cards/names, distinguishes review-loading/errors, guards asynchronous profile load. |
| `app/technician/(tabs)/profile.tsx` | Header and Rating statistics card use live authoritative reviews. Existing service-area/profile/sharing changes are preserved. |
| `app/technician/(tabs)/index.tsx` | Dashboard rating uses the same live result. |
| `app/technician/(tabs)/history.tsx` | History rating uses the same live result. |
| `app/technician/performance.tsx` | Overall rating and review count use the same live result. |
| `scripts/tests/technician-rating.test.mjs` | Summary, query, metadata, live-update and hook lifecycle tests. |
| `scripts/tests/reviewer-names.test.mjs` | Existing service loader updated; adds real customer/technician listener checks with missing aggregates, multiple reviews and access boundaries. |
| `scripts/tests/map-location.test.mjs` | Existing test loader receives the new rating helper dependency. |
| `scripts/check-rating-types.mjs` | Type-checks all affected screens and imported dependencies with project compiler options. |
| `scripts/seed-rating-emulator.mjs` | Guarded, demo-only fixtures for the two-device checklist below. |
| `scripts/TECHNICIAN_RATING_VALIDATION.md` | Cause, validation and device instructions. |

Validation completed:

- Focused TypeScript: passed (`node scripts/check-rating-types.mjs`).
- Focused ESLint for changed screens, service, hook, helpers and checks: passed.
- Ten rating tests: passed (`node --test scripts/tests/technician-rating.test.mjs`). These cover 5.0/1, zero reviews only after server confirmation, seven-review totals beyond five cards, malformed ratings, live updates, permission/network errors, account switching, target switching, logout/unmount and late callbacks. Account lifecycle checks run the actual hook in a controlled hook harness, not a device renderer.
- Fourteen local Firestore/Auth tests: passed. These run the actual service and current rules, including continuously mounted customer/technician listeners transitioning 0 -> 5.0/1 -> 4.0/7 while private aggregates stay zero. Existing reviewer names, review eligibility, duplicate protection, aggregate tampering denial, private-profile boundaries and notifications also pass. Real Auth-emulator sign-in checks in the existing suite are customer sessions; technician listener checks use emulator mock tokens.
- Fifteen existing map/public-profile regression tests: passed against loopback emulators on alternate ports because the standard Firestore port was briefly occupied. These include public profile/request actions, approved projections, private GPS boundaries, sharing and service-area persistence. The temporary alternate-port configuration was removed afterward.
- The demo fixture script passes syntax checking and ESLint, refuses to run without both loopback emulator hosts, and successfully seeds fresh local Firestore/Auth emulators. No device UI was exercised by that seed operation.
- `git diff --check`: passed.
- Full-repository `npx.cmd tsc --noEmit --pretty false`: 24 pre-existing errors, recorded before implementation. They concern Admin Web Vite/asset/compiler configuration, OTP test types and template component aliases. None were introduced by this fix.
- Full-repository `npm.cmd run lint -- --no-cache`: eight pre-existing errors, recorded before implementation: one unescaped apostrophe in `app/(tabs)/select-service.tsx` and seven unresolved template aliases. None were introduced by this fix.

Reproduce the rule/service tests from the repository root, with debug logging disabled:

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd emulators:exec --only firestore,auth --project demo-servicepilot-review-author --config firebase.review-author-test.json "node --test scripts/tests/reviewer-names.test.mjs"
```

No Firestore rules or index deployment commands are required for this rating fix. The current local rules already allow verified approved technicians to query reviews where `technicianId` equals their Auth UID. Previously uncommitted rules/index changes belong to the separate map/service-area work and were not modified here. No migration is required because existing reviews are read directly.

Device checklist — **not performed in this task**:

1. Use fresh local emulators to get a reproducible one-review baseline. In terminal A, start the demo backend:

   ```powershell
   Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
   firebase.cmd emulators:start --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json
   ```

2. In terminal B, build the local fixture helper dependency if needed and seed **only** the demo emulators:

   ```powershell
   npm.cmd --prefix functions run build
   $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8187"
   $env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9197"
   node scripts/seed-rating-emulator.mjs
   ```

   The script requires both loopback hosts, uses the hardcoded demo project, loads no credentials and preserves any existing reviews. Restart the backend without imported data before re-seeding if you need exactly one review again. It creates seven completed Gihan/Bandara requests: the first has the 5-star review; requests 2–7 are available for new reviews.

3. In terminal C, start **one** Metro server with explicit emulator mode. Restart the app when changing Firebase environment:

   ```powershell
   $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = "1"
   $env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = "127.0.0.1"
   npx.cmd expo start --localhost --port 8081
   ```

4. With the two Android emulators running, forward the same Metro and backend ports to both:

   ```powershell
   $adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
   foreach ($device in @("emulator-5554", "emulator-5556")) {
     foreach ($port in @(8081, 8187, 9197)) {
       & $adb -s $device reverse "tcp:$port" "tcp:$port"
     }
   }
   ```

   Open `exp://127.0.0.1:8081` in Expo Go on both devices (for example via `adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081`). Use the actual IDs from `adb devices` if different. Normal app sessions remain production-connected unless emulator mode is explicitly enabled.

5. Log in on device A as `rating-gihan@example.test`, and device B as `rating-bandara@example.test`. All fixture accounts use the **emulator-only** password `Only-for-rating-emulator-42`. On B choose Kandy and open Gihan's profile. Confirm `5.0 (1 review)`, reviewer `Bandara`, original comment/date and correct profile/request actions. On A confirm 5.0 and one review in Profile, its Rating card, Dashboard, Performance and History.
6. Keep A's Profile open. On B review completed request 2 with three stars. Without logging A out, confirm both profiles and technician statistics become 4.0 with two reviews; verify the new-review notification. Reopen the same request to verify duplicate-review protection.
7. Review requests 3–7 with five stars each. Expect 4.7 with seven reviews (33/7, rounded for display), even though the customer displays only five cards.
8. On A sign out and sign in as `rating-zero@example.test`. Confirm loading precedes `No ratings yet`, no Gihan rating/name carries over, and Performance shows zero reviews only after successful loading. Switch back to Gihan and confirm the saved reviews reappear.
9. Test offline startup and a denied review subscription in the development environment: loading or a distinct access error must never be described as zero reviews. Browse jobs and the customer profile details while reviews load.
10. Confirm reviewer names, request actions, notification badges and existing sharing controls still work. Record the app's visual result, navigation IDs, live update timing and account-switch behavior. Compilation and headless emulator tests do not establish device UI success.

Remaining limits: on-device rendering, real device account switching and notification visuals remain unverified. The inspection established stored production data and matching IDs, not Cloud Function execution or production listener/UI success. Discovery/map projection ratings remain unchanged. No production review was submitted to test the fix.
