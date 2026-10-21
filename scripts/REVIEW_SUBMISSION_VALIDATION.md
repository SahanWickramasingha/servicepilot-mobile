# Customer review submission — implementation and validation

The root and applicable nested instructions were checked before editing. Only
root `AGENTS.md` was present. Existing uncommitted Technician Reviews List work
was preserved. No production records, billing, deployment, commit or push was
performed. No migration is required.

## Confirmed root cause

`request-details.tsx` already routed Rate Service to `/review-technician` with a
request ID. That screen already contained a form; opening it did not save a
review. Its context loader called `getReviewForRequest`, then set `submitted =
true` when a review existed. The same flag rendered the new-submission Thank You
screen. The entry button always said Rate Service, including reviewed requests.
This incorrectly represented an existing-review state as a new submission. No
live record was read to assert what happened for the reported production request.

Existing request-photo UI was a placeholder counter, explicitly stating that
previews were not uploaded. There was no image picker/upload implementation in
the mobile app, Admin Web or Functions to reuse. Firebase Storage was initialized
with `servicepilot-756d9.firebasestorage.app`, but there were no local Storage
rules or Storage emulator configuration. Two SDK-54-compatible Expo modules were
therefore added; Firebase Storage remains the configured object-storage provider.

## Final behavior and boundaries

- Completed request → Rate Service → form, with no selected stars and no write.
  The form shows the request title and technician. All 1–5-star choices are
  accepted equally. Optional honest feedback is limited to 300 characters;
  over-limit text stays editable and blocks submission with a visible counter.
- Existing reviews use View Your Review and show their saved stars/comment/photos.
  Only a newly acknowledged review save shows Thank You. A concurrent winner or
  recovered uncertain save opens Your Review. No review is created by navigation.
- Up to five selected photos can be previewed/removed. The system image picker
  does not request camera, microphone or broad photo-library access. Cancellation
  and permission errors leave the form usable. Source files must actually have
  JPEG/PNG/WebP signatures, be at most 15 MiB, and decode as images. Images are
  resized to a maximum 1600-pixel edge and re-encoded as JPEG at 0.8 quality;
  outputs must be at most 5 MiB. Excessive (>50 MP) dimensions are rejected.
  Input and selected photos remain after recoverable save/upload failures.
- Native file Blobs go to Firebase's resumable upload API. Passing a typed array
  to Firebase's small-file multipart path would fail on React Native's Blob
  implementation. Upload count/percentage and save progress are shown. Synchronous
  tap guards, a shared per-account/request operation, and create-only rules prevent
  duplicate submissions. Account changes/unmount cancel pending uploads and reject
  obsolete UI results.
- The submission service rereads the authoritative request and own profile inside
  a transaction. It checks active Customer ownership and `completed` status,
  derives the technician from current/legacy request fields, rejects conflicting
  IDs and any supplied mismatching technician, and writes the existing canonical
  `service_reviews/{requestId}_{customerId}` ID. Rules allow creation only, require
  the verified/active session, approved technician, real own-profile name snapshot,
  integer 1–5 rating, string comment ≤300 and server timestamp. Trusted ratings
  and private profiles are never widened or written by the client.
- Optional `photoPaths`/`photoAttemptId` fields contain only owned, request-specific
  object paths, never image bytes or download URLs. Old reviews still work with
  no photo fields. Existing Customer and Technician cards show photos through a
  shared accessible thumbnail/modal viewer. Real reviewer names, the shared full
  rating/count aggregation and explicit pagination are preserved.
- Files are separate from request attachments at
  `review_photos/{customerId}/{reviewId}/{20-character-attempt}/{0..4}.jpg`.
  Storage rules enforce verified active owner/completed request uploads, JPEG
  content type and 5 MiB size. Existing objects cannot be replaced. A one-way
  publication metadata update is permitted only after the immutable review
  references that exact path; file hashes, size, content type and identity metadata
  cannot change. Referenced files cannot be deleted, even before publication.
- Published photo viewing follows existing review roles: active original owner,
  verified approved target Technician, eligible verified Customer browsing an
  approved Technician, and active Super Admin. Dispatcher, unrelated Technician,
  anonymous, inactive, pending-lifecycle and revoked sessions are denied. Rules
  evaluate at most two distinct Firestore documents per Storage operation. The
  publication flag supplies immutable review membership without a third lookup.
  All application downloads use authenticated `getBlob`, with only transient
  component-memory data URIs for native rendering. No bearer download URL is
  generated or stored by the app. Private request-photo paths remain denied.
- Upload failures abort review creation. Definitely rejected Firestore saves clean
  only that attempt's unused objects. A concurrent saved review's objects are
  excluded and independently protected by Storage rules. Ambiguous commit/network
  failures retain files, because a read returning no review cannot disprove a
  delayed commit. Retry first checks the server for an existing review. During the
  same process, retained paths are reconciled against a later saved immutable
  review and only unused paths are cleaned. Saved-review photo publication can be
  retried by its owner from the photo viewer. Notification failure does not turn
  a committed review into a failed submission or create a second review. An
  eight-second notification-confirmation deadline prevents an offline queued
  notification from indefinitely blocking a successfully saved review.

## Changed files for this task

- `app/(tabs)/request-details.tsx`, `review-technician.tsx`,
  `technician-profile.tsx`: review entry/form/saved state and Customer photo display.
- `app/technician/performance.tsx`, `src/services/technician.service.ts`:
  photo display/mapping added to the pre-existing uncommitted paginated reviews work.
- `src/services/review.service.ts`, new `reviewSubmission.service.ts`,
  `reviewPhotos.service.ts`, `src/utils/reviewValidation.ts`,
  `src/components/reviews/ReviewPhotos.tsx`: persistence, validation and photo lifecycle.
- `firestore.rules`, new `storage.rules`, `firebase.json`,
  `firebase.review-author-test.json`, `src/firebase/config.ts`: authorization and
  explicit demo Storage connection; ordinary Auth/emulator selection is unchanged.
- `app.json`, `package.json`, `package-lock.json`: Expo picker/manipulator modules
  and picker permission descriptions, with camera/microphone disabled.
- New `scripts/tests/review-submission.test.mjs`, `review-photo-picker.test.mjs`,
  `review-storage.test.mjs`; existing reviewer-name tests now use server timestamps
  for client creates. Existing review-list tests stub the native photo component.
- `scripts/check-rating-types.mjs`, `scripts/lib/performance-test-deps.mjs`,
  `scripts/lib/performance-render-harness.mjs`: expanded scoped checks and fixtures.
- `.gitignore`, this document and `storage.cors.review.example.json`: local test
  artifacts and operator instructions.

The pre-existing dashboard/review pagination hooks, map indexes, rating tests,
performance tests, seed fixtures and previous validation document were retained.
`firestore.indexes.json` was not edited by this task; it already contained the
pending review-query indexes from that earlier work.

## Validation performed

- Focused form/picker/submission and existing review/rating/performance tests:
  **53/53 passed**. Includes no-write navigation, entry labels, explicit stars,
  negative feedback, comment bounds, selected-photo removal, denied/cancelled
  picker, real-byte validation, resizing/upload Blob handling, upload progress,
  partial failure, cleanup/retry, uncertain commits, concurrent/repeated taps,
  existing reviews, account changes, offline notification confirmation and
  accessible larger-image viewing.
- Local Auth + Firestore + Storage tests: **22/22 passed** using only hardcoded
  demo-project/loopback fixtures. Covers direct malicious-client writes, storage
  owner/request/type/size checks, publication and overwrite/delete denial, private
  request-photo denial, both roles' submitted-photo list mapping and correct full
  rating summary, reviewer names, notifications, pagination and access revocation.
- Scoped TypeScript and changed-file ESLint passed. Full TypeScript still reports
  22 unrelated errors in Admin Web Vite/assets/import configuration, OTP tests and
  template theme imports/types. Full lint still reports eight unrelated errors:
  `app/(tabs)/select-service.tsx` unescaped apostrophe and seven template imports.
- Combined review/performance/authentication/account/password regression run:
  **115/115 passed** (the focused 53 plus 62 existing regressions).
- Android production JS/Hermes export passed (3,036 modules), producing local
  output at `.expo/review-submission-android-check`. The sandbox initially denied
  executing `hermesc.exe`; the authorized local export passed. This is not an APK
  install, native-module rebuild, deployment or proof of device UI success.
- The first security run exposed an unavailable Storage rules property and a
  missing explicit create-only object guard; both were fixed and the suite rerun
  successfully. Initial sandbox-only startup could not download the Storage rules
  runtime; the local-only rerun downloaded it. On this Windows/Java 24 setup,
  Firebase's shutdown leaves the demo Firestore Java child alive; only this task's
  verified orphan process was stopped between runs. Storage emits Java deprecation
  and shutdown-pipe diagnostics even when the test command exits successfully.

Reproduce checks from the repository root (PowerShell; `.cmd` avoids the host's
PowerShell script execution restriction):

```powershell
node --test scripts/tests/review-submission.test.mjs scripts/tests/review-photo-picker.test.mjs scripts/tests/technician-reviews-list.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/performance.test.mjs scripts/tests/change-password.test.mjs scripts/tests/auth-persistence.test.mjs scripts/tests/account-session.test.mjs scripts/tests/forgot-password.test.mjs
node scripts/check-rating-types.mjs
npx.cmd eslint 'app/(tabs)/review-technician.tsx' 'app/(tabs)/request-details.tsx' 'app/(tabs)/technician-profile.tsx' app/technician/performance.tsx src/services/review.service.ts src/services/reviewPhotos.service.ts src/services/reviewSubmission.service.ts src/components/reviews/ReviewPhotos.tsx src/utils/reviewValidation.ts src/firebase/config.ts src/services/technician.service.ts scripts/tests/review-submission.test.mjs scripts/tests/review-storage.test.mjs scripts/tests/review-photo-picker.test.mjs scripts/tests/reviewer-names.test.mjs scripts/tests/technician-reviews-list.test.mjs scripts/lib/performance-test-deps.mjs scripts/lib/performance-render-harness.mjs scripts/check-rating-types.mjs
$env:DEBUG = ''
$env:CI = '1'
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
firebase.cmd emulators:exec --only 'auth,firestore,storage' --project demo-servicepilot-review-author --config firebase.review-author-test.json --log-verbosity QUIET 'node --test scripts/tests/review-storage.test.mjs scripts/tests/reviewer-names.test.mjs'
npx.cmd expo export --platform android --output-dir .expo/review-submission-android-check
git diff --check
```

Use free ports 8187/9197/9297. Do not stop another developer's emulator. If a failed
run leaves a child process, inspect its PID and full command line first and stop
only the orphan belonging to that run. Dependencies under `functions/` and compiled
domain helpers under `functions/lib` are required by existing fixtures; build them
locally with `npm.cmd --prefix functions run build` if absent.

## Two Android emulators, one Metro server — manual steps not performed

1. Use fresh local emulators, with no production import:

   ```powershell
   $env:DEBUG = ''
   $env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config'
   firebase.cmd emulators:start --only 'auth,firestore,storage' --project demo-servicepilot-review-author --config firebase.review-author-test.json --log-verbosity QUIET
   ```

2. In another terminal seed existing local fixtures. Request 1 has an existing
   review; requests 2–7 are completed and unreviewed:

   ```powershell
   $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
   $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
   node scripts/seed-rating-emulator.mjs
   ```

3. Use SDK-54-compatible Expo Go, or rebuild the development client for the newly
   added native modules. Start exactly one Metro server:

   ```powershell
   $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
   $env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1'
   npx.cmd expo start --localhost --port 8081
   ```

   Forward ports to BOTH devices, substituting IDs from `adb devices`:

   ```powershell
   $reviewAdb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
   foreach ($device in @('emulator-5554', 'emulator-5556')) {
     foreach ($port in @(8081, 8187, 9197, 9297)) {
       & $reviewAdb -s $device reverse "tcp:$port" "tcp:$port"
     }
     & $reviewAdb -s $device shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
   }
   ```

4. Customer device: `rating-bandara@example.test`. Technician device:
   `rating-gihan@example.test`. Demo-only password for both:
   `Only-for-rating-emulator-42`. Never enter production accounts into this demo.
5. On Customer, open request 1: View Your Review must show the existing five-star
   review, not Thank You. Open request 2: Rate Service must show Gihan/title,
   zero selected stars, an empty feedback field and no review creation.
6. Choose one star and honest negative feedback. Add five JPEG/PNG/WebP gallery
   photos, remove one, inspect previews, cancel the picker and retry. Test any OS
   photo denial/limited-selection prompt offered; modern Android's system picker
   needs no broad library permission. Check accessible labels with TalkBack.
7. Submit twice quickly. Progress must appear and Thank You must wait for the
   acknowledged save. Reopen the request to confirm saved stars/comment/photos
   and View Your Review. With the fresh seed baseline, the Technician summary
   becomes 3.0 (2 reviews); cards show Bandara and photos. Open/close thumbnails'
   larger viewer. Verify a new-review notification and its request navigation.
8. Review request 3 without photos and optionally without a comment; zero Storage
   uploads should be needed. Old reviews without names/dates/photos must still
   render their established fallback states. Use `--review-list-pages` on the seed
   command in fresh emulators to exercise older Technician pages.
9. Locally interrupt an upload, then retry: the same input/photos must remain and
   no photo-less review may be silently submitted. Locally interrupt Firestore
   after uploading, restore it and retry; an uncertain save must be checked before
   another create, with no saved-photo deletion. The automated emulator suite
   covers definitive Firestore denial after upload and cleanup authorization.
10. On two Customer sessions for the same request, submit concurrently; only one
    canonical review may exist, with the other session showing that saved review.
    Log out/switch accounts during selection/upload; no old feedback/photo viewer
    may appear for the next account. Never modify real requests for these tests.

Device-native picker rendering, permissions, compression, upload progress,
TalkBack, and the two-device visual/notification flow were **not manually run**.
Headless mocks, real Firebase emulator sessions and a JS bundle do not establish
that those native/device checks passed.

## Storage prerequisites and operator-only deployment steps

The live bucket's existence, plan, permissions and CORS were not verified or
modified. A configured bucket name alone does not prove Storage is available.
[Firebase's current requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
require Blaze for Cloud Storage access. This task did not enable it. If the project
has no already-provisioned eligible bucket, optional production photo uploads
cannot work until the owner separately resolves that prerequisite. Reviews
without photos remain independent of Storage. Emulators require no billing.

The following commands are prepared for authorized operator review only; they
were **not executed**:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9
firebase.cmd deploy --only storage --project servicepilot-756d9
```

Submission needs no new Firestore index. The index command includes the previously
pending paginated review/count indexes already in this working tree; preserve all
existing indexes. No Functions or Hosting deployment is required. Compare any
live Storage rules with this new local rules file before deployment, merging any
legitimate existing paths without creating public read/write fallbacks. The repo
contained no prior Storage rules to reconcile against live state.

First use of Storage rules' Firestore lookups requires the Firebase Storage
service agent's cross-service permission. The CLI/console may prompt for it;
review that separately. See [cross-service rules permissions](https://firebase.google.com/docs/rules/manage-deploy).
No such IAM change was performed here.

For browser photo viewing only, review the explicit origins in
`storage.cors.review.example.json`, substitute approved deployed Customer origins,
and apply CORS separately if needed:

```powershell
gsutil cors set storage.cors.review.example.json gs://servicepilot-756d9.firebasestorage.app
```

This command was not run. See Firebase's [authenticated byte downloads and CORS](https://firebase.google.com/docs/storage/web/download-files).
Android native HTTP has no browser CORS prerequisite. The example is not a request
to allow every origin or deploy a new hosted site.

## Remaining limits

Firestore rules validate photo path ownership/count and immutable review data;
they cannot inspect Storage object existence or decode image bytes. Storage rules
enforce MIME/size/access/hash immutability. The official app additionally checks
actual source signatures and decoder output before upload. No image moderation or
server-side decoder was introduced, and no precise location/address is inferred.

Storage and Firestore are separate persistence operations. If the app is killed
or remains offline after upload, unreferenced private objects may remain; there
is no paid/deployed cleanup function or automatic bucket scan. Ambiguous attempts
are deliberately retained rather than risking deletion during a delayed commit.
In-memory retry reconciliation cannot survive an app restart. An operator may
review abandoned attempts against immutable review references before any cleanup;
never bulk-delete an attempt merely because the client reported a network error.
New unused paths after a saved review cannot change that review or be published.
Selected input itself is retained in memory on recoverable errors, not across an
OS process kill. Existing legitimate reviews are never migrated or removed.
