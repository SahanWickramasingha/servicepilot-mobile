# Mobile navigation performance — 7 November 2026

Implemented locally. No deployment, production record/configuration change, commit,
push or remote APK build. Root `AGENTS.md` was read first; no nested instructions
were found. Existing Admin Web/Worker changes and other unrelated work were retained.

## What was measured

Windows, Node 22.17.0, the same working tree/dependencies and deterministic adapters
executing the actual mobile screen functions before and after changes. These are
work counters and observable loading behavior, **not native timing, React commit
duration, memory or FPS measurements**. Fixtures are synthetic and make no network
requests. The original four mobile files were saved before editing under ignored
`.expo/mobile-navigation-before/`.

| Reproducible workload | Before | After |
| --- | --- | --- |
| Additional profile reads mounting authorized customer Home and Profile | 2 | 0 |
| Dashboard subscriptions started while an additional profile read has no response | 0 | 3 |
| Job row elements eagerly created by the parent for 200 matching jobs | 200 | 0 |
| Jobs handed to a virtualized list in that workload | 0 | 200; initial batch configured to 6 |
| Directory list visible while expanding a loaded eight-row page | No; full-screen loading | Yes; eight rows and loading progress |
| Customer workload subscriptions remaining after cleanup | 0 | 0 |

The causes were a redundant `getUserProfile` fetch preceding all dashboard
subscriptions, another mount-only profile read on Profile, all Jobs rendered with
`map` inside a ScrollView, and the directory clearing its array and replacing the
whole list with a spinner whenever its page count changed.

Reproduce from the repository root:

```powershell
node scripts/mobile-navigation-probe.mjs .expo/mobile-navigation-before
node scripts/mobile-navigation-probe.mjs
node --test scripts/tests/mobile-navigation.test.mjs
node scripts/performance-probe.mjs
node scripts/subscription-reliability-probe.mjs
```

Baseline/after counter output is retained locally in
`.expo/mobile-navigation-baseline.json` and `.expo/mobile-navigation-after.json`.
The tracked workload and table preserve the measurement definition if those
ignored artifacts are removed. The four baseline files were unmodified relative
to HEAD when this task began.

## Implementation and inspected paths

- `app/(tabs)/index.tsx`: consumes the root account session's live, server-confirmed
  customer profile and starts the existing pooled queries independently. Ordinary
  profile updates do not restart those queries. Old account callbacks are rejected,
  old request data is cleared on failures, and an owner check masks data before
  account-change effects finish.
- `app/(tabs)/profile.tsx`: consumes that same profile, removing its redundant fetch
  and initial network spinner. Profile edits now appear through the root observer.
  Unconfirmed, revoked or mismatched sessions cannot supply a displayed profile.
- `app/(tabs)/technicians.tsx`: retains existing display rows only while loading
  more for the same Auth user object/category/division. Account and filter changes
  immediately mask the prior scope. Loading has an accessible progress indicator;
  failed revalidation clears rows and retains Retry/error feedback. The existing
  bounded page queries and mandatory current-approval reads are unchanged.
- `app/technician/(tabs)/jobs.tsx`: replaces the outer vertical ScrollView with
  FlatList, stable job-ID keys, six-row render batches, window size seven and the
  original card spacing. The horizontal filters, header, empty state, reason modal,
  availability and all job actions remain. Every matching job stays accessible.
- `scripts/lib/mobile-navigation-workloads.mjs`,
  `scripts/mobile-navigation-probe.mjs`, `scripts/tests/mobile-navigation.test.mjs`:
  reproducible measurements and behavior/security regression checks.
- `scripts/tests/technician-access-ui.test.mjs` and
  `scripts/tests/service-categories.test.mjs`: provide the existing authoritative
  session fixture to Home; retain the prior assertions.
- `scripts/check-performance-types.mjs`: includes customer Profile in the mobile
  performance TypeScript scope.

Root and role layouts already retain visited lazy tabs. ProtectedRoute already
uses the root session observer rather than issuing navigation-time authorization
reads. Neither routing hierarchy nor those gates was changed. The root account
observer still requires server snapshots and current Auth authority, handles
revocation and blocks protected content during failed checks. No authorization
decision cache or extra memo wrappers were introduced: React Compiler is already
enabled in `app.json`.

Technicians, customer Requests, technician History, reviews and notifications
already use FlatList with bounded render batches; the directory and review head
queries are bounded. The existing own-request streams remain account-scoped but
read the account's complete request history. This task does not silently truncate
them: true server history pagination needs a separate design preserving dashboard
totals and realtime transitions.

The subscription pool and its auth-scoped cleanup were preserved. Its existing
13-consumer workload uses six SDK listeners and releases all six, both before and
after. Two identical directory consumers share one registration and one current
approval read for the one-document fixture; final cleanup leaves zero listeners.
The review resume probe observes one refresh on foregrounding and zero remaining
AppState handlers after blur. New tests additionally simulate 30 same-session
profile/tab renders without restarting the dashboard's three subscriptions.

Map directory/location listeners intentionally revalidate on focus and foreground;
this can contribute to development loading, but removing that validation without
device evidence could display revoked or unavailable locations. Those paths,
marker freshness, district geometry, GPS permission/sharing controls, job evidence,
signature coordinate conversion, safe-area/keyboard handling and image sizing/
existing image-cache policy were inspected and preserved. No image decoding or
map initialization bottleneck was established by these headless measurements.

## Validation

- `node scripts/check-performance-types.mjs`: passed, including all changed mobile
  screens and imported Auth/GPS dependencies.
- Targeted ESLint for the four screens, new scripts/tests and changed test/type
  helpers: passed with zero warnings.
- Headless regression selection: **159/159 passed**, including seven new mobile
  performance checks plus session/auth persistence and revocation, subscription
  cleanup, GPS account switching, map loading/actions/freshness, geographic
  distance, signature mapping, availability, categories, reviews and notifications.
  Full TAP output: `.expo/mobile-navigation-headless.log`.
- Root `tsc --noEmit --incremental false`: six errors in the existing Admin Worker
  and decision-email tests (ExecutionContext type, Node/DOM URL types, unknown
  catch parameters). A TypeScript compiler-host run substituting the saved four
  baseline screen sources reproduced the same six file/code/line diagnostics.
  These unrelated files were left untouched.
- Two emulator-only suites were initially included in the larger command:
  `availability-booking.test.mjs` and `map-location.test.mjs`. Both refused to start
  because loopback Firebase emulator environment variables were absent. They were
  excluded from the 159 passing headless checks; they are **not claimed as passed**.
  Their safety guards prevented production access. No emulator integration run was
  performed for this change.
- The older `scripts/performance-render-probe.mjs` failed before product edits
  while importing native Expo TypeScript into Node (`ERR_UNKNOWN_FILE_EXTENSION`).
  It is not used for the new comparison or claimed as passing.
- `git diff --check`: passed.

No connected device was available: the initial sandbox ADB daemon attempt failed;
the host ADB check started successfully and returned an empty device list. No
native Android project or local APK/AAB artifact was present. Therefore native
screen mounting/React commits, transition latency, dropped frames, resident memory,
real device offline/reconnect and repeated native navigation remain unverified.
Headless lifecycle tests are not evidence of a native memory plateau. Expo Go/dev
bundle/module loading, debug checks and Metro/Fast Refresh overhead were not timed,
and must not be confused with standalone release performance.

## Manual device verification still required

Use a local release/profile build when one is available. Compare the saved baseline
and changed source on the **same device, build mode, fixture dataset, network and
permissions**. Keep production records untouched; use loopback demo Firebase
emulators with the Android reverse-port setup from the existing local launcher.
Use one Metro server only for the development comparison. Confirm emulator routing
explicitly; an Android emulator alone must not select Firebase Auth Emulator.

1. Warm the app once, then record 30 cycles through Customer Dashboard → Technicians
   → Map → Requests → Profile and back. Repeat with rapid tab taps and system Back;
   confirm filters, list scroll and profile state survive. Include directory paging
   and a technician profile/review page. Record cold first visits separately from
   warm switches with React Native DevTools Profiler and Android frame metrics.
2. In an isolated approved technician account, cycle Dashboard → Jobs → History →
   Profile, open/close job details and its evidence/signature screens, and test
   accept/start/reject/cancel flows against demo data. Scroll a large Jobs fixture
   and confirm all records remain reachable, spacing matches and modal text input
   retains keyboard behavior. Check availability changes update row actions.
3. Background/resume repeatedly; toggle connectivity and retry. Map refresh should
   revalidate rather than show invented coordinates; stale/absent/OFF locations and
   permission denial must keep their existing behavior. Verify reviews and booking
   status changes propagate while tabs are retained.
4. Switch accounts, sign out, and revoke access through isolated fixtures while a
   query is pending. Confirm private profile/request/notification data disappears,
   late responses cannot restore it, and foreground GPS sharing cleans up.
5. Compare active Firestore listeners at equivalent points after 1, 10 and 30 cycles
   using local emulator request diagnostics. Capture memory with Android Studio's
   Memory Profiler (or `adb shell dumpsys meminfo com.sahanwickramasingha.servicepilot`)
   at those same points after idle/GC. Record allocations retained by inactive
   screens; do not infer memory behavior solely from listener counts. Capture
   `adb shell dumpsys gfxinfo com.sahanwickramasingha.servicepilot framestats` for
   equal scripted navigation sequences. DevTools profiling adds overhead, so compare
   like-for-like profiling builds and verify release behavior separately.

## Release requirements

No Firestore Rules/indexes, backend, hosting deployment, migration or new dependency
is required. These are bundled mobile JavaScript changes. A newly built APK/AAB is
needed to include them in the installed standalone app under the current release
setup. No local or remote APK build was started.
