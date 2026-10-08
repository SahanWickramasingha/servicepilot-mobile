The simplified Sri Lanka district geometry in `district-boundaries.json` comes from
geoBoundaries gbOpen LKA ADM2, sourced from OpenStreetMap / Wambacher and published
under the Open Database License (ODbL) 1.0. The extracted geometry remains under
ODbL 1.0. Attribution is displayed beneath the Customer district map.

- Attribution: © OpenStreetMap contributors; geoBoundaries.
- License: https://opendatacommons.org/licenses/odbl/1-0/
- Source metadata: https://www.geoboundaries.org/api/current/gbOpen/LKA/ADM2/
- Pinned source: https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09592ced973a3448cf66b6100b741b64c0d/releaseData/gbOpen/LKA/ADM2/geoBoundaries-LKA-ADM2_simplified.geojson

This file extracts the 25 district names and simplified polygon geometries from
that source. Canonical service identifiers and bounds are derived into
`district-catalogue.json` by `scripts/generate-district-catalogue.mjs`. This metadata
uses the same ODbL 1.0 source. `map.ts` loads geometry only when requested; names,
identifiers, bounds and polygon coordinates retain their source values.
The boundary dataset describes 2017 boundaries and is used for map fitting and
the approximate outside-district explanation, not to infer service coverage.
