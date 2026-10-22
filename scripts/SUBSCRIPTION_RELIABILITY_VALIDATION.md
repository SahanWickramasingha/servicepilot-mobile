# Mobile performance and subscription reliability — 2026-10-21

The starting Git tree was clean. Read root `AGENTS.md`; no nested `AGENTS.md` was
found. Reviewed the existing performance, review synchronization/pagination,
account-session, map loading, foreground-location and validation utilities before
editing. This report supplements `MOBILE_PERFORMANCE_VALIDATION.md`; its historical
measurements are not new measurements from this task.

## Confirmed findings and changes

1. Both notification screens awaited a profile read and then installed a
   notification center. Unmounting before that read completed left cleanup with
   nothing to unsubscribe; the continuation subsequently created four Firestore
   watches. Neither screen observed account changes. Replaced that setup with
   `useNotificationCenter`, using the existing shared profile/notification
   services. Cleanup owns both subscriptions immediately. Account, profile/role,
   unmount and late-callback guards clear private state. Profile changes with the
   same role do not restart the center. Notification source errors remain visible
   when another source emits partial data.
2. Customer request details listened only by request ID, retained the previous
   account's request after logout, and accepted late data when `currentUser` was
   null. It now resets/reconnects on Auth changes, checks ownership, clears failed
   data and rejects obsolete callbacks. The request-document service shares one
   active watch only for the same document and signed-in viewer.
3. Home and the unfiltered technician directory opened identical directory
   watches and independently repeated server approval checks. Share those active
   streams by category, division, bounded page size and authenticated viewer.
   Each consumer receives its own `hasMore` callback, including snapshot replay.
   Single public technician documents also share their existing verification
   work. Keep server approval checks, unavailable cached availability, district
   filtering and the 8/16/24 bounds. A directory listener error now supersedes
   pending verification; an older verification cannot republish rows afterward.
4. Review totals refreshed on navigation focus but not on app resume when the
   route remained focused. A limited head query need not change when older
   reviews change. Focused review hooks now trigger the existing coalesced
   head/full-summary refresh once per foreground transition and release their
   AppState observer on blur. The realtime head, complete server aggregates,
   review paging, legacy records, names and photos are preserved.
5. Job-location access-reference hints used an unbounded module Map and survived
   logout. They now use a memory-only 32-entry session cache, discarded on account
   changes/logout; its Auth observer stops when cleared. This caches only access
   reference IDs, never authorization decisions or coordinates. Every location
   read still checks the authoritative request and Firestore access rules. Each
   awaited stage also verifies the original Auth user, rejecting precise GPS
   results that finish after an account switch.
6. The existing render probe omitted the newer durable booking-attempt ID mock;
   it logged a TypeError and misleadingly counted zero booking calls. Fixed the
   fixture and used that same corrected probe for both source trees.

## Investigation coverage

| Path | Assessment |
| --- | --- |
| Customer Home, technician list/profile | Shared requests/notifications already existed; targeted remaining duplicate public streams. Home async work already checks a generation. |
| Customer Map | Existing focus/foreground directory and GPS cleanup, bounded reads, map memo inputs and freshness timer retained. GPS is not moved to service districts/towns. |
| Requests and request details | Existing virtualized 20-row list and shared full request query retained; fixed the detail document/session lifecycle. |
| Technician Dashboard, Jobs, History | Existing shared workspace, stable notification dependency, action guards and virtualized history retained. No new speculative memoization. |
| Performance & Reviews | Retained 20-item realtime head, complete aggregates and explicit paging; added foreground refresh. |
| Auth/profile gates and foreground sharing | Existing status/revocation gates and GPS cleanup retained. Access-gate failure handling is deliberately separate from ordinary profile display handling. Normal app sessions still require explicit demo-emulator opt-in. |

## Before/after evidence

Preserved the starting tracked app/src/domain sources in ignored
`.expo/performance-reliability-before`. The same Node 22.17.0 / TypeScript 5.9.2
adapters and deterministic inputs execute actual TypeScript from both trees.
No network is involved in these probes.

| Identical workload | Before | After |
| --- | ---: | ---: |
| Notification centers created after delayed profile completion following unmount, per customer/technician screen | 1 / 1 | 0 / 0 |
| Customer request still visible after logout | yes | no |
| Late callback displays the logged-out customer's request | yes | no |
| Two identical public directory consumers: watch registrations | 2 | 1 |
| Those consumers: server approval reads for one fixture document/snapshot | 2 | 1 |
| Those consumers: delivered updates | 2 | 2 |
| Directory listeners after final cleanup | 0 | 0 |
| Focused review hook refresh calls for background → active → duplicate active | 0 | 1 |
| Review AppState observers after blur | 0 | 0 |
| Existing 13 profile/jobs/review/notification consumers: active registrations / after cleanup | 7 / 0 | 7 / 0 |
| Existing 1,000-job initial snapshot + one changed job: document mappings | 1,001 | 1,001 |
| Twenty native-map component invocations: marker grouping calculations / polygon array identities | 1 / 1 | 1 / 1 |
| Request first page / initial FlatList batch | 20 / 6 | 20 / 6 |
| Dashboard center starts over ten availability/profile changes | 1 | 1 |
| Two immediate Submit taps: booking calls with the repaired probe fixture | 1 | 1 |

These are application registrations, verification calls and JS work counts, not
billed reads, wire RPC counts, actual React commits, native FPS or screen loading
times. Firestore may multiplex its own watches. The older service probe does not
model the newer bounded-review aggregation workload; review correctness and
coalescing are covered separately by review-sync/rating and emulator tests.

No Android UI speed gain is claimed. `adb devices -l` returned no connected
devices. Cold start, first usable screen, real component commit counts, navigation
latency, scrolling, bitmap display and native map performance were not measured.

## Validation actually performed

- **193/193 headless tests passed**, across all test files without emulator-only
  guards. Includes 12 new regressions for the confirmed defects: notification
  unmount/account/profile lifecycles, private request cleanup, query/page scope,
  pending approval errors, public profile metadata, request-document sharing,
  bounded session hints, obsolete precise GPS and review resume cleanup. Existing
  suites cover account-status enforcement, auth persistence, full review totals,
  pagination, live review updates, photo selection/submission, maps/freshness,
  foreground GPS cleanup, booking policy and duplicate action handling.
- **47/47 loopback Auth/Firestore tests passed** on
  `demo-servicepilot-review-author`: map-location, reviewer-names and
  availability-booking suites. These execute actual SDK/rules paths and include
  private request/profile/GPS access, notifications, authoritative approval,
  booking eligibility, complete review totals and realtime 20-item review paging.
- Performance-scope TypeScript and changed mobile TypeScript-file ESLint passed.
  Functions `npm run build` and `git diff --check` passed.
- Full root TypeScript reports **22 existing errors** in untouched Admin Web
  Vite/assets, OTP/Cloudflare tests and Expo template aliases/types. Full root lint
  reports **8 existing errors** in untouched `select-service.tsx`,
  `parallax-scroll-view.tsx`, `themed-text.tsx`, `themed-view.tsx` and
  `use-theme-color.ts`. Scoped checks are clean; unrelated files were preserved.
- Firebase CLI attempted its remote informational configuration fetch and emitted
  a network warning, then completed all local emulator tests. No production data
  reads/writes or deployment were used. Emulator ports 8187/9197 were no longer
  listening after the run.

The host's inherited `DEBUG` setting enabled Firebase CLI environment logging.
One debug line displayed in raw tool output included an inherited credential.
Removed environment-dump lines from saved logs and disabled debug in the documented
command. The raw tool transcript may retain that value; rotate the exposed
credential. The debug artifact belongs under ignored `.expo`, outside the change.

The broad run initially exposed an outdated map-loading test loader after adding
the session-cache dependency. Updated that loader (and the map-location loader)
to execute the real session utility adapter; the final 193-test run is green.

## Reproduce locally

From the repository root in PowerShell:

```powershell
node scripts/subscription-reliability-probe.mjs .expo/performance-reliability-before
node scripts/subscription-reliability-probe.mjs .
node scripts/performance-probe.mjs .expo/performance-reliability-before
node scripts/performance-probe.mjs .
node scripts/performance-render-probe.mjs .expo/performance-reliability-before
node scripts/performance-render-probe.mjs .
node scripts/check-performance-types.mjs

$localTests = Get-ChildItem scripts/tests -Filter '*.test.mjs' |
  Where-Object { -not (Select-String -LiteralPath $_.FullName -Pattern 'EMULATOR_HOST|Loopback|Local emulators required|emulators required' -Quiet) } |
  ForEach-Object { $_.FullName }
node --test $localTests

npm.cmd --prefix functions run build
$env:DEBUG = ''
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.expo/firebase-cli-config'
firebase.cmd emulators:exec --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json "node --test scripts/tests/map-location.test.mjs scripts/tests/reviewer-names.test.mjs scripts/tests/availability-booking.test.mjs"
```

The ignored baseline is a local source snapshot. On another checkout, supply an
equivalent saved pre-change tree. The render probe's existing root fallback is
for unchanged dependencies; all changed production modules exist in this snapshot.
Host adapters are not a substitute for profiling React Native.

## Remaining two-device Android procedure — not performed

Use two devices/emulators, the same build mode, OS, fixture sizes, permissions and
network conditions for before/after. Keep Expo Go/dev and release results separate.
Never use a normal release build against its production configuration to profile
fixtures; a release comparison needs a reviewed disposable-backend configuration.

1. Start fresh local Auth/Firestore emulators:
   `firebase.cmd emulators:start --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json`.
   Set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8187` and
   `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9197`. Run
   `node scripts/seed-map-emulator.mjs --sharing-off --kandy-only` and
   `node scripts/seed-rating-emulator.mjs --review-list-pages` **only after** the
   test suites, so fixtures do not alter test-query expectations.
2. For one Metro server, set `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=1`,
   `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1`, `EXPO_OFFLINE=1`, then run
   `npx.cmd expo start --localhost --port 8084`. Reverse ports 8084, 8187 and 9197
   with `adb -s <serial> reverse tcp:<port> tcp:<port>` on both devices; open
   `exp://127.0.0.1:8084`. For actual photo upload/display, use
   `firebase.review-author-test.json` with Storage on 9297, reverse that port too,
   and pick a real local image through the existing review form.
3. Use `rating-gihan@example.test` / `rating-bandara@example.test`, password
   `Only-for-rating-emulator-42`, for review/account tests. The map fixture accounts
   are `map-tech@example.test` / `map-customer-a@example.test`, password
   `Only-for-map-emulator-42`. Choose Available explicitly if a fixture profile has
   no availability; do not change production records.
4. Record ten cold launches per version: launch → Auth restored → first usable
   Customer Home or Technician Dashboard. Record median/range, separating bundle
   loading, navigation and Firebase data readiness. In React Native DevTools
   Profiler, record commits/durations for Home → Technicians → Profile → Request,
   Map → marker, Requests → details, and Dashboard → Jobs → History → Performance
   & Reviews. Keep the exact fixture records and interaction order identical.
5. Rapidly open/back out of both notification screens while offline/profile
   reads are pending; repeat at least 20 times. Resume connectivity and check
   Auth/Firestore emulator request logs for accumulating watches or duplicate
   verification reads. Capture server activity separately from JS application
   registrations. Repeat normal offline/resume without navigation.
6. Keep a private request detail open, log out, then sign in as another account.
   Confirm no previous request, address, notification or photo remains visible.
   Repeat switching while approval checks, profile reads, review pages and precise
   location reads are pending. Verify inactive/revoked accounts still hit the gate.
7. Load more than 20 reviews and check complete totals, real reviewer names,
   photos and live new reviews. Background the app while editing an older review
   outside the head **using local emulator fixtures only**, then resume the same
   focused route and verify full totals refresh. Confirm no extra head listeners
   remain after leaving the route, and test offline recovery/Retry.
8. On the map fixture pair, verify service district/area remain independent of
   GPS; test sharing ON/OFF, stale/unavailable positions, marker details, correct
   profile/request IDs, denied customer permission and approximate distance.
   Use the source-verified test coordinates and full flow in
   `SERVICE_AREA_MAP_VALIDATION.md`; no fixture coordinates enter app code.
   Background/resume and logout must stop foreground sharing as before.
9. On the two roles, perform a local booking/status transition and a review with
   photos; confirm realtime Requests/Jobs/History, full review totals, notification
   delivery/read state and photo opening. Capture scroll/frame timings on large
   request/history/review lists and maps separately from data readiness.
10. Leave sharing OFF, sign out, stop demo services, remove task port forwards,
    clear the two `EXPO_PUBLIC` emulator variables and restart Metro/app before
    normal sessions. Compare native timings only after completing both runs.

The full photo/Storage integration suite, native UI interaction, Android offline
recovery, scroll/frame profiling and real socket/read counts were not run in this
task. Persistent Firestore listeners retain SDK offline/reconnect behavior; no
polling was added. Full private request/notification queries still download their
existing complete datasets for exact counts/unread behavior. Server-side paging
or materialized counts would need a separate schema/security design. Cached
terminal query errors retain the existing explicit Retry/remount behavior;
foreground refresh also retries failed review streams.

## Changed files and delivery boundaries

| Files | Purpose |
| --- | --- |
| `app/(tabs)/notifications.tsx`, `app/technician/notifications.tsx`, `src/hooks/useNotificationCenter.ts` | Owned notification/profile lifecycle for both roles. |
| `app/(tabs)/request-details.tsx`, `src/services/request.service.ts` | Customer session reset/ownership and shared request-document watch. |
| `src/services/technician.service.ts` | Query-scoped directory/public profile sharing and obsolete-verification guard. |
| `src/hooks/useTechnicianReviews.ts` | Focused foreground aggregate refresh. |
| `src/utils/boundedSessionCache.ts`, `src/services/session-subscriptions.ts`, `src/services/location.service.ts` | Bounded account-cleared hints and pending GPS isolation. |
| `scripts/lib/subscription-reliability-workloads.mjs`, `scripts/subscription-reliability-probe.mjs`, `scripts/tests/subscription-reliability.test.mjs` | Reproducible headless before/after and 12 defect regressions. |
| `scripts/lib/performance-test-deps.mjs`, `scripts/tests/map-loading.test.mjs`, `scripts/tests/map-location.test.mjs`, `scripts/tests/technician-rating.test.mjs` | Real cache/session adapters and AppState test dependency. |
| `scripts/performance-render-probe.mjs`, `scripts/check-performance-types.mjs`, this report | Repair existing instrumentation, scoped checks and validation evidence. |

No dependencies, rules, indexes, billing, deployments, migrations, production
writes, commits, amendments or pushes. No new Firestore deployment commands are
required by these changes. The pending cross-booking overlap policy is untouched.
Changes remain available for review before any Git commit.
