# ServicePilot — Technician Map Markers and Service Areas

## Task
Implement the following changes in the latest local ServicePilot repository. Do the implementation and validation, not only a plan. This is a task-specific handoff: read existing root and nested AGENTS.md instructions and merge these requirements without blindly replacing existing project guidance.

## Preserve the project
- Inspect git status first and preserve unrelated uncommitted work.
- Keep React Native, Expo Router, TypeScript, Firebase Authentication, Firestore and the existing Admin Web.
- Preserve working reviews, real reviewer names, notifications and role boundaries.
- Customers select approved technicians directly. Dispatchers review technician applications; do not restore dispatcher job assignment.
- Retain the billing-free Firestore map flow. Do not introduce required deployed Cloud Functions, paid geocoding or a billing account.
- Do not deploy, modify billing, migrate live records or write production data as part of this task. Prepare any required deployment commands or migration scripts for review.

## Observed state
Customer map/list shows Gihan serving Kandy and one shared location. Technician sharing is ON. The map shows Googleplex/Shoreline Park outside Sri Lanka. This suggests the Android emulator is providing a default California GPS position; verify the actual coordinate flow before attributing the issue to rendering. Do not relocate GPS markers to a selected district centre to disguise this.

## Location semantics
Keep three distinct concepts:
1. Service district(s): where the technician offers services.
2. Selected service town/area: the technician's declared service locality.
3. Current GPS position: where the device reports the technician currently is.

Example: a technician can serve Peradeniya, Kandy while currently in Walapane, Nuwara Eliya. Selecting Kandy or Peradeniya must never overwrite GPS coordinates. District filtering remains based on service districts.

## Personal Information: district and town/area
- Add a clearly labelled Service Area section in Technician Personal Information using the existing design system.
- Reuse the existing 25-district catalogue and canonical district identifiers.
- Provide a searchable district-dependent Town / Area selector. For Kandy, include verified entries such as Peradeniya, Katugastota, Kundasale and Gampola.
- Inspect existing area data first. Use a reliable, licensed source for additions and document provenance. Do not invent an exhaustive catalogue or claim a short list covers every locality.
- Support existing district selections without requiring profiles to be recreated. For multiple service districts, associate areas with their district; do not introduce conflicting district fields.
- Reset incompatible area selections when districts change. Provide an explicit Other area text option for unlisted localities, validated and labelled as technician-provided.
- Save through the existing profile service with validation, loading, error and success feedback. Keep private street/home addresses private.
- Use stable area identifiers where available, with display labels. Do not infer a precise public location from an address.
- Existing profiles without an area must still work. Show the district alone until an area is saved.

## Customer map: visible technician symbols
- Use a recognisable wrench icon inside a custom map pin for each eligible technician with a valid shared approximate GPS position.
- Reuse the existing map library/provider and icon package. Inspect how markers render on Android before selecting an implementation.
- Fresh markers: blue/accent colour. Stale markers: grey plus a text status, not colour alone. Reuse one documented freshness threshold across map and list.
- Never confuse the customer/device blue dot with a technician marker.
- Tapping a marker opens an accessible card or bottom sheet containing technician name, service, rating/review count when available, declared service area, location freshness and approximate distance when available.
- Include existing View Profile and Request Service actions with correct technician IDs.
- Support overlapping technicians with clustering or an appropriate selection mechanism compatible with the existing library.
- Keep current district boundaries, map/list switch, service filters and attribution.
- Initial view should show the selected district. Fit map may include matching technicians outside the district. Provide an explicit Show location action for outside-district technicians instead of silently losing them or moving their coordinates.
- Show an outside-district note, for example: Serves Kandy; current shared location is outside this district.
- Do not render a town-centre fallback as a current-location marker. With no shared GPS, keep eligible technicians in the list with Location unavailable.
- Turning sharing OFF must remove the current-location marker according to the established sharing policy. Service-area selection itself does not enable location sharing.

## Approximate distance
- Obtain customer foreground location only with permission and for the feature's stated purpose. Denied permission must not prevent browsing.
- Calculate approximate straight-line distance from customer coordinates and the technician's public approximate coordinates, using a tested geographic distance function.
- Label it Approximately X km away; do not call it driving distance or ETA.
- Do not use district/town centres as a substitute for customer GPS or invent distances.
- Hide distance or show Distance unavailable if either coordinate is missing, invalid or stale. Never expose private technician GPS just to calculate browsing distance.
- Do not require paid reverse geocoding to display a current town. A manually selected service town is not evidence of the current GPS town.

## Location sharing and security
- Preserve foreground-only tracking, permissions, sharing controls and account-change/logout cleanup.
- Keep customer-visible approximate coordinates separate from private precise coordinates; Firestore reads expose entire documents.
- Precise location is limited to the owning customer of an eligible accepted/in-progress request, enforced using authoritative request data and actual project status values.
- Only the technician may update their location. Verify authoritative approval, restrict field types/ranges and prevent fabricated trusted rating or approval fields.
- Do not widen access to private user/profile/address documents to display public map cards.
- Reuse existing Firestore projections where safe. Keep queries compatible with rules; add only necessary indexes.
- Maintain throttled movement/interval-based writes and bounded reads/listeners. No write per GPS callback or automatic repeated full-collection fetches.
- Do not hardcode Kandy/Walapane coordinates in production or replace unavailable GPS with fixtures.
- Keep Auth connectivity failures separate from map/GPS failures. Do not automatically connect normal app sessions to the Firebase Auth Emulator merely because they run on an Android emulator.

## Validation
Run relevant TypeScript, lint and focused tests. Add meaningful checks for area/district validation, distance calculation, freshness and access boundaries when those paths change.

Manually verify on two devices/emulators using one Metro server:
1. Technician login; save Kandy and a valid service area.
2. Set a mock Kandy location through Android emulator Extended Controls > Location; sharing ON and confirm save success.
3. Customer login on the second emulator; choose Kandy; see the technician list and wrench marker.
4. Tap marker; verify name, area, rating state and correct profile/request actions.
5. Change mock GPS to Walapane; technician remains in the Kandy service results but the GPS marker stays near Walapane, with an outside-district note and Show location action.
6. Verify distance with granted permission and graceful browsing when permission is denied.
7. Sharing OFF removes the current marker. Verify stale and absent-location behaviour.
8. Reopen the profile and confirm saved service-area persistence; test an older profile with no area.
9. Confirm reviews and notifications still work.

Use verified coordinates for emulator fixtures and keep them in test documentation only. List any manual verification not performed; do not claim live success from compilation alone.

## Deliverables
- Implemented changes and concise explanation.
- Changed files and test/check results, separating unrelated pre-existing failures.
- Area catalogue provenance and coverage limitations.
- Exact required Firestore rules/index deployment commands for servicepilot-756d9.
- Two-emulator test instructions and remaining limitations.
- If a migration is necessary, an idempotent dry-run-first script; do not execute against production.
