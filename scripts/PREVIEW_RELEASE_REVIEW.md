# Preview release staging review — 2026-11-02

User-reported completed EAS build: `958781ea-ece7-4f34-98d0-dab4e3b037df`.
It was built from a dirty working tree based on `9bf6256`; current local HEAD
is also `9bf6256`. This is not proof of identical source. No upload source
archive or reproducible manifest was compared to the reviewed working tree.
Exact correspondence between these staged files and that APK is **unverified**.
Review/audit/documentation edits made during this preparation also cannot be
assumed present in the completed APK. No APK was downloaded or staged.

## Reviewed scope

Every modified and nonignored untracked path from the initial git status was
reviewed. The staged source covers permanent Expo/Android identity and preview
environment configuration, release validation and Windows launchers, category
filter route persistence and legacy validation, atomic profile/projection saves,
Firestore validation and its generator, regression tests and documentation.
Existing user work was preserved. Nothing was committed, pushed or tagged.

The three env example files use blank placeholders for URLs, identities and
credentials; only public release/emulator flags contain values. The Worker
example's service-account identity/key fields were normalized to blank
placeholders. No real key value was printed. The audit now enforces this example
policy. Existing private files are excluded through Git and EAS ignores; APK/AAB
patterns and explicit audit probes were added. No real env files, service-account
JSON, private keys, credentials, keystores or build binaries are included.
The explicit release review allowlist includes the reviewed source/test/docs.

Earlier EAS readiness/credentials documents record historical missing-variable
findings. Those were superseded by the successful real config evaluations during
build preparation. This staging review uses the actual local values without
printing them and does not change existing API URLs or remote environment values.

## Current validation

- PASS: root TypeScript (`npx.cmd tsc --noEmit`).
- PASS: mobile lint, zero errors; one pre-existing cleanup-ref warning in
  `app/technician/job-action.tsx:50`.
- PASS: Functions TypeScript build.
- PASS: Admin Web production build; existing >500 kB bundle advisory.
- PASS: focused ESLint of review/config/category/profile test scripts.
- PASS: 56 focused tests across preview config, release readiness, service
  categories/areas/distance, map loading/actions, reviews and notifications.
- PASS: real Expo CLI preview config through `eas-preview-build.ps1 -CheckOnly`;
  static release profiles/assets/upload exclusions.
- PASS: secret-pattern/source review and 21 Git/EAS private-file exclusion
  probes. The final audit also examines actual staged index blobs for credential
  patterns, service-account payloads and nonplaceholder example values.
- PASS: generated Firestore category Rules match the shared catalogue.
- PASS: 9 local Auth/Firestore emulator security tests; the deployed-snapshot-only
  test is intentionally skipped in local-Rules mode (1 skip, 0 failures).
  The isolated demo used a hash-verified copy of current Rules and stopped
  afterward. Adversarial denial assertions emitted expected permission-denied
  diagnostics, including expression-budget diagnostics; valid saves passed.
- Functions-wide lint: 17 pre-existing errors in unchanged `availability.ts`,
  `bookingSchedule.ts`, `booking-schedule.service.ts` and `trusted-auth.ts`
  (indentation, quotes and an explicit-any rule). Not silently fixed here.

Earlier profile/category reports retain their separately dated emulator results;
the current run is described above. No live production save or
device/APK verification was performed in this task.

Rules changes are prepared for separate review and were not deployed. No
production migration or write, signing change, cloud build, publication or billing
change was performed during staging preparation.

Proposed commit message:

```text
Prepare Android preview release and harden technician profile categories
```
