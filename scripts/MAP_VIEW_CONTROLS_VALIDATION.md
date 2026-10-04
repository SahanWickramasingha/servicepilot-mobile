# Map zoom and declared-service-area view

This focused UI increment preserves the earlier uncommitted ServicePilot implementation and root AGENTS.md edit. It adds no server reads/writes, location permissions, dependencies, paid APIs, Functions, migrations or Firestore rule/index changes. No deployment or production data write was performed.

## Behavior

- Bottom-right +/− buttons have 48×48 dp targets, accessible Zoom in/Zoom out labels and hints, and remain disabled until the map is ready or while a zoom operation is pending. They sit 36 dp above provider legal/logo space, separate from existing top-right Fit map / Show district and bottom navigation. Provider-native duplicate zoom controls are disabled.
- Zoom calls the existing `react-native-maps` camera API to read the current camera, then applies a partial zoom update preserving centre, heading and pitch. Google levels and map min/max props use the installed library's documented 0–20 range; the provider additionally clamps to its supported tile levels. Apple Maps uses relative camera altitude with the existing native min/max zoom constraints. A late camera read is ignored if a newer navigation action has occurred.
- Every Customer map/list Technician card and marker-detail card has Show service area, even when shared GPS is unavailable. The action uses that Technician's saved district/area association for the currently filtered service district. A different saved district is used only if the preferred district is not part of the Technician's declaration; it never comes from GPS/address. Multi-district associations remain separate.
- The verified locality catalogue currently contains IDs and names, without town coordinates. The action therefore fits the saved district boundary, highlights it in amber and labels, for example, **Service area: Peradeniya, Kandy** and **District boundary only; town reference unavailable**. It does not claim town-centre precision or create a coverage radius. [Existing provenance and coverage limits](../functions/src/domain/SERVICE_AREA_DATA.md) still apply; district data attribution remains visible.
- Show location clears the amber service reference and focuses the unchanged current public approximate GPS coordinate. GPS wrench styling/freshness and the existing approximate-location circle are preserved. Focus is one explicit camera action: later GPS updates move the pin without undoing pan/zoom or a service-area view. Fit map / Show district clear the service reference. District/category changes clear it with existing focus state. Location storage and sharing controls are untouched.

## Files changed in this increment

- `app/(tabs)/map.tsx`: shared card action, service-area view state and camera/scroll handoff.
- `src/components/maps/TechnicianMap.native.tsx`: zoom controls, relative camera operations, amber boundary/label and explicit focus behavior.
- `src/components/maps/TechnicianMap.types.ts`: separate service-area view props.
- `src/utils/mapViewActions.ts` (new): bounded relative zoom and saved district/area reference resolution.
- `scripts/tests/map-view-actions.test.mjs` (new): native component/camera integration harness and reference/zoom checks.
- `functions/src/domain/SERVICE_AREA_DATA.md`: document district-boundary-only reference behavior.
- This validation record (new).

The other modified/untracked files were present when this task started and were preserved. Earlier pending Firestore deployment commands remain in `SERVICE_AREA_MAP_VALIDATION.md`; this UI increment needs no additional deployment.

## Checks performed

```powershell
node scripts/check-map-types.mjs
npx.cmd eslint 'app/(tabs)/map.tsx' src/components/maps/TechnicianMap.native.tsx src/components/maps/TechnicianMap.types.ts src/utils/mapViewActions.ts scripts/tests/map-view-actions.test.mjs
node --test scripts/tests/map-view-actions.test.mjs scripts/tests/customer-map-location.test.mjs scripts/tests/service-areas-distance.test.mjs scripts/tests/map-loading.test.mjs scripts/tests/foreground-sharing.test.mjs scripts/tests/device-location.test.mjs
git diff --check
```

Focused TypeScript and changed-file ESLint passed. All **36 tests passed**, including five new tests covering saved district association, legacy/Other references, zoom boundaries/Apple altitude, camera preservation, unchanged GPS marker coordinates, return-to-location, GPS updates while viewing an area and a late zoom promise racing navigation. `git diff --check` passed. Repository-wide checks and Firestore security suites were not repeated for this UI-only increment; the prior handoff records their results and pre-existing root failures.

## Native verification and repeat steps

Performed on Android emulator-5556 (1080×2400, Expo Go/Google Maps) with one Metro server and **only** `demo-servicepilot-review-author` Auth/Firestore emulators. Customer logged in as the disposable `map-customer-b@example.test`. Demo Technician declared Peradeniya/Kandy; its shared GPS fixture was the documented Walapane point from the prior handoff. The fixture was supplied by a guarded ignored local helper, not production app code.

Verified:

1. Map → Kandy → List → Map Technician card → Show service area: switches to map, closes details when applicable, scrolls to the map, fits Kandy and displays the amber boundary and district-only Peradeniya label.
2. + increases scale; − returns to the prior scale with the same camera position and indicator. Targets/labels are present in Android UI accessibility output. Google logo/attribution, Fit/Show district and bottom navigation remain clear.
3. Show location returns to the Walapane wrench and clears the amber reference. Pan that view, then +: zoom stays at the panned position rather than resetting to the district/GPS centre.
4. Tap the wrench → marker detail card → Show service area: same declared-area navigation, with the detail modal dismissed.
5. A public emulator document read after these actions still showed `serviceDistrictIds: ['kandy']`, `kandy: 'lk-postal-20400-peradeniya'`, GPS grid cells `709,8086` and the original location updatedAt. The UI actions did not write either location or service coverage. The fixture aged naturally into Stale; the grey wrench and text remained visible during both views.

Screenshots inspected locally in ignored `.expo/service-area-verification/`: `service-area-before-zoom.png`, `service-area-zoom-in.png`, `service-area-zoom-out.png`, `return-current-gps.png`, `pan-before-zoom.png`, `pan-after-zoom.png`. Fixture coordinates/provenance and full demo Firebase/Metro setup are in [the earlier two-emulator procedure](SERVICE_AREA_MAP_VALIDATION.md#exact-two-emulator-procedure).

After verification, the disposable demo GPS fixture was cleared to sharing OFF, the demo app/task servers were stopped, and temporary emulator input/port-forwarding settings were removed. The pre-existing port 8081 server/forwarding was preserved.

Repeat additionally with a district-only profile, technician-provided Other, multiple saved service districts, no GPS, sharing OFF, fresh GPS, and category/district filter changes. Use the Technician sharing controls or guarded disposable fixture helpers only; no live data should be edited for UI testing.

**Not verified on a device for this increment:** iOS/Apple Maps, physical devices/release builds, different densities or large text, TalkBack interaction, reaching the native provider's extreme zoom levels, simultaneous live Technician GPS updates while zoom/navigation is pending, and the additional legacy/Other/multi-district/no-GPS/OFF/filter scenarios above. Automated coverage verifies core reference/focus and previous lifecycle behavior. Web retains its existing native-map fallback. Town-centre navigation remains unavailable because the existing verified catalogue contains no town coordinates; the district-only fallback is intentional and explicitly labelled.
