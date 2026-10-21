# Review synchronization fix

This supplements `REVIEW_SUBMISSION_VALIDATION.md` and the existing Reviews List
handoff. Root `AGENTS.md` was read; no nested `AGENTS.md` applied. The complete
uncommitted review/photo implementation was preserved. No live documents, billing,
deployment, migration, commit or push were performed.

## Confirmed diagnosis and saved-document trace

There was no confirmed submission/query field mismatch. Submission already writes
`service_reviews/{requestId}_{customerId}` after reading the completed request and
own Customer profile in a transaction. It derives `technicianId` from that request,
uses the exact permitted `customerName` snapshot, integer `rating`, trimmed
`comment`, `createdAt: serverTimestamp()`, and optional `photoPaths` plus
`photoAttemptId`. Opening a form does not create a review. Create-only rules at
the canonical ID still enforce one review per owned completed request.

The new local integration test inspected the actual saved demo document:

| Field | Verified local value |
| --- | --- |
| Collection / ID | `service_reviews/sync-new-completed-request_sync-customer-a` |
| `requestId` | `sync-new-completed-request` |
| `customerId` | `sync-customer-a` |
| `technicianId` | `sync-technician-a`, derived from that request |
| `customerName` | `Nimal Bandara`, from the authoritative own profile |
| `rating` / `comment` | `1` / `The repair still needs attention.` |
| `createdAt` | Confirmed Firestore server Timestamp, after the seeded history |
| Photos | Absent on that no-photo review; the separate real Storage test verifies `photoPaths`, content and visibility through both role streams |

No production review was read or claimed to have been repaired.

The confirmed gaps were in refresh and pagination:

1. The shared listener watched the newest 20 eligible dated reviews. Full-history
   count/average came from server aggregation, refreshed only on those snapshot
   events. A legacy record outside that window could change totals without an
   event, and returning to a mounted screen did not explicitly revalidate them.
2. Cache-only metadata changes were ignored after a successful result, leaving
   previously verified ratings presented as current while offline/revalidating.
3. `useTechnicianReviewPages` cleared all older pages on every new head array or
   status change. A new submission could therefore discard the loaded tail; simply
   deduplicating the new head plus old pages would also miss the displaced 20th row.

Ordinary new canonical reviews already matched the listener and could update the
head. This fix addresses the confirmed refresh, stale-state and page-continuity
gaps; it does not assume an undisclosed live deployment failure.

## Display/query audit

| Display | Review/rating path |
| --- | --- |
| Technician Performance & Reviews | `useTechnicianReviews(ownUid)` + 20-item `useTechnicianReviewPages` |
| Technician dashboard, profile, history | Same shared review hook and `getTechnicianRatingDisplay` |
| Customer technician profile | Same hook; permitted name, stars, comment, safe date formatter and `ReviewPhotos` |
| Customer Technician list, Home cards, map cards, booking technician card | Shared `TechnicianRating` component, using the same hook |
| Admin selected technician rating | Existing selected-technician realtime query and shared rating eligibility/display helpers; existing access retained |

Eligible mobile queries use `technicianId == target` and integer stars in
`[1,2,3,4,5]`. The head orders `createdAt DESC, document ID DESC`, limit 20. Count
and average include **all** eligible matching reviews, independent of loaded
pages. A separate count detects legacy records omitted by the ordering. Existing
explicit ID-cursor legacy scanning remains bounded and user-paged. Existing
`photoPaths` flow through both roles' cards without private Customer profile reads.
Missing/invalid legacy display dates say Date unavailable; missing names retain
the established unavailable-name fallback. No names or dates are fabricated.

`updateTechnicianReviewAggregate` exists in Functions source and writes private
user aggregates. Its deployment was not assumed. Mobile rating displays do not
read those private/projection aggregate values as a fallback. Directory selection
and ordering retain existing behavior; this task does not scan the whole directory
to rerank technicians on every review. Admin visibility and its existing global
dashboard collection flow are unchanged.

## Implemented changes

- Added `refreshTechnicianReviews` to the existing shared service. Navigation focus
  in the shared hook revalidates one bounded head read and the full-history server
  aggregations. Concurrent focus requests from cards sharing the technician are
  coalesced. A terminal listener error reconnects on focus or Retry. New server
  snapshots from any device refresh aggregates, with revisions preventing obsolete
  results from winning. The 15-second server-confirmation deadline now also covers
  subsequent aggregate refreshes, not only startup.
- Cache transitions and revalidation emit the last verified result as stale.
  Network failures can retain that same-viewer/technician result with an explicit
  out-of-date label and Retry. Permission and index errors clear data. A cached
  zero or failed query never becomes a fresh No ratings yet. Account/target changes
  and final unsubscribe clear listeners and cached results.
- Rebase loaded pages against the latest head, retaining displaced boundary rows,
  loaded older rows and the oldest loaded cursor. Results are sorted and deduped
  by ID. An in-flight old page cannot overwrite a newer head/account. If a full
  window changes with no overlap, paging restarts at the new head with a visible
  Reviews updated notice; it does not join two windows with a hidden gap. A
  confirmed zero clears old cards. Legacy-tail eligibility is updated on refresh.
- Added consistent Retry/status feedback to direct-hook screens and compact
  cards. Customer profile dates use the existing safe shared formatter. Review
  photos, storage ownership/publication, submission, notifications, authentication,
  bookings, map location and account-lifecycle code were preserved.

There is still at most one 20-document realtime listener per distinct technician
with mounted mobile consumers, shared across their screens/cards in that session.
Older pages add no listeners. No polling, unbounded per-card listener, repeated
automatic full-collection scan, client aggregate write or deployed Function was
introduced. Aggregation queries and the page read are separate reads, so a commit
between them can produce a short-lived difference until the next snapshot settles.
Trusted changes to records outside the head are rechecked on focus/Retry; they do
not have an independent whole-history realtime listener. Normal customer reviews
are immutable and server-timestamped, so new submissions enter the live head.

## Changed files in this synchronization task

- `src/services/technician.service.ts`
- `src/hooks/useTechnicianReviews.ts`, `src/hooks/useTechnicianReviewPages.ts`
- New `src/utils/reviewPagination.ts`; `src/utils/technicianRating.ts`
- `src/components/technicians/TechnicianRating.tsx`; new `TechnicianRatingStatus.tsx`
- `app/technician/performance.tsx`
- `app/technician/(tabs)/index.tsx`, `profile.tsx`, `history.tsx`
- `app/(tabs)/technician-profile.tsx`
- New `scripts/tests/review-sync.test.mjs`
- `scripts/tests/technician-reviews-list.test.mjs`, `technician-rating.test.mjs`,
  `reviewer-names.test.mjs`, and this document

Review submission/photo services, Firestore/Storage rules, indexes and config were
not changed in this task. Their existing uncommitted changes remain present.

## Actual validation

- **122/122 headless tests passed**, including all existing rating, reviewer-list,
  performance, review/photo submission, authentication, account-session and
  password regressions. New checks cover focus coalescing, unchanged-head totals,
  stale cache/network recovery, missing-index reconnection, repeated aggregate
  deadlines, account cleanup, a loaded 40-review chain becoming 41 on insertion,
  continued pagination to all 44 without duplicates, disjoint-window handling,
  comment/photo preservation, explicit stale-zero and authorization-error states.
- **23/23 Auth/Firestore/Storage emulator tests passed** on the hardcoded local
  `demo-servicepilot-review-author` project, with no Functions emulator. Separate
  Customer A, Technician A and Technician B Auth/Firestore sessions were used.
  Technician A's already-open stream changed 43 → 44 and showed the new review
  first, while B stayed at zero. Full average was `(43*4+1)/44`; paging retained all
  44 distinct IDs. A duplicate create was denied. A trusted local legacy insert
  outside the head changed the aggregate to 45 after explicit focus refresh.
  Private user aggregates deliberately stayed wrong (`reviewCount: 999`) throughout;
  client aggregate forgery and private Customer-profile reads remained denied.
  Existing real photo/name/notification/pagination/access tests also passed.
- Scoped TypeScript and changed-file ESLint passed. Full TypeScript reports the
  same 22 unrelated existing errors in Admin Web Vite/assets/import configuration,
  OTP tests and template theme imports/types. Full lint reports eight unrelated
  existing errors: the unescaped apostrophe in `app/(tabs)/select-service.tsx` and
  seven unresolved template imports. An initial pagination-effect dependency
  warning from this fix was corrected; the final scoped lint has no warnings.
- `git diff --check` passed. No Android-device, TalkBack, native picker or physical
  two-emulator visual test was performed for this synchronization task. Independent
  emulator SDK sessions are automated evidence, not device UI verification.
- Missing indexes are simulated in focused tests because Firestore's emulator
  does not establish production composite-index availability. Live index state
  was not queried. Java 24 emits Storage deprecation/shutdown-pipe diagnostics on
  successful test exit. On this Windows host the completed CLI can leave its demo
  Firestore Java child; only the verified child from this task is cleaned up.

Reproduce from the repository root in PowerShell:

```powershell
node --test --test-reporter=dot scripts/tests/review-sync.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/technician-reviews-list.test.mjs scripts/tests/performance.test.mjs scripts/tests/review-submission.test.mjs scripts/tests/review-photo-picker.test.mjs scripts/tests/change-password.test.mjs scripts/tests/auth-persistence.test.mjs scripts/tests/account-session.test.mjs scripts/tests/forgot-password.test.mjs
node scripts/check-rating-types.mjs
npx.cmd eslint src/services/technician.service.ts src/hooks/useTechnicianReviews.ts src/hooks/useTechnicianReviewPages.ts src/utils/reviewPagination.ts src/utils/technicianRating.ts src/components/technicians/TechnicianRating.tsx src/components/technicians/TechnicianRatingStatus.tsx app/technician/performance.tsx 'app/technician/(tabs)/index.tsx' 'app/technician/(tabs)/profile.tsx' 'app/technician/(tabs)/history.tsx' 'app/(tabs)/technician-profile.tsx' scripts/tests/review-sync.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/technician-reviews-list.test.mjs scripts/tests/reviewer-names.test.mjs
$env:DEBUG = ''
$env:CI = '1'
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.review-author-test.json --only 'auth,firestore,storage' --log-verbosity QUIET 'node --test scripts/tests/reviewer-names.test.mjs scripts/tests/review-storage.test.mjs'
git diff --check
```

The existing fixture dependencies and compiled helpers under `functions/lib`
must be available. If absent, install local dependencies and run
`npm.cmd --prefix functions run build`. Use free test ports; do not stop another
developer's emulator to free them.

## Exact two-device/emulator steps — not manually performed

Use fresh local demo Firebase emulators and two Android emulators. Do not import
production data. Keep a single Metro server and the Technician screen open during
Customer submission.

1. Start local Firebase services in terminal A:

   ```powershell
   $env:DEBUG = ''
   $env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
   firebase.cmd emulators:start --project demo-servicepilot-review-author --config firebase.review-author-test.json --only 'auth,firestore,storage' --log-verbosity QUIET
   ```

2. In terminal B seed the existing 24-review fixture and completed unreviewed
   requests 2–7. Reseeding preserves reviews; use fresh services for this baseline:

   ```powershell
   $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
   $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
   node scripts/seed-rating-emulator.mjs --review-list-pages
   ```

3. Start exactly one Metro instance (SDK-54-compatible Expo Go or a rebuilt
   development client with the previous photo modules):

   ```powershell
   $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
   $env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1'
   npx.cmd expo start --localhost --port 8081
   ```

4. Substitute actual device IDs from `adb devices` and forward all four ports:

   ```powershell
   $reviewAdb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
   foreach ($device in @('emulator-5554', 'emulator-5556')) {
     foreach ($port in @(8081, 8187, 9197, 9297)) {
       & $reviewAdb -s $device reverse "tcp:$port" "tcp:$port"
     }
     & $reviewAdb -s $device shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
   }
   ```

5. On device A log in as `rating-gihan@example.test` (Technician A). On device B
   use `rating-bandara@example.test` (Customer A). Demo password for both is
   `Only-for-rating-emulator-42`. Do not use production credentials in demo mode.
6. A: open View Reviews, note the full average/count, then Load More Reviews. The
   seeded history spans more than 20. Keep that screen open. B: open completed
   `rating-device-request-2`, choose one star, write negative/neutral feedback and
   optionally add 1–5 photos. Submit. Thank You must wait for the save.
7. A must receive Bandara's new card first, with one star, exact comment, current
   date and photos. The previously loaded older rows and displaced boundary row
   must remain without duplicate IDs. Continue Load More to the full history.
   On a fresh seed the summary changes from **3.1 (24 reviews)** to
   **3.0 (25 reviews)**: the exact seeded sum is 75, then `(75+1)/25 = 3.04`.
8. Compare A's dashboard, profile, history and Reviews summary. B: compare Gihan's
   Customer profile, Technician list, Home card and Kandy map card. Every visible
   rating/count must agree once server confirmation completes. Verify larger-photo
   viewing and that a separate `rating-zero@example.test` Technician still has no
   reviews. These checks require no logout/restart for synchronization; changing
   to the other Technician is a separate account-boundary check.
9. Reopen B's request: View Your Review must show the saved review and not offer
   another create. Repeated Submit taps and another Customer session reviewing the
   same request must not increase the count twice. Notifications remain intact.
10. Navigate away/back on A and B: focus should recheck totals/head. Disable local
    connectivity after a verified result: show out-of-date/error and Retry, never
    a new zero. Restore connectivity and Retry/refocus; ratings should recover.
    Confirm startup offline, denied role, and missing-index states separately using
    automated local tests or local-only rules fixtures, never production changes.
11. Sign out A and use `rating-zero@example.test` (same demo password), including
    while a page/aggregate is pending. No Gihan names, comments, photos or totals
    may appear for that account. Revisit older reviews with missing name/date/photo
    fields and verify their explicit fallbacks. Run the automated sync test for
    trusted legacy changes outside the head without editing any live records.

## Review-only deployment prerequisites

No new rules or indexes were needed for this fix. Existing pending review work
requires the current Firestore rules and review indexes in this workspace. The
three review indexes cover `technicianId + rating`,
`technicianId + rating + createdAt DESC`, and
`technicianId + rating + document ID DESC`. Production composite-index readiness
must be confirmed before claiming live success. Commands below are for authorized
review only and were not run:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9
```

If deploying the earlier photo work, its Storage rules/config prerequisites are
still separate:

```powershell
firebase.cmd deploy --only storage --project servicepilot-756d9
```

See `REVIEW_SUBMISSION_VALIDATION.md` for live-bucket availability, cross-service
Storage permissions, browser CORS and the existing optional-photo hosting/billing
prerequisite. None was changed or verified live in this task. Rating synchronization
itself uses Auth/Firestore, requires no Storage operations without photos, no paid
geocoding and no deployed Cloud Function. No migration is required.
