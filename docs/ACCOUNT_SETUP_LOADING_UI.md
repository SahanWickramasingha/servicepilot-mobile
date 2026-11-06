# Account setup loading presentation

The responsible state is `pending` in
`src/components/auth/LiveAccountGate.tsx`. It previously reused the red alert
text used for account errors. Its loading branch now renders
`src/components/auth/AccountSetupLoading.tsx`; authentication, authorization,
account observation, route decisions, timeout and retry callbacks are unchanged.
Existing uncommitted work was preserved.

The new view uses the existing ServicePilot PNG with `resizeMode="contain"`,
responsive sizing capped at 88 dp, and the existing rounded logo treatment. A
small blue ActivityIndicator sits below it, followed by the white “Getting things
ready” heading and muted grey “Checking your account setup…” supporting text.
There is no card, glow, artificial delay, progress percentage or loading action.
The modal owner declares light status-bar icons before opening Android's native
dialog, so its navy background has readable system icons.

`AppModal` already consumes the Router provider's measured safe-area insets.
The content centers inside that viewport without adding another provider or
system-bar padding. A growing ScrollView lets oversized text remain reachable;
text scaling is not capped, truncated or shrunk to fit. Ordinary spacing is 24 dp.

Accessibility uses one stable, polite, indeterminate progress region with a busy
state and the complete loading label. Decorative children do not create duplicate
announcements. No timer or imperative announcement repeats the message. The
platform's reduced-motion preference is read and observed; a still blue ring
replaces the spinning indicator when motion is reduced. The logo has no fade.

Recoverable errors keep their existing red alert and Retry access check action.
Access denial keeps its existing sign-in action. Loading exposes neither action.

## Checks

- `npx.cmd tsc --noEmit`: PASS.
- `npm.cmd run lint`: 0 errors; one existing `job-action.tsx:50` ref-cleanup warning.
- `node --test scripts/tests/onboarding-state.test.mjs scripts/tests/account-session.test.mjs`:
  18 PASS, 0 FAIL/SKIP. The existing gate regression now also checks that pending
  does not present an alert/retry and that recoverable errors retain Retry.
- Native capture uses explicit development demo mode, local Auth on 9197 and
  Metro on 8084. Firestore was deliberately unavailable to exercise the real
  pending state and its existing recovery, rather than adding a preview delay or
  alternate application route. No production data or real email was used.

## Existing wait limitation — not changed

The account observer configures a 20-second watchdog and error/retry feedback.
It re-arms the watchdog for profile snapshots, including cache/pending metadata.
Consequently it is not an absolute end-to-end 20-second limit: continuous snapshot
activity can extend the wait. That source-level limitation is reported separately;
this visual change does not hide it, change access checks or modify retry policy.
Continuous-snapshot behavior was not manually stress-tested in this UI task.

The earlier post-commit profile-confirmation interruption remains separately
documented in `AUTH_UI_ACCEPTANCE_2026-11-05.md`; this presentation change does not
claim to repair onboarding persistence.

## Native verification

Android 15 / API 35, Expo Go, portrait. The font scale and display size were changed
through Android settings; the reduced-motion case used Android's transition
animation preference, observed by the component's AccessibilityInfo subscription.

| Case | Result |
| --- | --- |
| Default 1080 × 2400 px viewport, density 420, font scale 100%, normal motion, gesture navigation | PASS after reopening Expo Go: centered group; readable system icons; clear status/navigation bars |
| Small 320 × 569 dp viewport, font scale 100%, normal motion, gesture navigation | PASS: compact centered group; readable system icons; no clipping or system-bar overlap |
| Small 320 × 569 dp viewport, font scale 200%, reduced motion, three-button navigation | PASS: full text wraps without clipping; still indicator; content clears status/navigation bars |
| Recoverable timeout and Retry | PASS observed with the deliberately unavailable local Firestore backend; loading and error presentations stay distinct |
| Spoken TalkBack/VoiceOver announcement timing | NOT VERIFIED manually; stable polite progress semantics inspected in source |
| iOS, physical devices and release APK | NOT VERIFIED; no release build made |

[Normal capture](screenshots/account-setup-loading-2026-11-05/normal.png),
[small-screen capture](screenshots/account-setup-loading-2026-11-05/small.png),
[large text / reduced-motion capture](screenshots/account-setup-loading-2026-11-05/large-text-reduced-motion.png).

Tooling encountered an Expo Go cached-bundle reload error and loss of the original
ADB devices. A temporary read-only instance of the existing Customer AVD was used
to continue without clearing original app data. It had no route to 10.0.2.2;
ADB reverse forwards for 8084/9197/8187 and explicit loopback emulator settings
restored the local preview. Resetting display metrics also left a stale-sized
native modal until Expo Go was fully reopened; the final normal capture was
checked after reopening. Expo Go's test-backend warning toast was dismissed
for the captures; application error handling and console diagnostics were not
suppressed or changed. This is emulator evidence, not a production auth success.

The original AVDs reconnected during testing; final normal-size verification used
the reconnected Customer AVD. The temporary read-only launcher was no longer
running at cleanup. The current AVDs were left running. Test Metro and Auth
emulator processes were stopped. Display overrides, font scale and transition
animation preference were restored to their original values.

No deployment, commit, push, remote APK build, Rules/index/dependency change or
new image asset was performed.
