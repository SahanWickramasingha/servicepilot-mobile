# Technician Reviews List

## Confirmed gap and final behavior

Started with a clean working tree on `main`. Read root `AGENTS.md`; no nested
instructions applied. The existing Performance route showed statistics but no
received-review cards; the dashboard had no View Reviews action. The shared
rating stream downloaded the complete technician history, lacked Retry, and
had no stable tie-breaker for equal dates.

Dashboard → Technician Rating → **View Reviews** now opens the existing
`/technician/performance` screen. It retains its statistics/design and includes a
read-only review list: permitted reviewer-name snapshot/initials, accessible
stars, optional comment and date. Unknown fields show `Reviewer name unavailable`
and `Date unavailable`, without inventing data or reading private customer profiles.
The screen accepts no target route UID; workspace UID must equal `auth.currentUser.uid`.

## Reads, totals and cleanup

The existing session-shared `subscribeToTechnicianReviews` now listens to at most
20 eligible reviews for one technician, ordered by `createdAt DESC, document ID
DESC`. Full-history count/average come from Firestore server aggregation with the
same integer 1–5 eligibility filter. Display continues through existing shared
rating helpers. No partial-page average or stale profile aggregate is used.
Aggregate work is shared across mounted consumers and coalesced during updates.
Explicit Load More fetches at most 20 documents; older pages add no listeners.
No polling, full-collection document downloads, client aggregate writes, new
dependency, or required deployed Function is introduced.

Because Firestore ordering excludes missing fields, a second server count detects
reviews missing `createdAt`. After dated pages, explicit document-ID cursor batches
locate these legacy records, emitting only missing-date records. This can revisit
dated records, but each request stays bounded and requires Load More; there is no
automatic repeated scan. If every review lacks a date, the first legacy batch
loads automatically. Unknown dates sort last. Paging stops when all counted
reviews are loaded or the cursor ends. No live migration/backfill is needed.

See Firebase's [aggregation documentation](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)
and [ordering field-existence behavior](https://firebase.google.com/docs/firestore/query-data/order-limit-data).
These operations use existing Firestore quotas/index reads. Aggregates and pages
are separate reads, not an atomic snapshot.

Loading, verified zero, permission/index errors and network failures are distinct.
A 15-second initial server-confirmation deadline reports an availability error,
never an unverified empty result. Retry reconnects the shared stream even while
dashboard consumers remain mounted. Page errors retain the retry cursor. Duplicate
taps are blocked. New head data resets old pages; account/target changes and
unmount reject obsolete data, pending pages and aggregates.

## Changed files

- `app/technician/(tabs)/index.tsx`: View Reviews entry.
- `app/technician/performance.tsx`: existing screen's complete virtualized Reviews List.
- `src/hooks/useTechnicianReviews.ts`: aggregate/page cursor and Retry state.
- `src/hooks/useTechnicianReviewPages.ts`: owner-only paging and stale-result cleanup.
- `src/services/technician.service.ts`: bounded shared head, full server aggregates,
  cursors, legacy records, timeout and shared retry.
- `src/utils/technicianRating.ts`: safe dates and deterministic ordering.
- `firestore.indexes.json`: three review-query indexes; existing indexes preserved.
- `scripts/tests/technician-reviews-list.test.mjs`: list/identity/paging UI checks.
- `scripts/tests/technician-rating.test.mjs`: aggregation/retry/account-change checks.
- `scripts/tests/performance.test.mjs`: existing pooled-service fixture updated for
  asynchronous server aggregation, retaining its performance assertions.
- `scripts/tests/reviewer-names.test.mjs`: actual emulator paging/security checks.
- `scripts/seed-rating-emulator.mjs`: optional multi-page device fixtures.
- This document, which supersedes previous full-history-listener guidance for ratings.

`firestore.rules` remains unchanged. Active-session/approval/role checks still
protect reviews. Technician reads are scoped to their own UID; legitimate
Customer/Super Admin access remains. Private author profiles, Dispatcher/anonymous/
other-technician access, and review edits/deletes remain protected. Authentication,
password reset, account lifecycle, booking and location-cleanup code was not changed.

## Validation actually performed

- **95/95 headless tests passed**: eight new list checks plus rating, performance/map,
  Change Password, Remember Me, account-session and Forgot Password regressions.
  Coverage includes zero/one/many, stable ordering, legacy fields, names, optional
  comments, full totals independent of pages, errors/retry, duplicate taps,
  deduplication, shared retry with other consumers, timeout and obsolete callbacks.
- **17/17 Auth/Firestore emulator tests passed**, on disposable
  `demo-servicepilot-review-author`. A 44-review history paged without duplicates,
  with correct full totals and missing dates. Real Customer/Technician sessions,
  names, notifications, new-review updates and stale/missing aggregates passed.
  Anonymous, other-technician, Dispatcher and inactive callers were denied page
  and aggregate reads; owner/Customer/Super Admin reads remained permitted.
  Private customer-profile reads stayed denied.
- Scoped rating-screen TypeScript and changed-file ESLint passed.
- The optional multi-page fixture was run twice on fresh demo emulators: 24
  reviews, missing date/name and empty comment were confirmed; reseeding did not
  duplicate reviews. An initial attempt encountered a busy local emulator port;
  rerun passed after the previous emulator finished stopping.
- Android production bundle export passed (3,023 modules); Admin Web TypeScript +
  Vite production build passed. Existing large-bundle/color and Node MockTimers
  experimental warnings are cosmetic. Builds do not establish device UI success.
- Full TypeScript retains **22 unrelated existing errors**: Admin Web files under
  mobile tsconfig (Vite env/assets/import options), OTP tests and template theme
  imports/types. Full lint retains **8 unrelated existing errors**: the apostrophe
  in `app/(tabs)/select-service.tsx` and seven unresolved template-theme imports.
- `git diff --check` passed.

Reproduce (PowerShell, repository root; installed dependencies/compiled fixture
helpers in `functions/lib` are needed):

```powershell
node --test scripts/tests/technician-reviews-list.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/performance.test.mjs scripts/tests/change-password.test.mjs scripts/tests/auth-persistence.test.mjs scripts/tests/account-session.test.mjs scripts/tests/forgot-password.test.mjs
node scripts/check-rating-types.mjs
npx eslint app/technician/performance.tsx 'app/technician/(tabs)/index.tsx' src/hooks/useTechnicianReviews.ts src/hooks/useTechnicianReviewPages.ts src/services/technician.service.ts src/utils/technicianRating.ts scripts/tests/technician-reviews-list.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/performance.test.mjs scripts/tests/reviewer-names.test.mjs scripts/seed-rating-emulator.mjs
$env:DEBUG = ''
$env:CI = '1'
firebase emulators:exec --only 'firestore,auth' --project demo-servicepilot-review-author --config firebase.review-author-test.json --log-verbosity QUIET 'node --test scripts/tests/reviewer-names.test.mjs'
npx tsc --noEmit --pretty false
npm run lint
npx expo export --platform android --output-dir .expo/technician-reviews-android-check
npm --prefix admin-web run build
```

Keep DEBUG empty/verbosity QUIET so emulator action URLs or request diagnostics
cannot leak secrets. Ports 8187/9197 must be free; do not terminate another
developer's emulator to free them.

## Manual Customer + Technician steps — device UI not performed

1. Start fresh emulators without importing production data:

   ```powershell
   $env:DEBUG = ''
   firebase emulators:start --only 'firestore,auth' --project demo-servicepilot-review-author --config firebase.review-author-test.json --log-verbosity QUIET
   ```

2. In a second terminal seed the one-review fixture:

   ```powershell
   $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
   $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
   node scripts/seed-rating-emulator.mjs
   ```

   If fixture helpers are missing, first run `npm --prefix functions run build`
   locally. Seed scripts enforce loopback hosts and a hardcoded demo project.

3. Start one Metro server with explicit emulator configuration:

   ```powershell
   $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
   $env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1'
   npx expo start --localhost --port 8081
   ```

   Forward these ports to both Android emulators, using actual IDs from
   `adb devices` if different:

   ```powershell
   $reviewAdb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
   foreach ($device in @('emulator-5554', 'emulator-5556')) {
     foreach ($port in @(8081, 8187, 9197)) {
       & $reviewAdb -s $device reverse "tcp:$port" "tcp:$port"
     }
   }
   ```

4. Open `exp://127.0.0.1:8081` on both. On A sign in as Technician
   `rating-gihan@example.test`; on B as Customer `rating-bandara@example.test`.
   Fixture-only password: `Only-for-rating-emulator-42` (not a production credential).
5. On A choose **View Reviews**. Confirm the existing Performance route shows
   `5.0 (1 review)`, Bandara, stars, comment and date. Profile → Performance opens
   the same screen. No reply/edit/delete controls should exist.
6. On B submit three stars for completed request `rating-device-request-2`.
   A should receive the new card/notification; Customer profile, technician
   dashboard and Reviews summary should show 4.0 with two reviews. Test another
   review without a comment.
7. Sign A out and sign in as `rating-zero@example.test`. Loading must precede
   genuine emptiness, with no Gihan cards/names flashing. Switch back, including
   while a page is pending, and repeat logout during a request.
8. For pagination/legacy fields, start fresh emulators and seed instead with:

   ```powershell
   node scripts/seed-rating-emulator.mjs --review-list-pages
   ```

   A fresh fixture has 24 reviews, including missing name/date and empty comment;
   requests 2–7 remain available for Customer submissions. Confirm 20 initial
   cards but full 24-review totals. Load More/rapid taps must not duplicate requests
   or cards. Newest dated reviews precede undated reviews; unknown fields use the
   explicit unavailable labels. The overall rating must not change as pages load.
   A populated fixture naturally counts preserved previous submissions too.
9. Interrupt networking during initial loading and Load More, then restore and
   Retry. Errors must never become zero reviews. Check denied access using local
   inactive/unauthorized accounts; rerun the security suite for customer/admin and
   private-profile boundaries. Check back navigation, statistics, notifications,
   Customer rating displays and existing logout/location cleanup.

## Required release commands — review only, not executed

The three added `service_reviews` indexes cover technician/rating eligibility,
createdAt descending pages, and document-ID descending legacy batches. Existing
indexes are preserved. Have the owner review/deploy them **before releasing the
client update**, and wait until building finishes:

```powershell
$env:DEBUG = ''
firebase deploy --only firestore:indexes --project servicepilot-756d9
```

No rules deployment, migration/backfill, Functions deployment, billing change or
production data write is required. Existing live rules must match the reviewed
repository boundaries; no live rules/configuration was inspected or changed.

Remaining limitations: no device UI, TalkBack, visual layout or real network
interruption was manually tested. Emulators do not establish production index
readiness. Aggregates require connectivity. Legacy records may need extra explicit
batches. Client review writes are immutable/server-timestamped, so new reviews
invalidate the live head; trusted administrative edits outside the latest page
require Retry/reopen to refresh totals. No deployment/production write occurred.
