# Android authentication acceptance follow-up — 5 November 2026

This is the current native acceptance record. It extends the earlier
[implementation handoff](SERVICEPILOT_LOCAL_HANDOFF_2026-11-05.md); older NOT
VERIFIED rows remain historical unless explicitly superseded below. No deployed
environment, real mail delivery or release APK is represented by these results.

## Isolation and evidence

- Two existing Android 15 / API 35 emulators, each 1080 × 2400, running Expo Go.
  Customer and Technician were exercised separately against one Metro on 8084.
- Explicit development flag `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=1`, gateway
  `10.0.2.2`, hardcoded demo project `demo-servicepilot-review-author`; local
  Auth 9197 / Firestore 8187. Local Booking/Photo URLs remained isolated; neither
  service was required or called for onboarding. No production fallback.
- Backend inspection used Firebase Admin against exact loopback emulator hosts.
  It checked Auth verification, absence/presence and contents of the owning
  profile, resolved creation/policy timestamps and stable account identity.
  These inspections did not create or repair the profiles under acceptance.
- Fresh registrations used the actual form and Create Account action. Partial
  fixtures used either an interrupted UI-created Auth account or a separately
  seeded Auth-only account. Profile completion used the actual application UI.
- Verification requests were observed in the local Auth emulator mail sink.
  Its actual action link was opened in Android Chrome, with only the loopback
  host changed to the AVD host gateway. Auth changed to verified and the consumed
  code disappeared from the sink. No Admin `emailVerified` override was used for
  these journeys. Real inbox delivery is **NOT VERIFIED**.
- Original application diagnostics were read from Android logcat through a
  strict parser; only stage, code, appVersion and demo projectId were retained.
  Raw logcat, action links/codes, credentials, identities and profile payloads
  are not included in the shared diagnostic record. Ignored local screenshots
  contain disposable UI fixtures, not production profiles.

The touch driver initially used stale/covered accessibility bounds, dismissed
the keyboard with Back incorrectly, and hit its own ADB output buffer limits.
Those are tooling failures, not application registration errors or PASS results.
For subsequent form entry the emulators used hardware input with automatic
software-keyboard display temporarily disabled. Keyboard-visible captures are
identified separately; this setting is restored after the run. All submissions,
verification checks, recovery and navigation still used the real UI.

## Observed acceptance

| Journey | Actual UI and emulator evidence | Assessment |
| --- | --- | --- |
| Fresh Customer registration | Create Account reached Verify Your Email with cooldown; Auth existed unverified; one verification message; own profile absent | PASS |
| Premature Customer verification check | Stayed at Verify Your Email with “Open your verification link, then try again.”; original `registration/email-not-verified` captured | PASS: protected access blocked |
| Customer link → verified profile → access | Local browser consumed the link; Auth verified before profile creation; I've Verified Email completed a verified Customer profile with resolved timestamps; subsequent sign-in reached the named Customer dashboard; original Auth identity unchanged | PASS; sign-in after completion exercised |
| Technician partial-account recovery | Account Already Exists alert offered RECOVER INCOMPLETE REGISTRATION; original credentials returned to Verify Your Email; original Auth identity retained; no profile existed before verification | PASS |
| Technician restart during onboarding | Expo Go force-stopped and reopened before verification/profile creation; returned to verification; local link verified Auth; I've Verified Email offered account-type choice and field re-entry because the memory draft was lost | PASS |
| Restarted Technician setup → pending | Re-entered professional fields and policy acceptance through the UI; reached “Email verified successfully / Registration Submitted / Your technician profile is now under review”; backend profile verified, role technician, approval pending, availability offline, timestamps resolved, same Auth identity | PASS; no dashboard access or self-approval |
| Customer Auth-only recovery and restart | Separately seeded Auth-only fixture signed in to verification; force-stop/reopen retained the original account with no profile; Resend requested a local message; link verified it; I've Verified Email offered authenticated field re-entry | PASS through re-entry |
| Customer partial profile save | Save Profile persisted the verified Customer profile, then displayed Continue Account Setup; the original server-confirmation read reported `firestore/profile-confirmation-missing` | FIRST ATTEMPT INTERRUPTED; saved profile is not a rejected write |
| Customer Continue Setup reconciliation | Continue Setup returned to sign-in; original credentials reached the Customer dashboard; the existing verified profile and original Auth identity remained present | PASS on recovery; first save confirmation remains interrupted |
| Separate fresh Technician registration | Confirmed absent Auth/profile before starting; Create Account reached verification first time, with one local message and no profile; actual link verified Auth; first I've Verified Email saved a verified pending/offline profile but showed recoverable verification/setup feedback and `firestore/profile-confirmation-missing` | FIRST ATTEMPT INTERRUPTED after a committed write |
| Fresh Technician retry | Pressed I've Verified Email again; reached Registration Submitted / under review using the saved pending/offline profile and original Auth identity | PASS on retry; not a first-attempt PASS |

## Original sanitized errors

Observed on the current Android UI runs, not inferred from older logs:

```json
{"stage":"verification-check","code":"registration/email-not-verified","appVersion":"1.0.0","projectId":"demo-servicepilot-review-author"}
{"stage":"auth-create","code":"auth/email-already-in-use","appVersion":"1.0.0","projectId":"demo-servicepilot-review-author"}
{"stage":"profile-server-confirmation","code":"firestore/profile-confirmation-missing","appVersion":"1.0.0","projectId":"demo-servicepilot-review-author"}
```

The first is the deliberately premature verification check. The second is the
existing-account attempt that then used explicit authenticated recovery. The
third occurred after both the Customer partial-account transaction and the
separate fresh Technician transaction: independent server inspections found
the complete saved records. It is a
confirmation interruption, not evidence of a Rules-denied write. The precise
reason that this immediate client read reported missing is **NOT ESTABLISHED**;
no network/Rules cause is invented. Retry must reconcile the original record,
and no account or profile was deleted as rollback.

`auth/email-already-in-use` is the original Auth provider code. The other two
are application checks, including validation of the confirmation snapshot;
they are not Firebase transport/Rules rejection codes. No new
`permission-denied`, `auth/invalid-credential` or email-provider failure was
observed in these exercised app journeys. Unexercised failure modes are not
marked PASS merely because their codes were absent.

Chrome also showed an Android “isn't responding” dialog during the separate
fresh Technician link run. The link had already been consumed and Auth was
verified while the profile remained absent. Chrome was force-stopped and
ServicePilot resumed before the UI completion/retry checks above. Thus the
complete external-browser handoff was not uninterrupted; that Chrome failure
is recorded separately from the app's subsequent confirmation error.

## System bars and remaining scope

Current screenshots and direct UI inspection cover authentication and role
screens in gesture and three-button navigation as listed in the final addendum.
Top content is below the status bar; checked bottom actions and tab bars are
above the corresponding system navigation area. The floating handwriting IME
and Expo Go update strip are host/development UI and were not treated as proof
of a release layout. The full keyboard, small-screen, modal and physical-device
matrix remains **NOT VERIFIED** unless an individual row says otherwise.

| Surface | Gesture navigation | Three-button navigation |
| --- | --- | --- |
| Sign-in, registration top and scrolled bottom actions | PASS, screenshots reviewed | PASS, screenshots reviewed |
| Forgot Password form (no reset submitted) | PASS, screenshot reviewed | PASS, screenshot reviewed |
| Verify Email and resend/check actions | PASS, Customer and Technician runs | PASS, fresh Technician and restarted Customer runs |
| Authenticated profile re-entry | Exercised for restarted Technician; no system-bar overlap observed | Exercised for partial Customer; no system-bar overlap observed |
| Technician pending approval | PASS | PASS, including saved-profile reconciliation |
| Customer dashboard/tab bar | PASS, fresh account | PASS, recovered partial account |
| Approved Technician dashboard/tab bar | PASS, current-run screenshot reviewed | PASS, separate approved demo fixture; pending applicants were not approved to reach tabs |
| Change Password, complete keyboard/handwriting states, all legal/modals/signature and small-screen/iOS/release layouts | NOT VERIFIED in this continuation | NOT VERIFIED in this continuation |

Representative ignored evidence is under `.firebase/review-config/task-device/`:
`auth-fresh-customer-verify-gesture.png`, `auth-customer-home-gesture.png`,
`auth-partial-customer-after-reconcile-threebutton.png`,
`auth-register-gesture-bottom.png`,
`auth-register-threebutton-bottom-verified.png`,
`auth-fresh-tech-verify-threebutton.png`,
`auth-fresh-tech-reconciled-pending-threebutton.png`,
`auth-approved-tech-tabs-threebutton-verified.png` and the allowlisted
`auth-ui-errors.json`. Browser action links and raw logcat are not attached.

`auth-approved-tech-tabs-gesture-verified.png`, `auth-forgot-gesture.png` and
`auth-forgot-threebutton.png` complete the current visual checks listed above.

To repeat the observed confirmation failure locally, run the existing emulator
and one-Metro commands in the handoff. Exercise either (a) an Auth-only Customer,
verification, a cold restart and authenticated form re-entry, or (b) a fresh
Technician, actual emulator link verification and I've Verified Email. Inspect
the own server profile after the UI interruption before retrying. Retain the
original sanitized confirmation event. Continue Setup / I've Verified Email
must reconcile that saved profile; do not repeat Auth creation or overwrite it.
No assertion is made that the error occurs on every run or on production.

## Remaining blockers

1. Customer partial setup and fresh Technician completion both had their first
   confirmation interrupted with the
   original code above. A successful retry does not make that first attempt
   reliable. Preserve this as a release follow-up and reproduce the post-commit
   read with narrowly scoped diagnostics before release; do not add an overwrite,
   broad Rules exception or timeout-based access grant.
2. Real email delivery, physical devices, iOS, installed/release APK identity,
   the original production failure, deployed Rules/index compatibility and the
   complete small-screen/keyboard/modal/signature matrix are **NOT VERIFIED**.
3. Native wrong-password recovery, mail-provider failure, expired/reused links,
   revoked/disabled/deleted and privileged-role journeys were not all exercised
   in this follow-up; previous automated coverage is separate evidence.
   Direct deep-link attempts to bypass pending approval are NOT VERIFIED here.
4. Previous automated results remain 347/347 units and 56 integration passes
   with one intentional skip, plus successful TypeScript/local export. They
   were not rerun as a substitute for these UI results. The existing Functions
   lint failures remain outside this documentation/testing follow-up.

No application source, Rules, indexes or dependencies were changed by this
acceptance follow-up. No deployment, migration, production write, real
verification/reset email, remote build or release APK build was performed.

Cleanup: both test app sessions signed out through their UI. The original
gesture navigation and hardware-keyboard display settings were restored on
both AVDs; task-owned Metro and Firebase emulator services were stopped. The
AVDs were left running. No unrelated local work was reverted. `git diff --check`
passed; routine Git line-ending notices are not test failures.

Release assessment: **NOT READY**. Customer access and Technician pending approval
were reached, including recovery/restart cases, but the first confirmation was
interrupted in two distinct journeys. Reconciliation works; first-attempt
completion still needs investigation and repair followed by a native rerun.
