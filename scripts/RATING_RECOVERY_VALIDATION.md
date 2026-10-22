# Dashboard rating recovery — October 22, 2026

## Confirmed cause and scope

Dashboard, History, Profile, Performance and customer cards share a technician-keyed,
Auth-scoped review stream. Tab blur leaves mounted consumers subscribed; focus and
foreground resume revalidate the bounded head and complete server aggregates.

The pre-fix service unconditionally emitted a stale result before a focus read.
If that read or an aggregate failed with `unavailable`, it reported failure without
scheduling another attempt. With an unchanged head there might be no further
snapshot to trigger aggregation. The shared pool discarded its replay value and
retained that failure until another successful emit or final disposal. Existing
hooks retained their own saved totals; newly attached consumers received only the
error. `verified` also lived inside a connection attempt, so Retry discarded it.

The pool already clears a recorded error on a successful emit: there was no
confirmed case of the pool replaying an error *after* success. The missing recovery
attempt and inconsistent saved-data replay were the problem. Review code in HEAD
already contains these gaps. The uncommitted directory/profile pooling changes
and the hook's foreground-resume improvement were preserved, not reverted.

Additional confirmed race gaps: the confirmation deadline did not invalidate its
pending operation, and a cache/pending-write metadata event did not invalidate an
aggregate started from an earlier server head. An old result could consequently
be presented as confirmed after the head became unconfirmed.

The formatter appended status prose to both the rating and count and then put
that prose in the combined label. Dashboard rendered the label, value badge and
separate status, producing the observed duplication.

`unavailable`/`network` does not establish an index failure or a server outage.
The app itself also generates `unavailable` at its confirmation deadline. No live
backend/network diagnosis was performed, and customer cached cards are not
evidence of a healthy connection. No Auth connectivity behavior was changed.

## Targeted changes

- Keep the last complete server summary/head/cursor in the account/query stream
  across reconnect attempts. Recoverable failures publish an explicitly saved
  result to current and new consumers. With no data, publish an error instead.
  Permission/precondition failures still clear inaccessible/unusable results.
- Add three automatic retries with 1s, 3s and 10s backoff. A 15s confirmation
  deadline bounds each attempt. Focus, foreground resume and Retry can start a
  fresh attempt after failure, including aggregate failure with an unchanged head.
  Pending attempts coalesce rapid taps and multiple subscribers into one listener.
  After exhaustion, saved/error feedback and Retry remain available; this is not
  an indefinite polling loop. Native Firestore promises cannot be cancelled, so
  superseded results are ignored using connection lifetime and revision checks.
- Clear progress/error state on an authoritative head plus successful full-history
  aggregations. Include metadata-only events and reject pending-write/cache heads,
  including the focus read. Invalidate timeout, cache and failure revisions.
- Dispose timers, listeners and saved values on final unsubscribe/account change.
  Saved data is memory-only while a consumer exists, not an offline disk cache.
- Keep values/counts free of warnings. Dashboard badge contains only the numeric
  rating (or an em dash), with bounded text and an accessible View Reviews action.
  One status below the summary shows Updating ratings… or Showing saved ratings
  plus Retry. Performance and compact customer cards use the same distinction.
  Unconfirmed empty data never says No ratings yet.
- Preserve 20-item head/page queries, full-history count/average, legacy review
  pagination, reviewer names, review submission, notifications and role rules.

Changed implementation files:

| File | Purpose |
| --- | --- |
| `src/services/technician.service.ts` | Saved-state replay, retry/backoff, metadata and callback invalidation |
| `src/hooks/useTechnicianReviews.ts` | Shared connection state, saved-data Retry, normalized error codes; retains existing resume handling |
| `src/utils/technicianRating.ts` | Separate numeric/count formatting from feedback |
| `src/components/technicians/TechnicianRatingStatus.tsx` | One concise status and Retry |
| `src/components/technicians/TechnicianRating.tsx` | Label saved compact ratings; retain count while updating |
| `app/technician/(tabs)/index.tsx` | Badge/summary sizing and accessible View Reviews |
| `app/technician/performance.tsx` | Remove duplicated stale feedback |

Tests changed: `scripts/tests/rating-recovery.test.mjs` (new),
`technician-rating.test.mjs`, `technician-reviews-list.test.mjs`,
`review-sync.test.mjs`, `review-indexes.test.mjs`, `reviewer-names.test.mjs`.
Other dirty/untracked files present at the start belong to the existing
performance/subscription work and were preserved.

## Before/after evidence and checks

The existing 27 rating/subscription tests passed before this work. Running the new
saved-data and automatic-retry regressions against HEAD's previous review service
failed both: shared summary became null instead of `{ average: 4, count: 47 }`,
and listener registrations remained 1 when the first scheduled retry should have
created registration 2. The same regressions pass with this implementation.

Local deterministic tests execute the actual service, hook, pool and screen
components with controlled SDK adapters, delayed promises and fake timers. They
cover ten Dashboard → Jobs → History → Dashboard focus cycles, resume, full totals
beyond a page, no-data/saved failures, retry exhaustion, rapid Retry taps, multiple
subscribers, query isolation, metadata/pending writes, stale callbacks, account
switch/logout, disposal and exactly one visible status with a numeric badge.
These are not Android UI tests.

Commands used:

```powershell
node --test scripts/tests/rating-recovery.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/technician-reviews-list.test.mjs scripts/tests/review-sync.test.mjs scripts/tests/review-indexes.test.mjs scripts/tests/subscription-reliability.test.mjs scripts/tests/performance.test.mjs
node --test scripts/tests/review-submission.test.mjs scripts/tests/review-photo-picker.test.mjs
node scripts/check-rating-types.mjs
node node_modules/typescript/bin/tsc --noEmit
npm.cmd run lint
```

All 86 tests in the two commands above pass, including ten new recovery tests.
Focused TypeScript and ESLint pass. Full root TypeScript has unrelated existing
Admin Web/Vite/image declarations, OTP worker test and Expo template alias errors.
Full lint has eight existing errors: an unescaped apostrophe in select-service
and seven template alias imports. None are in the changed implementation.

The existing 18 Auth/Firestore emulator review/access tests passed. The expanded
19-test suite also passes (21.6 seconds), including the new real
SDK recovery test uses a separate local technician, `disableNetwork/enableNetwork`,
and a legacy review outside the ordered head: saved 4.0/3 must recover to confirmed
3.5/4 through metadata-only head confirmation. It then checks ten fresh focus
revalidations. All writes are to the demo project on loopback emulators.

```powershell
$env:JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr'
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
$env:XDG_CONFIG_HOME = "$PWD/.firebase/review-config/rating-recovery"
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.review-author-test.json --only 'auth,firestore' --log-verbosity QUIET 'node --test --test-force-exit scripts/tests/reviewer-names.test.mjs'
```

Runner limitation: after the SDK network-toggle test, Node stayed alive even
after explicit Firestore termination, Firebase app deletion and Admin Firestore
termination all completed. The remaining handle was not identified. The final
emulator run uses `--test-force-exit` after tests/hooks finish. Service listener,
timer, stale-callback and Auth cleanup are independently asserted in the
deterministic suite without forced exit. Temporary teardown instrumentation and
generated CLI logs were removed.

## Native Android checklist — not performed

Two Android emulators were detected. Native sign-in, visual layout, actual tab
navigation and device background/network interruption were not exercised. No
live app session or production record was changed. To validate manually:

1. Start the existing demo-only emulator configuration and seed local accounts:

   ```powershell
   $env:JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr'
   $env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
   $env:XDG_CONFIG_HOME = "$PWD/.firebase/review-config"
   firebase.cmd emulators:start --project demo-servicepilot-review-author --config firebase.review-author-test.json --only 'auth,firestore'
   # In a second terminal, with emulators running:
   $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
   $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
   node scripts/seed-rating-emulator.mjs --review-list-pages
   ```

2. Start **one** Metro server explicitly in demo mode (restart it if an existing
   server used production configuration):

   ```powershell
   $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
   $env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1'
   npm.cmd start -- --clear
   ```

   ```powershell
   $ratingAdb = 'C:/Users/WW/AppData/Local/Android/Sdk/platform-tools/adb.exe'
   foreach ($ratingDevice in @('emulator-5554', 'emulator-5556')) {
     foreach ($ratingPort in @(8081, 8187, 9197)) {
       & $ratingAdb -s $ratingDevice reverse "tcp:$ratingPort" "tcp:$ratingPort"
     }
     & $ratingAdb -s $ratingDevice shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
   }
   ```

   Sign in as `rating-gihan@example.test` on one and
   `rating-bandara@example.test` on the other. Password:
   `Only-for-rating-emulator-42`. The seed only uses the guarded demo project;
   fresh baseline with `--review-list-pages` is 24 reviews, average 3.125 (3.1).

3. On technician: Dashboard → Jobs → History → Dashboard, repeat at least ten
   times. Verify the same numeric rating/count, no repeated warning prose, View
   Reviews navigation and retained older review pages. Reopen Profile/Performance.
4. Background/foreground the technician app. Brief revalidation should show a
   subtle update indicator and finish without a stale warning.
5. Interrupt and restore **local Firestore** connectivity while retaining demo
   data (for a restart, use emulator export/import). Confirm saved totals stay
   visible, sustained failure exposes one Retry, repeated taps coalesce, and
   recovery clears warnings without logout. Wi-Fi/airplane controls alone may not
   interrupt adb-reversed loopback connections; confirm a real request failure.
6. Test a fresh/no-data session offline: unavailable/loading must not be reported
   as No ratings yet. Test `rating-zero@example.test` online for a valid zero.
7. Switch accounts/logout during an attempt; no previous ratings/cards may remain.
   Submit a local completed-request review from the customer; verify correct
   technician totals, name, pagination, saved review and existing notification.

No Firestore rules/index changes, deployment commands, migrations, production
reads/writes, billing changes or commits are required or performed for this fix.
