# Booking consistency: implementation, validation and pending policy

## Scope and outstanding decision

Root `AGENTS.md` was read; no nested instructions apply. The working tree was
clean at the start, with review/photo commit `ba59530` preserved. No production
read/write, deployment, migration, billing change, commit or push was performed.

**The cross-booking scheduling conflict feature is not complete.** The user chose
to provide an established scheduling rule. Duration/end-time, simultaneous
capacity, reserving statuses, timezone and adjacency rules remain pending. This
handoff records the independent fixes that can be implemented without inventing
that policy. Do not interpret the baseline multiple-booking tests as a newly
approved conflict policy or deploy this as the completed scheduling feature.

## Actual model and confirmed gaps

- Customers choose approved technicians directly. Dispatchers review applications;
  no dispatcher assignment path was added. Admin Web request management is a
  read-only list. Existing trusted account-lifecycle/provisioning services and
  Functions contain no booking/reservation operation whose deployment can be
  assumed to solve these issues.
- The form already offers preferred hourly starts from 09:00 AM to 05:00 PM,
  saves `preferredDate`, `preferredTime` and `scheduledAt`, and requires a future
  start in the UI. It uses the device timezone. There is no saved end/duration or
  established overlap interval. Timezone normalization and interval validation
  therefore remain part of the pending scheduling decision.
- `TECHNICIAN_AVAILABILITY_VALIDATION.md` and existing emulator tests explicitly
  allow multiple simultaneous accepted/in-progress jobs, even at the same start.
  No existing status reserves capacity. `requested`/`pending` are counted as
  active in UI history but are not capacity reservations. `accepted`, legacy
  `assigned`, and `in_progress` are commitments without an existing numeric cap.
- Existing manual `available` / `busy` / `offline` state was already checked at
  creation and acceptance using transactions and authoritative rules. This was
  retained, not reimplemented as a new fix or tied to job count/GPS/logout.
- Gaps: counterparty verification/lifecycle checks were incomplete; creation
  copied customer identity details from the supplied client profile; rules only
  required `scheduledAt` to be a Timestamp; cancellation used a nontransactional
  read then update; status actions lacked consistent state/conflict errors.
- Each booking write previously awaited a separate notification write. A failed
  notification could make a persisted action look unsuccessful. Retrying creation
  generated another random request ID, and UI-only duplicate guards did not
  reconcile another device or a lost acknowledgement.
- Legacy `assignedTechnicianId`-only requests were supported by reviews/location
  helpers but not booking authorization/status transitions. Conflicting current
  and legacy identities needed explicit rejection.

## Implemented independent enforcement

1. Customer creation derives UID from Auth and rereads the own authoritative
   profile. Client profile names/email/phone cannot replace authoritative values.
   The selected public technician projection is reread in the transaction; rules
   recheck its authoritative approved, active, verified, non-pending private
   account plus Available in both documents at commit.
2. Acceptance requires the verified active approved technician, its authoritative
   request identity, Available state, and an active verified Customer profile.
   Rules perform the private Customer check; no cross-role private profile access
   was granted. Existing session revocation/account-lifecycle rules remain.
3. New starts must be valid future Dates in the service and greater than server
   `request.time` in rules. No end-time, overlap duration or new slot was invented.
4. Creation uses one stable 20-character form attempt ID as the request ID. Its
   immutable `booking_attempts/{customerUid}/requests/{requestId}` receipt is written
   in the same transaction. Rules validate both directions of that relationship;
   a direct request without its receipt, a standalone/foreign receipt, and receipt
   edits/deletion are denied. Receipts contain only IDs/time and are owner-readable
   by exact get, with no list permission.
5. Receipts are **idempotency proofs, not capacity locks**. Pending requests do not
   reserve capacity. Receipts persist through cancellation/completion so a delayed
   retry cannot recreate an old intent. A new form/new attempt allows a legitimate
   subsequent request. Callers retaining `attemptId` can reconcile across devices;
   the form retains it during its mounted lifetime. There is no claim of recovery
   of an unpersisted form token after app storage/process loss. Retry of an existing
   attempt returns its original saved booking, rather than editing its payload.
6. Every app booking/status write and its existing personal notification commit
   together. Notification IDs are deterministic per request/event. Rules use
   `getAfter` so the notification is authorized against the committed request.
   Invalid notification writes roll back the booking/receipt. Reviews continue
   using their existing separate notification path and passed regressions.
7. Cancellation and technician status actions use transactions on the request and
   own profile. Existing transition policy is explicit: Customer cancels pending;
   Technician accepts/rejects pending, starts/cancels accepted/assigned, completes
   in-progress. Redundant same-actor already-applied operations are no-ops; a
   competing different transition produces an actionable conflict. Reason rules
   remain. Rules restrict each action's changed fields and server timestamp.
8. Concurrent same-attempt creation may receive a create-only permission failure
   before Firestore retries its stale read. The service confirms that exact own
   receipt and saved request on the server before returning success. Missing or
   unauthorized confirmation preserves the original failure; no fake success or
   search for similar requests is used.
9. Existing shared request listeners synchronize both roles. New mutation reads
   are a bounded set of individual document reads, without scans, polling or new
   history listeners. Existing history subscription behavior/counts were retained.
   Ref guards prevent repeated native action taps; navigation after save checks
   that the authenticated account still matches.

The billing-free Firestore path remains. Rules do not gain access to Firebase
Auth's live user directory: revocation/disable/delete must continue through the
existing trusted lifecycle service, which gates the authoritative profile. An
out-of-band Auth-only change may leave an issued ID token usable until revocation
is reflected; no instantaneous Auth-directory lookup is claimed for Firestore rules.

## Changed files

- `functions/src/domain/booking.ts`: shared account/identity/transition/error helpers.
- `src/services/request.service.ts`: authoritative transactions, durable attempts,
  atomic notifications and idempotent recovery.
- `firestore.rules`: booking account/receipt/time/transition boundaries and legacy
  identity-safe notification authorization. Review/photo rules remain intact.
- `app/(tabs)/create-request.tsx`: stable attempt ID for form retries.
- `app/technician/job-details.tsx`, `job-action.tsx`: immediate tap guards and
  account-aware navigation after confirmed persistence.
- `scripts/tests/booking-policy.test.mjs`, `availability-booking.test.mjs`:
  meaningful policy, race, account, direct-client and retry coverage.
- `scripts/tests/performance.test.mjs`: checks form retry retains the attempt ID.
- `scripts/tests/map-location.test.mjs`: existing booking fixture now uses a future
  date and its existing preferred start, rather than an expired test timestamp.
- `scripts/lib/performance-test-deps.mjs`: loads the actual pure booking helpers.
- `scripts/check-booking-types.mjs`, `scripts/seed-booking-emulator.mjs`, this file.

## Validation actually performed

- **72/72 headless tests passed**: booking helpers, existing availability/session,
  form duplicate taps/retry token, performance, ratings, pagination, review
  submission, picker and index/error regressions.
- **52/52 Auth/Firestore/Storage emulator tests passed** after the concurrency fix:
  14 availability/booking, 15 map/location/privacy, 18 reviewer-name/notification,
  and 5 review/photo tests. The first combined run found the create-only race;
  it was corrected, the focused 14-test run passed, then all 52 passed together.
- The booking fixture seed ran twice on the same disposable emulators with exit
  code 0; existing accounts/records were preserved.
- Functions TypeScript build, rating-scoped mobile TypeScript, booking-specific
  mobile TypeScript and changed-file ESLint passed. `git diff --check` passed.
- Java 24 emitted known deprecation/shutdown warnings after successful emulator
  execution. They did not fail the passing test runs.
- No native device/manual scheduling, permission dialogs, real network interruption
  or production success was claimed. No cross-booking overlap test is claimed
  before the required scheduling policy is supplied.

Reproduce from repository root:

```powershell
npm.cmd --prefix functions run build
node scripts/check-booking-types.mjs
node --test scripts/tests/booking-policy.test.mjs scripts/tests/availability.test.mjs scripts/tests/performance.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/technician-reviews-list.test.mjs scripts/tests/review-indexes.test.mjs scripts/tests/review-sync.test.mjs scripts/tests/review-submission.test.mjs scripts/tests/review-photo-picker.test.mjs
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = '1'
$env:DEBUG = ''
$env:CI = '1'
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.review-author-test.json --only auth,firestore,storage --log-verbosity QUIET "node --test scripts/tests/availability-booking.test.mjs scripts/tests/reviewer-names.test.mjs scripts/tests/review-storage.test.mjs scripts/tests/map-location.test.mjs"
```

## Manual procedure — not performed

Use two Android emulators for Customer A and Technician; add a third emulator for
Customer B when testing separate-customer scheduling after its policy is supplied.
For baseline preferred-start checks set device timezones to Asia/Colombo; this is
a test setup, not a completed new app timezone policy.

1. Start fresh local services in terminal A:

   ```powershell
   $env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
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

3. Terminal C (replace serials with `adb devices` results):

   ```powershell
   $bookingAdb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
   & $bookingAdb devices
   foreach ($bookingDevice in @('emulator-5554', 'emulator-5556')) {
     foreach ($bookingPort in @(8081, 8187, 9197, 9297)) {
       & $bookingAdb -s $bookingDevice reverse "tcp:$bookingPort" "tcp:$bookingPort"
     }
     & $bookingAdb -s $bookingDevice shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
   }
   ```

4. Technician on `emulator-5554`: `booking-tech@example.test`. Customer A on
   `emulator-5556`:
   `booking-customer-a@example.test`; optional third-device Customer B:
   `booking-customer-b@example.test`. All use disposable password
   `Only-for-booking-emulator-42`. The fresh technician starts Offline.
5. A selects that technician directly: Offline blocks new submission. Save
   Available on Technician; verify A's mounted profile/form updates. Select a future
   date, an existing preferred start, title/description/address. Tap Submit twice:
   one request and one notification, navigation only after persistence.
6. Open the same pending booking on both devices. Simultaneously cancel on A and
   accept on Technician: only one action succeeds; both listeners settle on that
   state. Repeat with acceptance versus rejection from two Technician sessions.
   Verify actionable conflict feedback and no notification for the losing action.
7. Toggle Busy/Offline while A's form and a pending Technician booking remain open.
   Creation/acceptance must fail; rejection and already accepted job start/complete
   remain permitted. Availability must not change automatically.
8. Start then complete an accepted booking while Offline. Verify Customer history,
   completion notification and Rate Service/review flow. For a legacy compatibility
   check, Customer A can open seeded `booking-legacy-assigned`; Technician can open
   `/technician/job-details?id=booking-legacy-assigned` and start/complete it.
9. Interrupt local connectivity during submission, restore it and retry on the
   still-open form. Check the original attempt/request rather than creating a
   duplicate. Confirm no success is shown without persistence. Opening a new form
   is a new intent. Switch accounts mid-save: no old-account navigation/result.
10. Test disabled/deleted/unverified/pending accounts and forged writes through the
    automated malicious-client suite. These are emulator fixture changes only.
    Future cross-booking/manual overlap cases must be added after policy approval.

## Compatibility and deployment prerequisites — review only

Existing requests need no receipt or migration to read/cancel/transition/review.
Legacy `pending`/`assigned`, missing `scheduledAt`, and past starts remain usable
for existing lifecycle operations. Ambiguous/missing technician IDs are denied
rather than reassigned. The existing technician list query still keys on current
`technicianId`; an assigned-ID-only legacy record can be opened by authorized exact
route but is not newly backfilled into that query by this task.

New creation requires the new receipt transaction, authoritative identity fields,
verified target profile and future start. Older clients creating requests without
receipts will be rejected. Coordinate an updated client/rules release. A verified
account whose stored `emailVerified` flag is missing/false must run the existing
verified-profile synchronization; do not silently mark legacy accounts verified.

No new index, required deployed Function, trusted booking backend or billing
service was introduced by these independent fixes. After the outstanding conflict
policy is implemented and validated, the candidate rules-only command is:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9 --config firebase.json
```

**Not executed.** No current booking migration is necessary. Do not deploy the
unfinished scheduling feature or assume existing production rules were changed.
Any future capacity ledger/backfill requirements must follow the supplied policy
and be prepared as separate dry-run-first tooling, never applied to live records
as part of this task.
