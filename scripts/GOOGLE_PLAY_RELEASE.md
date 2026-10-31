# ServicePilot Google Play release preparation — booking Worker

The permanent booking host is the separate booking-worker/ project.
Follow [BOOKING_WORKER_DEPLOYMENT.md](./BOOKING_WORKER_DEPLOYMENT.md) for the
compatibility decision, transaction semantics, plan limits, secrets, local tests
and exact PowerShell deployment commands. The Render Blueprint and its server
environment example have been replaced. The Node booking server remains usable
for local development and shares the Worker's scheduling engine.

EAS Build builds/signs APK/AAB artifacts; Cloudflare runs the booking backend.
Neither hosts the existing photo Worker on the other's behalf. Keep
EXPO_PUBLIC_PHOTO_API_URL unchanged. Set EXPO_PUBLIC_BOOKING_API_URL to the actual
permanent servicepilot-booking Worker origin, without a path or query, in both
EAS preview and production. Public URLs are embedded at build time: rebuild the
app after changing them. Never put booking secrets in EAS or mobile env files.

Hosting preparation did not deploy, commit, push, change IAM/billing or write
production data. The budget is zero: only Workers Free is permitted, and the
paid-only CPU setting has been removed. Free-plan reliability is unproven; review
[BOOKING_WORKER_FREE.md](./BOOKING_WORKER_FREE.md) before any rollout. Do not
activate Paid. The real booking URL and dedicated booking credential remain
operator prerequisites. Check shared photo/OTP quota consumption too.

The existing native Google Maps SDK has separate restricted-key and billing
requirements. Do not silently upgrade the Firebase project. No paid geocoding,
required deployed Cloud Functions or new database has been added.

## Android identity, signing and EAS environment

Observed: app version `1.0.0`, Expo SDK 54, React Native 0.81.5, New Architecture.
The prepared `eas.json` defines the build profiles. Owner-approved package ID,
linked EAS project ID/owner and signing/Play history remain unconfirmed. No native
Android artifact or signing credential was generated. No account identity is invented.

`eas.json` now defines preview APK/internal and production AAB/store profiles,
separate EAS environments, remote signing credentials and remote version codes.
Production auto-increments versionCode. Keep version `1.0.0` until the owner
chooses the user-visible release version; remote versionCode starts from the
actual EAS/Play history. Do not assume 1 is valid for an already-published app.
See [APK/AAB profiles](https://docs.expo.dev/build-reference/apk/) and
[remote version management](https://docs.expo.dev/build-reference/app-versions/).

Fill `.env.release.example` into ignored `.env.release.local` for offline checks.
Configure each value separately in the **preview** and **production** EAS
environments. This local file is deliberately excluded from uploads:

| Variable | Meaning / visibility |
| --- | --- |
| `EXPO_ANDROID_PACKAGE` | Owner-approved reverse-domain application ID, stable across updates; plaintext |
| `EXPO_EAS_PROJECT_ID` | Actual EAS UUID linked to this app; plaintext |
| `EXPO_OWNER` | Actual Expo account/organization slug; plaintext |
| `EXPO_PUBLIC_BOOKING_API_URL` | Actual permanent HTTPS booking Worker origin, no path/query; plaintext |
| `EXPO_PUBLIC_PHOTO_API_URL` | Existing approved HTTPS photo Worker origin; plaintext |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Android-restricted Maps key; sensitive in EAS UI, still present in the APK |
| `EXPO_PUBLIC_USE_FIREBASE_EMULATORS` | `0`; profiles also enforce this |
| `SERVICEPILOT_RELEASE` | `1`; profiles also enforce this |

Expo embeds public variables at build time. EAS secret visibility does not make a
value private once bundled. Never create EAS variables for booking/Worker private
keys, service-account JSON, SMTP passwords or backend ADC paths. EAS guards reject
known credential variables and public private-key variables without printing
their values. Keep the current photo URL unchanged; do not replace it with the
booking service URL. See [EAS environment usage](https://docs.expo.dev/eas/environment-variables/usage/).

`app.config.ts` and the EAS pre-install hook reject missing release inputs, local
and IP HTTPS origins, demo flags/emulator hosts, placeholder hosts and temporary
trycloudflare/ngrok origins. Preview uses the same safe release requirements.
Normal local Expo development remains available. The guards also run for
`NODE_ENV=production` and explicit release mode. Neither guard proves a permanent
URL is reachable; run the health and authenticated staging checks separately.

`.easignore` excludes local env files, keys, credentials, backend services and
runtime logs. It retains `functions/src/domain`, which mobile source imports.
The root has both npm/pnpm locks and an invalid placeholder pnpm workspace file;
the EAS archive intentionally excludes those two pnpm files so EAS selects the
existing npm lock. Local pnpm files were preserved. Review the eventual archive
before uploading; exclusions are not a substitute for reviewing arbitrary files.

Exact owner steps after hosting/identity review (remote mutations/builds below
are prepared only, not executed):

```powershell
cd C:\Users\WW\Desktop\servicepilot-mobile
# Fill all real values locally; never copy backend credentials here.
if (!(Test-Path .\.env.release.local)) { Copy-Item .\.env.release.example .\.env.release.local }
npm.cmd run release:check -- --env-file .env.release.local

# After owner approval, sign in and link the actual EAS project.
npx.cmd eas-cli@latest login
$env:EXPO_OWNER = Read-Host 'Actual Expo owner slug'
$env:EXPO_EAS_PROJECT_ID = Read-Host 'Actual EAS project UUID'
npx.cmd eas-cli@latest init --id $env:EXPO_EAS_PROJECT_ID

# Interactive creation avoids putting key values in command history. Repeat for
# all variables in the table, separately for preview and production.
npx.cmd eas-cli@latest env:create --environment preview
npx.cmd eas-cli@latest env:create --environment production

# Confirm remote values before building; correct invalid existing values in EAS.
npx.cmd eas-cli@latest env:exec --environment preview 'npm run release:check'
npx.cmd eas-cli@latest env:exec --environment production 'npm run release:check'
npx.cmd eas-cli@latest credentials --platform android
npx.cmd eas-cli@latest build:version:set --platform android --profile production

# Only after the explicit build gate is satisfied:
npx.cmd eas-cli@latest build --platform android --profile preview
# After real-device APK/staging validation and signing review:
npx.cmd eas-cli@latest build --platform android --profile production
```

For existing Play apps, import/retain the correct upload keystore instead of
generating a replacement. For a first release, the owner may approve EAS-managed
generation. Enrol/verify Play App Signing, keep a protected credential backup, and
restrict Maps keys to the package plus appropriate SHA-1 certificate(s): preview
upload certificate and the Play app-signing certificate for store-distributed
builds. Do not confuse the upload key with Play's distribution signing key.
Manual AAB upload to Play's internal test track needs no Play service-account
JSON in EAS. Submission automation is deliberately not configured.

## Remaining Play and real-device release gates

1. **Privacy policy:** publish the owner's accurate public HTTPS policy and make
   it accessible inside the app and in Play Console. Current Settings and Register
   privacy/terms labels do not open a policy; those links need implementation
   once the real owner URLs/content exist. Document contact, retention, deletion,
   processors, precise/approximate foreground location and public reviews.
2. **Account deletion:** implement a discoverable in-app initiation path and an
   external deletion-request page, plus an authorized data-deletion/retention
   workflow. Existing Admin Web soft-delete retains profiles/bookings/reviews and
   is not this user-facing deletion requirement. Do not delete live data as a
   release-preparation test. See [Google deletion policy](https://support.google.com/googleplay/android-developer/answer/13327111).
3. **Data safety:** audit actual SDK/network/data behavior and complete the form;
   include account/contact identifiers, addresses/job details, precise and public
   approximate location, request/evidence/review photos, notes/parts/signatures,
   reviews and notifications. Determine sharing/processor/retention declarations
   from real contracts and behavior, not this preliminary inventory. No ad SDK or
   OS push integration was added. See [Google User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311).
4. **Console:** confirm developer identity/verification, application ID ownership,
   app access instructions and reviewer credentials, listing/screenshots/contact,
   content rating, ads declaration, target audience and applicable closed-testing
   requirements. New personal accounts may need 12 opted-in testers for 14
   consecutive days before production access; check the account's actual gate.
   [Official testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).
5. **Native artifact:** installed source defaults indicate minSdk 24 and target/
   compile SDK 36, but no merged manifest/AAB has been produced. Verify target API
   36 against current Play requirements, 16 KB page-size/native-library support,
   permissions and signing in the actual EAS artifact. Check camera/photo picker
   without unnecessary storage/audio permissions and foreground-only location;
   do not add background-location requirements. See [target API policy](https://support.google.com/googleplay/android-developer/answer/11926878).
6. **Devices:** signed preview APK on physical Android devices without Metro/ADB
   forwarding, then a Play internal-track AAB install. Test email/OTP/auth recovery,
   real Maps key and marker rendering, GPS permissions/sharing/privacy, district
   filters/distance, authenticated booking acceptance and overlap/idempotent retry,
   timeout reconciliation, evidence/notes/photos/signature/timers, reviews and
   notification history, account changes and offline/restart behavior. Include
   slow mobile networks, server restarts, large fonts, keyboard and edge-to-edge.
   OS push must not be claimed: current notifications are in-app Firestore data.
7. **Rollout:** review/deploy compatible Firestore Rules/indexes and photo Worker
   configuration separately before public access. Prior notes validation rules
   are local changes too. No live Rules/indexes/Worker deployment was performed.

No production release can be certified until these gates are met.

## Validation record

See the Worker deployment guide for this change's actual checks and limitations.
Previous release checks do not prove a deployed Worker, native signing, a Play
artifact or real-device acceptance. No such remote verification was performed.
