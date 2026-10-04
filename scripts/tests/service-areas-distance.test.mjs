import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const geo = require("../../functions/lib/domain/map.js");
const areas = require("../../functions/lib/domain/serviceAreas.js");
const projection = require("../../functions/lib/domain/mapProjection.js");
const ts = require("typescript");
const grouping = {};
new Function("exports", ts.transpileModule(readFileSync(new URL("../../src/utils/technicianMarkerGroups.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(grouping);
const peradeniya = areas.SERVICE_AREA_CATALOGUE.kandy.find((a) => a.label === "Peradeniya");

test("canonical district-area association, legacy district-only display and incompatible reset", () => {
  assert.deepEqual(areas.validateServiceAreas(["kandy"], { kandy: peradeniya }), { kandy: peradeniya });
  assert.equal(areas.declaredServiceAreaLabel("kandy"), "Kandy");
  assert.equal(areas.declaredServiceAreaLabel("kandy", { kandy: peradeniya }), "Peradeniya, Kandy");
  assert.deepEqual(areas.retainServiceAreas(["colombo"], { kandy: peradeniya }), {});
  for (const [ids, input] of [
    [["colombo"], { kandy: peradeniya }], [["colombo"], { colombo: peradeniya }],
    [["kandy", "kandy"], {}], [["imaginary"], {}], [["kandy"], []],
    [["kandy"], { kandy: { ...peradeniya, label: "Fake" } }],
    [["kandy"], { kandy: { ...peradeniya, latitude: 7 } }],
  ]) assert.throws(() => areas.validateServiceAreas(ids, input));
});

test("Other areas are validated, trimmed and labelled as technician-provided across multiple districts", () => {
  const other = { id: "other", label: "  Local town  ", source: "technician" };
  const saved = areas.validateServiceAreas(["kandy", "colombo"], { kandy: peradeniya, colombo: other });
  assert.equal(saved.colombo.label, "Local town");
  assert.match(areas.declaredServiceAreaLabel("colombo", saved), /technician-provided/);
  for (const label of ["", " ", " a ", "x".repeat(81), "bad\narea", "<area>", "bad\u007farea"]) {
    assert.throws(() => areas.validateServiceAreas(["colombo"], { colombo: { ...other, label } }));
  }
});

test("projection allowlists declared areas without copying address or precise GPS", () => {
  const output = projection.buildMapProfile("tech", { role: "technician", fullName: "Real Name", serviceDistrictIds: ["kandy"],
    serviceAreasByDistrict: { kandy: peradeniya.id }, address: "private", latitude: 7.1, longitude: 80.8 });
  assert.deepEqual(output.serviceAreasByDistrict, { kandy: peradeniya.id });
  for (const key of ["address", "latitude", "longitude"]) assert.equal(key in output, false);
});

test("compact stored IDs round-trip display labels and validate district associations", () => {
  const input = { kandy: peradeniya, colombo: { id: "other", label: "Local area", source: "technician" } };
  const encoded = areas.encodeServiceAreas(["kandy", "colombo"], input);
  assert.deepEqual(encoded, { kandy: peradeniya.id, colombo: "other:Local area" });
  assert.deepEqual(areas.readServiceAreas(encoded), input);
  assert.match(areas.declaredServiceAreaLabel("colombo", encoded), /technician-provided/);
  assert.throws(() => areas.readServiceAreas({ colombo: peradeniya.id }));
});

test("Haversine checks known distance, zero, symmetry, antimeridian and antipodes", () => {
  const zero = { latitude: 0, longitude: 0 }, east = { latitude: 0, longitude: 1 };
  assert.equal(geo.distanceKm(zero, zero), 0);
  assert.ok(Math.abs(geo.distanceKm(zero, east) - 111.19508) < 0.001);
  assert.equal(geo.distanceKm(east, zero), geo.distanceKm(zero, east));
  assert.ok(Math.abs(geo.distanceKm({ latitude: 0, longitude: 179.5 }, { latitude: 0, longitude: -179.5 }) - 111.19508) < 0.001);
  assert.ok(Math.abs(geo.distanceKm(zero, { latitude: 0, longitude: 180 }) - Math.PI * 6371.0088) < 0.001);
  for (const p of [{ latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }]) assert.equal(geo.distanceKm(zero, p), undefined);
});

test("one 120-second freshness threshold gates distance on both actual coordinate samples", () => {
  const now = 1000000, fresh = { latitude: 0, longitude: 0, updatedAtMs: now - geo.LOCATION_FRESH_MS };
  assert.equal(geo.browsingDistanceKm(fresh, fresh, now), 0);
  assert.equal(geo.browsingDistanceKm({ ...fresh, updatedAtMs: fresh.updatedAtMs - 1 }, fresh, now), undefined);
  assert.equal(geo.browsingDistanceKm(fresh, { ...fresh, updatedAtMs: now + 5001 }, now), undefined);
  assert.equal(geo.browsingDistanceKm(undefined, fresh, now), undefined);
  assert.equal(geo.browsingDistanceKm(fresh, { ...fresh, updatedAtMs: undefined }, now), undefined);
});

test("overlapping selection keeps each original coordinate and identity; zoom splits nearby points", () => {
  const points = [{ id: "a", title: "A", latitude: 7, longitude: 80 }, { id: "b", title: "B", latitude: 7, longitude: 80 },
    { id: "c", title: "C", latitude: 7.01, longitude: 80.01 }];
  const grouped = grouping.groupMarkerPoints(points, 1, 1, 350, 370);
  assert.deepEqual(grouped, [points]);
  assert.equal(grouped[0][1], points[1]);
  assert.deepEqual(grouping.groupMarkerPoints(points, 0.01, 0.01, 350, 370), [[points[0], points[1]], [points[2]]]);
});
