# Technician browsing and application approval — local validation

Scope: the attached request's tasks A and B only. No deployment, production data
write, migration, email, commit, push or APK rebuild was performed. The extensive
pre-existing working-tree changes were retained.

## Permission investigation

Both Home (`app/(tabs)/index.tsx`) and the directory
(`app/(tabs)/technicians.tsx`) already called `subscribeToApprovedTechnicians`.
Neither queried private technician `users` documents. The actual query is:

| Property | Value |
| --- | --- |
| Collection | `technician_map_profiles` |
| Required filter | `approved == true` |
| Optional district filter | `serviceDistrictIds array-contains <canonical district ID>` |
| Optional service filter | `serviceCategory in <canonical label plus supported legacy candidate labels>` |
| Ordering | document ID ascending |
| Limit | 8 initially, 16/24 after Load more; capped at 24 |
| Follow-up | one server `get` of each returned public projection, to enforce current authoritative approval |

The list Rule requires an authenticated Customer, an existing active own profile
(legacy missing accountStatus retains the established active default), no
`lifecyclePending`, an `auth_time` newer than any `sessionRevokedAt`, and the
**ID token** `email_verified == true`. A profile's `emailVerified:true` does not
substitute for this claim. Public document gets additionally require that the
technician's authoritative private profile is still approved and active. That
server-side Rule lookup does not grant customers access to the private document.

**Evidence and limit:** running the real original subscription against the
unchanged Rules succeeded for Dashboard, district/service filtering and an empty
district. Thus a general query/Rules mismatch was not demonstrated. An isolated
Auth/Firestore test then reproduced the exact permission denial with an older
unverified token: even after the Auth emulator verified the account, the same
query failed until the token refreshed. The modified subscription recovered.
This is a demonstrated failure mode, **not proof that the reported device has
that exact state**. Its original runtime root cause remains NOT VERIFIED without
that session's diagnostics. Redeploying identical Rules or restarting Metro
does not repair token/session authorization.

Changes: refresh the owning token once per pooled connection; wait for a server
snapshot; preserve query filters, bounds and current-approval checks. Errors now
identify `connection`, `query`, `approval check`, or `confirmation` in diagnostic messages and
retain the Firebase error code. Both screens display failure + Retry; a
permission failure is not rendered as a successful empty result. Retry reconnects
the pooled listener for every mounted consumer and cancels the previous listener.
There is no repeated full-collection polling. An inconsistent old approved public
projection whose authoritative technician is no longer approved still raises an
approval-check error in that implementation. The subsequent focused fix and its
before/after regression evidence are documented in
[TECHNICIAN_DIRECTORY_APPROVAL_CHECK.md](TECHNICIAN_DIRECTORY_APPROVAL_CHECK.md).
Privacy and authoritative approval checks are retained.

Both the customer directory and review queue have a 15-second initial online
confirmation deadline, producing failure/Retry instead of an indefinite offline
loading state. It does not start automatic repeat queries.

For a remaining device failure, inspect the new error stage/code, configured
Firebase project, refreshed token's `email_verified` and `auth_time` claims, own
saved role/account/lifecycle/revocation state, and authoritative approval of the
returned technicians. Do not log ID tokens or private profiles.

## Review workflow

Super Admin now has `/admin/applications` in its existing portal. It reuses the
existing Dispatcher application page and protected review service. Dispatcher
applications remain at `/dispatcher/applications`. No job assignment was added.

The queue reads authorized saved `users` data with `role == technician`,
`technicianApprovalStatus == pending`, `emailVerified == true`, ordered by document
ID, 50 records per page with a cursor. Next and First page controls allow bounded
browsing. Search and completeness filtering apply to the current page. Incomplete
records can produce an empty visible page; use Next if present. Other management
pages retain their prior query scope.

Completeness requires saved UID/email, nonblank name/phone/address, a recognized
service category (including supported legacy aliases), active account and no
pending lifecycle operation. No new profile-setup flag or area field is required,
so older complete applications remain compatible.

Verification reuses the existing **token-attested saved state**, not a newly
trusted client flag: `validPublicUserCreate` permits true only with the owning
token's `email_verified:true`; `validOwnerUpdate` permits false → true only with
that verified token. Reviewer updates cannot alter verification. The emulator
tests prove an unverified applicant cannot forge the saved flag. Trusted SDK
imports bypass Rules and must uphold this invariant; this task does not certify
or rewrite historical production imports.

Rules authorize active Super Admins and Dispatchers under the existing session
gate. They require pending + verified + complete authoritative applications,
server review/update timestamps, the authenticated reviewer UID, and a nonblank
rejection reason of at most 2,000 characters. A client cannot update only the
approval: the matching public projection must be written atomically.

Both review services now use transactions. Competing decisions retry against the
latest application and then reject an already decided application. The two web
portals show Approve/Reject, approval confirmation, required rejection reason,
disabled saving actions, a synchronous duplicate-submit guard, success/failure
feedback, and queue Retry. The existing mobile Dispatcher page also gains
confirmation, a save guard and a distinct load failure/Retry state.

Approval changes neither availability nor sharing. It publishes the safe approved
projection; requesting work still requires the existing availability and account
eligibility checks. Pending/rejected technicians keep approved-only restrictions.
Reviewer UID/time/reason are persisted. The prior client review workflow had no
separate application email, notification delivery or audit-log event; none is
claimed here. Existing request/review/notification flows are retained.

## getAfter warning

The reported original line 508 is `getAfter(users/{customerId})` inside
`bookingCustomerEligible`. That helper has **no call sites** in the inspected
Rules. Neither customer directory list nor public get authorization invokes it;
those paths use `get`/`exists`, not `getAfter`. The emulator accepted the full
Rules and did not reproduce this warning. Its particular CLI/compiler diagnostic
origin is therefore NOT VERIFIED. No security checks were removed to suppress it.

`getAfter` is a supported write/transaction Rules operation, used elsewhere here
to enforce atomic profile/projection writes; see the official
[Firebase Rules documentation](https://firebase.google.com/docs/firestore/security/rules-conditions#access_other_documents).
The unused helper is not evidence that these directory reads are denied.

## Files changed for this task

- `src/services/technician.service.ts`: token refresh, server confirmation, stage
  diagnostics and pooled Retry.
- `app/(tabs)/index.tsx`, `app/(tabs)/technicians.tsx`: loading/failure/Retry/empty states.
- `functions/src/domain/technicianApplication.ts`: shared completeness/eligibility predicate.
- `src/services/user.service.ts`: bounded verified mobile queue and transactional review.
- `app/dispatcher/index.tsx`: confirmation, duplicate guard and failure state.
- `admin-web/src/App.tsx`, `admin-web/src/layouts/AdminLayout.tsx`: shared Admin applications route/navigation.
- `admin-web/src/hooks/useTechnicianUsers.ts`: review queue filters, cursor paging, Retry.
- `admin-web/src/pages/dispatcher/DispatcherApplications.tsx`: shared review actions/feedback.
- `admin-web/src/services/technicianApprovalService.ts`: transactional decisions.
- `firestore.rules`, `firestore.indexes.json`: protected review validation and queue index.
- `firebase.technician-access-test.json`, `scripts/tests/technician-access-emulator.test.mjs`,
  `scripts/tests/technician-access-ui.test.mjs`: isolated integration and rendered UI checks.
- `scripts/lib/subscription-reliability-workloads.mjs`,
  `scripts/lib/performance-test-deps.mjs`, `scripts/tests/subscription-reliability.test.mjs`,
  `scripts/tests/service-categories.test.mjs`: refresh-aware adapters, pooled recovery
  and transactional approval regressions.
- This validation document.

## Local checks

Results: 6 isolated Auth/Firestore integration groups passed; 38 host UI/service/
regression tests passed. Mobile TypeScript, Functions TypeScript build, targeted
mobile and domain lint, Admin Web TypeScript/Vite build and Admin Web lint passed.
Admin Web lint retains 10 existing warnings (effect state updates, Fast Refresh
exports and Reviews dependencies); its Vite build retains the large-chunk warning.
No pre-existing failing check was suppressed. Early fixture-loader/cache/timestamp
test failures were corrected before the passing rerun. CLI remote-MOTD and Admin
SDK metadata discovery warnings did not prevent isolated emulator execution.

Commands from the repository root (PowerShell):

```powershell
npm.cmd --prefix functions run build
npx.cmd tsc --noEmit
npx.cmd eslint 'src/services/technician.service.ts' 'src/services/user.service.ts' 'app/(tabs)/index.tsx' 'app/(tabs)/technicians.tsx' 'app/dispatcher/index.tsx'
npm.cmd --prefix admin-web run build
npm.cmd --prefix admin-web run lint
Push-Location functions
.\node_modules\.bin\eslint.cmd src/domain/technicianApplication.ts
Pop-Location
node --test --test-reporter spec scripts/tests/technician-access-ui.test.mjs scripts/tests/service-categories.test.mjs scripts/tests/subscription-reliability.test.mjs scripts/tests/map-loading.test.mjs scripts/tests/technician-reviews-list.test.mjs
$env:DEBUG = ''
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'servicepilot-access-config'
firebase.cmd emulators:exec --project demo-servicepilot-access --config firebase.technician-access-test.json --only auth,firestore 'node --test --test-reporter spec scripts/tests/technician-access-emulator.test.mjs'
```

The demo suite requires loopback emulator hosts and uses only a `demo-` project.
It executes the actual customer subscription, application query hook, web review
service, Rules and Auth. It covers both portals' actor roles, unverified/disabled/
revoked sessions, forged verification, incomplete applicants, reasons/reviewer
timestamps, atomic public visibility and racing decisions. Rendered mobile tests
exercise loading/error/empty/Retry. Review and notification subscription regression
tests also run. Browser rendering and native interaction are not implied by these
host tests. The emulator does not validate production composite-index readiness.

## Review-only release commands

No migration is required. A single `users` composite index was added for the
verified pending queue; existing public-directory indexes remain intact.

```powershell
firebase.cmd deploy --project servicepilot-756d9 --only firestore:rules,firestore:indexes
# Wait until the index reports Ready before portal verification.

# In the existing release environment with its real HTTPS Admin Worker origin:
$env:VITE_DISPATCHER_API_URL = Read-Host 'Existing Admin Worker HTTPS origin'
$env:VITE_USE_FIREBASE_EMULATORS = '0'
npm.cmd --prefix admin-web run build:pages
Push-Location admin-web
..\admin-worker\node_modules\.bin\wrangler.cmd pages deploy dist --project-name servicepilot-admin-web
Pop-Location
```

No Worker, deployed Functions, billing change or email service is required by
these changes. Do not deploy Functions just because the shared domain file lives
under `functions/src`; mobile and Admin Web compile that module directly.
Mobile JavaScript changed: an installed standalone APK needs a new release APK
or a compatible already-configured EAS Update. Metro/Expo development can reload
the source. No APK or OTA publication was performed.

## Manual checks — NOT VERIFIED

On local demo accounts, test Super Admin and at least two active Dispatcher
logins, both web routes, queue paging/search, confirm/cancel approval, blank and
multiline rejection reasons, rapid double clicks, simultaneous opposing decisions,
success removal, offline/permission failure and Retry. Verify application details
and persisted reviewer metadata after reload. Check incomplete and old complete
profiles, no self-approval, and disabled reviewer access revocation.

On two customer/technician devices or emulators using one Metro server, verify
Dashboard/directory success, confirmed emptiness, filter changes, offline and
permission errors, Retry while both screens remain mounted, verification completed
outside the app, and logout/account-switch cleanup. Check newly approved offline
technicians cannot receive requests until their existing availability policy
allows it, sharing stays unchanged, and reviews/notifications still render.

The original production device failure, deployed Rules/index state, real browser
portal interaction, real Android/APK operation and live email delivery are
NOT VERIFIED. No production repair is inferred from compilation or emulator success.
