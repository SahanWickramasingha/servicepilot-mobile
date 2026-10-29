# Private R2 photo implementation and local validation

## Follow-up: separate object-key prefixes

New Worker-authorized reservations use `objectKeyVersion: 2` with
`photos/v1/customer-requests/<id>`, `photos/v1/technician-before/<id>` and
`photos/v1/technician-after/<id>`. Existing records without the internal version
continue to use `photos/v1/<id>`. The persisted external `r2:v1:<id>` references,
ownership checks, byte limits and Firestore Rules do not change. No dashboard
folders, object moves, migration or deployment is needed for this local change.

This Worker-only follow-up reran the full Worker suite: **23/23 passed**, including
real local R2 streaming, prefix separation, legacy confirmation/retry/view/delete/
cleanup compatibility and rejection of client-selected keys/version fields.
Worker TypeScript, changed-file ESLint, Wrangler dry-run build and diff checks
passed. The mobile/emulator results below are from the preceding implementation;
those unchanged paths were not rerun for this follow-up. No live test was run.

2026-10-29. Local changes only, uncommitted. Existing uncommitted work was
preserved. Root `AGENTS.md` was read; no applicable nested instructions existed.
The user's photo handoff scopes this work to customer request and technician
before/after photos, not the independent map/service-area implementation.

## Confirmed findings and resulting behavior

- Previous reports recorded read-only live evidence of no configured Firebase
  bucket and deployed rules without `booking_attempts`. Those observations were
  not re-probed or changed during this task. `storage/unknown` alone did not prove
  a specific cause. See `REQUEST_UPLOAD_ROOT_CAUSE.md` for the original evidence.
- Local owner-scoped receipt rules already permit first reads of nonexistent
  receipts. A live rules deployment remains necessary; R2 cannot fix an outdated
  Firestore deployment. Real emulator tests now commit a first zero-photo booking
  with no receipt, then replay the same receipt with one booking/notification.
- `requestAttachments.service.ts::uploadRequestPhoto` and
  `jobEvidence.service.ts::uploadJobPhoto` now use the private Worker, actual Blob
  bytes and immutable SHA-256-associated references. Firebase upload/metadata
  operations have been removed from these new-photo paths. No fallback occurs.
- `privatePhotos.service.ts::uploadPrivatePhoto` distinguishes reservation, PUT
  and trusted confirmation. A failed/lost PUT response invokes same-ID finalize;
  unconfirmed metadata never becomes a successful attachment. Auth connectivity,
  permission/configuration, interrupted transfers and retryable failures get safe
  messages without disclosing URLs, identities, tokens or provider response text.
- `create-request.tsx` retains an upload attempt even if a response was lost.
  Photo removal replaces only a pre-booking intent, uploads no removed images,
  and zero remaining photos bypass the service. An uncertain booking transaction
  is reconciled using its original receipt/ID before any new intent is allowed.
- `photo-worker/src/stream.ts` counts actual bytes, checks MIME/signature/digest,
  and withholds the final byte until full-body validation. This fixes the R2
  known-length race where a stream might commit before a later hash/EOF failure.
  A real local workerd/R2 test verifies a bad digest leaves no object.
- Worker `auth.ts`, `policy.ts`, `firestore.ts` and Rules enforce verified current
  identity, account/revocation/approval/assignment and purpose. Direct clients
  cannot forge confirmations or attach another account's object. No Admin SDK,
  new Firebase Function, public bucket or token URL is introduced.
- Cleanup tombstones serialize with reference commits. Lost DELETE responses can
  safely replay; referenced and completed-job files cannot be deleted. Native
  hashing, bounded RPC/page sizes and an upload-pause switch support a staged
  rollout; no cron was enabled automatically.
- Authenticated private loading reuses the existing image/modal viewer and
  clears on account changes. Saved evidence reloads from Firestore after screen
  reopening; completed evidence retains private viewing but denies mutation.

## Changed files by responsibility

App/domain:

- `src/services/privatePhotos.service.ts`, `src/utils/photoReferences.ts`: shared
  authenticated streaming upload, reconcile/status/delete and private image load.
- `src/services/requestAttachments.service.ts`, `src/utils/requestAttachments.ts`,
  `app/(tabs)/create-request.tsx`: optional attachments and safe booking retries.
- `src/components/jobs/RequestAttachments.tsx`, `JobEvidenceScreen.tsx`,
  `JobEvidenceView.tsx`, `src/services/jobEvidence.service.ts`,
  `functions/src/domain/jobEvidence.ts`: R2/legacy references and persisted evidence
  with existing notes/signature/timer/completion and revision checks.
- Existing request/job detail attachment integration and prior notification/
  booking fixes were retained. `package.json`/lock add the shared SHA-256 helper;
  `tsconfig.json` isolates Worker globals; `.env.photos.example` supplies only a
  public API-origin template. `.gitignore` protects Worker local state/secrets.

Worker/configuration:

- `photo-worker/src/{index,auth,firestore,policy,stream,types}.ts`.
- `photo-worker/{package.json,package-lock.json,tsconfig.json,wrangler.jsonc}`.
- `photo-worker/.dev.vars.example`, `firestore-role.yaml`, `README.md`.
- `firestore.rules`: trusted R2 confirmations, owner-scoped receipt reads and
  retained legacy evidence. `storage.rules`: new customer/job Firebase writes
  disabled, historical read and review policies retained. No index definitions
  changed: notification composite definitions remain, R2 expiry uses single-field.

Tests:

- `photo-worker/test/{auth,firestore,worker,runtime}.test.ts`.
- `scripts/tests/private-photos.test.mjs`, `r2-photo-security-emulator.test.mjs`.
- Updated `request-attachments.test.mjs`, `request-upload-lifecycle.test.mjs`,
  `job-evidence.test.mjs`, `request-attachments-emulator.test.mjs`,
  `job-evidence-emulator.test.mjs`, `scripts/lib/performance-test-deps.mjs`.
- `firebase.r2-test.json` uses new isolated loopback ports; existing local emulator
  configuration and unrelated running emulators were preserved.

## Checks actually run

| Check | Result |
| --- | --- |
| Focused mobile/service/booking/evidence/regression tests | **77 passed**, none failed/skipped |
| Worker crypto/policy/REST/stream/retry/cleanup/runtime tests | **20 passed**, none failed/skipped |
| Firestore/Auth/Storage emulator security + legacy/review/notification regressions | **22 passed**, none failed/skipped |
| Worker strict TypeScript | PASS |
| Scoped booking/screens TypeScript (`check-booking-types.mjs`) | PASS |
| Functions/domain TypeScript build | PASS |
| Changed app/domain/tests/Worker ESLint | PASS, no errors or warnings |
| Worker Wrangler dry-run bundle | PASS; no deploy |
| `git diff --check` | PASS |

Focused command (Node native test runner):

```powershell
node --test scripts/tests/private-photos.test.mjs scripts/tests/request-attachments.test.mjs scripts/tests/request-upload-lifecycle.test.mjs scripts/tests/request-submission-diagnostics.test.mjs scripts/tests/job-evidence.test.mjs scripts/tests/booking-policy.test.mjs scripts/tests/notification-recovery.test.mjs scripts/tests/notification-history.test.mjs scripts/tests/review-photo-picker.test.mjs scripts/tests/review-submission.test.mjs
npm.cmd --prefix photo-worker run check
npm.cmd --prefix photo-worker test
npm.cmd --prefix photo-worker run build
node scripts/check-booking-types.mjs
npm.cmd --prefix functions run build
git diff --check
```

Emulator command (demo project, no production data or bucket):

```powershell
$env:DEBUG = ''
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.r2-test.json --only auth,firestore,storage --log-verbosity QUIET "node --test --test-force-exit --test-timeout=90000 scripts/tests/r2-photo-security-emulator.test.mjs scripts/tests/request-attachments-emulator.test.mjs scripts/tests/job-evidence-emulator.test.mjs scripts/tests/review-storage.test.mjs scripts/tests/notification-history-emulator.test.mjs"
```

Ports: Firestore 9187, Auth 10197, Storage 10297, all 127.0.0.1. Real Rules tests
seed trusted records only through the test Admin context. Old Firebase files are
seeded only in the Storage emulator to verify retained private reads. Worker tests
sign test JWTs and mock Google/Auth/REST; the runtime stream test uses actual local
workerd/R2 with outbound requests blocked. These are complementary layers, not a
claim of an end-to-end live Cloudflare/Firebase deployment.

Java 24 prints a Firebase tooling deprecation notice and a Rules runtime exception
during emulator shutdown **after** all 22 tests and the script exit successfully.
No test failure was hidden. The existing whole-repository TypeScript baseline has
unrelated Admin Web Vite/OTP/template configuration failures; this task uses the
relevant scoped checks above instead of claiming full-repository compilation.

Coverage includes zero photos with unavailable/unconfigured R2; customer one/two,
third/size/type rejection; real byte limits with false/missing Content-Length;
interrupted/hash-invalid streams; no confirmation on missing objects; metadata
failure/lost upload or finalize response and stable retry; duplicate taps and
uncertain booking receipts; remove-after-failure to zero photos; direct account
replacement; invalid/expired/wrong-project/unsigned JWTs and key rotation; current
disabled/deleted/revoked/approval/assignment denial; foreign receipt/object and
forged metadata denial; before/after max-stage evidence, revisions, notes/signature/
timer/completion immutability; completed viewing; cleanup/reference races, no-object
reservations and idempotent DELETE; legacy authenticated reads and unchanged
reviews/notifications; paused uploads with reads/finalize still available.

## Remaining external prerequisites

**Not configured/verified live in this task:** Cloudflare account/subscription,
private R2 bucket/binding, deployed Worker URL/secrets/rate binding, Google IAM
identity/key, server-compatible Identity Toolkit API key, deployed current Rules,
index READY state, end-to-end staging authorization and production CPU/quota use.
No real upload, cloud setup, key creation, billing change, deploy, commit or push
was performed. R2 is not represented as unlimited or free of checkout requirements.

Follow [the exact setup, rollout/rollback and later deployment commands](../photo-worker/README.md).
Old Firebase-only clients need a coordinated rollout because new legacy uploads
will be denied under the prepared Rules. Existing R2 photos need the compatible
viewer/Worker even if new uploads are paused. No migration is needed or executed.

Review-photo uploads/publication/private views still depend on Firebase Storage;
missing Firebase bucket setup is not solved for reviews by this scoped migration.
Existing Firebase job/request references remain authenticated reads. Customer
signature strokes remain in Firestore without any Storage dependency.

## Manual Android verification — NOT RUN

After separately authorized staging setup, use one Metro server and two devices:

1. Start the supported app with a configured staging API origin. Use customer and
   assigned approved technician accounts. Ensure normal sessions are not silently
   pointed at an Auth emulator. The production verifier rejects unsigned emulator
   JWTs; isolated automated fixtures do not weaken that rule.
2. Unconfigure/unavailable photo API, submit a valid zero-photo booking. Check
   exactly one receipt, booking and notification, and no photo-service request.
3. Restore API; select one then two valid images. Check previews/removal/progress,
   submit, reopen customer request details and assigned technician job details.
   Reject a third image and a file exactly 2,000,000 bytes. Verify foreign login
   cannot fetch the private photo with the same opaque reference.
4. Interrupt upload/network, then retry. Interrupt after object storage but before
   confirmation response. Check same reference/booking, no duplicate notification.
   Remove all photos after a pre-booking failure and retry zero-photo submission;
   verify no removed photo is uploaded. For uncertain booking results restore the
   original receipt first; never change identity merely to bypass an error.
5. Switch/logout accounts during upload, view and booking. Check abort/state clear,
   no foreign booking/evidence commit and fresh authorization on reopening.
6. Technician: camera/gallery before photos, save, leave/reopen and restart app.
   Test three processed JPEGs and a fourth/oversized rejection. Run existing timer,
   save notes, after photos and customer signature; complete only with durable
   evidence. Check historical photos reopen after completion and edits/deletes fail.
7. Revoke assignment/approval, disable/delete account or revoke session on staging;
   check fresh read/upload/finalize fails closed. Check customer/technician role
   boundaries, legacy Firebase attachments, review text/photos and notifications.
8. Exercise reviewed local/staging cleanup with a lost/unreferenced upload and a
   referenced/completed photo. Only the unreferenced expired photo is removed.
   Pause new uploads; existing photos/viewing/finalize and zero-photo bookings work.

Camera/gallery permissions, actual Android Blob/XHR behavior, authenticated image
rendering, live Worker CPU limits, and live credentials remain **NOT RUN** here.

Final `git status --short`: 20 modified tracked paths and 20 untracked entries
(the new `photo-worker/` directory counts as one entry), including preserved
pre-existing work. All changes remain uncommitted; nothing is staged. Generated
test logs were removed; local ignored Worker artifacts are not source changes.
