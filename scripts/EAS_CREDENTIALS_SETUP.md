# Android credentials configuration — 2026-11-02

Historical diagnosis: the remote missing-key finding below was subsequently
resolved during build preparation. See [current release staging review](PREVIEW_RELEASE_REVIEW.md).

## Corrected verification and Windows setup

This section supersedes the earlier instructions below. The original checker
loaded `.env.local` in-process, unlike EAS CLI 27.2.0, which evaluates
`expo config --json` with `EXPO_NO_DOTENV=1`. That caused a false PASS when a
Maps key existed only in `.env.local`. The installed Expo CLI suppresses its
error logging in JSON mode, hiding the underlying release-validation error.

The corrected checker merges the actual preview `eas.json.env` into the supplied
process environment and launches the installed Expo CLI in a fresh subprocess
with dotenv disabled. Any nonzero exit, timeout, invalid JSON, or mismatch in
resolved identity/Maps configuration is FAIL. A non-JSON retry captures the
underlying error privately; raw config, keys and error output are never printed.
Only fixed diagnostic categories and value-free validation messages are emitted.

Current read-only verification:

- Actual EAS project/account preview environment plus `eas.json.env`: FAIL,
  `GOOGLE_MAPS_ANDROID_API_KEY` missing. The captured underlying error is
  `Release configuration rejected: GOOGLE_MAPS_ANDROID_API_KEY is required for
  the native Android map.`
- `EXPO_ANDROID_PACKAGE` and both API URLs are available on EAS preview.
  Owner/project aliases are absent on EAS but supplied by `eas.json.env` and
  agree with the static app identities. They are not missing prerequisites.
- Local `.env.local` contains the Maps key and both URLs. With those values
  explicitly loaded into the process, actual CLI config verification passes.
- `env:exec preview "npx.cmd --version"` succeeded here; the reported ENOENT
  could not be reproduced. A separate shell-less Node spawn of `npx.cmd` failed
  with EINVAL on this Windows/Node version. These launch errors are distinct
  from Expo release validation.
- TypeScript, focused ESLint, ten focused tests and diff whitespace checks pass.

Run this direct PowerShell helper from the repository:

```powershell
# Checks only, without opening credentials management:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\eas-preview-credentials.ps1 -CheckOnly

# After PASS, open credentials directly without nested env:exec:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\eas-preview-credentials.ps1
```

The helper explicitly reads only the Maps key and API URLs from `.env` and
`.env.local` into its own process, preserving existing process values. It loads
the public preview profile env values and runs the corrected checker before
the direct command `npx.cmd eas-cli@latest credentials --platform android`.
Select preview. It does not modify an environment file. If the Maps key is
absent locally, the helper provides one masked `Read-Host -AsSecureString` input
step and uses that value only in memory. No dummy value is substituted.

For cloud readiness, open the linked EAS project on expo.dev → Environment
variables → create variable, name `GOOGLE_MAPS_ANDROID_API_KEY`, type **String**,
environment **preview**, visibility **Sensitive**. Enter the actual key in the
value field and save. Do not put it in a command literal, chat, `eas.json` or
source code. This was not performed automatically. Sensitive visibility permits
local EAS config evaluation; Secret visibility would not provide the value to
local credentials setup. Existing Maps SDK/key restrictions were not changed.

Do not use a local helper PASS as proof that the EAS cloud variable exists.
After saving the remote key, the remote environment must separately pass the
corrected checker. No signing keys, builds or remote variables were changed in
this verification. No deployment, commit or push occurred.
