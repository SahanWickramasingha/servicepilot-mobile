# Technician approval email header

The approval template uses a two-cell presentation table in its existing navy
header: the app logo at 40 × 40 CSS pixels, 12 pixels of right padding, then the
existing white ServicePilot text. Both cells are vertically centered. The logo
has an empty alt attribute because the adjacent visible text supplies the brand
name and remains readable when images are blocked.

## Verified public source

The email currently uses:

https://servicepilot-756d9.web.app/assets/images/servicepilot-logo.png

On 7 November 2026, an unauthenticated HTTPS GET with redirects disabled returned
HTTP 200, Content-Type `image/png`, and 1,870,469 bytes. SHA-256 matched the original
`assets/images/servicepilot-logo.png` exactly:

`411e669c59a6d28dd55bcd0da2061a50300d02d531dcc13d68f56f611ca8b8c0`

The existing public file is the full 1254 × 1254 original, not an optimized image.
The template uses this verified source so the requested logo works without a new
asset deployment or an invented URL.

## Prepared optimized asset

`public/assets/images/servicepilot-email-logo.png` is an 80 × 80 PNG derived from
the original with bicubic resizing and PNG compression (9,562 bytes). It is sized
for display at 40 × 40 on screens with twice the pixel density. The original asset
was preserved.

Host this prepared file on the project's existing public Firebase Hosting site,
alongside `public/assets/images/servicepilot-logo.png`. This is a future hosting
step; no deployment was performed. After hosting, verify its final HTTPS URL
returns the actual PNG without login or redirects before replacing the current
image URL in the approval header. Do not use the local asset path in sent email.

## Previews and checks

Run from the repository root:

```powershell
node scripts/preview-approval-email.mjs
```

This regenerates `technician-approval.html` and desktop (960 px), mobile (390 px),
and narrow mobile (320 px) PNG screenshots. The script renders the actual template
on localhost in Chrome. It supplies the identical original logo bytes for the
verified public URL, so screenshot generation needs no external image request.
No local image path or data URI is inserted into the email HTML.

Browser checks verify logo dimensions, the 12 px gap, vertical alignment, visible
brand text with the image hidden, and absence of horizontal overflow. These are
browser previews, not live Gmail or Outlook inbox tests. No email was sent.

## Worker deployment — 7 November 2026

The user subsequently authorized deployment of the approval email header. Worker
`servicepilot-admin` was deployed successfully as version
`c3a484cb-a1e7-40dd-84f8-701516ee0b5b`, replacing
`50f8b45a-bc59-4b2a-a3c7-2160384760ab`.

To exclude unrelated uncommitted changes, the release used an isolated download
of the active production bundle and its current configuration. Only the approval
header's HTML was replaced from the canonical local template. The remainder of
the production bundle was preserved byte for byte. Ten sample decision/name
cases matched the local renderer; plain text, subject, recipient, sender,
rejection output, and HTML outside the approval header were unchanged.

The isolated release passed a Wrangler dry run and local workerd health/auth
smoke checks with all outbound requests blocked. Deployment used `--no-bundle`
and `--keep-vars` with the downloaded production configuration. A fresh download
of the deployed source matched the validated candidate's SHA-256:

`4e3a57cac1c44990f7bf2f82304f542200e5ef699c4fa087f142ade2f441f23d`

Production variables, secret binding names and runtime settings matched the
pre-deployment version. This preserved the existing Resend provider, sender
`no-reply@notify.sahanwickramasingha.space`, Firebase invitation mode, and actual
Admin origin `https://admin.sahanwickramasingha.space`.

Post-deployment `/healthz` and `/readyz` returned HTTP 200. Readiness reports
configuration presence only (`dependencies: not-probed`), not email delivery.
No live email was sent and no production account records were written. Existing
frozen retry payloads were preserved. No Firebase Hosting, Functions, rules,
indexes, Admin Web or APK deployment was performed; the optimized PNG still
awaits hosting as described above.
