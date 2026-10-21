# Review index failure diagnosis and validation

## Confirmed cause (read-only production checks, 2026-10-21)

Root `AGENTS.md` was read; there are no applicable nested instructions. Existing
uncommitted submission/photo/synchronization work was preserved. This task made
no deployment, production write, rules change, billing change, migration, commit
or push.

Both affected screens use `useTechnicianReviews` and the shared service in
`src/services/technician.service.ts`. The hook previously described **every**
`failed-precondition` as a missing index. The customer profile also displayed
the same failure in both `TechnicianRatingStatus` and an additional error card.

The missing-index diagnosis is now confirmed independently of that UI text:

- `.firebaserc` selects `servicepilot-756d9`; `firebase.json` references
  `firestore.indexes.json`. Normal app configuration initializes the same project
  and the `(default)` database. It selects a different, explicitly named demo
  project only when development emulator mode is enabled.
- `firebase.cmd firestore:indexes --project servicepilot-756d9 --database "(default)" --json`
  returned five deployed composite indexes: three map indexes and two message
  indexes. There were **no `service_reviews` composite indexes**.
- A read-only Firestore Admin API metadata check confirmed those five indexes
  were `READY`, with no missing review index currently building.
- Read-only `runQuery` / `runAggregationQuery` probes used the actual filters and
  ordering with a synthetic, nonexistent diagnostic technician ID. Document
  queries selected document IDs only; no review content was logged. The dated
  head, overall summary, and dated count each returned `FAILED_PRECONDITION` and
  **The query requires an index.** The legacy ID-only page query was accepted.
  Streaming REST errors used HTTP 400; the Firestore error status, rather than the
  HTTP status, identifies the failed precondition.
- Device log buffers did not contain an underlying review error to recover.
  The initialized target is now included in safe development diagnostics at each
  failure. This identifies the actual app's target on reproduction, including a
  stale Metro environment. Native screen reproduction was not performed.

The local definitions are already sufficient. No additional/redundant indexes
were added, and no existing indexes or security rules were removed or changed
in this task. Local definitions alone do not create production indexes.

## Query/index comparison

All queries target collection `service_reviews`, with `technicianId == target`
and `rating in [1,2,3,4,5]`. These filters match the established eligible-rating
definition and rules; review submission/schema/ownership are unchanged.

| Operation | Ordering / boundary | Existing required index fields |
| --- | --- | --- |
| Realtime head / focus refresh | `createdAt DESC`, `__name__ DESC`, limit 20 | `technicianId ASC`, `rating ASC`, `createdAt DESC`, implicit `__name__ DESC` |
| Dated next page | Same ordering, `startAfter(createdAt, id)`, limit 20 | Same dated index |
| Overall `count()` + `average(rating)` | No ordering, limit or cursor; all eligible reviews | `technicianId ASC`, `rating ASC`, implicit `__name__ ASC` |
| Count of dated reviews | Same dated ordering, no limit or cursor | Same dated index |
| Explicit legacy page | `__name__ DESC`, optional ID cursor, limit 20 | Existing `technicianId ASC`, `rating ASC`, explicit `__name__ DESC` |

All three local review indexes have `queryScope: COLLECTION`. The live server's
suggested links put `rating` before `technicianId` in the equality prefix; this
does not require a duplicate index. Equality-prefix fields can be permuted; the
ordered suffix must match. The Firebase SDK's
[index matcher](https://github.com/firebase/firebase-js-sdk/blob/master/packages/firestore/src/model/target_index_matcher.ts)
documents this distinction. Firestore's
[index ordering documentation](https://firebase.google.com/docs/firestore/query-data/index-overview#default_ordering_and_the_name_field)
explains the inherited `__name__` direction. The legacy index is retained even
though the current production planner can serve the diagnostic legacy query
using existing automatic indexes.

The focused test captures the actual service query constraints and aggregate
fields, compares them with the file referenced by `firebase.json`, checks cursor
values/20-item limits, and rejects a deliberately reversed timestamp direction.
Aggregations remain server-side and cover the entire matching history. No
unbounded document-download fallback or fake-zero failure state was introduced.
See [Firebase aggregation documentation](https://firebase.google.com/docs/firestore/query-data/aggregation-queries).

## Implementation in this task

- `src/utils/reviewDiagnostics.ts`: development-only stage/code/target diagnostics;
  distinguishes required/building indexes from unrelated preconditions, access
  errors and network failures. Only known server sentences are logged. Raw errors,
  arbitrary messages, query values, reviewer IDs, names/comments/photos, credentials
  and URLs are omitted. Production builds emit none of these diagnostics.
- `src/firebase/config.ts`: exports initialized project/default-database/emulator
  context for the diagnostics; environment and Auth behavior are unchanged.
- `src/services/technician.service.ts`: diagnoses listener, focus, page, aggregate
  and deadline failures at their source. Existing shared reconnect, listener cleanup,
  pagination and account guards remain in use.
- `src/utils/technicianRating.ts`, `src/hooks/useTechnicianReviews.ts`: one generic
  user error, `Reviews are temporarily unavailable.`; an unrelated precondition
  is no longer asserted to be a missing index. Permission/precondition errors
  still clear unverified data; recoverable network errors retain explicitly stale
  previously verified results.
- `src/components/technicians/TechnicianRatingStatus.tsx`,
  `app/(tabs)/technician-profile.tsx`, `app/technician/performance.tsx`: one error
  message with one accessible Retry; no duplicate profile failure/empty card or
  repeated performance-summary error. Technician details and booking actions remain
  usable. Existing names, photos, dates, ratings and 20-item owner pagination remain.
- Tests: `scripts/tests/review-indexes.test.mjs`, `review-sync.test.mjs`,
  `technician-rating.test.mjs`, `technician-reviews-list.test.mjs`; shared loader
  support in `scripts/lib/performance-test-deps.mjs`.

Retry is verified to stop a failed connection and create one fresh shared listener,
then rerun server aggregations. Repeated taps while connecting are coalesced, and
obsolete callbacks cannot replace the recovered data. No logout/restart is needed
after the deployed index becomes ready.

## Automated checks

Run from the repository root in PowerShell:

```powershell
node --test scripts/tests/review-indexes.test.mjs scripts/tests/review-sync.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/technician-reviews-list.test.mjs scripts/tests/performance.test.mjs scripts/tests/review-submission.test.mjs scripts/tests/review-photo-picker.test.mjs
node scripts/check-rating-types.mjs
npx.cmd eslint src/utils/reviewDiagnostics.ts src/firebase/config.ts src/utils/technicianRating.ts src/hooks/useTechnicianReviews.ts src/services/technician.service.ts src/components/technicians/TechnicianRatingStatus.tsx 'app/(tabs)/technician-profile.tsx' app/technician/performance.tsx scripts/tests/review-indexes.test.mjs scripts/tests/review-sync.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/technician-reviews-list.test.mjs
```

Actual results: the focused suite passed **64/64** tests; scoped TypeScript and
changed-file lint passed. Auth/Firestore/Storage integration passed **23/23**
tests with exit code 0. Java 24 emitted runtime deprecation and shutdown warnings
after successful execution; these did not fail tests.

Full-project `npx.cmd tsc --noEmit --pretty false` still fails with the same **22
pre-existing errors** outside the review work: 9 Admin Web Vite `ImportMeta.env`,
asset declaration and TSX-import configuration errors; 4 OTP test/Cloudflare type
errors; and 9 template theme/component alias/type errors. Those files were not
modified. Review screens and all their imported dependencies pass the scoped
TypeScript check. `git diff --check` passed (Git also emits existing LF/CRLF notices).

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = '1'
$env:DEBUG = ''
$env:CI = '1'
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.review-author-test.json --only auth,firestore,storage --log-verbosity QUIET "node --test scripts/tests/reviewer-names.test.mjs scripts/tests/review-storage.test.mjs"
```

This integration suite uses isolated demo accounts/documents, covers real names,
review ownership, duplicate prevention, >20-review totals, cross-client updates,
saved photos/access and immutable publication. Emulator success does **not** prove
that production indexes exist or are enabled.

## Remaining production step — review only, not executed

From this repository root, the exact index-only deployment command is:

```powershell
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9 --config firebase.json
```

This uses the confirmed configured file and target. Existing map/message index
definitions are retained. Do not use `--force` or expand the deployment scope.
There is no rules/functions/hosting deployment step for this fix.

Open [Firestore indexes for servicepilot-756d9](https://console.firebase.google.com/project/servicepilot-756d9/firestore/indexes),
select database `(default)` and the Composite tab. Confirm all three
`service_reviews` definitions above are **Enabled** (Admin API state `READY`),
not Building or Error. The UI can show `__name__` explicitly or as the inherited
suffix. Wait for backfill to complete before testing. A deployment acknowledgement
is not proof of readiness. Inspect any build error before retrying. Firebase
[documents index build progress](https://firebase.google.com/docs/firestore/query-data/indexing).
Then use the single Retry action on each already-open screen and inspect an
existing legitimate saved review. No new production review is needed for this
read-only confirmation. Live recovery remains unverified until deployment and
readiness are completed by the project owner.

## Exact two-emulator device procedure (not performed)

Use fresh local services, two Android emulators and one Metro server. Do not use
production accounts/data for submission tests.

1. In terminal A, run:

   ```powershell
   $env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
   $env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = '1'
   $env:DEBUG = ''
   firebase.cmd emulators:start --project demo-servicepilot-review-author --config firebase.review-author-test.json --only auth,firestore,storage
   ```

2. In terminal B, seed fresh local fixtures:

   ```powershell
   $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
   $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
   node scripts/seed-rating-emulator.mjs --review-list-pages
   ```

3. In terminal C, start a single Metro server:

   ```powershell
   $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
   $env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1'
   npx.cmd expo start --localhost --port 8081
   ```

4. In terminal D, connect both devices (replace serials if `adb devices` differs):

   ```powershell
   $reviewAdb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
   & $reviewAdb devices
   foreach ($reviewDevice in @('emulator-5554', 'emulator-5556')) {
     foreach ($reviewPort in @(8081, 8187, 9197, 9297)) {
       & $reviewAdb -s $reviewDevice reverse "tcp:$reviewPort" "tcp:$reviewPort"
     }
     & $reviewAdb -s $reviewDevice shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
   }
   ```

5. Device A: sign in as technician `rating-gihan@example.test`.
   Device B: sign in as customer `rating-bandara@example.test`.
   Password for both: `Only-for-rating-emulator-42`.
   Keep A's Performance & Reviews open. Fresh seeded baseline is **24 reviews**,
   average **3.125**, displayed **3.1**. Load the next 20-item page and note the IDs
   at the page boundary. Missing legacy names/dates use existing unavailable labels.

6. On B, open completed request `rating-device-request-2` → Rate Service. Opening
   must not change A's totals. Explicitly select **1 star**, enter
   `The repair still needs attention.`, and select two small supported JPEG/PNG
   photos from the emulator gallery. Preview/remove one, re-add it, then submit.
   Confirm Thank You appears after save; repeating Submit cannot create a duplicate.

7. Without closing A, verify Bandara's newest review, **1/5 stars**, exact comment,
   date and two thumbnails appear. Open/close the accessible larger-image viewer.
   Total becomes **25**, average **76/25 = 3.04**, displayed **3.0**. Loaded older
   cards remain once each. On B, open Gihan's Technician Profile → Customer Reviews:
   confirm the same new card/photos and **3.0 / 25** summary. Return to the completed
   request; View Your Review must show saved data without increasing totals.

8. Submit `rating-device-request-3` with **5 stars**, valid comment, and no photos.
   Verify both screens show **26**, average **81/26**, displayed **3.1**. Confirm
   the first review's photos and pre-existing no-photo reviews still render.
   Switch A to `rating-zero@example.test`; Gihan's cached reviews must disappear.

9. Interrupt local Firestore connectivity while viewing loaded reviews. Expect a
   loading/stale/error state and Retry, never a newly confirmed empty result.
   Restore the service/connection; Retry must recover without logout. An access
   failure must clear inaccessible cards. Inspect Metro's `[ServicePilot reviews]`
   stage/code/target diagnostic without private content. Missing/building-index
   recovery is covered by automated injected-error tests; the emulator does not
   enforce production composite indexes, so use the separate read-only production
   Enabled/Retry procedure above to confirm actual index recovery after deployment.

Native permission dialogs, picker/viewer behavior and the full two-device visual
procedure were not executed. No claim of live screen recovery is made from tests
or compilation alone.
