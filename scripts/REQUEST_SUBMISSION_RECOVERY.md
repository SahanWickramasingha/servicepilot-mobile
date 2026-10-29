# Request submission recovery — 2026-10-29

Later authenticated live checks and upload/confirmation fixes are recorded in
`REQUEST_UPLOAD_ROOT_CAUSE.md`; they supersede the live-access uncertainty below.

This follow-up preserves the existing uncommitted attachment implementation.
Only root `AGENTS.md` exists; it was read. No existing work was reset, committed,
pushed or deployed. No billing or production data changes were made.

## Confirmed findings and evidence

1. **Zero photos and Storage are separate paths.** In
   `app/(tabs)/create-request.tsx:handleSubmit`, the upload loop iterates only over
   the current selected photos. Zero images passes an empty `imageUrls` list to
   `src/services/request.service.ts:createServiceRequest`, which does not call
   Storage. Tests also assert no upload or cleanup calls on zero-photo retry.
2. **The local missing-receipt rule is correct.** The single-document `get` rule
   at `firestore.rules` → `/booking_attempts/{customerId}/requests/{requestId}`
   authorizes the authenticated path owner with an active, verified Customer
   session. It never reads the missing receipt's `resource.data`. Collection
   listing, foreign reads, updates and deletes stay denied. First submission
   reads the receipt in the existing transaction and atomically creates the
   booking, receipt and notification. Fresh nonexistent-receipt reads and booking
   replay pass the real emulator rules. This change adds a clarifying comment,
   not broader access.
3. **Live receipt denial is not reproducible with the current local rules and
   eligible session.** The supplied runtime evidence establishes a denied server
   receipt read, but does not distinguish an older deployed ruleset from a failed
   active/verified/role/lifecycle/revocation precondition or a different running
   build/target. Local code uses the current Auth UID for both path and ownership
   checks; `.firebaserc` and normal app configuration target `servicepilot-756d9`.
   Deployed rules and the failing session claims were not available to inspect.
   No client workaround bypasses receipt security. Server deployment/access
   compatibility remains a prerequisite for fixing that live failure.
4. **Confirmed client recovery defect:** the former `handleSubmit` catch unlocked
   a failed photo attempt only when `cleanupUnsubmittedPhotos` succeeded. An
   unavailable/denied Storage cleanup therefore froze the entire form even though
   no booking transaction had been invoked. This prevented removing optional
   photos and could leave the old intent/selection retained. It is now fixed.
5. **`storage/unknown` does not identify the underlying cause.** The first remote
   operation in `uploadRequestPhoto` is `getMetadata`, followed (only for
   `storage/object-not-found`) by `uploadBytesResumable`. The previous raw error
   log did not distinguish these. New diagnostics label `photo-metadata` versus
   `photo-upload`; focused tests inject failures into both actual service paths.
   The initialized normal bucket is
   `servicepilot-756d9.firebasestorage.app`. No alternate bucket, billing setting
   or rules workaround was guessed. Live bucket existence, applied Storage rules,
   IAM/cross-service access and the failing response remain **UNVERIFIED**.
6. **Notification definitions are already present.** `firestore.indexes.json`
   matches `notificationHistory.ts:pageQuery` and its filters/cursors:
   COLLECTION `notifications`: userId ASC, createdAt DESC, __name__ DESC;
   COLLECTION `system_messages`: audienceRoles CONTAINS, status ASC, createdAt DESC,
   __name__ DESC. Active and sent are intentional separate status queries.
   No index definitions were duplicated or pagination/security changed.
   A read-only CLI check (`firestore:indexes --project servicepilot-756d9 --json`)
   failed authentication in the available isolated CLI configuration. Production
   index deployment/readiness is **UNVERIFIED**; local/emulator success cannot
   establish it.

## Implemented recovery and diagnostics

- Before any booking transaction is invoked, a photo failure tries safe cleanup,
  then unlocks the preserved form even if cleanup failed. Failed cleanup retains
  files rather than deleting anything unsafely. The next submission gets a fresh
  ID because that discarded ID **never reached a booking transaction**. Removed
  images cannot come from the previous intent. No deferred Storage cleanup is
  performed by a zero-photo retry.
- Once booking was attempted, identity and intent remain frozen. Retry first uses
  `confirmServiceRequestAttempt` and reuses the original ID; an uncertain result
  is never discarded or treated as confirmed absence. Referenced files remain
  protected by Storage rules. The UI now describes the result as unconfirmed and
  asks the user to retry the same submission.
- `createServiceRequest` checks the authoritative customer account before its
  receipt read, so known role/account/lifecycle failures are identified first.
  Receipt read/confirmation errors retain their operation and safe error code.
- `requestSubmissionDiagnostics.ts` emits development-only allowlisted codes,
  numeric HTTP status when exposed by the SDK or structured response, and
  allowlisted structured server status/code. Unknown HTTP status stays `null`.
  Upload context includes initialized public project/bucket configuration,
  authentication/verification/ownership booleans, actual byte count and validated
  MIME. It never emits raw error objects/stacks/messages, response text, UIDs,
  private object paths, headers, tokens, full payloads or image contents. A test
  places private strings in all raw response fields and verifies their omission.
- User-facing errors distinguish photo access denial, unknown Storage/configuration
  failures, connectivity failures and booking access/uncertain results. Unknown
  Storage errors do not assert a particular rules, billing or bucket cause.
- Optional limits, byte validation, previews/removal, progress, authenticated
  viewing, eligibility, duration/scheduling and atomic notifications are preserved.

## Validation actually run

- **53/53 focused tests PASS**: request attachments, submission diagnostics,
  notification recovery/history, booking policy, review picker/submission.
  Covers zero/one/two images, failed upload → removal → zero-photo retry with both
  successful and failed cleanup, no Storage calls after removal, duplicate taps,
  uncertain booking confirmation, direct Auth account replacement during pending
  operations, both Storage operation failures and sanitized diagnostics.
- **19/19 demo Auth/Firestore/Storage emulator tests PASS**: request attachments,
  notification history, job evidence and review Storage. Covers own missing
  receipts before first submission, replay/one notification, foreign missing and
  existing receipts, no receipt-list access, inactive/lifecycle/revoked session
  denial, actual size/MIME/ownership/third-file rejection, authorized downloads and
  protection of committed uploads. Review/evidence regression checks pass.
- Scoped TypeScript (`node scripts/check-booking-types.mjs`): **PASS**.
- Changed-file ESLint: **PASS**.
- `git diff --check`: **PASS**.
- Android gallery/device/restart verification: **NOT RUN** (`adb` unavailable on
  PATH). No production test/write/deployment was performed.

The final emulator run used Firestore 8687, Auth 9597, Storage 9697; a previous
Firestore port remained occupied and was left alone. The Java 24 Storage runtime
printed a shutdown warning after all 19 tests and the test script completed
successfully. That shutdown warning did not fail a security test.

Reproduce:

```powershell
node --test scripts/tests/request-attachments.test.mjs scripts/tests/request-submission-diagnostics.test.mjs scripts/tests/notification-recovery.test.mjs scripts/tests/notification-history.test.mjs scripts/tests/booking-policy.test.mjs scripts/tests/review-photo-picker.test.mjs scripts/tests/review-submission.test.mjs
node scripts/check-booking-types.mjs
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
$env:DEBUG = ''
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.request-attachments-test.json --only auth,firestore,storage --log-verbosity QUIET "node --test --test-force-exit --test-timeout=90000 scripts/tests/request-attachments-emulator.test.mjs scripts/tests/notification-history-emulator.test.mjs scripts/tests/job-evidence-emulator.test.mjs scripts/tests/review-storage.test.mjs"
```

## Live prerequisites and commands — review only

An authorized operator needs to inspect the deployed default-database rules,
confirm the running app project/bucket and active verified Customer session,
including lifecycle and token revocation gates. The client requires the existing
owner-only receipt `get` and atomic booking/receipt/notification rules to be
deployed together. Older server rules may reject this client even for zero photos.
Storage requires the configured existing bucket, attachment path rules and the
existing Firestore cross-service access setup. Do not enable billing, create or
switch buckets, or change IAM based only on `storage/unknown`.

After explicit approval, deploy indexes and wait for Firebase to report READY,
deploy compatible Firestore rules, then Storage rules, then release/test the
client. No migration or new Cloud Function is required by these fixes.

```powershell
# Index-only deployment:
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9 --config firebase.json
# Separate required rules deployments:
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9 --config firebase.json
firebase.cmd deploy --only storage --project servicepilot-756d9 --config firebase.json
```

## Manual Android checks — NOT RUN

1. Use one Metro server and Customer/Technician sessions on two devices. Use the
   existing explicit demo mode/seed instructions in `JOB_WORKFLOW_VALIDATION.md`
   for isolated app tests; its app ports differ from the automated suite ports.
   Normal sessions must not automatically connect to Auth Emulator.
2. Fresh valid Customer booking: fill an explicit positive whole-minute duration
   and valid future Colombo schedule; leave photos empty. Confirm there are no
   `photo-*` operations, one booking/receipt/notification, and no receipt read
   denial with the compatible rules/session. Retry the same ID after a lost
   response; confirm no duplicate. Sign out/in if access preconditions fail;
   do not relax security to bypass a denial.
3. Add one and two valid JPEG/PNG/WebP images, each **< 2,000,000 bytes**. Confirm
   previews, removal and progress. Trigger a Storage failure, including cleanup
   failure; remove all images and retry. Confirm the booking has `imageUrls: []`
   and the retry performs no Storage metadata/upload/delete operations.
4. For a photo error, inspect only the new sanitized development event: operation,
   code, HTTP/server status (or null), bucket/project, session booleans and actual
   size/MIME. Determine the actual failing operation before investigating server
   configuration. Do not share raw SDK responses or network Authorization headers.
5. Interrupt the booking response after commit; Retry must open the original
   request without reuploading or deleting its photos. Change accounts while
   selecting/uploading/submitting; old work must not navigate/write as the new
   account. Restart and reopen committed photos as the authorized customer and
   technician; foreign accounts and anonymous sessions must be denied.
6. After approved deployment and confirmed index readiness, verify customer and
   technician notifications, both system-message statuses and pagination. Check
   existing review photos and technician evidence.

Drafts/IDs remain memory-only across process termination. For a terminated app
with an uncertain result, inspect Bookings before starting a new form. Abandoned
unreferenced uploads may remain after account loss/termination/failed cleanup;
there is no automatic orphan sweep. These limitations were not hidden by a live
success claim.

Incremental files changed in this follow-up: `create-request.tsx`,
`request.service.ts`, `requestAttachments.service.ts`, `firestore.rules` (comment),
`performance-test-deps.mjs`, attachment unit/emulator tests, the dedicated emulator
config, the earlier validation report, plus new `requestSubmissionDiagnostics.ts`,
`request-submission-diagnostics.test.mjs` and this report. All earlier uncommitted
attachment/viewer/notification work remains present. Everything is uncommitted.
