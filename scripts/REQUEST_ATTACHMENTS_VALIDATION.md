# Customer request attachments and notification indexes — 2026-10-29

Follow-up runtime diagnosis and current recovery/test results:
see `REQUEST_SUBMISSION_RECOVERY.md` and the latest `REQUEST_UPLOAD_ROOT_CAUSE.md`.

## Findings and implementation

The Create Request screen previously counted mock slots and always passed `imageUrls: []`.
It now uses the existing Expo system gallery picker, previews/removal, and zero to two
optional JPEG/PNG/WebP images. The exact threshold is **strictly less than 2,000,000
bytes**, not 2 MiB. Both the selected file and the exact Blob passed to Storage are
checked; picker `fileSize` is not trusted. No image compression/resizing is used.
The picker prefers the current iOS representation and requests no broad library,
camera, microphone or storage permission. Unsupported formats require another image.

Private, immutable paths are `request_attachments/{customerId}/{requestId}/{0|1}`.
The existing `imageUrls` field stores these durable Storage paths, never local URIs,
base64 or public download URLs. Existing requests without photos still map to `[]`.
The customer and authorized technician detail screens use authenticated Storage
bytes and the existing full-screen image viewer. Review photos and job evidence
retain their existing paths, limits and publication/access policies.

Firestore rules enforce a maximum of two unique, canonical, customer-owned paths
for the particular request. Storage independently enforces actual object size,
supported MIME, ownership, metadata, exactly two slots, and no overwrites. Technician
reads require the authoritative request, a matching non-conflicting technician ID,
active approved technician credentials, and a path referenced by that request.
There are no public attachment reads or object-list grants. Firestore rules cannot
inspect Storage object existence/bytes; the app uploads before committing, while
Storage rules enforce upload constraints. MIME metadata is enforced by rules;
client validation additionally checks image signatures. This is not server-side
image decoding or malware scanning.

Existing booking eligibility, scheduling, duration, transactions, attempt receipts
and atomic booking/notification writes remain in place. A submission freezes its
intent/ID once uploads start; repeated taps are guarded synchronously. Retry first
checks the original receipt on the server if a booking was attempted, so a lost
acknowledgement does not require reuploading or create another booking. Before any
booking attempt, upload failure tries partial-upload cleanup and unlocks the
preserved form even if cleanup fails. Files may remain, but that ID never reached
a booking transaction, so retry can safely use a fresh ID. Once booking was attempted, failed/uncertain
results retain files and identity. Rules also deny deletion after booking creation.
Account changes/unmount abort uploads and prevent stale callbacks/navigation.

The duration field already existed and the approved policy requires a positive
whole number of minutes. It now uses the standard visible input style and displays
its own inline error. Photos do not participate in required-field validation.

Both reported notification composite indexes **already existed** in the clean
starting tree; no duplicate or redundant index changes were made. Actual recent,
history and sweep queries use COLLECTION scope, `createdAt DESC`, `documentId DESC`
and snapshot cursors. `notifications` filters `userId == uid`; `system_messages`
filters `audienceRoles array-contains role` and `status == active` or `sent` in two
separate intentional queries. The explicit `__name__ DESC` definitions match that
ordering (also the default direction following the final descending sort field).
The notification error now says “Some notifications are unavailable. Please retry.”
without diagnosing an index error as connectivity. Existing retry recreates the
failed subscription set and clears errors after recovery. A new test verifies
`failed-precondition` is not automatically retried as a network error.

## Checks actually run

- `node scripts/check-booking-types.mjs`: PASS, affected booking screens and imported dependencies.
- Changed-file ESLint: PASS (screens, services, utilities, components, hook and test harness/tests).
- `git diff --check`: PASS.
- Focused Node tests: **49/49 PASS**:
  `request-attachments`, `notification-recovery`, `notification-history`,
  `review-photo-picker`, `review-submission`, `booking-policy`.
- Auth/Firestore/Storage demo emulator tests: **18/18 PASS**:
  `request-attachments-emulator`, `notification-history-emulator`,
  `job-evidence-emulator`, `review-storage`.
  Includes saved-path restoration, duplicate booking replay/one notification,
  customer/technician/foreign/anonymous reads, third/duplicate/foreign references,
  threshold/oversized/MIME rejection, immutable files and protected deletion.
- Full `npx.cmd tsc --noEmit`: FAIL in unchanged Admin Web (Vite env, logo imports,
  TSX-extension config), OTP tests (Cloudflare test types), and template theme/alias
  files. No errors were reported in changed files. These unrelated files were not edited.
- Android gallery, permission dialogs, image rendering, two-device sessions and app
  restart checks: **NOT RUN**; no `adb` executable available on PATH.

The first emulator run found a test-fixture Timestamp SDK mismatch; it was fixed.
The initial standard workflow port stayed occupied after shutdown, so the final
run used the separate checked-in attachment config without stopping that process.
Java 24 emitted Storage runtime deprecation/shutdown warnings; the final Node test
runner completed all 18 tests successfully. Emulator index behavior does **not**
prove production composite indexes exist or are ready.

Reproduce focused tests (PowerShell):

```powershell
node --test scripts/tests/request-attachments.test.mjs scripts/tests/notification-recovery.test.mjs scripts/tests/notification-history.test.mjs scripts/tests/review-photo-picker.test.mjs scripts/tests/review-submission.test.mjs scripts/tests/booking-policy.test.mjs
node scripts/check-booking-types.mjs
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
$env:DEBUG = ''
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.request-attachments-test.json --only auth,firestore,storage --log-verbosity QUIET "node --test --test-force-exit --test-timeout=90000 scripts/tests/request-attachments-emulator.test.mjs scripts/tests/notification-history-emulator.test.mjs scripts/tests/job-evidence-emulator.test.mjs scripts/tests/review-storage.test.mjs"
```

## Manual Customer/Technician verification — NOT RUN

Use two devices/emulators and one Metro server. For isolated local app tests use
the existing explicit demo emulator mode and its app-config ports (8187/9197/9297),
not the dedicated automated suite ports (8687/9597/9697). See
`JOB_WORKFLOW_VALIDATION.md` for the existing demo accounts, seed procedure and
two-device Metro setup. Do not seed production. Normal app sessions must not be
automatically connected to Auth Emulator.

1. Sign in as a verified Customer; select an approved Available technician. Fill
   required title, description, address and future Asia/Colombo schedule. Confirm
   the visible duration input rejects empty, zero, fractional and invalid values;
   enter an explicit positive whole-minute duration. Submit with **zero photos**.
2. Repeat with one and two JPEG/PNG/WebP files under 2,000,000 bytes. Confirm real
   previews; remove/replace images; cancel the picker; exercise denied access.
   Attempt repeated fast Add Photo taps and a third image. No third image is saved.
   Test actual files of 1,999,999, 2,000,000 and 2,000,001 bytes with misleading
   filenames/metadata; the latter two must be rejected without compression.
3. Submit and observe progress. Interrupt upload/network access, restore access,
   and Retry. Inputs/photos survive recoverable failure. Double-tap Submit.
   Interrupt the booking response after committing and Retry: only the original
   request and one new-request notification must exist. Do not start a new form
   while the outcome is uncertain; inspect Bookings first.
4. Open Customer Request Details, expand photos, navigate away/back, restart and
   reopen the saved request. Sign in as its selected/assigned technician on the
   second device, open Job Details and view the same customer photos. Another
   technician/customer and a signed-out session must not download them.
5. Change accounts/logout while gallery, upload and submission are pending. Old
   selections/content must clear; uploads stop; callbacks must not navigate the
   new account to the old request. Repeat with an older request without photos.
6. Check customer and technician notifications. After authorized deployment and
   index readiness, Retry must load personal and active/sent system messages,
   paginate with timestamp/ID ordering and clear the single error state. Verify
   review submission/photo viewing and technician before/after evidence still work.

## Deployment prerequisites and safe rollout — PREPARED ONLY

No deployment, billing change, production write, migration, commit or push was run.
No migration is needed for existing requests with empty/missing attachments.

Before enabling the client workflow, confirm the **existing configured Storage
bucket** is usable for this project and that Firebase Storage Rules' Firestore
cross-service permissions are already configured. Do not create/upgrade a bucket,
enable billing, or approve any IAM changes implicitly. Existing infrastructure is
reused; no new Cloud Function or trusted upload server is required by this change.

After explicit authorization, deploy the existing index definitions first and
wait until Firebase reports the two composite indexes READY in the target default
database. Then deploy restrictive Firestore rules, followed by Storage rules, and
only then roll out the updated client. Confirm live Customer/Technician queries
and authorized image downloads. Local definitions/emulator tests cannot certify
production readiness. Storage rules must be active before photo uploads can work.

Exact **index-only** command for later approval:

```powershell
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9 --config firebase.json
```

Separate rules commands for later approval:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9 --config firebase.json
firebase.cmd deploy --only storage --project servicepilot-756d9 --config firebase.json
```

## Limitations and changed files

Uncommitted form drafts are memory-only; committed attachment paths survive app
restart. Submission IDs are retained for retries within the mounted form. If the
app is terminated during an uncertain booking, inspect Bookings before starting a
new request. Files abandoned by process termination/account changes or failed
cleanup are conservatively retained; there is no automatic orphan sweep or live
data cleanup. Never delete a file after a booking may have committed. Retry keeps
the form frozen after a booking attempt to protect the original intent. These
changes do not change approved scheduling/overlap policy or role boundaries.

Changed:
- `app/(tabs)/create-request.tsx`, `app/(tabs)/request-details.tsx`,
  `app/technician/job-details.tsx`
- `src/services/request.service.ts`, `src/services/requestAttachments.service.ts`,
  `src/utils/requestAttachments.ts`
- `src/components/jobs/RequestAttachments.tsx`, `src/components/jobs/JobEvidenceView.tsx`
- `src/hooks/useNotificationCenter.ts`, `firestore.rules`, `storage.rules`
- `scripts/tests/request-attachments.test.mjs`,
  `scripts/tests/request-attachments-emulator.test.mjs`,
  `scripts/tests/notification-recovery.test.mjs`
- `scripts/lib/performance-test-deps.mjs`, `scripts/lib/performance-render-harness.mjs`
- `firebase.request-attachments-test.json`, this report.

The starting Git tree was clean. All implementation changes remain uncommitted;
`firestore.indexes.json` is intentionally unchanged because matching definitions
were already present.
