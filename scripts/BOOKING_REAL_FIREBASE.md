# Real Firebase accounts

For the prepared real-project **backend**, use
[BOOKING_REAL_BACKEND_SETUP.md](BOOKING_REAL_BACKEND_SETUP.md). It documents the
new booking-only profile, exact credential/IAM requirements, HTTPS path and
`start-booking-real.ps1`. The standalone combined profile described below remains
the default; its SMTP requirements do not apply to the new booking-only profile.

Open both Android emulators, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\WW\Desktop\servicepilot-mobile\scripts\run-servicepilot-real.ps1
```

This explicitly disables demo mode, removes emulator host variables in its own
process, restarts only this workspace's Metro, removes demo adb forwarding and
cold-starts both apps. The project remains `servicepilot-756d9`. It preserves
`.env.local` and the photo URL. It does not seed, migrate or accept any requests.
Background Metro logs are in `.firebase/review-config/real-mobile`.

Do not use `run-booking-demo.ps1` for real accounts. Firebase emulators may remain
running separately, but this app launch does not connect to them.

## Remaining acceptance prerequisite

Real Firebase login is independent of the booking backend. The local inspection
found no configured booking URL, no shell Application Default Credential path,
no standard gcloud ADC file, and none of the combined dispatcher's required SMTP
environment settings. A deployed standalone host has not been identified.

If the operator already has an approved HTTPS standalone host, set its base URL
using `EXPO_PUBLIC_BOOKING_API_URL` in the existing `.env.local` (preserve the
photo line), or pass `-BookingApiUrl` to the launcher. The app appends
`/v1/bookings/schedule`. Do not point real sessions at the demo localhost server.

For the default combined profile, the existing standalone server must be provisioned with a separately
approved booking-server identity and host. `dispatcher-main.ts` in production
mode requires `GOOGLE_CLOUD_PROJECT=servicepilot-756d9`, non-emulator ADC,
`DISPATCHER_MODE=production`, exact HTTPS `DISPATCHER_ADMIN_ORIGIN`, and
`DISPATCHER_SMTP_HOST`, `DISPATCHER_SMTP_PORT`, `DISPATCHER_SMTP_USER`,
`DISPATCHER_SMTP_PASSWORD`, `DISPATCHER_SMTP_FROM`. The combined server includes
dispatcher invitations, so SMTP is currently a startup requirement. Credentials
must be configured locally/server-side by the operator, not pasted into chat or
EXPO_PUBLIC settings. Never reuse the photo Worker's service account or broaden
its permissions. The hosting operator must supply the approved HTTPS reverse
proxy/base URL; a Firebase deploy command does not publish this entry point.

After those existing server prerequisites are configured, the prepared commands
are `npm.cmd --prefix functions run build` followed by
`npm.cmd --prefix functions run dispatcher:serve`. These were not run against
production. No deployment, credential provisioning or remote configuration was
performed. The real-account launcher was syntax-checked; no live acceptance or
other production-data write was performed as validation.
