# Backlog 2–10: local workflow validation (2026-10-22–23)

**Historical baseline below.** The subsequent tasks 1–6, approved scheduling
policy, new checks and final source-hash manifest are recorded in
[REMAINING_WORK_VALIDATION.md](REMAINING_WORK_VALIDATION.md). The 133/61 results
below are not the results of that follow-up run.

Root AGENTS.md and the attached backlog were read. No nested AGENTS.md files were
found. Git was clean at the start. The existing rating reconnect fix, reviews,
attachments, booking receipts, account lifecycle, subscriptions, manual availability,
service areas, map privacy and Admin Web were preserved. No commit, push, release
build, deployment, billing change, production write or migration was performed.

## Item status and actual changes

| Item | Status | Evidence / limitation |
| --- | --- | --- |
| 2–3 Photos | Implemented locally | Existing camera/library, JPEG upload, durable stage paths, preview/removal, progress, retry and customer viewing retained and tested. Permission errors now retain their actionable message. Native camera/gallery UI not exercised. |
| 4 Notes | Implemented locally | Existing validated persisted notes retained. Added dedicated server `notesUpdatedAt`; author is the immutable evidence `technicianId`. Form failure/reopen checks added. |
| 5 Signature | Implemented locally | Existing actual responder/SVG stroke capture retained; drawing now locks scrolling and refuses responder termination. Safe areas and keyboard avoidance added. Service acknowledgment wording; no legal identity claim. Native gestures not exercised. |
| 6 Progress/completion | Implemented locally | Checklist reads confirmed saved evidence, not selections or local flags. Existing all-four-required policy is explicit in Job Action and enforced in service and Rules. Added reopen/checklist checks and completion/timer concurrency handling. |
| 7 Timer | Implemented locally | Replaced callback counting with durable server timestamps, revisioned Pause/Resume, completion finalization and legacy start handling. Informational only. |
| 8 Overlap | **Blocked: product policy missing** | No end/duration/capacity/reservation/rescheduling policy exists. Current tests deliberately allow multiple jobs, including identical preferred starts. No restriction was invented. |
| 9 Notifications | In-app fixed/verified; OS push unavailable | Atomic deterministic lifecycle notifications, recipients/read state, shared retry/cleanup and role-specific navigation retained and tested. Offline read receipts no longer block opening a request/job. No push sender, token registration, expo-notifications or FCM build configuration exists. |
| 10 GPS/map lifecycle | Locally verified | Existing foreground sharing, cleanup, throttling, session guards, freshness, approximate distance and private/public separation retained and tested. Native GPS/permission transitions not exercised this run. |

The principal new defect was screen-local elapsed time. New timer writes live on
the existing request as `workTimer = { elapsedMs, runningSince, pausedAt, revision }`.
Starting a job records a server `runningSince`. Pause records server `pausedAt`
without using the device clock to commit duration. Resume folds the difference of
those two committed timestamps into elapsedMs and records a new server start.
Rules independently verify the arithmetic, ownership, approval, state, revision
and server timestamps. Millisecond conversion truncates sub-millisecond precision
consistently with Rules. Intervals only refresh the display; they never write.

Backgrounding does not pause work. Completion freezes a running timer in the same
transaction as status and notification. Already-paused timers remain frozen.
Existing cancellation states are preserved (technician cancellation is permitted
before start); finalization also preserves any existing timer. Legacy in-progress
jobs use their saved startedAt when pausing. A legacy job without a start shows
Unavailable rather than receiving invented history. Historical completed records
remain readable, with no backfill or retroactive invalidation. Running display time
uses device time between saved timestamps and is informational, never billing/payroll.

Emulator checks exposed stale Rules evaluation during concurrent timer mutations.
Pause/Resume reconciles only a fresh server record with the exact intended revision
and state. Status transitions may retry once in a new transaction, rechecking all
accounts, ownership, state, evidence and availability guards. This does not alter
the booking policy or produce extra notifications. Other failures remain errors.

Maximum-size evidence also exposed Rules expression-budget pressure. Validation
helpers share values instead of repeating identity/profile/part expressions; all
field, range, type, role and legacy-identity restrictions remain enforced.
Map keys and text trimming reject incorrect types directly. Malformed maps,
numeric/array names, fractional/string/out-of-range quantities and injected fields
have explicit negative emulator coverage. Account/job preflight server reads are
outside the evidence revision transaction; Rules recheck both authoritative
documents at commit. Tests change approval eligibility/job state after preflight
and verify that no stale evidence can commit.

Notification taps previously awaited read-receipt writes, which Firestore can
queue indefinitely offline. Both roles now initiate that write independently and
open their authorized destination without waiting. Session/unmount checks still
guard navigation and asynchronous error feedback; persisted read state alone
controls unread counts. Missing/inaccessible destinations retain their existing
protected request-screen feedback. No OS notification delivery is claimed.

## Evidence policy, privacy and limits

- Photos: 1–3 per stage; JPEG/PNG/WebP input, 15 MiB maximum source, 50 MP maximum
  decoded dimensions; resized to at most 1600 px on the longest edge, JPEG quality
  0.8, maximum 5 MiB output. Inspect the expanded preview for legibility before save.
  These reuse the existing review image preparation, not its public paths.
- Durable private Storage paths:
  `job_photos/{technicianId}/{requestId}/{before|after}/{attemptId}/{slot}.jpg`.
  Immutable attempt paths prevent overwrites; retries reuse them. No download-token
  URL is stored. Downloads use authenticated Storage access.
- `job_evidence/{requestId}` stores paths, notes, actual SVG signature strokes,
  customer name/confirmation, author/participant IDs, revision and server times.
  It is separate from review photos and public technician documents.
- Before photos are editable for accepted/legacy assigned/in-progress jobs. Notes,
  after photos and signature are editable only in progress. Completed evidence is
  read-only. Customer viewing is in their existing Request Details screen. Other
  customers/technicians and dispatchers cannot view evidence; existing Super Admin
  oversight remains. Authenticated role/lifecycle checks are enforced by Rules.
- Diagnosis and work completed are required, each ≤3000 characters. Recommendations
  are optional, ≤3000 characters. Parts are optional, at most 10, name ≤100 characters,
  integer quantity 1–999. New/changed notes must carry a server timestamp; existing
  unchanged legacy notes without a dedicated timestamp remain compatible.
- Signature requires a name, drawn stroke path and explicit customer confirmation;
  empty capture is rejected. The path is private participant evidence, not a typed
  name used as a signature. It is a service acknowledgment, not identity verification.
- Only safe new unreferenced uploads may be cleaned up. Storage denies deletion of
  referenced evidence. Ambiguous/offline cleanup retains objects for safe retry;
  unreachable abandoned attempts can remain as orphans. No bucket sweep was added.
- Completion requires all four saved evidence records, the pre-existing UI policy.
  The client verifies uploaded object metadata before acknowledging photo save.
  Firestore Rules validate evidence references but cannot inspect Storage bytes;
  these checks do not establish evidentiary authenticity or actual handwriting.

## Checks actually run

- **133/133 headless tests passed** in the final combined run: evidence forms,
  photo preparation/retry, notes/signature persistence, saved checklist, timer
  restoration, booking policy, notifications (including pending offline receipt),
  GPS/session cleanup, permissions, freshness/distance, reviews and subscriptions.
- **61/61 Auth/Firestore/Storage emulator tests passed** in the final combined
  run: 8 job evidence/timer tests, 14 booking/availability, 15 map/location/privacy,
  19 reviewer/rating/notification tests, and 5 review/Storage tests. These include
  malicious clients, maximum evidence size, timer races, historical compatibility,
  stale preflight rejection, immutable uploads and account/role boundaries.
- Workflow-scoped mobile **TypeScript passed**. Functions **build passed**.
  Functions changed-domain **ESLint passed**. Mobile changed-file **ESLint passed
  with 0 errors and 2 existing generation-ref cleanup warnings** in Job Action and
  JobEvidenceScreen. **git diff --check passed**.
- Full root TypeScript failed in unchanged Admin Web/Vite/assets, OTP Cloudflare
  test types and template theme/parallax aliases. Those paths are outside this
  change and match earlier validation reports. Full Functions lint reported four
  existing indentation errors in `functions/src/domain/availability.ts:12–15`;
  changed-domain lint passed. These failures were not hidden or fixed as unrelated
  cleanup. Raw task check logs are retained locally under ignored
  `.expo/workflow-validation/`.
- ADB reported **no attached devices**. Native/device checks below are **NOT RUN**.
  Earlier failed iterations located expression-budget/concurrency defects and one
  invalid nested-array test fixture; only the final passing runs are counted above.

Reproduce headless checks:

```powershell
node scripts/check-workflow-types.mjs
npm.cmd --prefix functions run build
node --test scripts/tests/job-evidence.test.mjs scripts/tests/work-timer.test.mjs scripts/tests/gps-lifecycle.test.mjs scripts/tests/notification-recovery.test.mjs scripts/tests/foreground-sharing.test.mjs scripts/tests/device-location.test.mjs scripts/tests/customer-map-location.test.mjs scripts/tests/booking-policy.test.mjs scripts/tests/service-areas-distance.test.mjs scripts/tests/map-view-actions.test.mjs scripts/tests/rating-recovery.test.mjs scripts/tests/review-photo-picker.test.mjs scripts/tests/review-submission.test.mjs scripts/tests/subscription-reliability.test.mjs scripts/tests/account-session.test.mjs scripts/tests/technician-rating.test.mjs
npx.cmd eslint src/components/jobs/JobEvidenceScreen.tsx src/services/jobEvidence.service.ts src/services/request.service.ts app/technician/job-action.tsx
git diff --check
```

Isolated automated Rules/Storage regression ports are 8387/9397/9497; the normal
manual app demo configuration remains 8187/9197/9297. Use fresh demo data:

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = '1'
$env:DEBUG = ''
$env:CI = '1'
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.workflow-test.json --only auth,firestore,storage --log-verbosity QUIET "node --test --test-force-exit --test-timeout=90000 scripts/tests/job-evidence-emulator.test.mjs scripts/tests/availability-booking.test.mjs scripts/tests/reviewer-names.test.mjs scripts/tests/review-storage.test.mjs scripts/tests/map-location.test.mjs"
```

`--test-force-exit` is limited to the Node emulator harness after its tests/hooks;
it does not test or replace app listener cleanup. Java 24 on this host emits
deprecation/shutdown warnings and can leave its Firestore process listening after
CLI shutdown. Stop only the process created by that run before reusing its ports.
Do not stop unrelated local emulators.

## Two Android sessions, one Metro server — NOT RUN

ADB reported an empty device list. No new camera UI, native signature gesture,
physical GPS, OS push, background/cold-launch or accessibility-layout success is
claimed. Use disposable Customer/Technician fixtures only:

1. Terminal A:

   ```powershell
   $env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
   $env:DEBUG = ''
   firebase.cmd emulators:start --project demo-servicepilot-review-author --config firebase.review-author-test.json --only auth,firestore,storage
   ```

2. Terminal B:

   ```powershell
   $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
   $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
   node scripts/seed-booking-emulator.mjs
   $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
   $env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1'
   npx.cmd expo start --localhost --port 8081
   ```

3. Terminal C, replace serials if needed:

   ```powershell
   $workflowAdb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
   & $workflowAdb devices
   foreach ($workflowDevice in @('emulator-5554', 'emulator-5556')) {
     foreach ($workflowPort in @(8081, 8187, 9197, 9297)) {
       & $workflowAdb -s $workflowDevice reverse "tcp:$workflowPort" "tcp:$workflowPort"
     }
     & $workflowAdb -s $workflowDevice shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
   }
   ```

4. Technician: `booking-tech@example.test`; Customer:
   `booking-customer-a@example.test`. Disposable fixture password:
   `Only-for-booking-emulator-42`. Save Available manually; it must remain independent
   of GPS and jobs. Save Kandy/Peradeniya in Technician Personal Information, reopen
   it and verify persistence. An older profile without a locality shows district only.
5. Customer chooses that technician directly and creates a future booking. Verify
   one technician notification despite repeated Submit. Accept on Technician, then
   start. Customer gets each intended notification, correct request ID and unread
   count; tapping opens that account's request. Repeat reject/customer cancel/
   technician cancel on separate bookings, including read-all and reconnect cases.
6. Before Photos: deny camera permission, use library, cancel selection, choose an
   unsupported/oversized image, then valid photos. Preview/remove selections. Save
   with network interrupted; verify no false success, selections remain, safe retry,
   no duplicate uploads. Reopen/restart: saved photos persist. Customer expands only
   their own evidence. Confirm another Customer/Technician cannot access paths.
7. Notes: reject blank diagnosis/work, invalid quantities, and excessive text. Save
   with parts and without parts/recommendations; retry after a disconnect; reopen
   to confirm values. Checklist must change only after successful persistence.
8. After Photos: repeat save/retry/reopen. Signature: reject empty capture, draw
   across the pad without scrolling, clear, redraw, confirm, save and reopen. Test
   large fonts, a small screen, keyboard focus and safe areas. Customer sees saved
   signature and notes; review photos remain separate.
9. Observe duration, navigate away/back, background and force-restart the app.
   Running time must continue. Pause, wait, navigate/restart, resume: paused duration
   is excluded. Duplicate taps and two Technician sessions cannot duplicate timing.
   Complete with one missing step: rejected. Save all steps and complete: status,
   notification/history and frozen duration agree; availability stays unchanged.
   Test network loss and an account switch during upload/save/completion. Legacy
   completed jobs stay readable, and missing legacy start time is unavailable.
10. In Extended Controls > Location set the existing verified Kandy fixture
    (7.290612, 80.633701), enable sharing and confirm save. Customer selects Kandy:
    wrench/card/Profile/Request actions must point to this technician. Move mock GPS
    to the existing Walapane fixture (7.0955, 80.8615); after the 60-second minimum
    write interval provide a fresh fix. Kandy results stay eligible, while the GPS
    marker remains near Walapane with the outside-district note/Show location action.
    These test fixtures are documented in [GPS trace validation](GPS_COORDINATE_TRACE_VALIDATION.md).
11. Request customer foreground location for approximate straight-line distance;
    repeat with denied/revoked permission. No centre-based or stale distance.
    Turn sharing OFF, then test logout, account switch, background, revoked GPS,
    disabled location services, offline/reconnect and local lifecycle disable/delete.
    Tracking stops; fresh public eligibility disappears under the existing policy.
    Offline removal may await reconnect/expiry (120 seconds); never promise immediate
    server removal without a connection. Reactivation/login must not enable sharing.
12. Submit a real local review with an attachment after completion. Confirm real
    reviewer names, aggregate reconnect, review image viewing and technician notice.
    Restart/background each app to check in-app notification catch-up. OS tray and
    push cold-launch tests remain blocked until push infrastructure exists.

## Android and pending product/configuration decisions

Installed Expo 54 / React Native 0.81.5 targets Android API 36 with **minimum API 24
(Android 7.0)**, from `node_modules/react-native/gradle/libs.versions.toml`. There is
no app minimum override. No claim is made about every Android version or device.
The image-picker 17 native module uses the system photo picker and requests CAMERA
only for capture; no broad photo-library or microphone permission is requested by
these screens. Existing Expo plugin disables microphone. Foreground location uses
expo-location 19; no background location/service is enabled. Android 13 notification
permission is not requested because no OS-push client exists. See official
[Expo image-picker documentation](https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/)
and [Rules timestamp conversion](https://firebase.google.com/docs/reference/rules/rules.Timestamp#toMillis).

Before any Android release build, confirm Android SDK/JDK/native toolchain, package
identifier, Google Maps key, Firebase configuration, camera manifest/plugin output
and permitted device versions. No prebuild, APK or release build was started here.

Item 8 needs: per-service/job duration or explicit end, buffers, capacity, reserving
statuses, timezone interpretation, adjacent-interval rules, cancellation releases,
rescheduling authority, and atomic create/accept/reschedule semantics. No current
reschedule entry point or interval ledger exists. Keep overlap prevention blocked
until those decisions are supplied; then implement one transactional reservation
policy at all write entry points with concurrent/adjacent/released-slot tests.

OS push needs a product decision to add it, plus an approved trusted delivery path.
Local preparation required after that decision: compatible expo-notifications/
device token registration, participant-scoped token rules and cleanup, native plugin
and Android channel/permission setup, FCM/build credentials and a trusted sender
using deterministic event delivery IDs. A sender must consume committed events,
not send from untrusted clients. Configure cold-launch authorization/navigation and
test real delivery on a development build. No sender or deployed/paid dependency
was introduced, no credentials were generated, and Firestore documents are not
claimed as proof of push delivery.

## Changed files and later deployment — review only

- Evidence UI/audit: `src/components/jobs/JobEvidenceScreen.tsx`,
  `src/services/jobEvidence.service.ts`, `functions/src/domain/jobEvidence.ts`.
- Timer/progress/status: `functions/src/domain/workTimer.ts`,
  `src/services/request.service.ts`, `app/technician/job-action.tsx`.
- Notification navigation: `app/(tabs)/notifications.tsx`,
  `app/technician/notifications.tsx`, `scripts/tests/notification-recovery.test.mjs`.
- Authorization: `firestore.rules` (notes audit, timer arithmetic/transitions and
  expression sharing with equivalent identity/approval checks).
- Checks: `scripts/tests/job-evidence.test.mjs`, `work-timer.test.mjs`,
  `job-evidence-emulator.test.mjs`, `scripts/lib/performance-test-deps.mjs`,
  `firebase.workflow-test.json`, this report.

No new index or migration is needed for notes timestamps or the timer. Existing
Storage evidence rules remain required and passed through the same regression
suite. Coordinate client/Rules rollout: old clients cannot alter timer-bearing
requests without correct finalization or save changed notes without their new
audit timestamp. No deployed Function/backend is required for this workflow.

Exact commands prepared for later explicit approval, **not executed**:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9 --config firebase.json
firebase.cmd deploy --only storage --project servicepilot-756d9 --config firebase.json
# Existing map/review indexes only, if their earlier rollout is still pending:
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9 --config firebase.json
```

No service-area catalogue was added or changed. Provenance/coverage remain in
[SERVICE_AREA_DATA.md](../functions/src/domain/SERVICE_AREA_DATA.md): GeoNames Sri
Lanka postal data, CC BY 4.0, four curated Kandy localities plus technician-provided
Other for all 25 districts. This is not an exhaustive locality catalogue, and
service areas do not provide GPS coordinates or distances.

Final working tree contains only these task changes, all uncommitted. The initial
tree was clean; no unrelated tracked file was modified. Local generated logs were
moved into ignored Expo artifacts and disposable test servers were stopped.
