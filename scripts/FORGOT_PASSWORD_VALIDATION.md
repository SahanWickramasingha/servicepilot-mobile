# Forgot Password implementation and validation

## Confirmed gaps and resulting behavior

The mobile Forgot Password screen previously set its sent state without calling
Firebase. `resetPassword()` existed but was unused and returned raw SDK failures.
The hosted action page supported only `mode=verifyEmail`, so it could not validate
or confirm a password-reset link. Repository Hosting configuration cannot establish
the live Firebase Console template settings; those settings were not inspected or
changed remotely.

The screen now awaits `sendPasswordResetEmail()` through the existing service,
validates email, prevents duplicate submissions, and gives the same neutral
confirmation for eligible, missing, and disabled accounts. Network/rate-limit
failures show safe retry messages. Completion after unmount is ignored.

The hosted page supports two separate actions. `resetPassword` calls
`verifyPasswordResetCode()` before enabling password fields, requires eight
characters and matching confirmation, and awaits `confirmPasswordReset()` before
showing password-update success. It supports password visibility, policy errors,
network retries, unavailable links, and fresh reset requests. Password fields and
the in-memory action code are cleared after success/disposal. `verifyEmail` retains
its existing `applyActionCode()` behavior. No reset code signs anyone in, calls
`sendEmailVerification()`, or manually changes `emailVerified`.

The page uses an isolated named Auth instance with in-memory persistence, never
the portal's primary Auth session. URLs are stripped before SDK imports; the
page uses no-referrer metadata and Hosting headers, no analytics, and no logging
of action codes, passwords, or raw provider errors. The API key, project,
destinations and optional demo emulator endpoint come only from the reviewed
configuration module. URL `apiKey` and `continueUrl` cannot override them.
Only the existing native scheme `servicepilotmobile://login` and the configured
portal `/login` destination are offered; there is no automatic redirect.

## Changed files for this task

- `app/(auth)/forgot-password.tsx`: real request, neutral feedback, loading/error states.
- `src/services/auth.service.ts`: only the existing reset-request function changed
  in this task; prior Change Password, persistence and logout work is preserved.
- `public/auth/action.html`: existing design, reset/fresh-link forms, visibility
  controls, secure bootstrap, preserved verification action.
- `public/auth/action-controller.js`: testable reset/verification controller.
- `public/auth/action-config.js`: public Firebase configuration and fixed destinations.
- `firebase.json` and `firebase.dispatcher-hosting.json`: scoped auth-page security
  headers. Regex path matching accepts URL slashes and the Windows Hosting
  emulator's normalized backslashes; the installed emulator's glob matcher lost
  these headers on Windows. No Firestore rules, indexes or Functions changed.
- `firebase.password-reset-test.json`, `scripts/prepare-password-reset-emulator.mjs`:
  isolated demo Auth/Hosting configuration and generated static site.
- `scripts/check-forgot-password-types.mjs`, `scripts/lib/password-reset-harness.mjs`,
  `scripts/tests/forgot-password.test.mjs`,
  `scripts/tests/password-reset-emulator.test.mjs`: focused validation.
- This document.

No dependencies, service-account keys, production records, deployments, commits,
or Console changes were introduced. Other existing working-tree changes remain.

## Checks actually performed

- **75/75 client tests passed**: 13 Forgot Password tests, plus 26 Change Password,
  13 Remember Me/persistence, 10 account-session/lifecycle UI, and 13 rating tests.
  Reset tests cover pending/failed verification, missing/duplicate/unsupported
  parameters, expired/invalid/used codes, minimum length, mismatch, policy errors,
  network/rate limits, duplicate taps, neutral request responses, unmount/disposal,
  fixed destinations, URL stripping, isolated Auth and verification regression.
  Expiry, policy and network/rate failures use controlled SDK error responses.
- **4/4 Auth + Hosting emulator tests passed**, on disposable
  `demo-servicepilot-review-author` only. Actual installed Firebase SDK verified
  and reset a real emulator action, rejected the old password, accepted the new
  password, rejected a used/invalid link, preserved a separate signed-in session,
  applied a verification action, and served the page/modules with no-referrer
  and no-store headers. The first run exposed the Windows header matching issue;
  it was fixed and all four tests passed on rerun.
- Scoped TypeScript and ESLint passed for changed application/service/page/test code.
- Admin Web TypeScript + Vite production build passed; its existing large-chunk
  warning remains.
- Expo Android production bundle export passed (3,022 modules), written only to
  ignored `.expo/password-reset-android-check`. Existing NO_COLOR/FORCE_COLOR
  warnings are cosmetic. This was a bundle build, not an installed-device test.
- `git diff --check` passed.
- Repository-wide TypeScript still reports **22 unrelated existing errors** in
  Admin Web's inclusion under the mobile tsconfig (Vite env/assets/compiler
  settings), `servicepilot-otp/test`, and template theme component/hook aliases.
- Repository-wide lint still reports **8 unrelated existing errors**: an unescaped
  apostrophe in `app/(tabs)/select-service.tsx` and seven unresolved template
  theme imports. These files were not changed for this task.

Commands (PowerShell, repository root):

```powershell
node --test scripts/tests/forgot-password.test.mjs scripts/tests/change-password.test.mjs scripts/tests/auth-persistence.test.mjs scripts/tests/account-session.test.mjs scripts/tests/technician-rating.test.mjs
node scripts/check-forgot-password-types.mjs
npx eslint 'app/(auth)/forgot-password.tsx' src/services/auth.service.ts public/auth/action-controller.js public/auth/action-config.js scripts/check-forgot-password-types.mjs scripts/prepare-password-reset-emulator.mjs scripts/lib/password-reset-harness.mjs scripts/tests/forgot-password.test.mjs scripts/tests/password-reset-emulator.test.mjs
npx tsc --noEmit --pretty false
npm run lint
npm --prefix admin-web run build
$env:CI = '1'
npx expo export --platform android --output-dir .expo/password-reset-android-check
```

## Exact isolated emulator test commands

Installed root and `functions/` dependencies are required. The emulator test uses
the installed Admin SDK only for disposable local accounts. No credentials are
required. Ports 9197 (Auth) and 5008 (Hosting) must be free.

```powershell
node scripts/prepare-password-reset-emulator.mjs
$env:DEBUG = ''
$env:CI = '1'
firebase emulators:exec --project demo-servicepilot-review-author --config firebase.password-reset-test.json --only 'auth,hosting' --log-verbosity QUIET 'node --test scripts/tests/password-reset-emulator.test.mjs'
```

Keep `DEBUG` empty and `--log-verbosity QUIET`: the Auth emulator's default output
includes reset action URLs, and Hosting access logs can also contain their query
parameters. Do not run with `--debug`, export emulator action data, or print/save
the emulator `oobCodes` response. Tests consume codes in memory without printing
them; all data is discarded when these emulators stop. The generated site lives
under ignored `.expo/password-reset-emulator`; production public files are never
rewritten. Do not deploy this demo directory/configuration.

## Required live configuration — review only, not executed

1. Review `public/auth/action-config.js`. Production project is
   `servicepilot-756d9`, `emulatorUrl` must remain `null`. The existing native
   scheme works for installed builds; Expo Go is not proof of custom-scheme
   handling. There are no configured universal/app links to add or assume.
2. Host **all three** auth files and the existing logo. The default `firebase.json`
   hosts `public/` but does not serve the portal SPA at `/login`. To preserve the
   portal and make its sign-in button work, use the existing combined staging
   configuration below. If the real portal uses another approved origin, set the
   fixed `webSignIn` configuration to its reviewed HTTPS login URL instead.
   Never derive that destination from reset-link parameters.
3. In Firebase Console, select **servicepilot-756d9 → Authentication → Templates
   → Password reset → edit / Customize action URL**. Set the email **action
   handler URL** to exactly:
   `https://servicepilot-756d9.web.app/auth/action`
   (no hardcoded `mode`, code, or continue query parameters). Save the template
   with Firebase's generated link placeholder retained. Inspect the template
   preview/generated email after saving. Review Email address verification as
   well if the Console customization applies across templates; its generated
   `mode=verifyEmail` link must still reach this page.
4. Under **Authentication → Settings → Authorized domains**, verify the actual
   Hosting domain and any separately configured approved portal domain. Keep the
   existing Email/Password provider enabled and review its password policy. The
   page enforces a minimum of eight characters and surfaces additional Firebase
   policy requirements. Review email-enumeration protection; the UI already
   normalizes missing/disabled account responses independently of that setting.
5. An `ActionCodeSettings.url` passed to `sendPasswordResetEmail()` is a continue
   destination, **not** the handler configuration. The service deliberately
   leaves it unset. See Firebase's
   [custom email action handler documentation](https://firebase.google.com/docs/auth/custom-email-handler)
   and [email action state documentation](https://firebase.google.com/docs/auth/web/passing-state-in-email-actions).

Hosting release commands below are for owner review **only**. They publish the
whole combined portal/public site, so review the existing portal build-time
backend configuration first and preserve its approved backend URL. Do not replace
it with a placeholder or deploy default `public/` over an existing portal.

```powershell
# Build using the portal's existing, reviewed production environment.
npm --prefix admin-web run build
if ($LASTEXITCODE -ne 0) { throw 'Portal build failed' }
$resetHostingStage = Join-Path (Get-Location) '.expo/dispatcher-hosting-review'
New-Item -ItemType Directory -Path $resetHostingStage -Force | Out-Null
Copy-Item -Path 'public/*' -Destination $resetHostingStage -Recurse -Force
Copy-Item -Path 'admin-web/dist/*' -Destination $resetHostingStage -Recurse -Force
$env:DEBUG = ''
firebase deploy --only hosting --config firebase.dispatcher-hosting.json --project servicepilot-756d9
```

Only staging/release assets from the reviewed build should be present in that
directory. No Firestore rules/index deployment, migration, Functions deployment,
backend endpoint, paid service, or billing change is needed for this reset flow.

## Manual inbox/browser/device checks — not performed

Use an approved **test project and disposable test account**, with that project's
public config and its own template URL; never point the demo emulator page at
production. A real email inbox cannot be validated by the Auth emulator, which
does not send email. After the owner configures/releases the handler, verify:

1. In the mobile app choose Forgot Password, enter the disposable account email,
   and submit once. Rapid taps must create only one in-flight request. Confirm
   neutral confirmation for both an existing and nonexistent email. Check invalid
   email, airplane mode/network failure, and rate-limit feedback separately.
2. Receive the reset email; check its trusted Hosting origin/path before opening.
   The handler must remove query parameters from the address bar, validate the
   code, then enable the new-password form. Before validation it stays disabled.
3. Try a short password, mismatched confirmation, and visibility toggles. Submit
   matching passwords with at least eight characters that meet project policy.
   Double-click Reset: only one request stays in flight. Success appears only
   after Firebase confirms; the password fields clear and Back to Sign In works.
4. Sign in normally: the **old** password must fail and the **new** password must
   work. The reset page must not have signed the user in or replaced an existing
   portal session. Registration verification remains a separate action.
5. Reopen the original email link: it must be unavailable, leave the password
   form disabled, and offer a fresh reset email. Repeat with a missing/modified
   code and an actually expired link. Request a fresh link and complete it.
6. Disable connectivity during code validation and separately during confirmation;
   errors must not show success. Restore connectivity and retry. Navigate away
   during a request; there must be no late UI/navigation update. On browser reload,
   the stripped URL intentionally cannot resume the code: reopen the email link.
7. Open a real registration `mode=verifyEmail` email and confirm the existing
   verification result and mobile/portal sign-in buttons. Check malicious
   `continueUrl`/`apiKey` query values cannot change the project or destination.

Remaining limitations: real inbox delivery/template routing, browser visual and
assistive-technology checks, installed Android/iOS deep-link behavior, real network
disruption, real rate limits/expiry, and live password-policy enforcement were not
manually exercised. Local emulator integration uses the installed SDK; the hosted
page retains its existing pinned Firebase CDN version and needs normal network
access to load it. No live configuration/deployment success is claimed.
