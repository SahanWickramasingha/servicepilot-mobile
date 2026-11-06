# Registration initialization and recovery

Registration opens a 60-second, in-memory initialization window before Firebase
Auth creation (or explicit recovery sign-in). The window binds to the matching
email and then UID. It ends on completion, failure, timeout, logout or account
switch. It is coordination only: Firestore Rules and account lifecycle checks
still enforce access. The global gate blocks interaction and accessibility to
the underlying screens while checking setup. Existing disabled, deleted,
lifecycle-pending and revoked profiles are never exempted.

Profile creation is a create-only transaction, followed by a server read that
confirms UID, role and active state before sending verification email. A failed
or unconfirmed write signs out only the registering account and releases the
window. Auth accounts are not automatically deleted: a timed-out write can
have committed. A later successful profile snapshot does not itself resume
registration or send verification email.

For an existing partial Auth account, fill in the registration form, explicitly
accept policy terms, submit, and choose **Recover incomplete registration** in
the error dialog. This authenticates using the entered email and password and
creates only a missing profile; it never overwrites an existing profile. If a
profile already exists, sign in normally. Reset a forgotten password from login;
contact support for a denied recovery or inactive account. Ordinary login does
not create profiles or grant policy acceptance. Passwords and profile payloads
are not stored for recovery across process restarts.

No rules, indexes, backend deployment, migration, production records or billing
changes are needed.

## APK failure investigation (4 November 2026)

A read-only Rules API comparison retrieved ruleset
`f43b1d0f-d0b6-4615-97ed-a23d20b19ca8`, updated
`2026-11-03T06:04:08.265109Z`. Git's source comparison found no differences
between that release and local `firestore.rules`. The downloaded source's SHA-256
is `4c885356b1c32b439dfc231390bb688142fae25f7f8f526e599c646255fbce36`.
Both allow the current policy fields, canonical technician category ID, pending
approval and offline availability. **No Rules deployment is required.** No
production Auth user or Firestore document was created, read or modified.

The actual registration/Auth/profile services and account observer were exercised
against loopback Auth/Firestore emulators with both the current local Rules and
the downloaded current release. Valid Customer and Technician registration,
server confirmation and verification succeed. Partial-account recovery preserves
UID, an incorrect password fails authentication with no profile write, and a
complete existing profile cannot be overwritten or assigned a different role.
An injected lost confirmation response preserves the committed profile and its
UID, reports `profile-server-confirmation / unavailable`, sends no verification,
and safely refuses a second create.

The older October 29 snapshot at the ignored review artifact
`.firebase/review-config/profile-save/deployed.rules` reproduces
`profile-create-transaction / permission-denied` for both roles. Isolated emulator
controls prove rejection of policy fields for both roles and category ID for
Technicians. That historical snapshot is **not** the current deployed release,
so this is not evidence that today's APK failure requires a Rules deployment.

Demonstrated client defects fixed in this follow-up:

- Recovery previously displayed raw Firebase authentication errors. It now
  explains that the original email/password are required, with Forgot Password
  guidance. Disabled, throttled and network failures have their own messages.
- Profile failures previously lost their original stage in the registration
  wrapper, and errors were logged only in development. Release diagnostics now
  emit `[registration-failure]` with only sanitized stage and code. A cleanup
  error cannot replace the original profile error.
- Registration validates profile and category input before Auth creation.
  Recovery checks profile absence from the server and checks it again inside
  the create-only transaction. Stale cached absence cannot authorize overwrite.

The reported APK's initial profile failure has not been reproduced with the
current services and deployed Rules. No Android device was connected to ADB for
reading its existing logs, and no APK artifact was present in this workspace.
Its build ID and original failure stage/code are still needed to establish the
device-specific cause. Do not describe the emulator results as proof that the
reported APK is fixed.

For a device with the diagnostics included, collect only the
`[registration-failure]` stage/code from React Native logs; do not share a full
logcat dump, Auth tokens, credentials or profile information. Typical distinctions:

| Stage | Meaning |
| --- | --- |
| `recovery-authentication` | Auth rejected recovery before any profile creation |
| `profile-existence-read` | Server read could not confirm whether a profile exists |
| `profile-create-transaction` | Create-only transaction failed; retain the original Firebase code |
| `profile-server-confirmation` | Write may have committed; never delete/recreate Auth or overwrite a profile |
| `profile-initialization` | Coordination window expired or account changed |

Run the committed emulator suite with current local Rules (all writes stay in
the disposable demo project):

```powershell
$env:DEBUG = ''
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config/registration/cli-config'
firebase.cmd emulators:exec --only auth,firestore --project demo-servicepilot-registration --config firebase.registration-test.json "node --test scripts/tests/registration-emulator.test.mjs"
```

`DEBUG` is cleared because Firebase CLI otherwise inherits unrelated shell debug
settings and may print its child environment. Downloaded release sources and
local comparison configs remain under ignored `.firebase/review-config/`.
No APK was rebuilt during this investigation.

Validation results for this follow-up:

- Current local Rules: 6 emulator tests passed.
- Downloaded current deployed Rules: 6 emulator tests passed.
- Historical October 29 Rules: 2 reproduction/control tests passed, with the 4
  current-contract tests intentionally skipped.
- Registration, legal-policy and service-category unit/UI suites: 29 passed.
- Focused account-session policy/login/revocation suites: 6 passed.
- TypeScript and targeted ESLint passed; `git diff --check` passed.
- Device/APK reproduction remains unverified; the installed build and original
  failure reference were requested. No APK build or production mutation ran.

Follow-up changed files (the existing gate/coordination edits from the preceding
task remain preserved):

| File | Change |
| --- | --- |
| `app/(auth)/register.tsx` | Actionable recovery authentication alert |
| `src/services/auth.service.ts` | Safe recovery authentication messages, original code retained |
| `src/services/registration.service.ts` | Validation before Auth; original stage/code and cleanup errors retained |
| `src/services/user.service.ts` | Payload validation, authoritative absence read, distinct create/confirmation stages |
| `src/utils/registrationDebug.ts` | Sanitized release diagnostics without profile data |
| `scripts/tests/registration-emulator.test.mjs` | Actual Auth/Firestore/service/Rules integration coverage |
| `scripts/tests/registration.test.mjs` | Recovery UI, credentials, diagnostics and cleanup regressions |
| `scripts/tests/legal-policy.test.mjs` | Server-read fixtures for confirmation and collision tests |
| `scripts/tests/service-categories.test.mjs` | Valid technician payload and server-read fixtures |
| `firebase.registration-test.json` | Loopback demo emulator configuration |
| `docs/registration-initialization.md` | Findings, provenance, checks and remaining device limitation |

## Checks

```powershell
npx.cmd tsc --noEmit
npx.cmd eslint "app/(auth)/register.tsx" src/services/auth.service.ts src/services/user.service.ts src/services/account-session.service.ts src/services/profile-initialization.service.ts src/services/registration.service.ts src/components/auth/LiveAccountGate.tsx
node --test scripts/tests/registration.test.mjs scripts/tests/account-session.test.mjs scripts/tests/legal-policy.test.mjs scripts/tests/service-categories.test.mjs
```

The account-session suite has an unrelated map-callable fixture that omits its
existing `../domain/serviceCategories` dependency. Run its relevant cases with
`node --test --test-name-pattern="session policy|mobile|web live|forced revocation" scripts/tests/account-session.test.mjs`.

Manual device checks remain necessary; automated tests do not establish live
Firebase or Android success. Use an explicitly configured non-production test
environment, never normal production sessions redirected to an Auth emulator:

1. Register a customer with policy acceptance. Delay the profile response; verify
   the setup gate remains visible without signing out, then reaches verification
   only after server confirmation.
2. Reject the profile write, then restore access and use explicit recovery. Confirm
   the same Auth UID is reused and the form data is saved once. Repeat with an
   existing complete profile and verify it is not overwritten.
3. Leave the profile unavailable for over 60 seconds. Confirm protected screens
   remain inaccessible, then retry through recovery after signing out.
4. Switch/log out during creation and while saving. Confirm the old attempt
   cannot route or send verification for the replacement session. Restart after
   an incomplete attempt and recover using the same credentials.
5. Disable, delete or revoke the test account during initialization. Confirm the
   existing enforcement still denies it. Check normal customer/technician role
   restrictions, policy gates, login and verification resend.

## APK rebuild

Installed standalone APKs embed the old JavaScript and require a rebuilt APK:

```powershell
eas build --platform android --profile preview
```

Use the repository's existing release environment and release checks. Install
the resulting APK on each test device. No build or deployment is executed by
this change; Metro refresh alone does not update an already installed standalone
APK.
