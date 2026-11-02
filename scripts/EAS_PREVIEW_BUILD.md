# Preview APK launcher — 2026-11-02

Use the launcher from the repository's PowerShell terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\eas-preview-build.ps1
```

The launcher reuses `eas-preview-credentials.ps1 -CheckOnly` to explicitly load
the allowlisted Maps key and API URLs into the same process, preserving existing
process values and leaving environment files untouched. It applies the preview
`eas.json.env` settings and verifies the actual installed Expo CLI's
`config --json` subprocess with `EXPO_NO_DOTENV=1` before invoking:

```powershell
npx.cmd eas-cli@latest build --platform android --profile preview
```

No credentials-management command runs from the loader's CheckOnly path.
Release validation remains enabled. A configuration failure stops the launcher
before EAS build is invoked. PowerShell calls `npx.cmd` directly, without nested
`env:exec`. Preview remains an internally distributed APK with remote signing.

To verify without submitting a cloud build:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\eas-preview-build.ps1 -CheckOnly
```

## Diagnosis and checks performed

The unprepared local shell's actual Expo config subprocess failed release
validation for absent process variables `GOOGLE_MAPS_ANDROID_API_KEY`,
`EXPO_PUBLIC_BOOKING_API_URL` and `EXPO_PUBLIC_PHOTO_API_URL`. The non-JSON
diagnostic retry confirmed `Release configuration rejected`; its raw output
was captured privately and not logged. EAS disables automatic dotenv loading,
so values existing only in `.env.local` do not resolve that process failure.

- PASS: new build launcher with CheckOnly, using actual local values and actual
  installed Expo CLI subprocess, not only an in-process config helper.
- PASS: actual EAS project/account preview variables plus `eas.json.env`, checked
  read-only through the same real Expo CLI evaluation. The current remote
  environment now satisfies the Maps-key requirement as well as API URLs and
  identities; earlier reports of a missing remote key are superseded.
- PASS: ten focused preview-config/release-readiness tests, static release
  profile/assets/upload exclusions, and diff whitespace checks.

No secret values were printed. API URLs, environment files, release guards and
signing credentials were not changed. No cloud build, deployment, commit, push
or billing activation was performed. The full build invocation was intentionally
not run; the verified scope is config resolution and launcher preflight, not a
compiled or installed APK.
