# ServicePilot legal, privacy and Google Play review

Reviewed 2026-11-02 (Asia/Colombo). Owner / Developer: Sahan Wikramasingha;
contact `sahanwikrama29@gmail.com`, `0767639021`, `tel:+94767639021`,
[confirmed LinkedIn](https://www.linkedin.com/in/Sahan-Wikramasingha).
Terms and Privacy version: `2026-11-02.1`, effective `2026-11-02`.

This is an implementation/evidence review, not a legal opinion, certification,
guarantee of Play approval, or a claim of GDPR/PDPA compliance. Owner decisions
and operational gaps below remain launch blockers. No live records, passwords,
tokens or private keys are included. Existing staged release work was preserved;
this task's changes remain unstaged. No commit, publication, remote write,
deployment, email, billing change or APK build was performed.

## Data handling actually inspected

| Data / role | Collection and purpose | Visibility and evidence |
| --- | --- | --- |
| Customer account | Name, email, phone, address, role/status and verification; login/service contact | Private `users`; `firestore.rules` owner/super-admin reads. Customers cannot read unrelated private profiles. Firebase Auth handles passwords. |
| Technician profile | Same account fields; specialty, experience, qualifications, optional certifications, districts/areas, availability, optional photo | Private profile accessible to owner, super admin and authorized dispatchers. `mapProjection.ts` allowlists public name/specialty/credentials/areas/photo/totals, excluding address/contact/private GPS and policy acceptance. Free-text public fields can still contain information users choose to enter; do not promise automatic redaction. |
| Technician location | Opt-in foreground GPS publication, movement/interval throttling, server freshness | `foregroundSharing.ts`, `location.service.ts`, location rules: precise `technician_locations` separate from grid `technician_map_locations`; browsing gets approximate cells. Fresh precise read requires owning eligible accepted/assigned/in_progress job plus authoritative access proof. OFF/background/logout cleanup stops tracking and revokes sharing; failures are surfaced rather than falsely confirming removal. |
| Customer distance | User-requested foreground fix, Haversine distance | `useCustomerMapLocation.ts`: memory only, no district-centre fallback, no remote customer location for browsing; unavailable/stale/denied location leaves browsing possible. |
| Requests / schedules | Customer and selected technician IDs/names, customer contact/address, description, photos, schedules/status/timers, cancellation | `request.service.ts`, `bookingSchedule.ts`, request rules: owning customer, assigned approved technician and super admin; dispatcher job assignment is not restored. Trusted scheduling uses authenticated Node/Cloudflare service, not mandatory deployed Functions. |
| Request / job photos | System-selected request images; technician camera/library before/after evidence | New scoped photos use authenticated Photo Worker + private R2 objects/Firestore metadata. Request photos: owner or authorized selected technician; job photos also super admin under Worker policy. Firebase historical scoped media is read-only; access is authenticated. Objects use references, not public bearer URLs. |
| Notes / signature | Technician service diagnosis/work/parts/recommendations and customer drawn approval | `jobEvidence.ts`, `jobEvidence.service.ts`, `job_evidence` rules restrict assigned eligible edits and participant/super-admin reads. Signature is a drawn path plus customer name/approval/time; no biometric matching/identification code was found. Customer permission remains necessary before a technician captures it. |
| Reviews / review photos | Rating, reviewer name, comment, date, review/request/participant IDs, optional resized JPEGs | `review.service.ts`, review rules and `storage.rules`: eligible signed-in readers; published review images have wider visibility than job evidence. Immutable original reviews/totals are preserved. Reports can hide display through separate restrictions; original records are not erased. |
| Notifications | Personal job events, targeted/broadcast system messages, read receipts | Notification rules bind personal reads to UID and system scopes to role; in-app Firestore notifications. No client FCM/Expo push registration or ads/analytics SDK invocation was found in inspected app code. A Firebase messagingSenderId alone is not proof of push collection. |
| Acceptance / safety | Policy versions + server time; private user blocks; reporter/reported IDs, content pointer, reason and moderation decision | New acceptance is required at profile creation; existing users explicitly accept, never backfilled. Reporter and super admin can read a report; only super admin lists/moderates it. Blocks are owner-only and bounded; new bookings check both directions authoritatively. Existing job history/evidence is retained. |
| Provider/network records | Firebase Auth/Firestore/Storage, Cloudflare Workers/R2, Android Google Maps; Expo/RN runtime | Worker authentication checks identity, revocation and authoritative job/profile data; trusted writes are allowlisted. Firebase/Google/Cloudflare can handle operational network/device data. Provider retention, enabled logging, actual regions, subprocessors and contracts need owner verification. Maps SDK diagnostics/pseudonymous identifiers and possible map interactions are disclosed; no claim of zero telemetry. |

No unrelated private-user read permission was widened. The audited public map
projection and private media boundaries were retained. Local fixes add acceptance
validation, safety records and moderated display, rather than granting public
access to private users/job evidence. Moderated content remains in original
records for authorized history; display hiding is not cryptographic erasure or
a promise that already-seen/publicly-shared content cannot be copied.

## Requirement matrix

Official primary sources were checked on the review date. Linked policies,
not summaries or community answers, govern submission.

| Requirement | Applicable / Not applicable / Unknown | Evidence | Implementation gap | Local fix | Owner / Console action |
| --- | --- | --- | --- | --- | --- |
| Public HTML Privacy Policy | Applicable | [User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en); `public/legal/privacy.html` | Not hosted; no verified live URL | Static readable HTML, no login, shared content, no tracker or PDF dependency | Approve wording; later host without geofencing; verify access and enter actual URL in Console |
| In-app policy, owner/contact, data lifecycle | Applicable | `LegalLinks`, `PolicyDocument`, shared JSON | Retention schedules / erasure operations not established | Both profiles and Settings link to policies/contact/deletion; honest limitations | Confirm retention, statutory bases, provider copies/contracts and operating markets |
| Registration Terms + Privacy acknowledgement | Applicable | `register.tsx`, `user.service.ts`, create rules | Compatible rule rollout required; old clients cannot create new-version payloads | Unchecked accessible checkbox, independent links in modal, inline error, current versions + server acceptedAt | Coordinate reviewed rules and app rollout; do not fabricate existing acceptance |
| Unexpected collection disclosure / optional choices | Applicable | [User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en), sharing panel, distance control, job evidence text | Physical device permission/dialog QA outstanding | Separate foreground sharing/distance actions; camera/photo purpose and recipient explanation; registration is not blanket consent | Recheck installed SDK behavior and all store claims; determine any additional jurisdiction-specific consent |
| In-app and external account/data deletion initiation | Applicable | [Deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), legal deletion screen/HTML | Public page not hosted; end-to-end handling not operationally verified | Discoverable email composer, exact subject, real clipboard fallback; no false submitted state | Test receiving mailbox; verify external page; supply Console deletion URL |
| Auth + Firestore + media erasure and justified retention | Applicable | `account-lifecycle.service.ts` only disables/revokes; Worker cleanup preserves referenced history | No full verified erasure workflow, fixed processing time or retention schedule | Policy explicitly distinguishes restriction from erasure; handling runbook below | Implement/approve and test backend/operator deletion, provider-copy handling, timelines and exceptions before release |
| Foreground / precise location | Applicable | Generated manifest and `TechnicianSharingPanel`; location rules | Final merged release manifest/device behavior not verified in this task | No background location; precise/private and approximate/public separation retained | Recheck final artifact and Data safety location answers; test denial/OFF/account switches |
| Broad photo/video and storage permissions | Not applicable to implemented occasional uploads | [Permissions policy](https://support.google.com/googleplay/android-developer/answer/18265346?hl=en), system picker code and library manifest | Native dependencies contribute permissions during Gradle merge | Explicit manifest removal of broad media/storage; preserve camera for technician evidence | Verify final merged APK/AAB; do not declare broad library access merely to satisfy an unused SDK |
| Microphone / contacts / SMS / call logs / overlays / advertising ID | Not applicable to implemented features | No functional use found; generated removals | Final artifact verification outstanding | Explicit blockedPermissions; tel opens dialer without CALL_PHONE | Confirm no later SDK reintroduces permissions; no related Console claims |
| Signature biometric declaration | Unknown if owner later changes processing; no biometric identification currently found | Drawn path renderer/validator only | Signature retention/erasure unknown | Explain job-evidence purpose and viewers | Classify as user-provided evidence/personal information based on actual use; do not label every signature biometric |
| Terms before UGC, including legacy accounts | Applicable | [UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en); acceptance prompt / rules / Worker | Requires reviewed client/rules/Worker rollout | Explicit current acceptance before profile/booking/review/evidence/photo uploads; dismiss cancels; no fabricated records | Version policies with coordinated validation changes; retain legitimate old records |
| Report content/users and block users | Applicable: profiles, reviews and job-related one-to-one service interaction | Same UGC policy; Safety controls + owner-private blocks + bidirectional booking checks | 200-block UI limit; no claim that blocking erases previous jobs or globally revokes public record reads | Actionable private reports, block/unblock, hidden public content, preserved evidence; unknown legacy review author can still be reported | Monitor queue; handle active-job safety manually; do not advertise automatic cancellation or emergency response |
| Authorized ongoing moderation | Applicable | Admin-only `/admin/moderation`, bounded pending-50 queue; rules | Manual staffing/response policy; queue throughput needs operational follow-up; hide is display moderation | Private investigation/resolution, actor/server time, hide/restore profile/review content; existing suspension workflow retained | Assign responsible moderator, review queue regularly, define escalation/appeal handling and complete backlog process |
| Data safety disclosure | Applicable | [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), inventory above | Console answers and third-party classification unconfirmed | Evidence-based draft below | Confirm exact release SDKs, purposes, service-provider/user-directed sharing exceptions and actual erasure practices |
| Target audience / Families | Unknown | No approved audience/age declaration in repo | Age suitability, children access and moderation decisions outstanding | No fabricated age claim or child-directed feature added | Decide audience, territories, ages and whether child protections are needed; complete audience declaration |
| Content rating / ads | Applicable rating; ads not found | Reviews/photos/text; no ads SDK/payment code found | Real content and external SDK behavior must match answers | Report/block/moderation and prohibited-content terms | Complete IARC questionnaire honestly; verify no ads before declaring no ads |
| Reviewer access | Applicable | Customer verification and approved technician flows | No approved demo credentials or reviewer bypass | Instructions below, no real passwords or accounts created | Provision authorized test accounts and exact review instructions through Console |
| Current target API | Applicable | [Target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en): new/updated phone apps require API 36 from Aug 31, 2026 | Final release artifact target unverified | Installed RN 0.81.5 manifest/version catalog target 36; native config inspected | Check final merged manifest/AAB. A source default is not proof of the uploaded artifact |
| Signing / App Bundle | Applicable for Play | `eas.json`: preview APK, production AAB, remote signing | Play App Signing/upload linkage unverified here | Existing signing kept unchanged | Use reviewed production AAB later; verify upload key, package and Console setup. No key generation here |
| Developer identity / account declarations | Applicable; rollout details depend on account and territories | [Android developer verification](https://developer.android.com/developer-verification/assets/pdfs/updates-to-play-console-for-android-developer-verification.pdf) | Account identity/package registration not inspected | Owner/contact identity consistent in local policies | Complete applicable Console verification and package registration; confirm legal identity/store details rather than inferring approval from an EAS account |
| Developer-account testing | Unknown account applicability | [Personal account testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB): newer personal accounts need qualifying closed testing | Account type/creation/access unknown | No invented tester counts | Confirm account; if applicable complete at least 12 continuously opted-in testers for 14 days and apply for production access |
| Native SDK compatibility / 16 KB | Applicable to native libraries | [16 KB guidance](https://developer.android.com/guide/practices/page-sizes), installed RN/maps/Expo | Actual ELF/zip alignment and device run not checked | No unneeded SDK added; clipboard only for requested native fallback | Validate final AAB, bundled native dependencies and 16 KB device behavior; check Console SDK warnings |
| Accurate listing, stability and access | Applicable | Source/tests, feature gates and limitations | No new release artifact or manual end-to-end device run | Functional legal/contact/safety flows and focused regressions | Use real screenshots; do not promise automatic deletion, emergency support, background tracking or dispatcher assignment |
| Payments | Digital-purchase billing not applicable to current physical-service booking flow | [Payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en); no payment SDK/checkout found | Any future monetization requires a fresh assessment | No billing SDK/payment service added | Keep physical services distinct from future digital subscriptions; approve business model before declaring monetization |
| Health, financial lending, gambling, VPN, news, messaging/social chat | Not applicable to inspected features | No such functionality found | Reassess if scope changes | None added | Do not submit irrelevant declarations; UGC rules still apply to reviews even without chat |

## Data safety draft — not submitted

Treat the following as an evidence inventory, not preselected Console answers.
Google's collection/sharing categories and exceptions require owner confirmation.

| Candidate data type | Evidence / purpose | Optionality and sharing considerations |
| --- | --- | --- |
| Name, email, user ID, phone, address | Account/contact and physical service delivery; Firebase Auth/Firestore | Registration currently requires contact/address. Technician public name and qualifications; participant contact within jobs. Classify user-directed/service-provider transfers correctly. |
| Approximate and precise location | Technician private GPS + public grid; optional customer memory-only distance | Sharing and runtime permission are optional. Do not answer based only on customer distance: technician precise data is stored. Maps SDK data is a separate provider consideration. |
| Photos | Optional review/request/job images, Firebase Storage/R2 | User selection/camera action; public reviews versus private job media differ. Do not claim referenced evidence is auto-erased. No app video/audio recording feature found. |
| Other user content | Qualifications/certifications, requests, reviews, notes, drawn signature and reports | Required and optional fields differ by role/action; signature is not automatically biometric identification. |
| App activity / interaction | Bookings, review activity, notifications/read receipts and blocks | Core operation/safety; optional actions. No ads/marketing use found in app source. SDK own-purpose processing may differ. |
| Device/other IDs, diagnostics, network data | Android Maps SDK; Auth/hosting operational metadata | [Maps disclosure](https://developers.google.com/maps/documentation/android-sdk/play-data-disclosure) lists device/SDK metadata, crash data, IP and SDK pseudonymous identifier, plus configuration-dependent map interaction events. Match actual native SDK version before final answers. Blocking advertising ID does not mean all SDK identifiers disappear. |

Read [Firebase provider privacy guidance](https://firebase.google.com/support/privacy).
HTTPS is enforced for configured release API origins; Firebase/Worker calls use
authenticated HTTPS and media responses are private/no-store. This is evidence
for inspected transport paths, not proof that every provider copy, future endpoint
or final native SDK is encrypted in every context. Do not mark broad Console
claims without validating the actual release and provider documentation.
Firebase Analytics/Crashlytics/ads/Expo push instrumentation was not found in the
app code inspected; Maps has its own diagnostics and identifiers. Provider logging
settings, backup schedules, data residency and DPA/subprocessor arrangements are
unknown, not guessed. [Cloudflare R2 logging documentation](https://developers.cloudflare.com/r2/buckets/data-access-logs/)
does not prove logging is enabled or disabled on this project's bucket.

## Deletion handling runbook and implementation blockers

1. Receive the user-sent email. Opening the composer or copying an address is
   not receipt of a request. Confirm mailbox access and assign a handler.
2. Ask for registered email and account role only as needed. Verify control
   through a challenge to the registered mailbox or an existing authenticated
   verification flow. A displayed UID or forged email From header alone is not
   identity proof. Do not request passwords, tokens, private keys or routine ID
   documents. Define a recovery process for inaccessible email separately.
3. Inventory the verified UID's Auth account, private user, public projection,
   precise/public locations and location-access proofs, availability, bookings,
   receipts, evidence/signatures/photos, reviews and review photos, notification
   and message-read records, blocks, reports, lifecycle/provisioning/audit data.
   Include provider object metadata and both Firebase legacy and R2 media.
4. Plan removal/anonymization per record and references. Preserve other users'
   legitimate records; do not recursively delete a whole shared booking or
   referenced object simply because one participant requests deletion. Determine
   and document any legal/security retention basis, minimal fields, access and
   expiration. No fixed period or blanket exception is assumed here.
5. Existing admin delete disables Auth, revokes tokens, changes accountStatus
   and public visibility/sharing; it does **not** call Auth deleteUser or erase
   Firestore/storage. Keep restriction available while a request is reviewed,
   but do not describe it to the user as completed erasure.
6. Full fulfilment needs an authorized, idempotent, dry-run-first operator/backend
   workflow with approval, checkpoints, retry/reconciliation, reference checks,
   Auth deletion, storage/Firestore deletion or justified anonymization, review
   aggregate correction where appropriate, and provider log/backup handling.
   Such a destructive workflow was not implemented or run in this task. Existing
   pending-upload cleanup deliberately preserves referenced/completed evidence
   and is not an account-erasure system.
7. Agree processing/response timelines and operational capacity before launch.
   Tell the verified requester the actual scope, outstanding provider copies and
   any justified exceptions; confirm completion only after verification. Record a
   minimal restricted audit, with its own justified retention. No email was sent.

## Legal, ownership and owner decisions

The app targets Sri Lankan localities; operating markets, controller obligations,
legal bases, sensitive-data treatment, cross-border transfers and age policy need
qualified owner/legal review. The [Sri Lanka DPA's current notice](https://dpa.gov.lk/notice.php)
reports phased PDPA commencement, including Jan 1, 2027 for specified parts,
with other parts not yet active. Confirm the relevant Gazette and actual launch
date; do not reuse obsolete commencement claims or infer legal compliance from
this policy text. EEA/UK or other markets would require their own assessment.

No root repository LICENSE was found. This does not prove every asset and code
contribution is owned by the confirmed developer. Terms limit the ownership
assertion to material actually owned; third-party and prior-license rights are
reserved. The existing ServicePilot logo was reused unchanged; its provenance
and any contributor agreements still need confirmation. No developer photograph
was invented. District/town attribution and existing provider/license notices
were retained. Review all redistributed dependency licenses for the final binary;
the About notice is not a substitute for their required license texts.

Owner blockers: statutory processing grounds; operating markets/age audience;
retention and deletion schedules; verified erasure/backend process and mailbox
handling; provider contracts/regions/backups/logging; content moderation staffing,
backlog capacity and appeals; asset ownership; final SDK/manifest/16 KB review;
actual public URLs; Console declarations and authorized reviewer access.

## Reviewer access and manual verification

Provide Console reviewers authorized customer and approved-technician test
accounts through the Console's restricted app-access fields only. Do not put
passwords here or create accounts without approval. Explain email verification,
technician approval, any test data and access to customer/technician flows.
Use two disposable local emulator accounts for development verification:

- Registration: unchecked submit errors inline before Auth; inspect both links,
  close policy reader, confirm all fields remain; checked registration persists
  server acceptance versions/time. Simulate profile-write/retry failure.
- Existing profile: browse with no fabricated acceptance; first content save
  prompts; dismiss returns without submission; agree saves once and continues.
  Test logout/account replacement and denied/unavailable acceptance writes.
- Both roles: Profile/Settings → all five links; existing logo and exact contact
  details. Email failure → clipboard/manual selection; call dialer; LinkedIn.
  Deletion composer opens with exact subject, sends nothing automatically.
- Public HTML: no login, keyboard-readable, mobile layout, mailto/copy fallback,
  content/version parity. After authorized hosting, check real external access
  without login/geofencing and correct MIME type; no live URLs exist from this task.
- Safety: report profile/review/legacy review/job; super admin sees it, normal
  users/dispatchers do not see others' reports. Investigate, record decision,
  hide/restore public content and test suspension through existing controls.
  Block/unblock in both directions, prevent new bookings, retain existing jobs,
  evidence, legitimate reviews/totals and notifications. Exercise offline retry.
- Permissions: foreground sharing disclosure before action; grant/deny both
  customer distance and technician location. Stop/OFF/logout/background behavior;
  no background permission. Library picker without broad grants; camera permission
  only on camera action. Verify notes/signature recipients and consent wording.
- Later release: inspect final Gradle-merged manifest and APK/AAB permissions,
  exact target SDK/native SDK versions, certificate identity and native alignment;
  test on devices including 16 KB. The earlier completed APK predates this work
  and has not been claimed to contain it.

Manual email/dialer/LinkedIn/device UI, hosted pages, full erasure, real moderation
operations, final merged native artifact and Console declarations were not
verified in this session. Compilation is not evidence of those outcomes.

## Local files and later deployment — commands prepared only

Shared content/model: `functions/src/domain/legal-content.json`, `legalPolicy.ts`.
Mobile: legal reader/acceptance/contact/safety components; `app/legal/[page].tsx`;
registration/profile/settings/map/review/job integration and guarded services.
Security: Firestore acceptance/report/block/restriction rules; Storage acceptance
on review creation; Photo Worker acceptance checks. Admin: `/admin/moderation`.
Web: `public/legal/{terms,privacy,deletion,about,support}.html`, existing logo and
copy fallback, generated by `scripts/generate-legal-pages.mjs`.
Audit/tests: this document, Android manifest audit and focused legal/rules tests.
`expo-clipboard` is the only new runtime dependency, matching installed Expo SDK.

The existing 33-file staged release snapshot was not changed in the index. These
new unstaged changes need their own review; do not assume that snapshot or build
`958781ea-ece7-4f34-98d0-dab4e3b037df` includes them.

```powershell
# Generate/check shared public pages locally; no publication:
node scripts/generate-legal-pages.mjs
node scripts/generate-legal-pages.mjs --check

# AFTER owner review and explicit deployment authorization only:
firebase.cmd deploy --only firestore:rules,storage --project servicepilot-756d9
# Review Admin Web hosting configuration separately before publishing its UI.
# Photo Worker acceptance enforcement also needs its separately reviewed rollout:
npm.cmd --prefix photo-worker run check
npm.cmd --prefix photo-worker test
# Only after that separate review and explicit deployment authorization:
Push-Location photo-worker
npx.cmd wrangler deploy --config wrangler.jsonc
Pop-Location

# Public static pages: existing firebase.json serves public/. This deploy also
# includes existing auth action pages: review the complete public tree first.
firebase.cmd deploy --only hosting --project servicepilot-756d9
```

No new composite index is required: reports use a bounded single-field pending-status query;
blocks use owner-scoped document/list reads; restrictions use exact document
gets. Keep current indexes. Review all local-versus-live Rules differences, not
just this task's diff. Publish compatible backend/rules/admin controls in a
coordinated rollout before exposing new registration/UGC flows; account creation
and uploads using new guards will fail against incompatible old Rules.

After publication, enter actual Privacy and deletion URLs in Play Console. A
later APK/AAB rebuild is required for these screens, permission removals and
clipboard native module. Do not generate/replace signing credentials. No build
or publish command was executed in this task.

## Verification record

| Check | Result |
| --- | --- |
| Root TypeScript and focused Functions legal-policy lint | PASS |
| Root lint | PASS, zero errors; existing cleanup-ref warning in `app/technician/job-action.tsx:50` |
| Functions TypeScript, Admin Web production build, Photo Worker TypeScript | PASS; existing Admin bundle-size advisory |
| Focused legal/registration/contact/provider lifecycle tests | 9 passed |
| Existing category, map, review, notification and request-upload regressions | 58 passed |
| Existing photo picker/private-photo transport tests | 11 passed |
| Real Photo Worker suite, including local workerd/R2 | 24 passed; acceptance checked before reservation and after streaming |
| Local legal Auth/Firestore suite | 5 passed, including positive registration and real booking, both block directions, report/moderation access, and retained job history |
| Existing profile/category Auth/Firestore suites | 9 passed; 1 deployed-snapshot-only case intentionally skipped in local-Rules mode |
| Review Storage/Auth/Firestore suite | 6 passed, including acceptance-required upload, published visibility, immutable originals and safe cleanup |
| Shared public HTML/logo generation parity, generated category Rules, source/credential scan, 21 Git/EAS exclusions, whitespace | PASS |
| Generated native manifest introspection | PASS; granted generated permissions are COARSE_LOCATION, FINE_LOCATION, INTERNET, VIBRATE; removal directives include the targeted unnecessary permissions |
| Installed native-library manifests/version catalog | RN target/compile API 36; image-picker manifest contributes CAMERA and broad storage, with broad storage explicitly removed by app manifest; final Gradle merge not verified |

An additional account-session/auth-switch regression run passed 16 cases and hit
one existing fixture failure: `account-session.test.mjs` does not supply
`../domain/serviceCategories` when loading the existing callable `map.service.ts`.
Both that test and service match HEAD and are unchanged by this task. This is
separate from the passing new legal/account-change and authoritative Rules tests.
The broader Functions lint baseline previously recorded 17 errors in unchanged
files; focused lint of the new domain file passed. These were not silently fixed.

Storage emulation under Java 24 emitted deprecation/shutdown diagnostics, but the
isolated six-case run exited successfully. Initial local test attempts included
a client/Admin Timestamp fixture mismatch, unverified fixture flags and stale
emulator ports; those were corrected and the relevant positive tests rerun.
No production writes or real user records were used. Permission-denied diagnostics
in adversarial fixtures are expected; successful writes were tested separately.

Settings now uses actual Auth logout and working legal/contact routes. The old
notification/dark-mode toggles only changed component state and did not implement
preferences or permission withdrawal; they were replaced with truthful directions
to Notifications, feature sharing controls and device settings. Notification
services and their actual delivery/read-state behavior were preserved.

Final merged APK/AAB manifest, native/phone/email UI, hosted policy access,
complete erasure operations and Play Console declarations remain unverified.
