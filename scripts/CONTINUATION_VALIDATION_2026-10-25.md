# ServicePilot continuation — 2026-10-25

Scope: the pasted continuation request, merged with root AGENTS.md. `rg --files
-g AGENTS.md` found no nested instruction files. Initial Git status was clean;
HEAD was `10da5d52249465f0e70c7fc8af85f44d7972bc33`, matching the handoff. The
job-action screen calculates elapsed time through `workElapsedMs` and persists
Pause/Resume through `setJobTimerPaused`. No completed feature was replaced.

## Initial audit and final disposition

| Area | Initial classification and evidence | Disposition |
| --- | --- | --- |
| Signature alignment | Complete locally: `signaturePoint` in `src/utils/signatureCoordinates.ts`, capture in `src/components/jobs/JobEvidenceScreen.tsx`, `SignaturePreview` in `JobEvidenceView.tsx`. Shared canonical dimensions, inverse centered SVG transform, stroke inset, relayout stroke separation and scroll locking already exist. | Verified existing dimension/edge, empty/clear/save/reload and component tests; no rewrite. Native touch verification NOT RUN. |
| Direct Auth-switch cleanup | Partial: `installLocationAuthGuard` in `src/firebase/locationAuthGuard.ts` calls `ForegroundSharing.prepareAuthChange` before SDK identity replacement; generation guards cancel GPS work. Initial OFF-but-unconfirmed cleanup bypassed the guard, and queued revocations lacked a generation check. | Both races fixed in `src/utils/foregroundSharing.ts`; added regression tests. Existing stale-marker warning and 120-second freshness remain. |
| Cross-booking overlap | Partial: policy and authoritative enforcement already exist in `functions/src/domain/scheduling.ts`, `createBookingScheduleService.change`, and Firestore Rules. Exact retries of legacy schedule review incorrectly conflicted after a lost acknowledgement. | Exact identical review retries now return without writes/notifications; changed intervals still conflict. Concurrent acceptance/rescheduling, adjacency and legacy blocking are tested. |
| Android OS push | Blocked: no approved delivery design/configuration, installed `expo-notifications`, client token registry or trusted sender. Firestore notification streams are in-app only. | Existing concrete proposal retained in `ANDROID_PUSH_DESIGN.md`; no SDK/sender deployment or real push. Required decisions below. |
| Notification history | Partial: `connectNotificationHistory` in `src/services/notificationHistory.ts` already bounds queries, orders timestamp/ID, joins scoped receipts and scans all history for explicit totals/Mark all. Boundary retention used a single get, so later read/deletion/audience changes could leave stale cards. | Boundary rows now have bounded, session-scoped live document listeners. Unverified/inaccessible rows are hidden. Unit and real Rules tests added. |
| Latest-snapshot validation | Partial: previous `.expo/workflow-final/2026-10-23T15-47-26-040Z/manifest.json` records a different HEAD and `snapshotUnchanged:false`; its counts cannot validate this source. | Complete for required scoped checks: fresh snapshot unchanged, all required commands exit 0. Separate existing full-project failures remain. |
| Android release readiness | Partial: Expo/native dependencies and foreground permission setup exist; application/build/signing/production configuration and native verification remain. | Preparation completed in `ANDROID_RELEASE_READINESS.md`; APK build/release remains unverified. |

## Confirmed fixes and boundaries

Location: even locally OFF sharing must finish unconfirmed initial remote cleanup
before changing credentials. Queued revocations now check both session generation
and UID immediately before calling the adapter, and cannot mark a later same-UID
session remotely cleared. Old watchers, heartbeat timers, deferred writes and GPS
acquisition still cancel locally. Normal replacement waits behind in-flight writes
and confirmed OFF. Already-replaced external identities cannot cancel a write
already submitted to Firestore or guarantee offline removal; they cancel queued
work and disclose residual approximate markers. No account-A cleanup writes using
account-B credentials. New sessions remain opted out, including after reactivation.

Scheduling: the latest repository report `REMAINING_WORK_VALIDATION.md` records
explicit approval after the older policy-blocked `BOOKING_CONSISTENCY_VALIDATION.md`.
The implemented policy requires explicitly selected positive whole-minute duration,
capacity one for overlapping half-open `[start,end)` intervals, no buffer, adjacent
slots allowed, Asia/Colombo civil times, and reservations in `accepted`, legacy
`assigned`, and `in_progress`. Pending/requested jobs reserve nothing. Terminal
states release reservations. Customer proposals replace accepted intervals only
after technician approval. Unknown legacy intervals block acceptance until explicit
review; none are inferred or migrated. The trusted transaction reads/writes the
same technician lock and commits deterministic notices with the booking. Direct
client acceptance/schedule edits are denied. More than 500 active records per
identity query fail closed for review. This continuation adds no scheduling policy.

History: a source has at most `20 * requested page count` retained document
listeners, in addition to its bounded page listeners. Receipt queries stay in
groups of 20 loaded system IDs. Re-entry into a page releases its retained
listener; withdrawal/deletion, authorization loss, account change and stop clean
up listeners. Excess boundary movement explicitly requests a refresh. No Rules,
indexes or private-document permissions were widened. Recent unread dots are not
total counts. Check unread total and Mark all still scan ALL eligible history in
bounded pages; the cost scales with history. Count changes invalidate the result
and require an explicit retry. Integration tests now honor that existing contract
when receipt acknowledgements arrive during a scan. Continuous scalable exact
totals still need an approved trusted inbox/counter projection; none was added.

## Changed files, grouped by feature

- Auth/location: `src/utils/foregroundSharing.ts`,
  `scripts/tests/auth-switch-location.test.mjs`.
- Notification history: `src/services/notificationHistory.ts`,
  `scripts/tests/notification-history.test.mjs`,
  `scripts/tests/notification-history-emulator.test.mjs`.
- Scheduling retry: `functions/src/services/booking-schedule.service.ts`,
  `scripts/tests/scheduling-emulator.test.mjs`.
- Validation/release preparation: `scripts/validate-workflow-snapshot.mjs`,
  this report, `scripts/ANDROID_RELEASE_READINESS.md`.

Signature implementation, review names/ratings, evidence/signatures, timer,
booking submission idempotency, role boundaries, map projections, freshness,
service areas and notification navigation remain in their existing paths.

## Recorded validation

Final run: **all required scoped checks passed**, runner exit **0**, source
snapshot unchanged **true**. HEAD remains
`10da5d52249465f0e70c7fc8af85f44d7972bc33`. Recorded from
2026-10-25 16:28:27 to 16:33:38 UTC (21:58:27–22:03:38 Asia/Colombo).

Manifest: `.expo/workflow-final/2026-10-25T16-28-27-106Z/manifest.json`.
The exact commands, process exit codes and logs are stored there. Command used
from repository root:

```powershell
node scripts/validate-workflow-snapshot.mjs
```

The ignored `.expo/workflow-final/<UTC timestamp>/manifest.json` records HEAD,
upstream ahead/behind, before/after Git status, changed files, source/test/Rules/
config SHA-256 hashes, exact commands, exit codes and separate logs. It checks
that executable source hashes are unchanged at the end. Report-only Markdown is
outside that executable-source hash set. Do not substitute earlier counts.

| Recorded check | Actual result | Exit code |
| --- | --- | --- |
| Scoped workflow TypeScript | Pass | 0 |
| Changed mobile source lint | Pass | 0 |
| Changed test/runner script lint | Pass | 0 |
| Functions/backend TypeScript build | Pass | 0 |
| Changed backend source lint | Pass | 0 |
| Headless regression suite | 235 tests, 235 pass, 0 fail/skipped | 0 |
| Auth/Firestore/Storage workflow integration | 69 tests, 69 pass, 0 fail/skipped | 0 |
| Account-lifecycle emulator integration | 15 tests, 15 pass, 0 fail/skipped | 0 |
| Reset-site staging + Auth/Hosting integration | Staging pass; 4 tests, 4 pass, 0 fail/skipped | 0 |
| Git diff whitespace check | Pass | 0 |
| Full-root TypeScript baseline | 22 existing diagnostics | 2 |
| Full Functions lint baseline | 4 existing indentation errors | 1 |

The full-root diagnostics match the earlier checked-in source baseline: Admin Web
Vite/import/asset types, OTP Cloudflare test types, and legacy template theme/hook
aliases. The four full Functions lint errors remain at
`functions/src/domain/availability.ts:12–15`. Those files were not changed; neither
baseline is presented as passing or as an Android release certification.

Selected SHA-256 hashes (the manifest includes all relevant source/tests/config):

| File | SHA-256 |
| --- | --- |
| `src/utils/foregroundSharing.ts` | `51ede86f4447d672dfa257b77af66253255be1f9e7266d8cb51bda991044cdbc` |
| `src/services/notificationHistory.ts` | `2620ffaa451767f0db1436fa25961035af78f8847c47f51461cb3b96e767d495` |
| `functions/src/services/booking-schedule.service.ts` | `aad92be97187a930aff7c4f508cd4646c1155bac06983c7b975ef17993c3e2dd` |
| `scripts/validate-workflow-snapshot.mjs` | `b6d719748e5d79cf5bd1aac8f76044341c2a4e321b58267e1c7dcd0529797808` |

Java 24 emitted deprecated-Unsafe/rules-runtime shutdown warnings after the
successful test-script outcomes. The manifest records actual CLI and script exits
and cleanup of only each run's owned Firestore PID; final cleanup errors are empty.
No production Firebase command was run. Markdown results were finalized after the
run; executable source remained unchanged, and a final diff whitespace check was
run again after documentation updates.

Checks include scoped workflow TypeScript; changed mobile/test/backend lint;
Functions build; headless auth, rating/review, evidence/timer, scheduling, map,
notification and GPS regressions; Auth/Firestore/Storage integration; lifecycle
integration; hosted reset integration; full-root TypeScript/full-Functions lint
as separately reported baselines; and `git diff --check`.

Negative integration coverage includes foreign accounts, inactive accounts,
revoked approval, completed-job edits, forged timestamps/timer state, malformed
evidence, stale revisions/sessions, concurrent bookings/reviews/timer writes,
private Storage access, approximate/precise GPS separation and sharing OFF/expiry.

Development run `2026-10-25T16-00-03-455Z` had 234/234 headless checks and
68/69 integration checks pass. The failing total-count assertion assumed no
receipt update could arrive during a scan; the service correctly invalidated it.
The test now retries only that explicit invalidation, at most five times. Java 24
left that run's Firestore process alive and blocked the following lifecycle suite.
The runner now records ownership while its Firestore server is listening and
cleans up that owned process with PowerShell after shutdown (`taskkill` returned
Windows Access denied). The boundary integration fixture also waits for its new
seeded head before capturing cursors: an older SDK cache page is not evidence
that the new fixture's history has loaded. A separate background-during-Auth-switch
regression ensures foreground lifecycle cancellation cannot skip the required
same-account OFF write. The runner also skips empty changed-file lint
scopes instead of accidentally linting an entire tree. The failed development
run is not the final validation result.

## Blocked decisions and manual checks

Actual push: approve provider (proposal: Expo Push Service/FCM v1), existing
standalone worker host/operator, queue/read/retry budget, installation/token schema
and retention, Android/Expo project ownership and credentials. The proposal covers
rotation/multiple devices, account-switch/logout/offline unregister, authoritative
recipient checks, invalid-token quarantine, durable delivery claims, bounded
retries/receipts and session-authorized cold/foreground/background navigation.
No sender has been implemented or approved. No push success is claimed.

ADB at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` returned no attached
devices in this session. ALL new Android UI/device checks are **NOT RUN**. Exact
two-emulator setup and test steps are in `ANDROID_RELEASE_READINESS.md`. Unit and
Firebase emulator success cannot establish physical GPS, camera UI, native touch,
real push delivery or production readiness.

Service-area catalogue was unchanged: four Kandy postal localities from GeoNames
CC BY 4.0, with limited coverage and technician-provided Other for all 25 districts.
See `functions/src/domain/SERVICE_AREA_DATA.md` for provenance and limitations.
Service locality never supplies current GPS or customer distance. No migration is
necessary for these changes, and no live records were read or modified.

## Deployment and Git

Review-only deployment commands, rollout compatibility and APK prerequisites are
in `ANDROID_RELEASE_READINESS.md`. No commit/amend/push, deploy, APK/remote build,
billing change, real push, live migration or production-data write was performed.
Final local `main` versus cached `origin/main` is **ahead 0 / behind 0**. No fetch
was performed, so this is not a claim about newer remote state. Final working
tree: **8 modified tracked files and 2 untracked Markdown reports**, exactly the
10 files listed above. All changes remain uncommitted. The final manifest records
the same complete changed-file list and before/after Git status.
