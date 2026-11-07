# Gmail technician decision emails

Implemented locally on 7 November 2026. No deployment, real OAuth exchange, email
send, remote configuration update, production record write, migration, commit or
push was performed. Root `AGENTS.md` was read; no nested instructions were present.
Existing unrelated mobile/Admin Web/Worker work was preserved.

## Existing flow retained

The saved approval/rejection still drives
`POST /v1/technicians/decision-email`; its status route is unchanged. The Worker
verifies the reviewer token/current role, rereads the authoritative decision,
matches the saved recipient to Firebase Auth and uses the existing templates.
The same decision revision, private receipt, atomic 120-second lease, frozen
payload and submitted-receipt replay suppression remain in use.

`admin-worker/src/gmail.ts` refreshes an OAuth access token using a server-side
form POST to `https://oauth2.googleapis.com/token`, then sends UTF-8 multipart
plain-text/HTML MIME in the base64url `raw` field to:

```text
POST https://gmail.googleapis.com/gmail/v1/users/{authorized-sender-address}/messages/send
```

An explicit sender mailbox is used in the URL, and the frozen From address must
match `ADMIN_EMAIL_FROM`. There is no browser token flow, SMTP, domain-wide
delegation, automatic refresh/send retry, new library or persisted access token.
Both calls use the existing bounded request transport; redirects are rejected.
Credentials and upstream error bodies are not logged or returned to the client.

The server refresh grant follows Google's
[web-server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server#offline).
The MIME format and send request follow the
[Gmail sending guide](https://developers.google.com/workspace/gmail/api/guides/sending)
and [messages.send reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send).

## Exact Worker configuration

| Setting | Storage | Required value/purpose |
| --- | --- | --- |
| `TECHNICIAN_EMAIL_PROVIDER` | Worker variable | `gmail` |
| `GMAIL_CLIENT_ID` | Worker secret | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Worker secret | That client's secret |
| `GMAIL_REFRESH_TOKEN` | Worker secret | Offline refresh token authorized by the sending Gmail account |
| `ADMIN_EMAIL_FROM` | Worker variable | Bare authorized Gmail mailbox address; no display-name wrapper |

The sending account must have consented to
`https://www.googleapis.com/auth/gmail.send`, and Gmail API must be enabled in the
Google OAuth client's project. No mailbox-read scope is needed for this adapter.
Credentials must belong to the same OAuth client and sending account. These remote
prerequisites and actual sender authorization have **not** been verified or changed.
Do not put these credentials in Expo/Vite variables or commit them to source.

`ADMIN_EMAIL_PROVIDER` still controls dispatcher invitations independently. Keep
its existing production value `firebase`, `FIREBASE_WEB_API_KEY` and all existing
service-account/Firebase/CORS settings unchanged. The Firebase invitation adapter
does not use `ADMIN_EMAIL_FROM`. If deliberately using Resend invitations in a
different environment, the shared From setting must also remain authorized for
that provider; selecting Gmail for technician mail does not reconfigure invitations.

The local `wrangler.jsonc` selects Gmail decisions while retaining Firebase
invitations and an empty sender. Missing Gmail credentials/sender return the
existing `not_configured` status without contacting any email provider or rolling
back the saved decision. No fallback to Resend or Firebase occurs. An unsupported
technician provider is also unconfigured. For older environments without the new
selector, the existing Resend decision behavior remains the default.

## Duplicate protection and honest status

The published Gmail send method exposes no idempotency parameter. Consequently,
this adapter conservatively treats uncertain sends as non-repeatable; the stable
MIME Message-ID is for correlation, **not** a claimed deduplication guarantee.

- The first sending claim records `provider=gmail`. Concurrent requests reuse that
  receipt. A successful Gmail message ID produces `submitted`, never `delivered`.
  Submitted receipts suppress all future sends for that decision.
- OAuth failures happen before any Gmail send request, so they are definitive
  failures and can be explicitly retried after the existing cooldown. Likewise,
  clear Gmail 400/401/403/404/429 rejections remain failed requests. Provider quotas
  may require a longer operational wait than the app's minimum retry cooldown.
- A send timeout, 5xx, unexpected response or missing acceptance ID produces
  `unknown` with `retryable=false`. A crash leaving a Gmail sending lease also
  becomes non-retryable after expiry. An operator must inspect the Gmail/provider
  record before any recovery; no automatic resend or mailbox scan is introduced.
- Configuration changes and switching providers cannot erase uncertainty. Older
  receipts without a provider are treated as Resend. Uncertain Resend receipts
  cannot be retried through Gmail, while safe same-provider Resend retries retain
  their existing 23-hour window. Frozen payloads/senders are retained.
- A lost final Firestore receipt acknowledgement is checked without sending again;
  Gmail returns a non-retryable unknown result if acceptance cannot be confirmed.

Exactly-once inbox delivery is not claimed. Retaining receipts and using the same
provider account remain operational requirements. Google's
[error guide](https://developers.google.com/workspace/gmail/api/guides/handle-errors)
also distinguishes API responses from actual successful mail delivery.

## Future setup/deployment commands — not executed

From the repository root, store the three server-side credentials using interactive
secret entry. These commands change the remote Worker and require a separately
authorized release; they were **not** run in this task:

```powershell
.\admin-worker\node_modules\.bin\wrangler.cmd secret put GMAIL_CLIENT_ID --config .\admin-worker\wrangler.jsonc
.\admin-worker\node_modules\.bin\wrangler.cmd secret put GMAIL_CLIENT_SECRET --config .\admin-worker\wrangler.jsonc
.\admin-worker\node_modules\.bin\wrangler.cmd secret put GMAIL_REFRESH_TOKEN --config .\admin-worker\wrangler.jsonc
```

After replacing the sender placeholder with the mailbox that authorized the token,
the exact Worker deployment command is:

```powershell
$gmailSender = 'REPLACE_WITH_AUTHORIZED_GMAIL_ADDRESS'
.\admin-worker\node_modules\.bin\wrangler.cmd deploy --config .\admin-worker\wrangler.jsonc --name servicepilot-admin --keep-vars --var "TECHNICIAN_EMAIL_PROVIDER:gmail" --var "ADMIN_EMAIL_FROM:$gmailSender"
```

The explicit From override avoids deploying the template's empty sender. Review
all declared local variables against production before release: `--keep-vars`
preserves undeclared dashboard variables, but locally declared variables and CLI
overrides still apply. Leave `ADMIN_EMAIL_PROVIDER=firebase` unchanged. No Cloud
Functions, Firestore Rules/index deployment, migration, Pages or APK rebuild is
required by this backend-only change. Existing records need no backfill.

## Validation

```powershell
npm.cmd --prefix admin-worker run check
npm.cmd --prefix admin-worker test
npm.cmd --prefix functions run build
```

- Worker TypeScript check: passed. Shared-domain Functions TypeScript build: passed;
  this is compilation only, not a Functions deployment.
- Full Worker unit/runtime suite: **35/35 passed**. Gmail tests cover both decision
  templates, UTF-8 MIME, exact token grant, safe headers, missing settings, sender
  mismatch, token/send errors, redirects and no transport retries. A real local
  workerd instance executes the Gmail adapter with **all outbound calls mocked**.
- Receipt tests exercise the real shared decision engine with a serialized in-memory
  transaction adapter: reviewer/recipient checks, concurrency, durable replay
  suppression, failures, lost acknowledgements, crashed leases and provider changes.
  Existing invitation, token, CORS, Firestore-adapter and Resend tests also pass.
- Targeted Worker/test and shared-domain lint: passed without warnings.
- The initial sandbox full-suite attempt could not resolve esbuild source paths
  because of filesystem restrictions; the same unmodified suite passed on the
  host. No production access or external provider calls were required.
- No new Firebase emulator integration or real OAuth/sender/delivery test was run.
  Configuration syntax and mocked acceptance do not establish provider readiness
  or inbox delivery. The current production deployment is unchanged by this task.
