# ServicePilot full functional and integration audit

## Verified creation and resend follow-up — 6 November 2026

[Current focused evidence and changed files](../docs/ONBOARDING_VERIFICATION_RESEND_2026-11-06.md)
supersedes earlier assumptions about current deployed Rules. Read-only inspection
of release `abdcc5a1-35cc-4348-bed0-2ef055937ec2` found normalized source identical
to local Rules, including trusted verified-claim creation. The supplied Customer
Commit shape succeeds in emulators with verified claims; cached unverified claims
and the historical false-only predicate reproduce denied controls. The precise
cause of the supplied production denial is **NOT ESTABLISHED**; incident-time
credentials, release and installed build must be correlated before claiming it fixed.

Resend ignored the already-verified outcome when starting its UI countdown. It now
offers profile continuation without sending or restarting cooldown; accepted mail
requests, throttling, session/network errors and uncertain requests have distinct
feedback/backoff. Verification and profile errors are separated using the result
of awaited Auth reload/forced token refresh, never a client verification assertion.
Native Customer resend, already-verified continuation and denied-write recovery
feedback were exercised against isolated demo emulators. Real inbox delivery is
**NOT VERIFIED**. A committed-profile missing-snapshot interruption recurred before
repair; one read-only transaction now confirms an unexpected post-commit absence,
with all identity/server/profile checks preserved and no repeated write.
With the final source, a separate fresh Technician completed its first verified
setup to Registration Submitted / under review, with a verified pending/offline
profile and resolved timestamps. Existing Customer recovery reached its dashboard.
The fresh Customer first-attempt path after the final confirmation repair is
integration-tested; another fresh native Customer run remains **NOT VERIFIED**.

Final automated checks: **24 integration + 65 regression tests pass**, zero
failures/skips; TypeScript passes; lint has zero errors and the existing
`job-action.tsx:50` warning. Full audit suites were not repeated. Current Rules need
no additional deployment based on this comparison; exact reviewed command and
remaining device/inbox checks are in the linked evidence. No deployment, production
mutation, account deletion, commit, push or APK rebuild occurred.

## Current Android authentication acceptance continuation

[Actual UI acceptance, original errors and remaining blockers](../docs/AUTH_UI_ACCEPTANCE_2026-11-05.md)
records the follow-up against isolated Firebase emulators and one Metro server.
It supersedes older native-auth NOT VERIFIED rows only where a new UI observation
is explicitly recorded. The Customer partial-account save produced the original
sanitized `profile-server-confirmation / firestore/profile-confirmation-missing`
after a committed profile; Continue Setup and sign-in subsequently recovered
Customer access with the same account. The interrupted first confirmation remains
a release blocker. A separate fresh Technician run also saved a pending/offline
profile and reported the same confirmation code; retry reached pending approval.
Previous compilation/unit results are not used to mark new UI
journeys PASS. No deployment or release APK build occurred in this continuation.

## Verification-first onboarding, map preservation and system bars — 5 November 2026

The current implementation and acceptance record is
[SERVICEPILOT_LOCAL_HANDOFF_2026-11-05.md](../docs/SERVICEPILOT_LOCAL_HANDOFF_2026-11-05.md).
It supersedes the profile-first ordering described in older sections below.
Those historical reproductions/results remain evidence for their original source
versions, not proof of the current APK or current device acceptance.

New registration creates Auth and requests verification before any Firestore
profile write. A single root account decision coordinates startup/protected
routes; missing profiles use authenticated setup, not account-deletion denial.
Completion reloads Auth/verified claims, preserves legacy records and validates
server confirmation without overwriting trusted fields. Safe-area handling now
uses Router's existing provider around the navigator and native modals. Root
AGENTS.md's GPS/service-area/privacy requirements and existing map implementation
were retained. Exact commands, changed-path groups, integration coverage,
remaining manual checks and Rules/index release actions are in the linked record.

Current local results: 347/347 unit tests, 16/16 registration integration tests,
15/15 map integration tests and 11/11 request/evidence integration tests pass;
TypeScript/lint/category synchronization and local Hermes Android export pass.
Lint retains the existing `job-action.tsx:50` warning. No deployment, migration,
production write or remote APK build occurred. Original installed-APK diagnosis,
production readiness and unperformed manual checks remain NOT VERIFIED.

**Current assessment: local priority fixes validated; NOT READY for APK release.**

Current two-emulator acceptance used one Metro server and an explicitly isolated
demo Auth/Firestore backend. Both roles logged in. Kandy/Peradeniya persisted;
an OS-provided Kandy fix produced matching public grid cells and a visible blue
wrench marker. A Walapane fix retained the Kandy service result and showed the
outside-district note and Show location focus. Marker details, matching profile
and preselected request form were exercised; no request was submitted. Denied
customer location retained browsing; granting permission displayed approximately
33.5 km from the fresh customer fix to the public technician approximation.
Sharing OFF cleared both location documents and removed the marker. Both
dashboards' tabs were visually checked with gesture and three-button navigation.

| Current acceptance group | SDK/Rules or regression | Native UI |
| --- | --- | --- |
| Customer/Technician fresh verification-first onboarding | PASS | NOT VERIFIED; disposable form touch-driver attempts did not finish reliably |
| Customer and approved Technician login | PASS | PASS, separate accounts |
| Existing/missing profile, pending/rejected/inactive/revoked, account switching | PASS | Dedicated native matrix NOT VERIFIED |
| Password/reset/resend, stale claims, duplicate actions and deadlines | PASS | Dedicated native matrix NOT VERIFIED |
| Map service-area/GPS separation and granted/denied distance | PASS | PASS as described above |
| Gesture / three-button tab clearance | Source/regression checked | Both role dashboards PASS |
| All modal/keyboard/legal/signature/small-screen/release surfaces | Regression checked where available | Complete native matrix NOT VERIFIED |

The detailed changed-file groups, provenance/coverage limits, current manual
matrix, emulator setup, prepared deployment/build commands and remaining release
evidence are in the linked handoff. Functions build and Admin Web build pass;
Functions lint still has 17 pre-existing errors in unchanged files. Category
Rules integration adds 14 PASS and 1 intentional historical snapshot SKIP. No
new index, migration, Worker/Pages/Functions deployment or billing is required.
The original installed APK identity/first failure and deployed Rules remain
unverified; local source fixes do not establish that exact device trigger.

## Committed-profile confirmation and recovery repair — 5 November 2026

**Demonstrated local root cause:** post-commit confirmation failures were
mislabelled as profile-write failures, and explicit recovery rejected every
existing profile instead of validating and resuming it. For the inspected source,
`profile-server-confirmation` is entered only after `runTransaction` resolves.
That stage therefore follows an acknowledged write; the later
`profile-already-exists` is consistent with persistence, not evidence that the
original write was rejected. The reported events must still be correlated to
the same private account/project/build before treating them as one device trace.
`auth-create / auth/email-already-in-use` is a separate attempt that cannot
progress to a profile write.

Two fresh emulator reproductions failed before repair (6/8 controls passed):

1. Replace the current Auth user object with the same UID using the actual SDK
   immediately after the real confirmation read. The write exists on the server,
   but the identity guard throws a code-less Error; the outer catch labels it
   `profile-server-confirmation / firestore/profile-write-failed`. Keeping this
   identity guard is intentional: another auth/session must not inherit an
   earlier operation. It now reports `auth/registration-account-changed`.
2. Throw a plain provider error object `{ code: 'unavailable' }` from the server
   confirmation boundary after a real commit. The old `instanceof Error` wrapper
   discarded its code and later assigned `firestore/profile-write-failed`.
   Both wrapper boundaries now retain the original code, stage and known commit
   acknowledgement without serializing raw error messages or payloads.

These reproduce the **local classification/recovery defect**. They do not prove
which guard or transport condition triggered the installed APK. The original
generic code cannot distinguish missing snapshot, UID/role mismatch, session
change or inactive state. **Device acceptance and the exact APK trigger remain
NOT VERIFIED**. No production records were inspected/changed to infer a cause.

### Confirmation and recovery behavior now

- Server absence reads, transaction failures, existing-profile validation and
  post-commit confirmation retain distinct stages. Code-less read failures use
  `firestore/profile-read-failed` or `firestore/profile-confirmation-failed`;
  only code-less transaction failures use `firestore/profile-write-failed`.
  Provider errors such as `unavailable` and `permission-denied` are preserved.
- Confirmation requires a server snapshot with no pending local writes, an
  unchanged Auth identity, matching owner UID/email/public role, valid schema
  and authoritative account/session state. Cached/pending snapshots are
  `firestore/profile-confirmation-pending`, not a write rejection. Schema,
  identity, role and account failures have separate sanitized codes.
- Resolved timestamps are checked by finite timestamp value, never by equality
  against a `serverTimestamp()` sentinel, object identity or device clock.
  The old confirmation code did not compare timestamps or snapshot metadata;
  neither is established as the original APK trigger. Fresh real SDK timestamps
  pass. Existing legacy missing dates/policies remain subject to normal gates.
- Existing recovery authenticates first, validates the same-role own server
  profile and performs **no profile write**. Form name/address/category changes
  cannot overwrite saved values. A concurrent profile appearing inside the
  transaction is also validated without a transaction write. Ordinary create
  still refuses existing profiles; ordinary login still creates none.
- Past `sessionRevokedAt` no longer fails merely because the field exists.
  Recovery uses the existing account-session policy with current `auth_time`;
  stale/future revocation, disabled/deleted/lifecycle-pending or malformed
  profiles remain blocked. Requested role changes remain rejected.
- Unverified valid profiles continue to verification. Verified pending
  technicians continue to the pending screen; verified customers/approved
  technicians return through login. Rejected applications and outdated policy
  records return to login with guidance. No recovery approval or policy
  acceptance is fabricated, and no protected dashboard bypass is introduced.
- The UI distinguishes an acknowledged save with interrupted confirmation from
  a save whose outcome is unknown. A transaction `unavailable` is uncertainty,
  even if its acknowledgement was lost after commit. A real Rules rejection is
  tested separately and leaves no profile. Recovery safely handles either.

### Final validation for this repair

| Command/check | Result |
| --- | --- |
| `node scripts/run-audit-fixes.mjs project registration` | **16/16 PASS**, real loopback Auth/Firestore SDKs and local Rules |
| `node --test scripts/tests/registration.test.mjs` | **15/15 PASS**, including code preservation, acknowledged-save UI and recovery routing |
| `node scripts/run-functional-audit.mjs units` | **338/338 PASS** including registration, policy, role and account-session regressions |
| `node scripts/run-audit-fixes.mjs checks` | TypeScript/root lint/category synchronization PASS; existing `job-action.tsx:50` lint warning remains |
| Targeted ESLint on changed JS test/dependency files | PASS |
| PowerShell diagnostic sanitizer/syntax tests and `git diff --check` | PASS; only Git line-ending notices |

The 16 emulator cases include both public roles, incorrect passwords, UID
preservation, complete-profile read-only recovery, role mismatch, normal create
refusal, server read failures with/without provider codes, cache/pending metadata,
real timestamps, inactive/malformed profiles, old-policy preservation, approval
routing, past/future revocation, a real Rules write rejection, lost transaction
acknowledgement, a concurrent create and same/different-UID account replacements.
No real email was sent; verification actions used the Auth emulator.

An intermediate test fixture used a delete sentinel in a non-merge Admin set;
it was corrected to omit the field. Another no-overwrite baseline could observe
the previous version of an Admin-updated fixture through an already-active Web
SDK watch. A bounded test-only barrier now waits for the fixture patch before
capturing the baseline. Neither correction adds production polling or weakens
application assertions. Pre-fix red evidence is retained in ignored
`confirmation-before-fix.log/json`; final command results are in the manifest.

Changed in this repair: `src/services/user.service.ts`,
`src/services/registration.service.ts`, `app/(auth)/register.tsx`,
`src/utils/registrationDebug.ts`, `scripts/lib/RegistrationDiagnostics.ps1`,
`scripts/lib/performance-test-deps.mjs`, registration unit/emulator tests,
legal-policy/service-category fixtures, the capture guide, audit and manifest.
Unrelated existing work was preserved. **No Rules change is needed for this
registration repair.** The prior evidence/map Rules changes still require their
separate reviewed release. No deployment, production-account deletion, APK
build, real email, commit or push was performed.

Manual acceptance still required: preserve/correlate the failing APK build and
runtime project; reproduce initial failure and recovery on an authorized test
account, capture the newly specific stage/code, confirm the saved profile is
unchanged and UID retained privately, and verify verification/pending/login
destinations. Repeat wrong-password, existing-role mismatch and account switch
controls. Use the capture guide; do not share raw logs or private account data.

## Registration diagnostic preparation — 4 November 2026

**APK registration and device acceptance remain NOT VERIFIED.** The failing APK
has not been identified or reproduced; the Android SDK's ADB returned an empty
device list. No Rules deployment, APK rebuild, production account action or real
email was performed. No fresh cloud Rules metadata was fetched in this follow-up.

Exact Windows commands, installed-APK preservation/static inspection, safe ADB
capture, payload/Rules comparison, read-only deployed-release inspection and
root-cause evidence requirements are in
[APK_REGISTRATION_CAPTURE.md](APK_REGISTRATION_CAPTURE.md).

The existing source exposed release stage/code warnings, but neither app version
nor runtime project. Source inspection found no explicit console-stripping step;
this does not verify the installed APK's contents or runtime logging. Prepared
unbuilt diagnostics now emit one JSON line containing **only stage, sanitized
code, Expo app version and initialized Firebase project ID**. Legacy payload
debug loggers are silent in all builds. Verification-stage telemetry preserves
the original Firebase code while retaining the existing actionable UI error.
No account ID, profile, raw error, token or credential is logged.

`scripts/Capture-RegistrationDiagnostics.ps1` filters the selected app PID/tag,
reconstructs an allowlisted schema and discards raw logcat. It supports current
JSON and older single-line JS-object warnings; unsupported/missing events leave
the diagnosis unverified. It does not perform registration or send email.
The read-only capture itself has not been verified against a connected device.

Validation for this preparation: registration unit/render tests **13/13 PASS**,
registration Auth/Firestore emulator tests **6/6 PASS**, PowerShell sanitizer
tests **PASS**, mobile TypeScript **PASS**, root lint **PASS** with the same
pre-existing `job-action.tsx:50` warning. These local results are not APK evidence.
Changed files in this preparation: `src/utils/registrationDebug.ts`,
`src/services/registration.service.ts`, both registration test files,
`scripts/Capture-RegistrationDiagnostics.ps1`,
`scripts/lib/RegistrationDiagnostics.ps1`,
`scripts/tests/registration-diagnostics.ps1`, the capture guide and this audit.

The deployed Rules version to inspect is the `cloud.firestore` release for the
observed runtime project, default database, at failure time. The historical
`f43b1d0f-d0b6-4615-97ed-a23d20b19ca8` snapshot must not be assumed current.
Current local registration fields satisfy local create contracts, and the recent
evidence/map edits did not change those contracts. A mismatch, the earlier race,
or a wrong password is not established as this APK's root cause. Preserve the
original first failure and separate recovery event before drawing conclusions.

Reviewed **future-only** Rules command, not executed:
`firebase.cmd deploy --config .\firebase.json --only firestore:rules --project servicepilot-756d9`.
The independent evidence/map Rules fixes still need a reviewed release; no index,
Worker or Pages release is introduced by diagnostic preparation. A later APK
build requires separate review; the installed failing APK must be preserved first.

## Repair follow-up — 4 November 2026

This section supersedes the historical findings and counts below. The original
audit is retained as reproduction evidence. Application code and local Rules
were repaired in this follow-up; no deployment, production write, migration,
real email, APK build, commit or push was performed. Unrelated existing changes,
including the registration/recovery implementation, were preserved.

| Priority | Current result | Evidence and limits |
| --- | --- | --- |
| F01: account-listener failure reopens access | FIXED locally | Terminal listener errors invalidate pending token checks, clear the cached profile and disable registration-completion reevaluation. Token verification errors also stay blocked through initialization completion. Retry immediately blocks and establishes a new observer. Existing account generations, disabled/deleted/revoked denial and sign-out remain intact. Regression tests include the delayed-token race, initialization completion, token failure followed by disabled status, actual gate rendering, retry/unsubscribe, and existing account-switch/cleanup tests. |
| F02: maximal evidence denied | FIXED locally | The original sanitized failure was Firestore `permission-denied`, with emulator diagnostics `maximum of 1000 expressions reached`; this was an expression budget failure, not a demonstrated document access-call overflow. Cache the parts count and remove ten redundant wrapper calls while validating every part. Real Rules/service tests save 3 before + 3 after photos, 10 parts at maximum name/quantity, maximum notes/signature and complete exactly once. Ownership, confirmed photo references, disabled/deleted/revoked status, invalid tenth parts, revision races and incomplete completion remain enforced. |
| F03: unresolved legacy map initialization | FIXED locally | Resolve authoritative category once in `validMapProfile`, retaining the same equality/approval/role checks. Fresh unresolved legacy profiles initialize with empty category/districts; no approval, category, coverage or GPS is invented. Broader tests also exposed the 25-area budget boundary: absent districts now short-circuit before area validation. Maximum 25-area atomic writes pass; malformed/cross-district areas and private/trusted-field injection remain denied. |
| F04: installed APK registration | BLOCKED / NOT VERIFIED on device | Both actual public-role payloads commit under current local Rules, are confirmed by a server read, then proceed to emulator verification. Correct partial-account recovery authenticates and retains UID; wrong passwords fail before profile creation; existing profiles cannot be replaced or assigned another role. No attached APK or connected Android device was available to reproduce the original installed failure. Do not attribute it to the listener or Rules optimizations without its original diagnostic. |

Registration diagnostics captured only stage and sanitized code. Successful
Customer and Technician paths reached `server-confirmation-and-verification`.
Negative controls recorded `auth-create / auth/email-already-in-use`,
`recovery-authentication / auth/wrong-password`,
`profile-create / firestore/profile-already-exists`, and an **injected**
`profile-server-confirmation / unavailable`. The last case proves that a lost
confirmation preserves the committed profile; it is not evidence of the original
APK cause. Unit tests also cover `auth/invalid-credential` recovery guidance.
The existing recovery UI asks for the original password and offers password-reset
guidance instead of displaying the raw credential error. Ordinary login does not
fabricate profiles. Creation remains create-only and server-confirmed.

### Follow-up validation

Sanitized commands/results are in `FULL_FUNCTIONAL_AUDIT_COMMANDS.json`; detailed
ignored local artifacts are under `.firebase/review-config/full-audit/`.
The emulator runner uses explicit loopback hosts and disposable `demo-*` projects.
Run phases sequentially: the map phase resets only its owned loopback demo
namespace so bounded-query fixtures do not include preceding test users.

| Check | Result |
| --- | --- |
| `node scripts/run-functional-audit.mjs units` | 335/335 PASS; mobile/domain/render harness coverage, not a device claim |
| `node scripts/run-audit-fixes.mjs units` | 71/71 PASS, including the final pinned historical listener control |
| `node scripts/run-audit-fixes.mjs rules` | 11/11 PASS; real Firebase SDKs, current-policy profiles, actual services and Firestore Rules |
| `node scripts/run-audit-fixes.mjs map` | 15/15 PASS; real Rules, public/private GPS separation, OFF, approval, access, area persistence and maximum 25 areas |
| `node scripts/run-audit-fixes.mjs project registration` | 6/6 PASS; project-matched Auth emulator and actual profile service/Rules, no real email |
| `node scripts/run-audit-fixes.mjs checks` | TypeScript and root lint pass; category generator confirms generated Rules are synchronized. Root lint retains one pre-existing warning at `app/technician/job-action.tsx:50`. |
| Targeted ESLint on changed audit runner/regression/map/performance test files; `git diff --check` | PASS; only Git line-ending notices |
| Profile/category/legal rerun | 14 PASS, 1 intentionally skipped historical-snapshot case observed, but wrapper timed out. Do not count as a completed passing command. |

Fixture repairs were necessary in the account-session and map dynamic loaders
(actual service-category dependency), map public-field allowlist (existing
`serviceCategoryId`), and booking render harness (current state slots, native
attachment dependency and confirmation-before-retry behavior). No application
behavior was changed to satisfy obsolete fixtures. Intermediate polluted-map and
fixture failures were rerun cleanly. The historical audit still documents
unresolved Storage/listener-runtime controls, two availability controls,
Functions lint errors, Pages environment guard and non-priority product limits;
they are not silently reclassified as passing by these focused repairs.

### Changed files in this repair follow-up

Production fixes: `src/services/account-session.service.ts`,
`src/components/auth/LiveAccountGate.tsx`, `firestore.rules`.
Regression/integration coverage: `scripts/tests/functional-audit.test.mjs`,
`functional-audit-core-emulator.test.mjs`,
`functional-audit-evidence-emulator.test.mjs`, `map-location.test.mjs`,
`account-session.test.mjs`, `performance.test.mjs` (all under `scripts/tests/`).
Validation/report tooling: `scripts/run-audit-fixes.mjs`,
`scripts/run-functional-audit.mjs`, this report and its command manifest.
Other dirty/untracked registration, documentation, test and configuration files
predate this repair and remain preserved; the full git status is not a list of
new changes made by this follow-up.

### Manual acceptance still required — NOT VERIFIED

Use an explicitly configured non-production project and two devices/emulators
with one Metro server. Never infer emulator configuration merely from Android
running on an emulator. The full two-device checklist below remains required.
For the repaired paths specifically:

1. Open protected content, interrupt the account-status listener while a token
   check is outstanding, and end a delayed registration initialization. Access
   must remain covered and untappable, including accessibility navigation.
   Tap Retry while offline: remain blocked with retry guidance. Restore service,
   Retry and verify a fresh status check before access opens. Switch accounts
   while checks are pending; old results must never authorize the next account.
   Disable, delete and revoke disposable accounts: access closes and sign-out
   is enforced, including while registration is initializing.
2. As an approved technician, save three confirmed photos per stage, ten valid
   parts and maximum supported notes/signature; reopen and confirm persistence.
   Attempt foreign photo IDs, an invalid tenth quantity, stale revision and
   incomplete completion: reject without a partial write. Complete a valid job
   twice: one transition/notification. Confirm the customer cannot read foreign
   evidence or private profiles.
3. Open an older unresolved technician profile: initialization succeeds safely,
   no fabricated specialty/coverage/approval/location appears, and it is not
   shown as eligible until authoritative required fields are valid. Correct
   specialty/district explicitly, save areas and reopen. Enable sharing with
   mock GPS, then turn it OFF; no district-centre fallback marker is allowed.
4. Preserve the failing installed APK before replacing it. Record version,
   source/build ID, runtime project and connectivity. Capture only the first
   `[registration-failure]` stage/code through sanitized local logcat; do not
   share raw logs, passwords, tokens, email links or profile payloads. Reproduce
   Customer and Technician separately with demo accounts and a test transport.
   Confirm the server profile exists before verification. Force a profile-write
   rejection; retry the same email via recovery, first with the wrong original
   password (actionable reset guidance), then the correct one (same UID, only a
   genuinely missing profile created). Repeat with an existing profile and a
   different requested role: no overwrite. A committed-but-unconfirmed profile
   must be retained. Capture the original stage/code before assigning a cause.

### Release actions and remaining blockers

**Rules deployment is required** for F02/F03. The historical deployed Rules
matched the pre-fix source; the repaired source intentionally differs. For later
explicitly authorized release review only (not executed):

```powershell
firebase deploy --only firestore:rules --project servicepilot-756d9
```

No index change or production migration is required by these repairs. Existing
13 index metadata checks remain historical evidence, not a new cloud check.
An **APK rebuild is required** to include the listener/gate fix after the missing
APK diagnostic and manual acceptance checks are resolved; no APK was built here.
No Worker or Pages code changed for these fixes and neither needs redeployment
solely for them. Existing Worker/Pages configuration and operational blockers
listed in the historical audit still require separate release verification.
Local automated priority checks passing does not establish installed-APK,
browser, production-email or deployment readiness.
Task-owned emulator controllers and leftover inspection sessions were stopped
after validation. No production service was stopped.

## Historical audit before repairs (retained evidence)

**Original assessment: NOT READY for the next preview release.**

Audit date: 4 November 2026, Asia/Colombo. Committed baseline:
`2102ae09910e96650697098465d3dd7cad06cf33`, plus the existing uncommitted
registration/recovery changes. Root `AGENTS.md` was read; no nested project
`AGENTS.md` was found. Existing work was preserved.

This is an audit, not an application repair. No application behavior, Rules,
indexes, IAM, billing or production records were changed. No account was deleted
in production, no real email was sent, no remote APK build/deployment ran, and
nothing was committed or pushed. All write tests used disposable loopback demo
projects. Cloud access was limited to read-only Rules/index metadata.

## Executive assessment

Substantial local functionality works: registration for both public roles,
credential-based recovery retaining the UID, policy enforcement, canonical
public profiles, foreground GPS publishing/access/OFF cleanup, atomic duplicate
booking prevention, real reviewer names/private-profile isolation, dispatcher
provisioning/lifecycle controls, and all three current Workers' local tests and
dry-runs. The Android JavaScript/Hermes export and Admin Web build also succeed.

Release blockers remain:

1. **The reported installed-APK registration failure is not explained.** Current
   services pass six registration emulator tests. Its original profile-stage/code
   and installed build identity were not available; no Android device was
   connected. The earlier race must not be presumed to explain this failure.
2. **Account access can reopen after its live status listener terminates.** The
   audit reproduces a committed async-token race and an additional path introduced
   by registration initialization completion.
3. **A supported evidence record is rejected by Rules' 1,000-expression limit.**
   Three photos per stage save, but adding ten valid parts fails for an approved,
   verified technician with current policy acceptance.
4. **An unresolved legacy technician cannot initialize its map projection.**
   A fresh fixture reproduces a Rules expression-budget rejection without any
   stale records or missing policy acceptance.

There is **no current Firestore Rules/index deployment drift to fix**. At
`2026-11-04T11:56:09Z` (17:26:09 Colombo), read-only metadata returned Ruleset
`f43b1d0f-d0b6-4615-97ed-a23d20b19ca8`, updated
`2026-11-03T06:04:08.265109Z`; its source matches local `firestore.rules` after
line-ending normalization. All **13 local composite indexes** match deployed
**READY** indexes; none is missing/building. Source equality does not mean the
Rules are functionally correct: the budget failures above occur with that source.

## Evidence and status definitions

- **PASS** means the specifically described local automated path passed. It is
  not a claim of physical-device or production success.
- **FAIL** means a reproducible application failure, or an explicitly identified
  failing check. A fixture/environment failure is not automatically an app defect.
- **PARTIAL** means some subpaths passed but important integration/device or
  operational checks did not complete.
- **NOT VERIFIED** means no adequate execution evidence exists for that scope.

The audit executed real Firebase Web/Admin SDKs against Auth/Firestore/Storage
emulators, actual client services, Rules, Worker REST adapters, workerd/Miniflare
and a local standalone booking HTTP server. Unit/render harness tests are labelled
separately. Admin Web browser interaction and Android UI were not executed.

## Feature matrix

| # | Feature group | Status | Executed evidence and limits |
| --- | --- | --- | --- |
| 1 | Customer/Technician registration, policies, verification, recovery | PARTIAL | Six real-service registration cases pass in a project-matched Auth emulator; both payloads commit and are server-confirmed before verification. Wrong passwords fail before profile creation, recovery retains UID, existing profiles/roles cannot be overwritten, and lost confirmation preserves the committed profile. Four hosted Auth-action tests pass. Reported APK failure remains NOT VERIFIED. |
| 2 | Login/logout, Remember Me, restoration, passwords, switching, lifecycle | FAIL | Broad auth/session/password unit coverage passes; 31 provisioning/lifecycle emulator cases and four hosted Auth-action cases pass. New audit tests reproduce terminal-listener races, including a registration-completion regression. Native cold-start persistence, offline logout marker removal and actual installed-APK switching remain NOT VERIFIED. |
| 3 | Technician applications, dispatcher decisions and roles | PASS | Category/profile/legal emulator batch: 14 pass, one historical-snapshot case intentionally skipped. Dispatcher/lifecycle batch: 31 pass. Trusted account provisioning, pending approval, canonical category checks, failed Auth/commit recovery, role denial and protected-account restrictions execute locally. Portal interaction/inbox delivery remain outside this PASS scope. Customers still select approved technicians; no dispatcher assignment was restored. |
| 4 | Private profiles/public projections, categories, districts, areas, availability | FAIL | Canonical and known-legacy projection initialization pass with unique current-policy fixtures. District/area validation and reset logic pass unit coverage; current category/profile Rules tests pass. Unresolved legacy projection initialization fails (F03). Availability control run passes 12/14; its two remaining booking failures are not isolated enough to assign a new root cause. Catalogue coverage is four Kandy localities plus explicit Other/district-only coverage, not all towns. |
| 5 | Directory, filters, search, ratings, navigation | PARTIAL | Category/filter/navigation/render tests pass. Fresh public projection omits address/phone/email/GPS. Search operates on loaded results, capped at 24 IDs (F06); it is not a global search. Native navigation and large real-directory behavior remain NOT VERIFIED. |
| 6 | Maps, permissions, sharing, freshness, distances, precise access | PARTIAL | Fresh actual-service test passes public/private separation, browsing denial of precise GPS, owning-job precise access, foreign-customer denial and OFF removal. Movement/interval throttling, permission-denial handling, freshness, haversine distance, overlap selection and map actions have passing unit coverage. Legacy unresolved projection fails. Actual Android wrench rendering, blue dot distinction, mocked Kandy/Walapane movement and two-device permissions remain NOT VERIFIED. |
| 7 | Requests/photos, receipts, duplicate taps, uncertain retries, atomic notices | PASS | Unique current-policy zero-photo booking concurrently submitted twice produces one request, receipt and notification. Corrected audit-only UI fixture confirms duplicate-tap prevention. Photo Worker tests (24) and request upload/receipt/diagnostic unit tests pass. Real private R2, native file picker/upload and production network acknowledgement loss remain NOT VERIFIED. Original older attachment fixtures are not a clean passing end-to-end suite. |
| 8 | Accept/reject/cancel, conflicts, rescheduling, concurrency, timezones, legacy | PASS | Four real Firestore REST booking-adapter cases and one standalone HTTP/Auth/Firestore case pass, plus scheduling/booking unit tests. They cover concurrent overlaps, adjacent jobs, revision/idempotency, ownership, revocation, availability, lost acknowledgement and legacy schedule review. Production hosting/IAM and actual UI remain NOT VERIFIED. |
| 9 | Job status, timer, pause/resume, notes, photos, signature, completion | FAIL | Work-timer, signature-coordinate and evidence validation unit tests pass; simple accepted-policy notes persist through the actual policy service/transaction/Rules. Three before and three after photos persist, then ten valid parts fail the Rules budget (F02). Complete maximal job workflow cannot be certified. Original evidence fixtures also omit policy acceptance. Native capture/drawing, app-kill timer and completion UX remain NOT VERIFIED. |
| 10 | Reviews, ratings, pagination/photos, aggregate consistency | PARTIAL | Fresh unique completed-job review stores the actual profile name, is readable by another customer without exposing that profile, sends one notification and refuses overwrite. Review/rating/paging/photo unit coverage passes. Older reviewer integration reruns timed out and include reused deterministic data; they do not establish a new aggregate defect. Clean full-history/offline live aggregates and real Storage review-photo integration require another isolated run/device acceptance. |
| 11 | Notifications, read/unread/read-all, paging, cleanup, account isolation/push | PARTIAL | Both real notification-history cases in the workflow batch passed; unit suites cover joins, read-all, retained rows, boundaries and switching. Booking/review fresh tests prove real notification creation. Native OS push is not implemented (F07); Firestore in-app notices are not evidence of FCM/Expo push delivery. |
| 12 | Admin/Dispatcher portals, invitations/resend, controls, moderation, reports/messages/audits | PARTIAL | Admin Web build/lint pass; role route structure is present. Provisioning/lifecycle 31-case emulator batch, Admin Worker 16 tests and eight REST/Auth/Firestore cases pass. Legal Rules batch exercises reporting/moderation access. Browser workflows, production email, deep links and deployed Pages/API compatibility remain NOT VERIFIED; local Pages env guard fails. Admin collection reads are unbounded (F08). |
| 13 | Terms/Privacy, versioned acceptance, blocks/reports/deletion | PARTIAL | Version consistency, unchecked registration, policy retry/cancellation, blocks and private reports/moderator permissions have passing unit/emulator coverage. Legal/support/deletion pages and copy/composer failure paths are tested in harnesses. Deletion remains a manual email/operator process; admin delete is access restriction, not erasure. No real email or deletion request was sent. |
| 14 | Booking/Photo/Admin API authentication, CORS, validation, errors/retries | PASS | Booking 6, Photo 24 and Admin 16 local tests pass after sandbox retry; all three dry-runs/type checks pass. workerd exercises JWT signature/audience/expiry/current-Auth checks and real local R2 binding behavior; REST emulator cases cover atomic recovery. Local failure/CORS/input/deadline handling passes the cases in those suites. Production origins, service-account IAM, R2 binding/privacy, quotas and real email remain NOT VERIFIED. |
| 15 | Firestore/Storage Rules, indexes, IAM assumptions, private media/GC | FAIL | Read-only deployed comparison: same Rules, 13/13 READY indexes. Fresh client privacy/access boundaries pass; legitimate evidence/legacy projection writes hit Rules budgets. Storage legacy-read/new-write-denial cases partly execute, but the broader Storage runtime controls were unstable and are not a clean PASS. Cleanup engine has local tests; no cron is configured by default (F09). IAM and actual private-bucket state were not exercised. |
| 16 | Environment, release guards, APK config, Pages/build compatibility | PARTIAL | Mobile TypeScript/root lint pass (one warning); Functions build passes but lint has 17 errors. All Workers type-check/dry-run and Admin Web builds pass. Static release guard passes, as does local .env + explicit preview emulator flag. Configured offline Android/Hermes export passes outside sandbox; no APK was built. Pages env guard fails, remote EAS/Pages settings and installed APK provenance remain NOT VERIFIED. |

## Priority registration investigation

Trace: `app/(auth)/register.tsx:207` validates the form and calls
`registerAccount` at line 334 -> `src/services/registration.service.ts:9` validates
the payload before Auth and opens the bounded coordination window ->
`auth.service.ts:28` creates Auth or explicitly authenticates recovery ->
`user.service.ts:137` reads absence from the server, checks again in a create-only
transaction and confirms the saved UID/role/account state from the server ->
verification is sent only after persistence. The account observer blocks setup
UI while missing-profile initialization is active; inactive/revoked accounts are
not granted an exception.

| Reproduction | Original stage / sanitized provider code | Result |
| --- | --- | --- |
| Fresh Customer and Technician registration | Auth -> profile transaction -> server confirmation -> verification; no provider error | PASS for both roles |
| Repeat registration using the same email | `auth-create / auth/email-already-in-use` | No second Auth identity or profile |
| Partial Auth account; wrong recovery password | `recovery-authentication / auth/wrong-password` in the emulator; unit tests also cover `auth/invalid-credential` and enumeration-protected variants | Authentication denied before profile creation; actionable original-password/Forgot Password message |
| Partial Auth account; correct credentials | Same original UID; genuinely missing profile created | PASS for both roles |
| Existing complete profile, including attempt to change role | `profile-create / firestore/profile-already-exists` | Original profile and UID preserved |
| Injected lost server-confirmation response after real commit | `profile-server-confirmation / unavailable` | No verification, original Auth kept, committed profile remains, second create refused |
| Installed APK's reported initial Profile Setup Failed | **Original stage/code unknown** | NOT VERIFIED; cannot identify the actual cause from the generic alert |

The reported `auth/invalid-credential` identifies recovery authentication failure,
not a Firestore create failure. Wrong-password behavior is demonstrated, but it
does not prove that the user's password was wrong: wrong email/project/build or
another Auth condition has not been ruled out for that device. The current
credential error is safe/actionable; authentication is never bypassed.

The October 29 saved Rules snapshot discussed in earlier work is not today's
deployed Rules. It must not be used as the explanation for this APK. Current
Rules accept both current registration payloads, and current deployed indexes
match. No production account repair or Rules rollout is justified solely by this
registration report. Capture the existing APK build ID and sanitized
`[registration-failure]` stage/code before assigning its root cause.

## Ranked findings

### F01 — High — Terminal profile-listener failures can reopen account access

- **Reproduction:** `node --test scripts/tests/functional-audit.test.mjs`.
  Delay `getIdTokenResult`, terminate the profile listener, then resolve the old
  valid token. Actual callbacks are `error, allowed`; expected only `error`.
  The same probe against `git show HEAD:src/services/account-session.service.ts`
  fails. A separate current-only probe receives an active profile during
  registration, terminates the listener, then finishes initialization: the gate
  also emits `allowed` from the obsolete snapshot.
- **Files/lines:** `src/services/account-session.service.ts:24`, `:41`, `:49`,
  `:55`; `src/components/auth/LiveAccountGate.tsx:27` clears its blocking message
  on allowed. New reproduction: `scripts/tests/functional-audit.test.mjs:16`.
- **Root cause:** the terminal listener error neither advances the revision nor
  marks the subscription unusable. Pending async work and the new initialization
  reevaluator can still authorize from previously received data.
- **Impact:** protected UI can reopen without a live account-status listener;
  subsequent disable/delete/revoke events cannot be enforced by that listener.
  This is not a demonstrated backend Rules bypass: authoritative reads/writes
  remain protected.
- **Classification/fix:** async-token path is pre-existing; initialization-finish
  path is a regression surface in the current local coordination change. Make
  terminal failure invalidate all pending evaluations and cached reevaluation;
  reopen only after a successful new subscription/check. Keep network failures
  distinct from revocation. Requires an **APK rebuild** after a tested fix.

### F02 — High — Supported maximum job evidence exceeds the Rules expression budget

- **Reproduction:** `functional-audit-evidence-emulator.test.mjs` creates a unique
  approved/verified technician with current policy acceptance, real assigned job
  and confirmed synthetic R2 metadata. Actual service saves three before photos
  (revision 1), three after photos (revision 2), then attempts ten valid parts
  with valid notes. The last write returns `permission-denied`,
  `maximum of 1000 expressions ... reached`, at Rules line 1385. Simple notes
  with zero parts pass. This is not the old fixtures' missing-policy problem.
- **Files/lines:** `firestore.rules:611`, `:632`, `:1385`;
  `src/services/jobEvidence.service.ts:29`; reproduction test `:53`.
- **Expected/actual:** the advertised three-photo/ten-part record should save;
  legitimate notes update is denied, potentially preventing completion.
- **Root cause/impact:** combined authorization/evidence validation exhausts the
  evaluator's per-request expression budget. Technician loses progress/gets a
  save failure despite valid input. Source is committed/pre-existing and matches
  deployed Rules; no production write was performed to reproduce it.
- **Recommended fix:** optimize repeated Rules work while preserving authoritative
  account/job/approval checks, metadata confirmation, revision/timestamp checks
  and parts limits. Test the full worst case at the real transaction boundary.
  Requires a **Rules deployment** after review; do not bypass validation in the
  client or silently lower the supported UI limit.

### F03 — High — Unresolved legacy profiles cannot initialize their public map projection

- **Reproduction:** fresh core emulator test creates a valid current-policy,
  approved technician without a category ID, specialty or district IDs, with an
  unlisted legacy service locality. `syncOwnMapProfile` attempts an honest empty
  category/district projection. It fails `permission-denied` with the
  1,000-expression limit at Rules lines 1355/1257. Canonical and known legacy
  `Electrical`/`Colombo District` controls pass.
- **Files/lines:** `src/services/location.service.ts:120`, `:128`;
  `firestore.rules:1205`, `:1224`, `:1235`, `:1257`;
  `scripts/tests/functional-audit-core-emulator.test.mjs:69`.
- **Expected/actual:** unresolved legacy data should remain unresolved without
  inventing a location or specialty; creating its safe projection should not
  exhaust Rules. Actual rejection blocks initialization and can block sharing.
- **Root cause:** category fallback/projection and paired legacy district
  validation together exceed the evaluation budget for the unresolved case.
  This is pre-existing committed behavior, not a registration payload regression.
- **Recommended fix:** reduce repeated category/district validation costs and
  retain strict projection equality. Do not guess a specialty/district or move
  GPS to a centre. **Rules deployment** needed for that fix; production migration
  is not demonstrated as necessary.

### F04 — High — Installed-APK registration remains an unexplained release blocker

- **Reproduction/evidence:** user reports Auth creation -> Profile Setup Failed
  -> Account Already Exists -> recovery invalid-credential. Six current emulator
  cases pass; there is no attached APK/build ID or connected device to replay.
- **Files/lines:** `app/(auth)/register.tsx:334`,
  `src/services/registration.service.ts:9`, `user.service.ts:145`, `:214`, `:222`,
  `src/utils/registrationDebug.ts:31`.
- **Expected/actual:** users must finish registration or recover the same UID;
  the reported installed build does not. **Root cause remains unknown**.
  Build/source mismatch, device connectivity/confirmation failure or a different
  payload are hypotheses, not findings. Current Rules drift is ruled out at the
  metadata check time.
- **Next step:** obtain installed build identity and original sanitized failure
  reference, test that artifact on a non-production two-device setup. Preserve
  the partial Auth account; do not create a duplicate, weaken checks or fabricate
  a profile on normal login. The already-local client fixes need an eventual
  **APK rebuild/install** to reach a standalone APK; none ran during this audit.

### F05 — Medium — Test harness debt hides failures and produces false application alarms

- `scripts/tests/account-session.test.mjs:192` omits the callable map service's
  existing category dependency. It fails before testing enforcement. The audit
  supplies the real dependency and all tested denial/allow cases pass. This is
  a **pre-existing fixture defect**, not evidence that mobile maps fail.
- `scripts/tests/performance.test.mjs:173` imports native upload dependencies in
  Node and seeds an old create-request hook-state layout. It fails on Expo's
  `.ts` module import before reaching duplicate-tap logic. A current isolated
  audit fixture exercises the actual form and duplicate prevention passes.
- Many original evidence/review/booking fixtures predate current policy
  acceptance and mock the policy service as already accepted. They cannot be
  treated as current positive fixtures. Reviewer reruns also reused deterministic
  document IDs and timed out; aggregate differences are not a proven app defect.
- Eight emulator suites have ordinary `.test.mjs` names. Initial broad unit
  discovery hit their safety guards; they were subsequently routed to emulators.
  Multi-project Auth initially defaulted password sign-ins to the CLI's default
  project; project-matched Auth processes corrected categories/registration/
  dispatcher results. This was an audit-harness error, not a provider failure.
- Legacy `servicepilot-otp/test/index.spec.ts:11` still expects Hello World while
  GET now returns OTP API health JSON: both tests fail. No active mobile screen
  imports `otp.service`; Firebase email actions are the verified active path.
- **Recommended fix:** repair test dependencies/state fixtures and make isolated
  per-project current-policy data mandatory. Keep intentional legacy-policy tests
  separate. Test-only changes need **no deployment**. Do not rewrite expectations
  to accept the actual Rules/session defects above.

### F06 — Medium — Directory search cannot discover beyond the first 24 document IDs

- **Reproduction:** follow `subscribeToApprovedTechnicians` with a page count
  above three. Count remains 24, query order is document ID, and has-more becomes
  false at the cap. The screen searches only that returned array.
- **Files/lines:** `src/services/technician.service.ts:126`, `:161`;
  `functions/src/domain/mapProjection.ts:15`; `app/(tabs)/technicians.tsx:109`.
- **Expected/actual/impact:** a user may interpret a name search as searching the
  eligible directory, but a matching 25th+ technician cannot appear. This is a
  source-confirmed intentional read bound with a discoverability limitation;
  no production directory-size assumption was made.
- **Recommendation:** explicit scope/cap messaging or bounded cursor pagination
  and a real searchable index. Preserve bounded reads. A client fix requires an
  **APK rebuild**; query redesign may need reviewed indexes, not deployed Functions.

### F07 — Medium — Native notification delivery is not implemented

- **Evidence:** `package.json` has no `expo-notifications`, no token-registration
  implementation or native push sender was found. `scripts/ANDROID_PUSH_DESIGN.md:1`
  is a proposal, not delivery evidence. Existing notifications are Firestore data.
- **Expected/actual:** in-app updates work in exercised paths; background/terminated
  app OS push is **NOT VERIFIED and currently unsupported**, not a tested feature.
- **Recommendation:** do not advertise native push readiness. A future implementation
  requires explicit sender/credential/device approval, **APK rebuild and backend
  rollout**. No configuration or real push was added in this audit.

### F08 — Medium — Admin reports load whole collections

- **Reproduction:** open source trace for Reports -> three `useCollectionData`
  calls -> `onSnapshot(collection(...))`, without a query limit/cursor. Current
  totals are computed client-side from every returned record.
- **Files/lines:** `admin-web/src/hooks/useCollectionData.ts:30`;
  `admin-web/src/pages/Reports.tsx:14`.
- **Impact:** increasing history raises initial reads/memory and threatens free
  quota/portal responsiveness. No production load test was performed; scale impact
  is inferred from an unbounded query, not a measured production outage.
- **Recommendation:** bounded pages and authorized aggregate/report queries;
  preserve role restrictions and complete totals. **Pages deployment** needed for
  a frontend fix; indexes might depend on the chosen query design.

### F09 — Medium — Photo cleanup has no default schedule; live delivery/IAM are unverified

- **Evidence:** `photo-worker/src/index.ts:77`, `:179` implements bounded cleanup,
  while `photo-worker/wrangler.jsonc:18` explicitly enables no cron. Local tests
  cover intent/finalize/tombstone races and a real local R2 binding, not a live job.
  Admin `/readyz` at `admin-worker/src/index.ts:15` checks configuration only and
  explicitly returns dependencies not probed.
- **Impact:** expired upload orphans are not automatically guaranteed to be
  collected; configured APIs can still have missing IAM, quota, bucket bindings,
  CORS or mail delivery in production.
- **Recommendation:** separately review operational cleanup scheduling/alerts and
  least-privilege service accounts. Check deployed endpoints with controlled test
  accounts and no destructive recovery. Future cron/API changes require a
  **Worker deployment**; no such deployment or IAM change ran here.

### F10 — Medium — Pages release configuration is not established locally

- **Reproduction:** `node admin-web/scripts/check-pages-env.mjs` (from Admin Web)
  fails its required public HTTPS API-origin/emulator/public-variable guard.
  Generic `npm run build` and lint still pass.
- **Files/lines:** `admin-web/scripts/check-pages-env.mjs:6`;
  `admin-web/src/services/dispatcherProvisioningService.ts:14`;
  `firebase.dispatcher-hosting.json:3` points to a separate staged review directory.
- **Impact/root cause:** the current local release environment does not prove the
  Pages account API is configured. Remote Pages settings were not inspected; this
  is not proof that the deployed portal is broken. A successful generic build
  must not bypass the guarded `build:pages` workflow.
- **Recommendation:** verify actual Pages API origin, allowed origin on Admin
  Worker, Firebase authorized domains, and exact staged artifact. Config changes
  require a **Pages rebuild/deployment**; do not deploy the Firebase review staging
  directory as if it were the current Pages build.

### F11 — Low — Functions lint and one existing effect warning remain

- `npm --prefix functions run lint`: **17 errors**, in
  `functions/src/domain/availability.ts:12`, `domain/bookingSchedule.ts:3`,
  `services/booking-schedule.service.ts:1`, `services/trusted-auth.ts:4`.
  Sixteen are reported auto-fixable; one is explicit `any`. These files were not
  changed by the registration work/audit. Functions TypeScript build passes.
- Root lint exits zero with one existing effect-cleanup ref warning at
  `app/technician/job-action.tsx:50`. It is not a reproduced timer/UI failure.
- Fix style/effect handling in a separate reviewed change. No deployed Cloud
  Function is required by the current billing-free app, and no Cloud Function
  deployment should be introduced just to clear lint.

### F12 — Low — Deletion is manual restriction/erasure handling, not automated erasure

- **Evidence:** `app/legal/[page].tsx:32`,
  `functions/src/domain/legal-content.json:31`, `adminLifecycle.ts:105`.
  Composer/copy paths are tested; admin delete keeps historical records and
  disables access rather than deleting Auth/Firestore/media data.
- This is disclosed in the current legal pages, not evidence of concealed data
  deletion. Actual request handling, identity verification, retention and provider
  erasure remain **NOT VERIFIED**.
- Recommendation: retain the disclosure; establish an operator runbook/erasure
  implementation separately. It may need **trusted backend/Worker changes and
  reviewed data operations**. Do not erase shared records or delete accounts as
  part of this audit.

No **Critical** defect was demonstrated. That does not certify security across
untested production IAM, provider configuration, native code or operating systems.

## Commands, results and test counts

The exact expanded commands, working directories, exit codes, durations and
counts are recorded in [FULL_FUNCTIONAL_AUDIT_COMMANDS.json](FULL_FUNCTIONAL_AUDIT_COMMANDS.json).
Retries/overlapping suites are separate runs: **do not add these into a single
test pass percentage**. Logs and provider-metadata snapshots remain local under
ignored `.firebase/review-config/full-audit/`; raw provider credentials/payloads
are not part of the report or manifest.

| Command/run | Passed | Failed | Skipped | Interpretation |
| --- | ---: | ---: | ---: | --- |
| `node scripts/run-functional-audit.mjs units` — classified original unit/UI suites | 326 | 2 | 0 | 328 cases; map/performance fixture defects F05 |
| `node scripts/run-functional-audit.mjs audit-probes` | 2 | 3 | 0 | Five added cases: two corrected-fixture controls pass, three assertions expose the session defects (including baseline comparison) |
| `node scripts/run-functional-audit.mjs project-auth registration` | 6 | 0 | 0 | Actual services/Rules, matching Auth project |
| `node scripts/run-functional-audit.mjs project-auth categories` | 14 | 0 | 1 | Category/profile/legal tests; historical-snapshot-only case skipped |
| `node scripts/run-functional-audit.mjs project-auth dispatcher` | 31 | 0 | 0 | Provisioning, lifecycle, role/access, retry/audit paths |
| `node scripts/run-functional-audit.mjs core-probes` | 5 | 1 | 0 | Fresh random current-policy data; unresolved legacy projection fails |
| `node scripts/run-functional-audit.mjs evidence-probes` / project-matched author rerun | 1 | 1 | 0 | Fresh accepted-policy data; ten-part update fails after six saved photos |
| Booking Worker `npm test` outside sandbox | 6 | 0 | 0 | JWT/current-Auth/CORS/runtime and REST tests |
| Photo Worker `npm test` outside sandbox | 24 | 0 | 0 | Crypto/auth/policy/finalize/cleanup/local R2 runtime |
| Admin Worker `npm test` outside sandbox | 16 | 0 | 0 | Auth/provider/HTTP/Pages guard/local runtime |
| Booking Worker `npm run test:emulator` | 4 | 0 | 0 | Actual Firestore REST concurrency, idempotency and lost acknowledgement |
| Admin Worker `npm run test:emulator` | 8 | 0 | 0 | Actual Auth/Firestore REST provisioning/lifecycle recovery |
| `node --test scripts/tests/booking-runtime.test.mjs` with local backend | 1 | 0 | 0 | HTTP -> standalone Node -> Auth/Firestore emulators |
| `node scripts/run-functional-audit.mjs hosted-auth` | 4 | 0 | 0 | Real reset/verify emulator actions plus local Hosting files/headers |
| Original mixed workflow/Storage/notification suites | 18 | 10 | 0 | 28 cases; mixed stale fixtures, expression failures and missing initial Hosting. Not ten independent app defects |
| Original map/review/availability batch | 28 observed | 28 observed | — | Timed out at 240s; no final TAP count, not a completed suite |
| Accepted-policy map control | 0 | 15 hook failures | 0 | One initialization hook failure fans out; fresh core test isolates the unresolved-legacy case |
| Accepted-policy availability control | 12 | 2 | 0 | Remaining booking-denial cases not independently isolated |
| Accepted-policy reviewer control | 13 observed | 6 observed | — | Timed out at 60s; deterministic old documents contaminate some totals/duplicate assumptions |
| Combined extra Storage/Hosting fixture control | 5 | 9 | 0 | Emulator runtime terminated unexpectedly; later ECONNREFUSED is environmental, not an app regression |
| Legacy OTP `npm test -- --run` | 0 | 2 | 0 | Stale Hello World expectations, not active Firebase verification path |

Initial broad unit discovery produced 326 pass/10 fail out of 336 because eight
guarded emulator files were misclassified by filename. Those guard failures
were corrected by invoking the right infrastructure, not by weakening guards.
Initial categories/dispatcher cross-project password failures likewise disappear
with a matching Auth emulator and must not count as app regressions. The extra
combined Storage/Hosting control later had 39 observed failures/15 observed passes
before its 90s timeout after infrastructure loss; it provides no completed PASS.

Build/check results:

| Check | Result |
| --- | --- |
| `npx.cmd tsc --noEmit` | PASS |
| Targeted ESLint for the added audit tools/preload/tests | PASS, zero errors/warnings |
| `npm.cmd run lint` (root) | PASS, zero errors/one existing warning |
| Functions `npm.cmd run build` | PASS |
| Functions `npm.cmd run lint` | FAIL, 17 existing errors |
| Admin Web `npm.cmd run build` / `npm.cmd run lint` | PASS / PASS |
| Admin Web Pages environment guard | FAIL in current local environment; remote environment NOT VERIFIED |
| Each Worker `npm.cmd run check` | PASS |
| Each Worker `npm.cmd run build` (`wrangler deploy --dry-run`) | PASS on verified retry; no deployment |
| `node scripts/check-release.mjs --static` | PASS |
| Release guard in bare shell | FAIL safely on missing variables |
| Release guard with `.env.local` + explicit preview emulator flag `0` | PASS; no endpoint reachability claim |
| Offline Android Expo/Hermes export with explicit local public build environment | PASS on sandbox-permission retry; no APK/native installation |
| Read-only Rules/index comparison | PASS: source matches, 13/13 READY indexes |
| `adb devices` | No devices connected; all device checks NOT VERIFIED |

Tooling retries: esbuild/workerd initially hit sandbox directory access errors;
the three Worker suites and dry-runs passed on authorized local retries. The
first Android export lacked explicitly loaded build environment; with that
environment it resolved 3,084 modules but sandbox denied `hermesc.exe`. Offline
Hermes export then passed outside the sandbox. None of those permission/config
attempts proves an application failure. Two initial index-metadata requests used
unsupported explicit page sizes (HTTP 400); default-size read succeeded. Storage
runtime instability is kept separate from actual Rules budget rejections.

Main audit entry commands:

```powershell
node scripts/run-functional-audit.mjs checks
node scripts/run-functional-audit.mjs units
node scripts/run-functional-audit.mjs workers
node scripts/run-functional-audit.mjs worker-verify

$env:DEBUG = ''
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config/full-audit/cli-config'
firebase.cmd emulators:exec --only auth,firestore,storage --project demo-servicepilot-review-author --config firebase.audit-test.json "node scripts/run-functional-audit.mjs emulator-all"

# While the audit Firestore instance is running, project-matched Auth controls:
node scripts/run-functional-audit.mjs project-auth registration
node scripts/run-functional-audit.mjs project-auth categories
node scripts/run-functional-audit.mjs project-auth dispatcher
node scripts/run-functional-audit.mjs audit-probes
node scripts/run-functional-audit.mjs core-probes
node scripts/run-functional-audit.mjs project-auth author

node scripts/prepare-password-reset-emulator.mjs
node scripts/run-functional-audit.mjs hosted-auth
node scripts/run-functional-audit.mjs bundle
node scripts/run-functional-audit.mjs bundle-configured
node scripts/run-functional-audit.mjs bundle-configured-verified
node scripts/summarize-functional-audit.mjs
```

The runner's added tests deliberately assert correct behavior; confirmed defects
remain red. It does not fix application behavior. Synthetic-policy preload is
an explicitly labelled fixture control, scoped to Admin-written loopback demo
profiles. It never patches client writes/Rules or grants production acceptance.
Earlier wrapper executions recorded child failures without exiting nonzero; the
audit runner now propagates failed child status. For those recorded executions,
use the inner case JSON/TAP status, not only the outer emulator CLI exit code.
Command manifest counts follow those inner cases. Timeouts are not converted
into passes.

## Flow traces and integration boundaries

- **Identity and roles:** registration form -> registration coordinator -> Auth ->
  private `users/{uid}` -> live gate/mobile access decision. Dispatcher creation
  uses trusted API engines and a separate Admin session, not public registration.
  Admin routes allow only Super Admin/Dispatcher paths appropriate to their role.
- **Coverage and location:** Personal Information -> profile transaction ->
  public `technician_map_profiles`. Declared district/area are separate from
  foreground `technician_locations` and coarse `technician_map_locations`.
  Public marker coordinates use device GPS/coarsening, not a district centre.
  Freshness is two minutes; writer minimum interval is 60 seconds, heartbeat
  90 seconds, movement threshold 100 metres. Distance is haversine straight-line
  distance only with fresh customer/public coordinates. Current device GPS town
  cannot be inferred from selected service area. Android-emulator California GPS
  remains a device input hypothesis until the actual device sample is inspected.
- **Booking:** UI submission lock/stable attempt ID -> optional private photo
  upload/confirmation -> client Firestore transaction -> authoritative customer/
  technician/public availability -> request + private receipt + deterministic
  notification. Accept/reschedule -> Booking API -> verified token + current
  account -> lock/revision transaction. A lost response retains retry identity.
- **Jobs:** assigned request -> server-timestamp work timer + revisioned evidence
  -> confirmed photo references, validated notes/signature -> completion checks.
  Simple evidence works; maximum notes cannot currently be certified.
- **Reviews/notices:** completed own request + actual private author profile ->
  deterministic create-only review/name snapshot -> best-effort notification.
  Canonical review queries supply totals; cached public profile rating fields
  alone are not proof of current aggregates. Notification history uses bounded
  queries/receipt joins and account-scoped cleanup; it does not send OS push.
- **Private media/trusted APIs:** native bytes/MIME/size -> Photo API authentication
  -> pending metadata -> private R2 bytes -> authoritative finalize -> confirmed
  reference -> job/request Rules. Browser credentials cannot directly write trusted
  metadata. Historic Firebase files have explicit read compatibility and new
  request/job writes are denied there. Live provider IAM/bucket/retention is not
  established by Miniflare or Admin-owner emulator transports.
- **Legal/admin:** current versions exist in app/static HTML/Rules; acceptance is
  explicit. Reports are private and moderator decisions role-protected. Delete
  restricts access/history and does not erase all provider data. Current Admin
  reports remain whole-collection listeners. API ready/configured is not proof of
  real inbox delivery or provider permissions.

## Rollout and data-repair implications (nothing executed)

| Change after this audit | Required rollout | Data repair |
| --- | --- | --- |
| Gate terminal-error fix, new client recovery/validation/diagnostics, directory UX | APK rebuild/install after tests and device acceptance | None shown necessary; keep original partial UID |
| Evidence/legacy projection Rules-budget optimization | Reviewed Firestore Rules deployment | No migration demonstrated; never guess missing specialties/districts |
| Query redesign | Reviewed indexes if definitions change | Current 13 indexes already READY; no index rollout needed for current source |
| Admin report pagination/API-origin/frontend changes | Guarded Pages rebuild/deployment | No production writes from this audit |
| API behavior, optional cleanup scheduling or future push sender | Relevant Worker/backend rollout plus explicitly reviewed configuration | Do not run orphan cleanup on live objects as an audit action |
| Account-deletion automation | Separate trusted workflow/operator review | Potential shared-history/media operations need explicit review |

For a future **reviewed Rules fix only**, the required command would be:

```powershell
firebase deploy --only firestore:rules --project servicepilot-756d9
```

No current index deployment is necessary. If a future query change adds indexes,
the reviewed command is `firebase deploy --only firestore:indexes --project
servicepilot-756d9`. These are preparation notes, not actions performed here.
There is no reason to deploy Functions or introduce billing/paid geocoding for
the current map/registration architecture. Do not use a Rules deployment to
conceal the unexplained APK registration failure.

## Two-device Customer/Technician acceptance checklist — NOT VERIFIED

Use two devices/emulators with one Metro server and an explicitly configured
non-production/demo environment. Record source/build ID and runtime project.
Normal APK sessions must not automatically use Auth Emulator because the device
is an emulator. No stage below was claimed completed on a device in this audit.

1. Customer A registers with unchecked policy first (blocked), accepts current
   Terms/Privacy, then registers. Repeat Technician B with a canonical specialty
   and all required fields. Delay profile persistence; protected UI stays blocked
   without a premature missing-profile sign-out. Save confirmation precedes email.
2. Reject one profile write using test infrastructure; record only stage/code.
   Retry using the same email: no duplicate identity. Wrong-password recovery
   shows reset guidance; correct recovery preserves UID and creates only missing
   data. A complete profile cannot be replaced or assigned a different role.
3. Follow verification/reset links in the configured non-production mailbox/action
   emulator. Verify resend cooldown and invalid/expired/reused actions. Never log
   codes, links or credentials. Switch accounts during reload/verification.
4. Test Remember Me on/off, force-stop/relaunch, cold start, password change wrong
   and correct current password, logout and account switching. Disable/delete/
   revoke test accounts while open. Trigger a terminal listener error and ensure
   access stays blocked (currently a known defect; retest the eventual fix).
5. Dispatcher test portal reviews B's pending application; approve/reject with
   correct actor/audit. Customer/Technician cannot access Dispatcher/Super Admin
   routes, and Dispatchers cannot assign customer jobs or manage accounts.
6. B saves Kandy/Peradeniya, reopens to verify persistence, changes districts and
   checks incompatible area reset. Test Other, multiple districts, older
   district-only profiles and unresolved legacy specialty without inventing data.
7. Set mock Kandy GPS using Android Extended Controls > Location, sharing ON.
   Record the device-reported sample, successful save and coarse public result.
   Use the test-only documented Kandy latitude `7.2906`, longitude `80.6336`;
   provenance is recorded in [SERVICE_AREA_MAP_VALIDATION.md](SERVICE_AREA_MAP_VALIDATION.md)
   (GeoNames feature 1241622; this audit did not re-download the gazetteer).
   A chooses Kandy and sees both list and distinct wrench marker; retain district
   boundaries, filters, attribution and the map/list switch.
8. Tap the marker: name, specialty, declared area, rating state/freshness, correct
   View Profile/Request IDs, accessibility and overlapping-technician selection.
   Confirm the customer blue dot is not the technician marker.
9. Change B's mock GPS to Walapane: B remains in Kandy service results while GPS
   stays outside Kandy. Test outside-district note, explicit Show location and
   fit-map; never move the marker to the service-town centre. The same test
   document records latitude `7.09495`, longitude `80.86074` (GeoNames feature
   11987343). These are documentation fixtures, never production GPS defaults.
10. Grant A foreground permission and compare approximate straight-line distance;
    deny it and still browse. Stale/missing coordinate: no invented distance or
    town-centre current-location marker. Stale markers have text plus grey state.
11. Sharing OFF removes coordinate markers. Pause/background, revoke permission,
    disable device location, disconnect network, log out and switch accounts.
    Failed remote removal must be visible; precise access/distance expire and no
    new foreground GPS callbacks write per sample or under the next account.
12. A submits with zero, one and two photos. Double-tap and lose acknowledgement;
    retry reuses attempt identity and produces one request/receipt/notification.
    Check denied uploads, actual byte limits and correct private R2 finalization.
13. B accepts two overlapping requests concurrently: exactly one wins; adjacent
    jobs remain allowed. Test reject/cancel races, customer/technician proposals,
    stale revisions, Colombo timezone on devices in another timezone and legacy
    schedule review. Confirm availability remains manually controlled.
14. Start/pause/resume, leave/reopen/force-stop, and verify the persisted timer.
    Save notes, 0/10/3000 boundaries and 10 parts; before/after photos up to three,
    signature capture and reopen. Maximal current evidence is a known Rules
    blocker; retest after a security-preserving fix. Invalid/incomplete completion
    must fail without a partial status transition or duplicate notification.
15. Complete a valid job. A reviews; another customer sees A's real name/initials
    without private profile reads. Verify aggregate updates beyond the first
    page, missing legacy dates, duplicate attempts and review-photo privacy.
16. Test notifications over 20 entries, live updates to older pages, read/unread,
    full read-all, audience changes, offline recovery and account isolation.
    Mark OS push unsupported until a separate implementation/device test exists.
17. Exercise Admin/Dispatcher browser invitations, resend, account controls,
    protected accounts, moderation, system messages, reports and audit outcomes
    using demo/test transports. Never use a real inbox or production account to
    satisfy this checklist without a separately authorized acceptance run.
18. Open app/public legal pages, Other-area attribution, block/report actions and
    deletion-request composer/copy fallback. Verify that opening a composer is not
    reported as submission and that soft deletion is not reported as erasure.

## Next actions, in order

1. Preserve and identify the failing installed APK; capture only the original
   registration stage/code and runtime target. Resolve that reproducibly before
   declaring registration fixed on Android.
2. Fix F01's terminal-listener invalidation and registration completion path;
   retain the added red regression tests and prove fresh resubscription recovery.
3. Fix F02/F03 Rules expression costs without widening reads/writes, granting
   trusted fields, lowering security or fabricating legacy coverage/category.
   Require fresh maximum-size and unresolved-legacy tests to turn green.
4. Repair F05 test fixtures and run clean per-project, per-run data for long
   review/Storage suites; investigate the two remaining availability controls.
   Eliminate hanging listeners and emulator-runtime instability before using a
   passing aggregate claim as release evidence.
5. Confirm actual Pages/Worker/mobile environment and least-privilege provider
   configuration. Do not infer deployment health from dry-run or `/readyz`.
6. Complete the two-device/browser checklist. Only then consider an explicitly
   reviewed preview APK/Rules/Worker/Pages rollout. No rollout or production-data
   repair was authorized or performed by this audit.

Audit-only additions: this report, its command manifest, the audit runner and
summary generator, two demo emulator configs, three focused regression/integration
test files, and one clearly labelled accepted-policy fixture-control preload.
The pre-existing registration changes remain preserved and reviewable.
Audit-owned emulator and timed-out test process trees were stopped after checks;
unrelated services were preserved.
