# Request photo upload: confirmed live prerequisites and local fixes

Current implementation: [private R2 migration and validation](R2_PHOTO_VALIDATION.md).
The Firebase-only flow below is historical evidence, not the new upload setup.

Checked 2026-10-29. This report supersedes the live-configuration uncertainty in
`REQUEST_SUBMISSION_RECOVERY.md` and `REQUEST_ATTACHMENTS_VALIDATION.md`.
Existing changes were preserved. Root `AGENTS.md` was read; no nested files exist.

## Confirmed live cause

Authenticated, **read-only** checks using the existing normal Firebase CLI login
returned:

| Check | Observed result |
| --- | --- |
| Deployed web app SDK configuration | project `servicepilot-756d9`, bucket `servicepilot-756d9.firebasestorage.app`; matches local `src/firebase/config.ts` |
| Google Cloud Storage metadata GET for that exact bucket | HTTP **404** |
| Project bucket-list GET | HTTP **200**, `buckets: []` |
| Firebase Storage rules releases | Empty list |
| Deployed default Firestore rules | Released; last update `2026-10-05T10:42:18.578922Z`; differs from local rules and has **no `booking_attempts` match** |

There is **no existing project bucket** to receive these photos, and no released
Storage rules. The configured name is not an existing alternative that can be
selected locally. This is an external provisioning/deployment prerequisite, not
evidence of malformed JPEG bytes or a particular billing restriction. No billing
state was inferred or changed.

The deployed Firestore rule source was inspected read-only: it has no receipt
match or wildcard grant covering receipts. Firestore consequently denies
`booking_attempts/{customerUid}/requests/{requestId}` under that deployed source.
Thus removing photos bypasses Storage, but **cannot make the current production
booking succeed until compatible Firestore rules are deployed**. Local rules
already correctly allow a verified active Customer's single missing-receipt read,
and deny foreign/list access.

The original failing device's exact historical HTTP response is unavailable.
Two attached Android emulators (`emulator-5554`, `emulator-5556`) were inspected
through the SDK's absolute `adb.exe` path; their retained ReactNativeJS logs had
neither the structured failure event nor `storage/unknown`. No production upload
was triggered to recreate it. A normal sandbox unauthenticated bucket probe was
blocked (`EACCES`); the successful authenticated checks above were subsequently
performed through approved read-only execution. No production data was read or
written: only app configuration, bucket metadata/list and released rule source.

## Client defects fixed locally

`src/services/requestAttachments.service.ts:uploadRequestPhoto` previously did a
speculative metadata GET before the upload. That request could block a completely
fresh upload. It then treated SDK completion as final success without a separate
metadata validation, and treated a rejected SDK promise as failure even if the
server had saved the object before acknowledgement was lost.

The sequence is now:

1. Fetch the selected native file as a Blob, read the same Blob's bytes and require
   equal sizes. Validate actual bytes and signatures. Each file is strictly
   **< 2,000,000 bytes**; MIME is JPEG, PNG or WebP. Picker metadata is not trusted.
2. Upload the **original validated native Blob** with `uploadBytesResumable`, the
   private canonical path and exact customer/request metadata. There is no fresh
   pre-upload metadata lookup. Native Blob handling was preserved deliberately:
   installed React Native `BlobManager` rejects ArrayBuffer/typed-array Blob
   parts, while the installed Firebase SDK constructs multipart Blobs for files
   at or below 256 KiB. Converting uploads to typed-array Blob parts would regress
   that path. No such conversion was introduced.
3. After SDK acknowledgement, confirm the saved object's full path, owner,
   request ID, actual size and MIME with authenticated `getMetadata`.
4. If the SDK upload rejects, perform one bounded metadata reconciliation. A
   matching saved object recovers a lost response or immutable-path retry;
   missing/unverifiable objects do not count as success.
5. Return durable paths to `createServiceRequest` only after confirmation. The
   booking, receipt and notification still commit atomically through the existing
   transaction and scheduling/eligibility checks.

An acknowledged upload whose confirmation fails now has operation `photo-confirm`
and `uploadAcknowledged: true`. The form retains its pre-booking identity/files for
retry instead of cleaning up acknowledged uploads. Selection edits invalidate
that pre-booking photo intent. Removing all images submits an empty list without
Storage upload, metadata or delete calls. Any identity that reached a booking
transaction remains locked and reconciled; it cannot be silently discarded.

The screen also preserves an error's actual operation instead of overriding every
photo-phase error as `photo-upload`. Diagnostics distinguish `photo-read`,
`photo-upload`, `photo-confirm` and reconciliation metadata errors, with
acknowledgement/confirmation state, safe error code, available numeric HTTP status
and allowlisted structured server code/status. Raw messages/responses, UIDs,
private paths, image contents, tokens and headers are never logged by this code.
Unknown HTTP status is explicitly null. No unknown error is automatically labeled
as a billing, rules or bucket problem.

## Actual validation

- **62/62 focused Node tests PASS**: attachment selection/submission, upload
  lifecycle, safe diagnostics, booking policy, notification history/recovery,
  review picker/submission.
- **20/20 Auth/Firestore/Storage demo emulator tests PASS**: request attachments,
  notification history, job evidence and review Storage. The new actual upload
  service test exercises normal upload/confirmation, successful uploads with lost
  acknowledgements, acknowledged uploads with failed metadata reads, immutable
  retries and booking/attachment persistence. Existing ownership, MIME/size/count,
  foreign-access and committed-file deletion protections continue to pass.
- Scoped TypeScript (`node scripts/check-booking-types.mjs`): **PASS**.
- Changed-file ESLint: **PASS**.
- `git diff --check`: **PASS**.
- Android gallery/picker/permission/image display and interactive submission:
  **NOT RUN**. Attached-device log inspection was read-only, not an end-to-end UI
  verification. No live success is claimed.

The final emulator run used a temporary root config with ports 8887/9997/10097
because earlier Firestore test ports were occupied. The temporary config and
diagnostic files were removed after validation. Java 24 printed a Storage runtime
shutdown warning after the Node runner reported all 20 tests passed.

Reproduce focused tests:

```powershell
node --test scripts/tests/request-attachments.test.mjs scripts/tests/request-upload-lifecycle.test.mjs scripts/tests/request-submission-diagnostics.test.mjs scripts/tests/notification-recovery.test.mjs scripts/tests/notification-history.test.mjs scripts/tests/booking-policy.test.mjs scripts/tests/review-photo-picker.test.mjs scripts/tests/review-submission.test.mjs
node scripts/check-booking-types.mjs
```

For emulator security tests, use `firebase.request-attachments-test.json` with
available ports (or a root-level temporary copy with alternate ports):

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
$env:DEBUG = ''
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.request-attachments-test.json --only auth,firestore,storage --log-verbosity QUIET "node --test --test-force-exit --test-timeout=90000 scripts/tests/request-attachments-emulator.test.mjs scripts/tests/notification-history-emulator.test.mjs scripts/tests/job-evidence-emulator.test.mjs scripts/tests/review-storage.test.mjs"
```

## Exact external steps still required — not performed

1. An authorized project owner must initialize Firebase Storage for
   `servicepilot-756d9` in the Firebase Console's Storage section. There is no
   existing bucket in the project to reuse. Verify the resulting bucket name;
   retain the current configuration only if it is the actual provisioned name.
   If setup requires a billing/plan/IAM decision, stop for the owner's explicit
   authorization. No account upgrade or resource creation was performed here.
2. Deploy the compatible local default-database Firestore rules for receipts and
   atomic booking/notification writes. This is necessary even with zero photos.
3. Once the bucket exists, deploy the local private attachment Storage rules and
   verify their Firestore cross-service permissions. Do not enable public reads.
4. Then verify Android uploads and confirmed metadata reads, followed by booking
   and authorized Customer/Technician photo viewing. Index readiness is a separate
   prerequisite for notification queries; no index readiness claim is made here.

Prepared commands, **review only**:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9 --config firebase.json
# Run only after Firebase Storage has been initialized:
firebase.cmd deploy --only storage --project servicepilot-756d9 --config firebase.json
# Separate notification index deployment, if not already ready:
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9 --config firebase.json
```

Manual Android verification after authorized setup: fresh zero-photo booking;
one/two valid photos; upload failure and removal → zero-photo retry; confirmation
failure → same-path retry; uncertain booking response → same-ID reconciliation;
account switch during pending work; persisted private viewing as customer and
assigned technician with foreign reads denied. Keep explicit duration and future
Colombo schedule validation. Do not recreate an uncertain booking in a new form.

Incremental implementation files: `requestAttachments.service.ts`,
`requestSubmissionDiagnostics.ts`, `create-request.tsx`, attachment unit/emulator
tests and diagnostics tests; new `request-upload-lifecycle.test.mjs` and this
report. Earlier uncommitted changes remain intact. No rules were weakened and
nothing was committed, pushed, deployed or provisioned. No billing or production
records were changed. Files abandoned before a booking may remain after removal
or failed cleanup; uncertain/committed bookings and their files are protected.
