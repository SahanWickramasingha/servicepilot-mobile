# Service locality catalogue

ServicePilot uses the existing 25 geoBoundaries district IDs from `map.ts`. There was no town catalogue in the local application; `serviceAreas` and `serviceDivision` were legacy free-text fields. Those fields remain compatible through `resolveServiceDistrictIds`; no address or GPS is used to infer coverage.

The initial curated list contains four Kandy postal localities, verified in the official [GeoNames Sri Lanka postal export](https://download.geonames.org/export/zip/LK.zip) on 2026-10-03. GeoNames publishes this dataset under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with attribution required and no accuracy/completeness warranty; see its [postal dataset readme](https://download.geonames.org/export/zip/readme.txt). The selector includes a visible link crediting GeoNames.

| Display label | Source postal code | Source district | Persisted application ID |
| --- | --- | --- | --- |
| Peradeniya | 20400 | Kandy (KY) | lk-postal-20400-peradeniya |
| Katugastota | 20800 | Kandy (KY) | lk-postal-20800-katugastota |
| Kundasale | 20168 | Kandy (KY) | lk-postal-20168-kundasale |
| Gampola | 20500 | Kandy (KY) | lk-postal-20500-gampola |

These are application IDs namespaced by country, postal code and locality. A postal code is not asserted to uniquely identify a town worldwide. Labels and district associations were retained from the source. The list is a small curated subset, not an exhaustive catalogue of Kandy or Sri Lanka. All 25 districts support **Other area**, clearly marked technician-provided, or district-only coverage. No runtime GeoNames API/account or paid geocoding is needed.

`serviceAreasByDistrict` is an optional map keyed by existing canonical district IDs. Values are the stable catalogue ID or `other:<validated locality name>`. The source prefix distinguishes technician-provided labels. Compact strings allow all 25 associations to be validated within the Firestore expression budget. UI models decode these into ID/label/source objects. Saving rejects mismatched districts, unknown IDs, extra fields, and invalid Other labels (2–80 characters, trimmed, no control characters or angle brackets). Removing a district clears its area. Existing profiles without this field show only the district and require no recreation.

Selections describe service coverage only. They never enable sharing, change device GPS, provide current town information, or supply map/distance fallback coordinates. Private street/home addresses are not copied into the public projection.

The explicit **Show service area** action uses four reference points in `src/utils/mapViewActions.ts`, keyed by the existing saved IDs. The same official Sri Lanka postal export was downloaded and checked again on 2026-10-03; all four rows specify Kandy (`KY`) and accuracy **4** (gazetteer match):

| Town | Latitude (WGS84) | Longitude (WGS84) |
| --- | --- | --- |
| Peradeniya | 7.2622 | 80.5841 |
| Katugastota | 7.3276 | 80.6212 |
| Kundasale | 7.2737 | 80.7001 |
| Gampola | 7.1643 | 80.5696 |

These are estimated postal locality references, not surveyed town boundaries. The yellow pin/banner explicitly says **Town reference only (GeoNames); service boundary unavailable**. No invented coverage radius is drawn. Town references are credited to GeoNames in the customer map attribution. Other areas, older district-only profiles and unknown/malformed area IDs fall back to the existing verified district geometry from `map.ts` / `district-boundaries.json`, with **District boundary only** in the yellow banner. A technician-provided label never receives inferred coordinates. Reference navigation changes only camera/overlay state; it never supplies current-location wrench coordinates, customer coordinates, distance or a GPS fallback, and is never persisted in a location document.
