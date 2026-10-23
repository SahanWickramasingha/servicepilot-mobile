# Android OS push — proposal awaiting approval/configuration

Prepared 2026-10-23. This is a delivery design, not an implementation or evidence
of delivery. Existing Firestore notifications remain the source of truth. No push
dependency, token, credential, sender deployment or real push was added/generated.
The user approved scheduling separately; that approval does not approve push.

## Provider and trusted host

Proposed provider: Expo Push Service, with FCM v1 Android credentials configured
for an identified development/release application. Run a worker beside the
existing standalone Node backend, using its existing protected Admin credentials.
No required Cloud Function, paid service, billing change or production sender is
authorized. The hosting operator must approve a continuously running worker and
its bounded polling/queue budget; do not assume the existing host is deployed.

Use the installed Expo SDK's compatible `expo-notifications` version, selected
with `npx.cmd expo install expo-notifications` only after approval. SDK 54 Android
remote push needs a development build; Expo Go is not a delivery test.

## Registration and account changes

- Register only after authenticated opt-in. One installation binding per device,
  separate from other devices owned by the same user. The trusted registration
  endpoint derives UID from a verified token and checks active account/session.
- Store tokens privately; no public user/map document, analytics or log contains
  one. The server stores a token fingerprint for uniqueness and the protected token
  for delivery. A device-bound random registration secret prevents arbitrary
  reassignment of another installation. Keep it in appropriate native secure storage.
- Token refresh listeners upsert the current binding; deactivate superseded
  bindings. On login/resume, reconcile current token and binding ownership. Multiple
  installations remain independent. Enforce one current owner for a token.
- Detach while the previous identity is still available; invalidate local callback
  generations on logout/switch. Server rechecks current binding ownership and
  session validity immediately before send. Never send old-account content to a
  newly bound installation. Administrative disable/delete revokes its bindings.
- Offline logout cannot promise immediate remote unregister. Generic payloads
  prevent content leakage, and tapping always requires current authorized access.
  Reconnect must reconcile pending unregister before enabling a new binding.
- Remove `DeviceNotRegistered` tokens. Other permanent invalid-token/credential
  failures are quarantined for operator action, without dumping provider responses
  or token-bearing payloads into logs.

## Channels, permission and navigation

- Create a stable Android service-updates channel before requesting Android 13+
  notification permission. Request permission in an explained user action. Denial
  leaves all in-app notifications, unread checks and bookings usable.
- Foreground receipt refreshes existing authorized Firestore state. Background
  receipt uses the same generic OS notification. Neither changes booking status.
- Payload: generic title/body, opaque notification ID and request ID, schema
  version. No customer name/address, evidence, signature, coordinates or token.
- A single response handler covers foreground/background and the initial
  cold-launch response. Wait for restored Auth and the live account gate, fetch the
  notification as its recipient, then fetch the referenced request and derive the
  destination from the current role. Never trust a payload route or recipient UID.
- Dedupe navigation using notification/delivery ID plus current session. Clear the
  consumed initial response. Do not redirect an account B login to account A data.
  Missing/deleted/inaccessible destinations show neutral unavailable feedback.
  Completed jobs open the authorized read-only details/history, not job actions.

## Delivery, authorization and failure handling

- Consume only committed, authorized lifecycle notification events. Verify
  recipient against the saved request and event type; never accept a client-selected
  recipient or arbitrary body. Published system messages use authoritative role,
  audience/status and active-account eligibility at send time.
- Transactionally claim a deterministic `(event ID, installation binding version)`
  delivery record with a bounded lease. Store ticket/receipt state privately.
  One worker claim wins; multiple server instances cannot freely duplicate sends.
- Provider acceptance is not device receipt. Poll Expo receipts in bounded batches.
  Retry transient failures with exponential backoff, jitter and a maximum attempt/
  age budget. Permanent failures stop retrying; the in-app event stays available.
- A provider timeout can have an uncertain outcome: exactly-once transport is not
  guaranteed. Stable event IDs and client navigation deduplication handle duplicates.
- Poll with stable `(createdAt, document ID)` cursors and overlap/deduplication; a
  durable checkpoint and lease recover restarts. Explicitly choose a start cursor
  before enabling delivery so historical events are not unexpectedly broadcast.

## Approval and prerequisites still required

1. Approve provider, worker host, read/retry budget and deployment owner.
2. Confirm Android application ID, Expo project/build ownership, FCM configuration
   and secure credential storage. No keys belong in the repository or mobile app.
3. Approve token/installation schema, retention and lifecycle Rules; prepare indexes.
4. Implement local client/worker mocks, invalid-token/authorization/idempotency tests
   and account-switch races before any deployment approval.
5. Build locally with the approved toolchain, then test granted/denied permission,
   foreground/background/cold launch, offline reconnect, duplicate taps and different
   signed-in accounts. Do not claim delivery from mocked sender responses.

Primary references checked during this task:
- [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Expo delivery tickets, receipts and errors](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Expo push FAQ and Android development-build requirement](https://docs.expo.dev/push-notifications/faq/)
- [Android notification permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission)
