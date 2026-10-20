# Login persistence and Remember Me

## Confirmed causes

- The mobile Login screen stored Remember Me only in React state and never
  passed it to `loginUser`.
- `src/firebase/config.ts` used `getAuth(app)` without native persistence. The
  installed `firebase` version is **12.19.0** (`@firebase/auth` **1.13.6**).
  Its `dist/rn/index.js` explicitly initializes memory persistence when no
  AsyncStorage adapter is supplied. No suitable native storage dependency was
  installed.
- Startup and protected routes already listened for Firebase's initial auth
  event, but profile-read errors redirected to Login even if Auth still had a
  user. Pending profile checks could also finish after logout/account changes.

## Implemented behavior

React Native initializes Auth with the public `initializeAuth` and
`getReactNativePersistence` APIs using Expo SDK 54's compatible
`@react-native-async-storage/async-storage` **2.2.0**. The installed SDK's native
`setPersistence` implementation supports switching on the same initialized Auth
instance; no secondary Auth instance or custom token format is needed.

- Remember Me ON: await native storage availability and `setPersistence` with
  React Native persistence before Firebase sign-in.
- Remember Me OFF: await `setPersistence` with `inMemoryPersistence` before
  sign-in. Firebase removes any previously saved session while preserving the
  current in-memory user. Backgrounding does not end this session. A full process
  restart does not restore it.
- Persistence failures prevent sign-in and show an actionable error. Native
  storage failures during initialization block routing with storage/restart
  instructions, instead of silently treating failed restoration as logout.
- Explicit logout retains the existing ordering: await foreground location
  sharing shutdown, then await Firebase `signOut`, which removes the Firebase
  persisted session. The logout service itself is unchanged.
- The root gate awaits `authStateReady` before mounting app routes. Startup and
  protected routes share the existing role, verification, account-status, and
  technician-approval decision function. Stale account checks and unmounted
  callbacks cannot authorize content or redirect.
- A failed account-profile read retains Firebase authentication and shows a
  retry screen. Protected content stays blocked until account access is checked.
- Existing saved Firebase sessions are loaded under the same Firebase app/name
  and configuration. Initialization reuses an already initialized Auth on Fast
  Refresh without replacing its user or changing an OFF session into ON.
- Expo web uses its platform module; Admin Web's separate Firebase configuration
  and authentication code are unchanged.

The app never manually saves passwords, credentials, or tokens. Firebase manages
its own persisted session through the supplied storage adapter. No logout is
performed merely on backgrounding. No production records, security rules, billing,
dispatcher provisioning, map/booking/rating logic, or Change Password behavior
were changed. The existing development-only emulator opt-in is retained.

References: [Firebase persistence and awaiting selection before sign-in](https://firebase.google.com/docs/auth/web/auth-state-persistence),
[Firebase native persistence API](https://firebase.google.com/docs/reference/js/auth#getreactnativepersistence),
and [Expo Firebase guidance](https://docs.expo.dev/guides/using-firebase/).
The React Native API and persistence switching were also inspected and exercised
directly in the installed SDK, rather than assuming browser APIs work on Android.
The native adapter has a localized type declaration for the public native export
that Firebase's universal TypeScript entry omits; Metro resolves the native entry.

## Changed files for this task

| Files | Purpose |
| --- | --- |
| `src/firebase/authPersistence.native.ts`, `src/firebase/authPersistence.ts` | Native initialization, readiness, persistence selection/errors; Expo web fallback. |
| `src/firebase/config.ts` | Initialize Auth through the platform module; keep the same project and emulator configuration. |
| `src/services/auth.service.ts` | Pass Remember Me through persistence selection before sign-in. Other service flows, including Change Password and explicit logout, are unchanged. |
| `app/(auth)/login.tsx` | Use checkbox selection, reject rapid duplicate submissions, expose checkbox state accessibly, remove raw login-error logging. |
| `src/components/auth/AuthSessionGate.tsx`, `app/_layout.tsx` | Wait for restoration before mounting routes. |
| `src/hooks/useMobileSessionAccess.ts`, `src/components/auth/SessionAccessFeedback.tsx`, `src/components/auth/ProtectedRoute.tsx`, `app/index.tsx` | Shared access checks, account-change cleanup, recoverable profile-read failures. |
| `package.json`, `package-lock.json`, `pnpm-lock.yaml` | Add compatible AsyncStorage and synchronize dependency locks. pnpm synchronization also records dependencies already declared in the existing manifest; their versions were not upgraded. |
| `scripts/tests/auth-persistence.test.mjs`, this document | Focused checks and Android handoff. |

Pre-existing changes retained: `app/(auth)/change-password.tsx`, its implementation
inside `auth.service.ts`, `scripts/tests/change-password.test.mjs`, and
`CHANGE_PASSWORD_VALIDATION.md`.

## Checks actually performed

1. **64 automated tests passed**:

   ```powershell
   node --test --test-reporter=spec scripts/tests/auth-persistence.test.mjs scripts/tests/change-password.test.mjs scripts/tests/foreground-sharing.test.mjs scripts/tests/performance.test.mjs
   ```

   This includes 13 new persistence/access tests, 26 unchanged Change Password
   tests, 15 sharing tests, and 10 existing subscription/performance regressions.
   The native SDK test uses the installed React Native Auth implementation with
   synthetic HTTP responses and an in-memory replacement for native storage.
   It exercises ON restoration, offline restoration, OFF clearing/restoration,
   preservation of the active session, Fast Refresh reuse, switching accounts,
   and explicit logout. Hook/JSX harness checks exercise actual Login, root-gate,
   and access-hook behavior. No HTTP request reaches Firebase.

2. **Scoped ESLint passed without warnings**:

   ```powershell
   npx eslint "app/(auth)/login.tsx" app/_layout.tsx app/index.tsx src/firebase/config.ts src/firebase/authPersistence.ts src/firebase/authPersistence.native.ts src/services/auth.service.ts src/components/auth/AuthSessionGate.tsx src/components/auth/ProtectedRoute.tsx src/components/auth/SessionAccessFeedback.tsx src/hooks/useMobileSessionAccess.ts scripts/tests/auth-persistence.test.mjs
   ```

3. **Focused TypeScript check: zero diagnostics** using the existing tsconfig
   options and the changed auth/native files plus their imported dependencies.
4. `npx tsc --noEmit`: **24 pre-existing errors**, matching the prior baseline:
   Admin Web `ImportMeta.env`, image imports and `.tsx` import configuration;
   Cloudflare OTP test types; shared theme/parallax imports and related indexing.
   No errors in the changed authentication files.
5. `npm run lint`: **8 pre-existing errors**, matching baseline: one unescaped
   apostrophe in `app/(tabs)/select-service.tsx` and seven unresolved
   theme/parallax imports. No new lint errors or warnings.
6. `git diff --check`: passed.

## Manual Android checks NOT performed

Use disposable test accounts and an explicitly configured development/demo
environment. Do not use production accounts for password/session testing.
Keep one Metro server running. Expo Go SDK 54 includes AsyncStorage; an existing
custom development build needs rebuilding to include the newly added native
module before testing. Install dependencies with the project's chosen package
manager. Use **Settings > Apps > ServicePilot (or Expo Go) > Force stop** and
relaunch for process-restart tests. Fast Refresh, Reload, Home, or backgrounding
alone are not a full process restart. Do not clear app storage between steps.

1. **Remember Me ON:** sign in with ON. Confirm the correct dashboard. Force stop
   and relaunch. Expect the restoring/checking indicator, then the same account's
   permitted dashboard, without a Login redirect/flash.
2. **Remember Me OFF:** explicitly log out, sign in with OFF, and confirm normal
   access. Force stop and relaunch. Expect Login and no protected content. Also
   test after a previous ON session to confirm an older saved user cannot return.
3. **Background/resume:** repeat with both ON and OFF. Press Home, wait, return.
   The active session should remain signed in. Confirm normal location-sharing
   foreground/background cleanup is unchanged. If Android kills the process
   while backgrounded, OFF correctly requires login on the next cold launch.
4. **Explicit logout/restart:** sign in with ON, log out with the existing control,
   and wait for completion. Force stop/relaunch. Expect Login. For a technician,
   confirm normal sharing shutdown happens before logout completes. A failed
   sharing revocation must not be reported as a completed logout.
5. **Two accounts:** sign in as A with ON, log out, sign in as B with ON, restart.
   Only B should restore and only B's private data/subscriptions should appear.
   Repeat B with OFF; restart should show Login, never A. Repeat switching during
   a slow profile read: no late redirect or data from the previous account.
6. **Offline restart:** use an installed test build with bundled JavaScript so
   loading JavaScript does not depend on Metro connectivity. Sign in online with
   ON, force stop, disable network, relaunch. Firebase should retain the saved
   user; initialization may wait for the SDK network timeout. If account-profile
   access cannot be verified offline, expect the retry screen with no protected
   content and no automatic logout/Login redirect. Restore connectivity and tap
   Try again; access should resume after the existing account checks succeed.

Also test a simulated native storage failure (clear message and no sign-in),
rapid Login taps with ON/OFF, an unverified account, a pending/rejected technician,
an inactive account, and wrong-role navigation. These must retain the established
access restrictions.

## Remaining limitations

- Device/native-bridge rendering and real Auth integration were not exercised.
  The automated SDK test simulates process restart by deleting/recreating the
  Firebase app with retained synthetic storage; it is not an Android process test.
- Offline authentication does not bypass profile/role/approval checks or provide
  new offline access to Firestore data. This change adds no private-profile disk
  cache.
- A prior memory-only session from the old app cannot survive process death and
  cannot be recovered retrospectively. Existing stored Firebase sessions and
  live in-process sessions are preserved when available; no migration is needed.
- Remember Me OFF ends on process death, including OS termination in background;
  backgrounding with a live process alone keeps authentication.
- Startup storage failures require fixing device storage and reopening the app;
  the app does not silently continue with an unknown restored-session state.

No deployment, billing changes, production writes, commits, or pushes were made.
