# Verification, profile creation and resend — 6 November 2026

This is a focused follow-up to the current audit, not a new project audit.
Unrelated uncommitted work is preserved. No deployment, production record write,
account deletion, commit, push or APK rebuild was performed.

## Demonstrated findings

**Reported production denied create:** the supplied operation is a rejected
create, `profile-create-transaction / permission-denied`, not failed email
verification or a post-commit confirmation failure. Its precise production cause
is **NOT ESTABLISHED** by the supplied payload/stage alone.

Read-only inspection of the current `servicepilot-756d9` Firestore release found
Rules identical to local source after line-ending normalization. Ruleset:
`abdcc5a1-35cc-4348-bed0-2ef055937ec2`; release update
`2026-11-05T18:48:50.976551Z` (6 November, 00:18:50 Asia/Colombo).
The source returned by the API has SHA-256
`26b1a2efea2ec320d7c276a990a3a42011948225442aeb52f0766ee801a4df31`.
The normalized local/deployed SHA-256 is
`7cf174be3157511763a713fc6899a3da67f428fa3583e76e41397656840f74f9`.
No user records or production Auth identities/tokens were inspected.

These Rules already accept `emailVerified: true` only with the owning verified
Auth claim. They no longer require the older false-only creation flow. The
reported Customer field set is allowlisted; policy versions and acceptedAt
timestamp/request-time checks agree. The REQUEST_TIME transforms are accepted.
UID/path ownership and exact Auth email matching remain required. The transaction
may read its own missing document without an existing profile/session; create
does not call the protected-content active-session gate. Technician creation
still requires a public role, pending approval, offline availability and its
allowlisted professional/category fields. No Rules were relaxed in this follow-up.

The exact REST Commit shape (`currentDocument.exists=false`, the Customer fields
and all three REQUEST_TIME transforms) was exercised with real emulator tokens:
403 with a cached unverified claim, then 200 with an awaited refreshed verified
claim. Both actual service flows also refresh stale claims before their profile
transaction. The old false-only Rules predicate reproduces the SDK's original
`permission-denied` for both roles; restoring current Rules allows both. These
are controlled denial causes, not proof of the token/release used by the reported
production Commit. Current matching Rules with a verified token accept this shape.

**Resend defect:** `sendVerificationEmail` already reloads the current Auth user
and skips the SDK email call when verified. The screen ignored that distinction
for cooldown and always started another countdown. Failed profile completion also
used a combined verification/setup error while leaving resend available. Neither
the old countdown nor SDK acceptance proved inbox delivery.

**Additional native confirmation defect:** after restoring current local Rules,
the Customer transaction committed, but the immediate `getDocFromServer` snapshot
reported missing. Independent emulator inspection found the saved verified profile
and resolved timestamps. The original sanitized code was
`profile-server-confirmation / firestore/profile-confirmation-missing`.
Installed Firestore source implements `getDocFromServer` through a snapshot
listener. The precise underlying listener/cache timing is not claimed to be proved.
The application previously treated that one post-commit absence as final.

## Changes

- `src/services/registration.service.ts`: retain original error code/stage and
  record verified state only after awaited Auth reload and forced token refresh.
  Already-verified resend clears the send cooldown; accepted requests start it;
  throttling/uncertain timeouts back off without claiming acceptance. Operation
  locking, account identity checks and existing 20-second deadlines remain.
- `src/services/auth.service.ts`: preserve separate refresh/send failure stages;
  check account identity again after sending. A verified reload never sends mail.
- `src/services/user.service.ts`: after an acknowledged transaction, an unexpected
  server-marked missing snapshot gets one read-only transaction confirmation
  (`maxAttempts: 1`). It never retries a write. Identity, server metadata, role,
  lifecycle, policy and resolved timestamp validation still apply. A genuinely
  missing, denied, cached, pending or switched-account result cannot grant access.
- `src/utils/onboardingFeedback.ts`, the verify-email/profile-setup/register
  screens: distinguish unverified email, refresh failure, verified setup failure,
  request failure and already-verified continuation. Confirmed verification hides
  resend; a failed profile setup offers a safe Continue action. Existing committed
  profiles reconcile without replacement. Old account/unmounted responses are ignored.
- `src/utils/registrationDebug.ts`: allowlist the distinct verification-refresh
  stage; diagnostics retain only sanitized stage/code/version/project metadata.
- Focused registration/emulator tests and new `verification-feedback.test.mjs`:
  actual Commit, stale claims, deferred refresh, security controls, missing-snapshot
  confirmation, genuine absence, lost acknowledgements, resend outcomes, repeated
  taps, identity changes, restart/re-entry and role destinations.

Auth and default-database Firestore share the same Firebase app in config. Normal
configuration targets `servicepilot-756d9`; explicit development demo mode targets
`demo-servicepilot-review-author`. Environment mismatches already fail startup.
Integration tests assert the real token audience/issuer, Auth app and Firestore
app agree. The reported APK's actual token/Firestore credential at incident time
and installed source/update identity remain **NOT VERIFIED**.

## Checks

- Auth/Firestore registration integration: **24 PASS, 0 FAIL/SKIP**.
- Registration, feedback, onboarding state, account session, persistence and
  policy regression suites: **65 PASS, 0 FAIL/SKIP**. Shared confirmation behavior
  justified the account/session/policy checks; unrelated full-audit suites were not rerun.
- TypeScript: **PASS**. Lint: **0 errors**, existing `job-action.tsx:50` warning.
- Integration projects are hardcoded disposable demo projects with loopback-only
  emulator hosts. Automated tests send only to the local Auth mail sink. Provider
  throttling/network/invalid-session errors are injected at the SDK boundary while
  the registration service and other SDK operations remain real.

## Native UI evidence

Android 15 / API 35, Expo Go, existing Customer AVD launched as a disposable
read-only instance, one Metro server. Explicit demo Auth 9197 / Firestore 8187;
ADB reverse and loopback endpoints. No production fallback or real email.

| Journey | Actual result |
| --- | --- |
| Fresh Customer form and initial verification request | PASS: Verify Your Email; Auth unverified; no profile; one local sink message |
| Premature I've Verified Email | PASS: original `verification-check / registration/email-not-verified`; setup remains blocked |
| Unverified Resend after cooldown | PASS: second local sink message; UI says request accepted and inbox delivery unconfirmed; real countdown |
| Consume latest local verification code, then Resend | PASS: Auth verified, Email Verified heading, Continue profile setup, no new countdown or resend control |
| Continue with temporary local false-only Rules | PASS control: original `profile-create-transaction / permission-denied`; verified Auth retained, no profile, verified-but-denied feedback, safe Continue, no resend |
| Restore current Rules and Continue (before confirmation fix) | Write PASS; first confirmation interrupted with original missing code; saved verified Customer profile and valid timestamps independently observed |
| Retry existing Customer and sign in | PASS: original saved profile recovered and Customer dashboard reached |
| Fresh Technician with final confirmation fix | PASS on first completion: actual form/initial local message, consumed local action code, I've Verified Email reached Registration Submitted / under review; server profile verified, pending/offline, all timestamps resolved; no new confirmation error |

Local verification codes were consumed through the real Auth emulator action-code
SDK, not an Admin emailVerified override. Browser handoff and real inbox delivery
are **NOT VERIFIED** in this run. Screenshots contain disposable fixtures and stay
in ignored local evidence; credentials, links and private payloads are not reported.
System UI/Expo reload errors and stale accessibility-tree failures occurred during
test setup; successful UI states above were separately captured and inspected.
Fresh Customer first-attempt creation after the final confirmation fix was covered
in SDK/Rules integration, but a second fresh native Customer run was **NOT VERIFIED**.
The native Customer first-save interruption above occurred before that fix.

## Release status and next action

No additional Rules deployment is required by the current comparison. If a later
reviewed Rules change needs deployment, the exact command is below, **not executed**:

```powershell
firebase.cmd deploy --config .\firebase.json --only firestore:rules --project servicepilot-756d9
```

Production resolution of the supplied denied Commit is **NOT VERIFIED**. Correlate
a fresh sanitized failure with the installed build/update, active Rules revision
and verified-claim/project-match booleans at that operation; do not share tokens
or payloads. Do not automatically retry denied writes against production or widen
Rules based on the payload alone. Real inbox delivery, provider throttling,
physical-device/iOS/release APK journeys and the full native restart/switch/failure
matrix are **NOT VERIFIED**. No release readiness is inferred from compilation.
