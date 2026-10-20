# Technician ratings: local follow-up, 20 October 2026

## Confirmed current behavior and cause

Root `AGENTS.md` was read; no nested guidance files exist in this checkout. Git
status, branch `main` and existing diffs were inspected before editing. Earlier
Change Password, Remember Me, provisioning and account lifecycle work remains
uncommitted and preserved. This task used local/emulator data only: no fresh
production inspection, production writes, deployment, billing change, commit or
push was performed.

The original customer-profile `5.0 (1 review)` / technician-dashboard `No ratings
yet` defect was ALREADY FIXED in the current source. Customer profile and
technician Dashboard, Profile, Performance and History use
`useTechnicianReviews` and `getTechnicianRatingDisplay`. The earlier investigation
is historical evidence in `TECHNICIAN_RATING_VALIDATION.md`, not a new production
observation in this task.

The remaining confirmed mismatch was in Customer Home cards, technician list,
map cards, selected-technician request card and Admin Web's technician table.
They displayed `users`/`technician_map_profiles` aggregate fields rather than the
live reviews. Missing values were coerced to zero and presented as `New`, `0
reviews`, or `0`, even when an eligible review existed. This was verified by code
inspection and reproduced using missing/stale aggregate fixtures locally.

Review creation still writes `service_reviews` using a completed request,
authenticated Customer identity, authoritative real-name snapshot, integer stars
1–5, duplicate protection and notification. Existing rules permit verified
Customers to read approved technicians' reviews and approved/verified Technicians
to read their OWN reviews. Other technicians/private Customer profiles remain
inaccessible. None of those rules or review-submission behaviors were changed.

The existing optional `updateTechnicianReviewAggregate` Cloud Function queries
reviews for one technician and writes PRIVATE user aggregates. It does not update
the public projection, and its deployed state was not assumed or checked against
production. It is not required by the billing-free display flow.

## Implemented behavior

- Customer cards/list/map/request rating displays now use a single reusable
  `TechnicianRating` component backed by the SAME shared stream as profile and
  technician statistics. Stale aggregate props never supply a display fallback.
- The technician-scoped query is pooled by technician ID and authenticated
  viewer. Multiple mounted views for the same technician share one query, one
  summary calculation per confirmed emission and the same summary object. Query
  changes are not triggered by map timer ticks or ordinary component renders.
- Summary computation moved from individual hook consumers into the shared
  service emission. Existing two-argument review callbacks continue to work;
  rating consumers receive the summary as the third callback argument.
- Only complete, server-confirmed snapshots without pending writes establish an
  average/count. `Loading ratings...`, `Ratings unavailable`, and verified
  `No ratings yet` are separate states. Compact error text has an accessible
  permission/network explanation. Existing full profile error feedback remains.
- One decimal place and singular/plural review counts use the existing formatter
  everywhere. All eligible reviews count, even when the profile renders five
  review cards. Reviewer names and visibility are unchanged.
- The Admin table offers `View rating`; only the selected technician's scoped
  review listener is mounted. Opening another row replaces it. It uses the same
  eligibility, summary and display helpers. This avoids adding listeners for
  every row of the existing unpaged administrator table.
- Account changes, target changes, errors and unmount release/clear subscribers;
  obsolete callbacks cannot restore earlier account data. No client aggregate
  writes, extra backend endpoint, full `service_reviews` collection scan, polling,
  private-profile read or required deployed Function was added.

The source is the already permitted, complete technician-specific review query.
Its read cost scales with that technician's review history. Additional DIFFERENT
technicians shown by cards require their own scoped queries, within the existing
bounded/virtualized mobile directory. Same-technician consumers share live work;
there is no cross-account or persistent rating cache. Cached-only offline startup
can remain loading until a server response; it is not interpreted as zero.

## Changed files for this follow-up

| Files | Change |
| --- | --- |
| `src/services/technician.service.ts` | Calculate and share a confirmed summary with the existing review stream. |
| `src/hooks/useTechnicianReviews.ts` | Consume the shared summary; preserve identity, metadata and cleanup checks. |
| `src/components/technicians/TechnicianRating.tsx` | Shared compact mobile rating/count/loading/error rendering. |
| `app/(tabs)/index.tsx` | Home cards use live rating/counts; rating box permits multiline state labels. |
| `app/(tabs)/technicians.tsx` | Virtualized technician list uses the common display. |
| `app/(tabs)/map.tsx` | List and selected/overlap map cards use live ratings; GPS/area/distance behavior unchanged. |
| `app/(tabs)/create-request.tsx` | Selected-technician card uses live ratings; booking handlers unchanged. |
| `admin-web/src/components/TechnicianRating.tsx`, `admin-web/src/services/technicianRatingService.ts` | Scoped, account-guarded admin lookup with shared rating helpers. |
| `admin-web/src/pages/Technicians.tsx` | Replace stale aggregates with one-at-a-time View/Close rating; lifecycle controls preserved. |
| `scripts/tests/technician-rating.test.mjs` | Display, rounding, pooled query/calculation and admin lookup regressions. |
| `scripts/tests/reviewer-names.test.mjs` | Use actual shared summaries; add real Customer/Technician Auth emulator test with stale/missing aggregates. |
| `scripts/tests/performance.test.mjs`, `scripts/lib/performance-render-harness.mjs` | Use the real rating helper and resolve TSX imports in existing render tests. |
| `scripts/check-rating-types.mjs` | Include all newly affected mobile screens and their dependencies. |
| This document, `scripts/TECHNICIAN_RATING_VALIDATION.md` | Current handoff and historical-report cross-reference. |

The backend, Firestore rules/indexes, auth services, account lifecycle service,
review submission/name helpers and dependency lockfiles were not changed BY THIS
FOLLOW-UP. Their earlier working changes remain intact.

## Checks actually performed

- **97 client tests passed**: 13 rating tests, 10 shared-subscription/performance
  tests, 9 map action tests and 65 existing auth/session/sharing tests. Coverage
  includes zero/one/multiple reviews; `4.3 (3 reviews)` rounding; missing/stale
  aggregate props; cache/pending snapshots; permission/network failures; one query
  and calculation shared across consumers; account/target switching; final
  unsubscribe and obsolete callbacks; and the bounded admin lookup.
- **31 Auth/Firestore emulator tests passed**: 15 review/rating/name/security tests,
  15 map/privacy regressions and the existing trusted lifecycle/map test. The new
  real Customer and Technician sign-in test observes 0 -> 1 -> 2 -> 3 reviews with
  three consumers per session. It verifies `4.3 (3 reviews)` while private
  aggregates remain `1/99`, then removes those aggregates using local Admin SDK.
  Both roles retain the correct result. Aggregate tampering and private-profile
  access remain denied. Other technician, dispatcher, inactive and unverified
  review access boundaries and reviewer-name/notification behavior pass.
- `node scripts/check-rating-types.mjs`: passed for affected mobile screens and
  imported dependencies. Admin Web TypeScript/Vite build and existing backend
  TypeScript build passed. Scoped ESLint passed.
- Admin Web lint completed with its same 10 existing warnings. The existing
  production bundle-size warning remains.
- Full root TypeScript still reports the same **22 pre-existing diagnostics** in
  Admin/Vite declarations, OTP tests and theme/template aliases/types. Full root
  lint still reports **8 pre-existing errors** in `select-service.tsx` and
  theme/template imports. No unrelated fixes were made.
- `git diff --check`: passed. Device/browser UI rendering was NOT tested.

Reproduce from the repository root with installed dependencies, Java 21+ and the
installed Firebase CLI. Disable debug logging and run emulator suites sequentially
because they use Auth 9197 / Firestore 8187:

```powershell
node scripts/check-rating-types.mjs
npm --prefix functions run build
npm --prefix admin-web run build
node --test scripts/tests/technician-rating.test.mjs scripts/tests/performance.test.mjs scripts/tests/map-view-actions.test.mjs scripts/tests/auth-persistence.test.mjs scripts/tests/change-password.test.mjs scripts/tests/foreground-sharing.test.mjs scripts/tests/account-session.test.mjs
$env:DEBUG = ''
$env:JAVA_TOOL_OPTIONS = '-Xmx512m -Djava.net.preferIPv4Stack=true'
$env:CI = '1'
firebase emulators:exec --project demo-servicepilot-review-author --config firebase.review-author-test.json --only 'auth,firestore' 'node --test scripts/tests/reviewer-names.test.mjs scripts/tests/map-location.test.mjs scripts/tests/map-admin.test.mjs'
```

## Manual two-account/device checklist — not performed

Start fresh disposable emulators in terminal A:

```powershell
$env:DEBUG = ''
$env:JAVA_TOOL_OPTIONS = '-Xmx512m -Djava.net.preferIPv4Stack=true'
firebase emulators:start --project demo-servicepilot-review-author --config firebase.review-author-test.json --only 'auth,firestore'
```

Terminal B, seed ONLY existing guarded demo fixtures:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
node scripts/seed-rating-emulator.mjs
```

Do not seed imported/production data. The existing seed preserves reviews; start
fresh emulators for exactly one review. It creates Gihan, Bandara and a zero-review
technician, with completed requests that can receive additional reviews.

Terminal C, one Metro server for two Android emulators:

```powershell
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '10.0.2.2'
npx expo start --clear
```

Open the same Metro URL on both emulators. Explicit demo mode selects
`demo-servicepilot-review-author`; normal sessions must not be redirected to Auth
emulators. Use device A as `rating-gihan@example.test` and device B as
`rating-bandara@example.test`. The synthetic local-only fixture password is
`Only-for-rating-emulator-42`.

1. On B choose Kandy. Check Home cards, technician list, map list, Gihan's profile
   and selected-technician request card all show `5.0` with `1 review`. On A check
   Dashboard, Profile, History and Performance match. Set technician availability
   Available through existing controls if needed to open the request screen;
   this does not enable sharing.
2. Map-list ratings must work without shared GPS. For a marker-card check, enable
   foreground sharing manually and use the existing Android mock-GPS setup; do
   not substitute a district/town centre for GPS. Check rating/name/profile and
   request actions in the marker card.
3. Keep A signed in. On B submit a three-star review for the second completed
   fixture request. Both sides should update to `4.0 (2 reviews)` without signing
   out. Confirm reviewer Bandara and the review notification. Reopening that
   completed request must not permit a duplicate review.
4. Add five-star reviews to requests 3–7: all displays should show `4.7` and
   `7 reviews` (33/7), while the profile shows only five review cards. Revisit
   list/map/request views and verify they retain the same counts.
5. On A switch to `rating-zero@example.test`. Loading precedes verified
   `No ratings yet` / `0 reviews`; no Gihan data carries over. Switch back and
   confirm his rating returns. Rapid navigation/unmount must not revive an old
   account's result.
6. Test offline startup/reconnection, then a denied review query in local
   development. Loading/access errors must not become `New`, zero, or `No ratings
   yet`. Existing job/profile browsing remains available while ratings load.
7. Verify sharing OFF/map eligibility, disabled-account enforcement, real reviewer
   names, review visibility and notification behavior are unchanged.

Optional Admin Web check: use the explicit demo mode and local Super Admin fixture
setup in `ACCOUNT_LIFECYCLE_VALIDATION.md`, on the SAME demo emulator instance.
Open Technicians > View rating for Gihan; verify matching values and live updates.
Open a different row and confirm the earlier lookup closes. Check permission/
network messages and sign-out/account switching. Do not use production accounts.

## Release/backfill requirements and limits

Release the updated mobile app and rebuild/release Admin Web through the existing
approved process. No release was performed here. This rating change requires no
new backend hosting, Function deployment, Firestore rules/index deployment,
aggregate backfill or migration. Existing deployed read rules must match the
review boundaries verified locally; any older unrelated rule updates still need
their own review/release.

Legacy private/public aggregate fields are retained for compatibility, including
the pre-existing directory ordering that still uses them. This task fixes displayed
averages/counts; it does not promise a freshly recomputed global rating ranking or
repair stored aggregate caches. Reading existing eligible reviews makes a
production backfill unnecessary for the updated displays. No migration script or
production write is needed to see old reviews.

Full review history is needed for an authoritative overall average/count. Very
large per-technician histories may eventually merit a separately designed trusted
summary projection; a five-review page must never stand in for that overall
summary. No new paid backend, required Cloud Function or per-screen aggregation
request was introduced to solve this task. Manual Android/browser layout,
offline timing and visual notification checks remain outstanding.
