# Change Password validation

The original screen only validated local inputs, displayed success, and returned
after 1.2 seconds. It never called Firebase Authentication. The corrected flow
uses the existing configured Auth instance, checks for an email/password account,
validates the form, reauthenticates with the current password, then awaits
`updatePassword`. This follows [Firebase's password update and reauthentication
guidance](https://firebase.google.com/docs/auth/web/manage-users#set_a_users_password).

The existing screen design, entry routes, and delayed return are retained. The
button and inputs are disabled during submission, with an immediate ref guard
against duplicate taps. Only confirmed success clears the fields and schedules
the return. Unmount cancels that timer and suppresses asynchronous state writes.
Errors use fixed messages rather than raw Firebase error details. No credentials,
passwords, or tokens are logged or persisted by this change.

## Checks performed

- `node --test scripts/tests/change-password.test.mjs`: 26 focused service and
  screen tests passed using injected Firebase methods and the repository's hook/JSX
  harness pattern. Covers validation, provider/session checks, exact password
  preservation, ordered reauthentication/update, error messages, failure paths,
  duplicate submissions, success field clearing, account changes, and unmount.
- `node --test scripts/tests/foreground-sharing.test.mjs`: 15 existing regression
  tests passed, including revocation before logout and account-change cleanup.
- `npx eslint "app/(auth)/change-password.tsx" src/services/auth.service.ts scripts/tests/change-password.test.mjs`:
  passed.
- TypeScript compiler API check using the existing tsconfig options, the changed
  screen/service as root files, and their imported dependencies: zero diagnostics.
- `npx tsc --noEmit`: repository-wide check has 24 existing errors in Admin Web
  (`ImportMeta.env`, image imports, `.tsx` import configuration), Cloudflare OTP
  tests, and the shared theme/parallax imports. The changed files have no errors.
- `npm run lint`: baseline has 8 existing errors: an unescaped apostrophe in
  `app/(tabs)/select-service.tsx` and seven unresolved theme/parallax imports.
  These files were left untouched.
- `git diff --check`: passed.

All automated Firebase operations were mocked. No live password changes,
deployments, emulator sessions, commits, pushes, or production writes were performed.

## Manual checks still required

Use a disposable email/password account in an explicitly configured local test
environment. Keep the app's existing environment selection; do not automatically
connect normal sessions to the Auth Emulator or use production accounts for this
check. Open Change Password from Profile or Settings.

| Scenario | Steps and expected result |
| --- | --- |
| Successful change | Enter the correct current password, a different new password of at least 8 characters, and matching confirmation. Submit. The button shows loading; success appears only after completion; fields clear; the screen returns after 1.2 seconds. Sign out through the normal logout control and confirm the new password works and the old password is rejected. |
| Wrong current password | Use an incorrect current password with an otherwise valid form. Submit. An incorrect-password message appears, no success or automatic return occurs, and the original password still works. |
| Mismatched confirmation | Enter different new/confirmation values. The matching requirement remains unmet and Update Password stays disabled. |
| Weak password | Try fewer than 8 characters: submission stays disabled. If the test environment enforces additional password policy, try an 8+ character password that violates it: Firebase rejection must show the stronger-password message with no success. |
| Reused password | Enter the current password as both new values. The different-password requirement remains unmet and submission stays disabled. |
| Duplicate taps | With a valid form and a slow connection, tap Update Password rapidly. A single operation runs, inputs and submission disable, and only one success/return occurs. |
| Network failure | Load the screen, disconnect the test device's network, then submit valid values. Expect a connection message, no success/automatic return, and an enabled retry after failure. Restore connectivity before retrying. |
| Missing or expired session | Open the route with no authenticated user, fill a valid form, and submit: expect a sign-in message and no update. Separately invalidate a disposable test session and retry: expect an appropriate sign-in message on Firebase rejection. |
| Unsupported provider | Sign in with a test provider-only account and attempt a valid submission. Expect an email/password-only message, without creating a password provider. Linked password accounts should work. |
| Leave during submission | Start a slow submission and immediately go back or cancel. No delayed navigation or state updates should occur on the unmounted screen. Repeat by leaving during the success delay. |
| Throttling/recent login | With controlled test failures, verify too-many-attempts and recent-login errors show the corresponding wait/sign-in instructions without success. Avoid generating repeated real authentication attempts. |

Manual device/UI and real Auth integration checks above were not performed. The
hook harness exercises handlers and rendered props, not native rendering or
screen-reader behavior. An already sent Firebase request cannot be cancelled by
leaving the screen. A network failure after the server has accepted an update can
leave the outcome uncertain; the UI reports no success without confirmation.

No Firestore rules/index changes, migrations, dependencies, or deployment commands
are required. Existing logout and location-sharing code is unchanged.
