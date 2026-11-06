# Windows capture of the unexplained APK registration failure

Current local source now uses verification-first onboarding; see
[the 5 November implementation record](../docs/SERVICEPILOT_LOCAL_HANDOFF_2026-11-05.md).
The profile-first payload/ordering analysis below describes the earlier source
and installed-APK investigation. It must not be used as the sequence of the
current client: new registration requests verification before any profile write,
and verified profile creation binds `emailVerified: true` to the verified Auth
claim. `verification-check` and `profile-email-verification` are additional safe
diagnostic stages. Preserve the original APK before rebuilding and correlate its
own first event/build/project/Rules rather than attributing a current-source
sequence to it. Local integration success does not close that APK diagnosis.

Status: **installed-APK registration and device acceptance NOT VERIFIED**.
The 5 November local confirmation/recovery repair is documented at the top of
`FULL_FUNCTIONAL_AUDIT.md`. A committed profile is now resumable after explicit
credential authentication and validation; existing profiles are never overwritten.
No APK was rebuilt, no Rules deployed and no production registration/recovery
was performed by the agent. ADB was found at the standard Android SDK path, but
`adb devices` returned no connected devices during preparation.

## What the installed APK can expose

Before this follow-up, the latest local source had an unconditional release
`console.warn('[registration-failure]', { stage, code })`. The detailed
`[registration-debug]` callbacks were development-only and unsuitable for sharing.
There is no explicit console-removal configuration in this repository. This
establishes source intent only: the failing installed APK's source, bundled
events and runtime log sink are **NOT VERIFIED**. An empty capture proves neither
success nor that logging was stripped. Older React Native object logs may also
be multiline and therefore deliberately rejected by the safe parser.

Prepared, unbuilt diagnostics now emit one JSON line in both release and debug:

```text
[registration-failure] {"stage":"profile-create-transaction","code":"permission-denied","appVersion":"1.0.0","projectId":"servicepilot-756d9"}
```

This is an **example schema, not an observed device result**. Only these four
fields are emitted. Stages/codes are allowlisted; unknown context becomes
`unknown`. Version comes from the running Expo manifest; confirm native
`versionName` and `versionCode` independently below. Project comes from the
initialized Auth app, not CLI configuration. No UID, email, password, token,
error message, stack, address or profile value is emitted. Legacy debug payload
loggers are now silent even in development. Verification failures retain the
original provider code in diagnostics while preserving the actionable saved-
profile UI message. These changes cannot add events to the existing installed
APK; preserve it and inspect/capture it before any later build.

## 1. Select the device and record installed version

Use Windows PowerShell. Enable USB debugging and approve this computer on the
device. Substitute the serial printed by the first command; never use a variable
named `$PID` (PowerShell reserves it). Keep device serials out of shared reports.

```powershell
Set-Location -LiteralPath 'C:\Users\WW\Desktop\servicepilot-mobile'
$adbPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (!(Test-Path -LiteralPath $adbPath)) { throw 'Set adbPath to your Android SDK platform-tools adb.exe' }
& $adbPath devices
$deviceSerial = 'REPLACE_WITH_DEVICE_SERIAL'
$appPackage = 'com.sahanwickramasingha.servicepilot'
$captureDir = Join-Path (Get-Location) ('.firebase\review-config\apk-registration\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $captureDir -Force | Out-Null

& $adbPath -s $deviceSerial shell dumpsys package $appPackage |
    ForEach-Object {
        if ($_ -match '^\s*versionName=([0-9A-Za-z.+-]+)\s*$') { 'appVersion=' + $Matches[1] }
        if ($_ -match '^\s*versionCode=(\d+)\b') { 'versionCode=' + $Matches[1] }
    } | Set-Content -LiteralPath (Join-Path $captureDir 'installed-version.txt') -Encoding UTF8
Get-Content -LiteralPath (Join-Path $captureDir 'installed-version.txt')
```

The package above matches local `app.json` and the EAS preview configuration.
If it is absent, establish the actual build/package with its operator; do not
silently capture Expo Go or a different application. Open the installed app
manually. Do not uninstall, clear app storage, reset accounts or change project
configuration before preserving evidence.

Optional read-only preservation/static check of the installed base APK:

```powershell
$apkPathLine = @(& $adbPath -s $deviceSerial shell pm path $appPackage) |
    Where-Object { $_ -match '^package:.*\/base\.apk\s*$' } |
    Select-Object -First 1
if (!$apkPathLine) { throw 'Base APK not found; record split-package layout before proceeding' }
$deviceApkPath = ($apkPathLine -replace '^package:', '').Trim()
$savedApk = Join-Path $captureDir 'installed-base.apk'
& $adbPath -s $deviceSerial pull $deviceApkPath $savedApk
if ($LASTEXITCODE -ne 0) { throw 'APK preservation failed' }
Get-FileHash -LiteralPath $savedApk -Algorithm SHA256 |
    Select-Object Algorithm, Hash | ConvertTo-Json |
    Set-Content -LiteralPath (Join-Path $captureDir 'apk-hash.json') -Encoding UTF8

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($savedApk)
try {
    $entry = $zip.GetEntry('assets/index.android.bundle')
    if (!$entry) { throw 'No embedded bundle at the expected path; do not infer logging is absent' }
    $stream = $entry.Open(); $memory = [IO.MemoryStream]::new()
    try {
        $stream.CopyTo($memory)
        $bundleText = [Text.Encoding]::UTF8.GetString($memory.ToArray())
        [pscustomobject]@{
            failureMarkerPresent = $bundleText.Contains('[registration-failure]')
            versionKeyPresent = $bundleText.Contains('appVersion')
            projectKeyPresent = $bundleText.Contains('projectId')
        } | ConvertTo-Json
    } finally { $stream.Dispose(); $memory.Dispose(); $bundleText = $null }
} finally { $zip.Dispose() }
```

This prints booleans only; never print the bundle. String presence in JS/Hermes
is a static clue, not proof the code path executes or its logs reach ADB. Updates
can also make an embedded APK differ from the running JS. A parseable runtime
event from the reproduced failure is stronger evidence. Preserve the build/source
identity separately; version alone does not identify a unique build.

## 2. Capture one action per file

The capture script reads only the selected app PID's `ReactNativeJS` log stream,
starts at the end of the buffer, reconstructs the four-field schema, and saves
**no raw logcat**. Legacy single-line stage/code events are supported, with both
context fields set to `unknown`. Native stderr and all unrelated messages are
discarded. It never clears logs, starts registration, resets a password or sends
email. Do not use `adb logcat > file`, `Tee-Object`, a transcript, verbose Firebase
logging, or an unfiltered bugreport as a substitute for this capture.

With the app already open, run the following, then immediately perform the one
UI action while the 120-second window is active:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Capture-RegistrationDiagnostics.ps1 `
    -Adb $adbPath -Serial $deviceSerial -Package $appPackage -Seconds 120 `
    -OutputPath (Join-Path $captureDir '01-technician-registration.jsonl')
```

Reproduce Technician registration using the failing build and an authorized test
account/transport. Retain the **first** failure before tapping Register again.
Record the UI alert title and whether this was creation or recovery separately,
without account details. Do not type credentials in PowerShell/ADB or automate
text entry. If an account already exists, do not substitute a fresh email to
conceal the partial account; a second `auth/email-already-in-use` does not reveal
the original profile failure. No successful path should be run against production
just to gather diagnostic evidence or send a real verification email.

Then capture recovery as its own attempt, using **Recover incomplete
registration**, the same email, the original password and explicit policy
acceptance (not ordinary login):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Capture-RegistrationDiagnostics.ps1 `
    -Adb $adbPath -Serial $deviceSerial -Package $appPackage -Seconds 120 `
    -OutputPath (Join-Path $captureDir '02-technician-recovery.jsonl')
```

Use separate files for an intentionally incorrect password and, only in the
authorized test environment, correct-password recovery and a complete-profile
control. Never recreate/delete the Auth identity to bypass recovery. Correct
recovery can create a profile and send verification; it is not a read-only check.
If the installed release targets production and that action is not authorized,
stop at capture of the existing failure and arrange a controlled test separately.

If the app process restarts, reopen it and run a new capture filename; its old
PID filter will not follow a restart. Zero events, missing context, an interrupted
capture or unparseable multiline logs leave the device diagnosis **NOT VERIFIED**.
If the installed APK lacks the prepared events, review the diagnostic patch for
a later authorized build; do not rebuild or deploy as part of this capture task.

## 3. Compare the actual payload and deployed Rules

Do not log a live payload. Review its field names/types and fixed state values
from the matching build source, using synthetic inputs in emulator tests.

| Current local create payload | Local Rules contract |
| --- | --- |
| Both roles: `uid`, `fullName`, `email`, `phone`, `address`, `role`, `accountStatus`, `emailVerified`, `termsVersion`, `privacyPolicyVersion`, `acceptedAt`, `createdAt`, `updatedAt` | `hasRequiredUserFields` and the role-specific field allowlist. UID must equal authenticated owner and path; normalized email must equal token email; public roles only; active account and false profile verification. |
| Policy versions `2026-11-02.1`; all three timestamp fields use `serverTimestamp()` | `currentPolicy` requires these policy versions; `acceptedAt` must be a timestamp equal to `request.time`. Creation/updated timestamps are present. `policyAccepted` is validation input, not a persisted extra field. |
| Technician extras: `technicianApprovalStatus: pending`, `availability: offline`, canonical `serviceCategoryId` and matching `specialization`, plus string `experience`, `qualifications`, `certifications`, `serviceAreas`, `serviceDivision` | Exact technician allowlist/required fields, canonical category/label check, pending approval and offline availability. No approval/rating/GPS is fabricated. Customer create does not include technician extras. |

`createUserProfile` first performs an authenticated **server absence read**, then
a create-only transaction with another absence check, then a **server confirmation
read** checking identity, metadata, schema and account/session state. Check owner
reads as well as create Rules. Successful verification comes after confirmation.
Ordinary creation refuses existing profiles; authenticated recovery validates
and resumes valid same-role profiles without writing them. Different roles or
invalid/inactive profiles remain refused. Current emulators passed both
public roles and recovery with this payload. That is not evidence of the payload
inside the failing APK. The F02/F03 Rules edits affect evidence/map validation,
not `validPublicUserCreate` or the user-create allowlists.

Check the active Rules release for the **runtime project from the event** and
the `(default)` Firestore database, at the reproduction time. For the expected
project the release resource is:

```text
projects/servicepilot-756d9/releases/cloud.firestore
```

The audit's last actual read-only cloud check was `2026-11-04T11:56:09Z`:
`projects/servicepilot-756d9/rulesets/f43b1d0f-d0b6-4615-97ed-a23d20b19ca8`,
release updated `2026-11-03T06:04:08.265109Z`. It matched the **pre-repair** local
Rules. It has not been refreshed in this diagnostic follow-up. Do not use the
October 29 historical snapshot, assume this release is still active, or mistake
the current evidence/map source differences for a demonstrated registration
Rules mismatch. If runtime project is unknown, establish it before assigning a
backend cause; if it differs, check that project's release instead.

An authorized operator with existing Google Cloud CLI credentials can obtain
read-only Rules evidence below. No token is printed or saved; do not enable a
PowerShell transcript or HTTP debug trace. These commands are provided for
review and **were not executed in this follow-up**:

```powershell
$rulesProject = 'servicepilot-756d9' # Must match the observed runtime target
$accessToken = (gcloud auth print-access-token 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or !$accessToken) { throw 'Existing read-only cloud credentials required' }
try {
    $headers = @{ Authorization = 'Bearer ' + $accessToken }
    $release = Invoke-RestMethod -Method Get -Headers $headers `
        -Uri "https://firebaserules.googleapis.com/v1/projects/$rulesProject/releases/cloud.firestore"
    $ruleset = Invoke-RestMethod -Method Get -Headers $headers `
        -Uri ('https://firebaserules.googleapis.com/v1/' + $release.rulesetName)
    [pscustomobject]@{
        checkedAtUtc = [DateTime]::UtcNow.ToString('o')
        release = $release.name; ruleset = $release.rulesetName; updateTime = $release.updateTime
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $captureDir 'rules-release.json') -Encoding UTF8
    $source = @($ruleset.source.files | Where-Object { $_.name -eq 'firestore.rules' })
    if ($source.Count -ne 1) { throw 'Inspect Rules source names before comparing; no unique firestore.rules file found' }
    [IO.File]::WriteAllText((Join-Path $captureDir 'observed-deployed.rules'), $source[0].content, [Text.UTF8Encoding]::new($false))
} finally { $headers = $null; $accessToken = $null }
git diff --no-index -- .\firestore.rules (Join-Path $captureDir 'observed-deployed.rules')
# git diff exit code 1 means a difference, not a failed Rules read.
```

This reads Rules source/metadata only, never user records. Establish whether the
active release changed during reproduction; retrieve the version active at the
failure time if it did. Reproduce any suspected difference with the matching
APK source payload and that saved Rules source in loopback emulators before
claiming a cause. A difference by itself is insufficient.

## Evidence required to close the blocker

- Installed version name/code, APK SHA-256, matching source/update identity;
  original first failure event, separate recovery event and runtime project.
- `auth-create` errors precede profile persistence. `recovery-authentication /
  auth/invalid-credential` means authentication was rejected; it does not prove
  a bad password, a Rules problem or the cause of the earlier profile failure.
  Verify original credentials/build/project without logging them.
- `profile-existence-read / permission-denied` points to the authenticated
  absence-read stage, not the create allowlist. `profile-create-transaction /
  permission-denied` requires reproducing owner/token/payload/Rules behavior;
  the code alone does not prove Rules drift. `unavailable` needs connectivity
  evidence before blaming Rules. Account-listener interference requires an
  observed account-change/sign-out at that stage and a controlled reproduction,
  not the previous race diagnosis reused as an assumption.
- `profile-server-confirmation` can fail after a successful commit. Verify
  existence/state in an authorized private inspection, record only the outcome,
  and never delete/rewrite a profile to retry. Confirm recovery retains UID
  privately; no UID belongs in the shared diagnostic log.
  In the inspected source this stage follows transaction acknowledgement. The
  former generic `firestore/profile-write-failed` at this stage could mask a
  code-less validation/session guard or a dropped plain provider error code.
  It is not proof of a failed write. Current code preserves provider codes and
  distinguishes account changes, missing/cache/pending snapshots and invalid
  schema/state; correlate the matching APK source before applying that diagnosis.
- `send-verification` happens after persistence. It is a distinct mail/Auth
  failure, not an incomplete-profile conclusion. Do not send real emails to
  establish this diagnostic.
- Controlled results for Customer and Technician creation, delayed/failed writes,
  correct/incorrect recovery credentials, valid-profile read-only resume and
  invalid/cross-role profile refusal against
  the same saved Rules. Then complete the actual two-device acceptance checklist.
  Passing emulators or a static string check cannot close device acceptance.

## Reviewed future release action — DO NOT RUN YET

The evidence/map fixes already require a Rules release independently of this
unexplained registration failure. The exact scoped command, after review of
`firestore.rules` and explicit release authorization, is:

```powershell
firebase.cmd deploy --config .\firebase.json --only firestore:rules --project servicepilot-756d9
```

Use root `firebase.json`, not `firebase.dispatcher-hosting.json`. No index change
is needed for these fixes. No Worker/Pages deployment is implied. A later APK
rebuild is needed for client fixes/diagnostics only after review and the required
checks; no build or deployment is authorized by this capture preparation.
Keep registration/device acceptance **NOT VERIFIED** until actual supported
results are recorded.
