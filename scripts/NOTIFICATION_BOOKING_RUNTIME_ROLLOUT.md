# Notification and booking runtime repair — 2026-10-30

Follow-up: use [BOOKING_LOCAL_ANDROID.md](BOOKING_LOCAL_ANDROID.md) for the current
tested launcher, process-scoped demo configuration and exact PowerShell commands.
The old seed's legacy blocking job is now opt-in; existing jobs are preserved.

Real-project local server follow-up: see
[BOOKING_REAL_BACKEND_SETUP.md](BOOKING_REAL_BACKEND_SETUP.md) for the implemented
booking-only profile, dedicated IAM/credential checks and HTTPS startup commands.

## Diagnosis and local changes

The checkout was clean before this work. No production data/configuration, billing,
deployment, commit or push was changed. R2 photos, evidence, timers, signatures,
reviews and role rules were not edited. No migration is necessary.

Notification subscriptions use `src/services/notificationHistory.ts` through
`notification.service.ts`: top-level **collection** queries (not collection-group),
`createdAt DESC`, document ID DESC, `limit(20)` and `startAfter(documentSnapshot)`.
Personal notifications filter `userId == authenticated UID`; system messages use
`audienceRoles array-contains role` and separate `status == active` / `sent` queries.
History, unread sweeps and mark-all use the same bounded page builder. Receipts
are scoped to the viewer and groups of up to 20 message IDs. Retry and account
cleanup are unchanged; missing-index errors are still visible with explicit Retry.

`firestore.indexes.json` ALREADY declares both required COLLECTION indexes:

- notifications: userId ASC, createdAt DESC, __name__ DESC.
- system_messages: audienceRoles CONTAINS, status ASC, createdAt DESC, __name__ DESC.

`firebase.json` references that file, and `.firebaserc` targets servicepilot-756d9.
The reported missing-index errors therefore indicate indexes unavailable in the
runtime database (absent, building, or a different deployed target). Production
readiness was not inspected remotely. The new test captures actual head/cursor
queries for customer and technician and checks them against the configured index
file. All other indexes are preserved byte-for-byte.

Booking creation already atomically writes a deterministic notification in the
same transaction as the request and immutable submission receipt. The recipient
is the approved public projection's `technicianId`, required to equal the selected
technician UID. The emulator regression now also checks that exactly one creation
notice exists, has type `new_customer_request`, and addresses the selected actual
Firebase Auth user even after concurrent submissions from two devices.

The acceptance error came from `src/services/bookingSchedule.service.ts` before
any HTTP call. Neither `.env.local` nor the task shell configured
`EXPO_PUBLIC_BOOKING_API_URL`. `request.service.ts` delegates acceptance exclusively
to that client. `functions/src/dispatcher-main.ts` wires the trusted scheduler into
`dispatcher-server.ts` at POST `/v1/bookings/schedule`; it is deliberately NOT
exported from `functions/src/index.ts`. There is no acceptance feature flag or
missing callable Function to deploy. See `ANDROID_RELEASE_READINESS.md` for the
existing standalone-host design.

Local changes add explicit configuration validation, actionable errors before
token/network access, HTTP allowance only for explicit demo mode on known local
hosts, and session checks after response decoding. Authentication, ownership,
approval, availability, customer eligibility, lock serialization, overlap bounds
and deterministic backend notices are unchanged. A failed preflight/rejected
transaction leaves the pending booking unchanged. A timeout/lost acknowledgement
can occur AFTER commit: reopen or retry the same action to confirm, never claim
the booking necessarily stayed pending in that case.

## Missing configuration and sources

- `EXPO_PUBLIC_BOOKING_API_URL`: approved HTTPS base URL of the existing standalone
  Node host/reverse proxy, supplied by the deployment operator. No real production
  URL is recorded/known here; do not substitute an invented Functions URL. Do not
  include `/v1/bookings/schedule`; the client appends it. `.env.booking.example`
  documents the setting. Set it in the mobile build environment or local env file
  without overwriting `EXPO_PUBLIC_PHOTO_API_URL`, then restart Metro with `--clear`
  and reload BOTH apps (rebuild/release installed production bundles).
- Backend: `DISPATCHER_MODE=production`,
  `GOOGLE_CLOUD_PROJECT=servicepilot-756d9`; protected Application Default
  Credentials for the same project, configured server-side by the operator.
- `DISPATCHER_ADMIN_ORIGIN`: exact approved HTTPS Admin Web origin. Optional
  `BOOKING_WEB_ORIGIN`: exact approved HTTPS browser-booking origin if used.
  Native clients do not require a browser CORS origin.
- `PORT` defaults to `8789`; `DISPATCHER_BIND_ADDRESS` defaults to `127.0.0.1`.
  Use the existing approved HTTPS reverse proxy and process supervisor.
- The combined host requires `DISPATCHER_SMTP_HOST`, `DISPATCHER_SMTP_PORT`,
  `DISPATCHER_SMTP_USER`, `DISPATCHER_SMTP_PASSWORD`, `DISPATCHER_SMTP_FROM` in
  production; values come from the operator's SMTP service and secret store,
  never an EXPO_PUBLIC setting. This work did not inspect or print them.
- Production sessions must leave `EXPO_PUBLIC_USE_FIREBASE_EMULATORS` unset/0.
  Running on an Android emulator does not authorize switching Firebase projects.

## Targeted rollout commands — prepared, NOT executed

First inspect existing indexes in the correct default database:

```powershell
firebase.cmd firestore:indexes --project servicepilot-756d9
```

Review that the local manifest includes any remote-only indexes before deploying;
do not approve removal of unrelated remote indexes. Then:

```powershell
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9 --config firebase.json
```

Wait until BOTH required indexes are READY/Enabled in Firestore's Indexes page in
the `(default)` database. CLI deployment completion alone and emulator success do
not prove index readiness. Restart/retry notifications in both production-role
sessions only after rollout approval; verify projectId/databaseId using existing
safe notification diagnostics, without logging payloads/tokens.

No Rules, Storage or Functions deployment is required by this patch. If an
independent comparison confirms existing scheduling Rules were never deployed,
review the whole Rules diff and coordinate the compatible scheduler/client cutover
before this separately authorized command:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9 --config firebase.json
```

Build and start the existing standalone server on the APPROVED host, with the
server variables above already provisioned (do not run this against production
until authorized):

```powershell
npm.cmd --prefix functions ci
npm.cmd --prefix functions run build
npm.cmd --prefix functions run dispatcher:serve
```

The exact remote upload/supervisor/reverse-proxy command cannot be supplied until
the operator identifies their hosting system. `firebase deploy --only functions`
does not deploy this scheduler. No new paid service is introduced by this patch.

## Two Android emulators, one Metro — manual verification pending

Use disposable emulator data. In terminal 1:

```powershell
firebase.cmd emulators:start --project demo-servicepilot-review-author --config firebase.review-author-test.json --only auth,firestore,storage
```

In terminal 2:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-demo.ps1 -Mode Backend
```

In terminal 3, seed explicitly (never production):

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9197'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8187'
node scripts/seed-booking-emulator.mjs
```

In terminal 4:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-demo.ps1 -Mode Mobile
```

In terminal 5, replace serials with `adb devices -l` results:

```powershell
$bookingAdb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $bookingAdb devices -l
foreach ($bookingDevice in @('emulator-5554','emulator-5556')) {
  foreach ($bookingPort in @(8081,8187,9197,9297,8789)) {
    & $bookingAdb -s $bookingDevice reverse "tcp:$bookingPort" "tcp:$bookingPort"
  }
  & $bookingAdb -s $bookingDevice shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
}
```

1. Use SDK-54-compatible Expo Go. Sign in as seeded technician `booking-tech` on
   device A and customer `booking-customer-a` on B (fixture login details are in
   `seed-booking-emulator.mjs`). Set technician availability Available.
2. If an older seed includes a legacy assigned job without an explicit interval, review
   it through the existing schedule panel with a deliberately chosen interval.
   Do not infer a duration or disable the legacy conflict guard.
3. Customer selects that technician and submits a future dated request with an
   explicit duration. Confirm exactly one `new_customer_request` notification with
   `userId=booking-tech`, no dispatcher assignment, correct detail navigation.
   Retry the same submission and confirm no duplicate request/notice.
4. Open both notification screens. Exercise personal notices and active/sent
   role-targeted system messages seeded only into the disposable emulator. Verify
   newest-first order, equal-timestamp pagination beyond 20, unread counts,
   mark-all, Retry, and logout/account switch without prior-account content.
5. Accept the pending request on A. Verify one acceptance notice to customer B.
   Repeat acceptance/retry: no duplicate. Overlapping bookings must be rejected;
   adjacent intervals may succeed. A foreign/disabled/unapproved account cannot
   accept. A rejected transaction leaves status requested/pending.
6. Stop the backend and attempt another acceptance. Verify actionable failure
   and no direct client acceptance. Reconnect/retry the same action to reconcile
   an ambiguous timeout. Restart Metro without the endpoint to test configuration
   failure, then restore via the demo launcher. Both apps must reload after changes.
7. Verify customer R2 request photos, before/after evidence, timer pause/resume,
   signature, completion and review names still work using the existing approved
   photo configuration. Emulator tests do not establish external R2 availability.

These UI/device steps and production index/backend checks were not performed in
this task.

## Checks actually run

- `node --test scripts/tests/booking-transport.test.mjs scripts/tests/notification-history.test.mjs scripts/tests/notification-recovery.test.mjs scripts/tests/booking-policy.test.mjs scripts/tests/scheduling.test.mjs`: 23 passed.
- `firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.workflow-test.json --only auth,firestore,storage --log-verbosity QUIET "node --test --test-concurrency=1 --test-force-exit --test-timeout=90000 scripts/tests/availability-booking.test.mjs scripts/tests/scheduling-emulator.test.mjs scripts/tests/notification-history-emulator.test.mjs"`: 22 passed; CLI reported script exit 0. Used workspace-local `XDG_CONFIG_HOME=.firebase/review-config` after the sandbox prevented reading the normal CLI config. Java Storage runtime emitted deprecation/shutdown warnings. The orphaned Firestore runtime was identified and stopped after testing; the command completed with exit 0. No production records were used.
- `node scripts/check-booking-types.mjs` and `node scripts/check-workflow-types.mjs`: passed.
- `npm.cmd --prefix functions run build`: passed.
- `npx.cmd --no-install eslint src/services/bookingSchedule.service.ts scripts/tests/booking-transport.test.mjs scripts/tests/notification-history.test.mjs scripts/tests/availability-booking.test.mjs`: passed.
- PowerShell parser validation of `start-booking-demo.ps1`: passed. Launcher/device UI was not executed.
- `git diff --check`: passed.
- `npx.cmd tsc --noEmit --pretty false`: failed in untouched Admin Web Vite/image/extension types, OTP Cloudflare test types, and template component/hook aliases.
- `npm.cmd run lint`: failed with 8 errors in untouched `select-service.tsx` and template aliases; existing `job-action.tsx` effect-cleanup warning.
- `npm.cmd --prefix functions run lint`: failed with 4 existing indentation errors in untouched `functions/src/domain/availability.ts`.

An initial new transport test needed a missing fixture dependency added; its final
run passed. There are no remaining focused test failures. Broad baseline failures
were left unchanged to preserve task scope.
