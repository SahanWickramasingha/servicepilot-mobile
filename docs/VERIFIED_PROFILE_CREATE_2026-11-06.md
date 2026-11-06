# Verified-user profile-create denial — 6 November 2026

Scope: registration, verification, profile creation and the users-create Rules.
Existing unrelated edits were preserved. No full audit, deployment or rebuild.

## Cause and smallest fix

`completeVerifiedRegistration` reloads Auth and force-refreshes the ID token,
requiring both the Auth user and token to be verified. `createUserProfile` then
submits `emailVerified: true` in its create-only transaction at `users/{ownUid}`.
The earlier `validPublicUserCreate` predicate required that flag to be `false`,
so even a verified owning user was denied.

The narrow fix was already present in the local uncommitted Rules: allow the
`true` flag only when `request.auth.token.email_verified == true`, while retaining
legacy `false` creation. It was preserved and documented; no additional service
or authorization change was necessary. Ownership, Auth email matching, public
role/field allowlists, current policy/timestamps, pending approval and offline
Technician creation remain enforced.

## Actual reproduction and checks

Disposable `demo-servicepilot-registration`, loopback Auth 26497 / Firestore
26487. The actual registration/profile services ran against real SDKs and Rules.
The new comparison changes only the verified-create predicate back to its old
value and restores the current Rules in `finally`; no production Rules API is used.

Both roles produced the original sanitized error below, with verified token
claims, a submitted `emailVerified: true`, and no persisted profile:

```json
{"role":"customer","stage":"profile-create-transaction","code":"permission-denied"}
{"role":"technician","stage":"profile-create-transaction","code":"permission-denied"}
```

After restoring the narrow fix, retry with the original Auth identity/draft
completed Customer setup and Technician pending/offline setup. Additional real
Rules controls deny foreign UID/path/email, admin/dispatcher roles, self-approval,
available status, fabricated ratings/review counts and a string verification flag.
Existing controls deny verified profile flags from unverified Auth accounts.

- `node --test scripts/tests/registration-emulator.test.mjs`: **18 passed**, zero
  failures/skips, run through the existing `firebase.registration-test.json`.
- Registration and policy unit/UI suites: **26 passed**, zero failures/skips.
- `npx.cmd tsc --noEmit`: **PASS**.
- Targeted ESLint for registration/Auth/profile services, verification/profile
  setup screens and the emulator test: **PASS**.
- Initial comparison-test failure was Windows CRLF matching in the test, fixed
  by normalizing loaded Rules line endings. A rerun also waited for cleanup of
  the test-owned Firestore Java process; neither was an application failure.

The earlier native `profile-confirmation-missing` happened after a committed
write and remains a separate open blocker. This test does not establish the
installed APK's identity, current deployed Rules or production behavior; those
are **NOT VERIFIED**. No native UI or real email delivery was rerun here.

Next action: review the existing narrow Rules change for a separately authorized
deployment, then rerun native verified Customer/Technician registration against
matching Rules. Do not treat this as repair of the post-commit confirmation issue.
