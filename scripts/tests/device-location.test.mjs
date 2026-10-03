import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(path, deps = {}) {
  const result = {};
  new Function("exports", "require", ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(result, (id) => deps[id]);
  return result;
}
const errors = load("src/utils/locationSharingError.ts");
const { acquireDeviceFix } = load("src/utils/acquireDeviceFix.ts", {
  "./locationSharingError": errors,
  "@/functions/src/domain/map": { validCoordinate: (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 },
});
const kandy = { latitude: 7.290612, longitude: 80.633701, sampledAt: Date.now(), accuracy: 5 };

test("injected Kandy GPS fix resolves acquisition and removes the temporary watcher", async () => {
  let next, removed = 0;
  const waiting = acquireDeviceFix({ now: Date.now, watch: async (callback) => { next = callback; return () => removed++; } });
  await Promise.resolve(); next(kandy);
  assert.deepEqual(await waiting, kandy); assert.equal(removed, 1);
});

test("bounded timeout is reported accurately and removes the watcher", async () => {
  let removed = 0;
  await assert.rejects(acquireDeviceFix({ now: Date.now, watch: async () => () => removed++ }, undefined, 20), (error) => {
    assert.equal(error.code, "location/acquisition-timeout"); assert.match(error.message, /timed out/); return true;
  });
  assert.equal(removed, 1);
});

test("OFF/cleanup abort acquisition; a late native registration is immediately removed", async () => {
  let register, next, removed = 0;
  const controller = new AbortController();
  const waiting = acquireDeviceFix({ now: Date.now, watch: (callback) => { next = callback; return new Promise((resolve) => { register = resolve; }); } }, controller.signal);
  controller.abort(); await assert.rejects(waiting, (error) => error.code === "location/cancelled");
  next(kandy); register(() => removed++); await Promise.resolve();
  assert.equal(removed, 1);
});

test("old emulator fix is ignored until a fresh injected coordinate arrives", async () => {
  let next, removed = 0;
  const waiting = acquireDeviceFix({ now: Date.now, watch: async (callback) => { next = callback; return () => removed++; } });
  next({ ...kandy, sampledAt: Date.now() - 120000 });
  assert.equal(removed, 0); next({ ...kandy, sampledAt: Date.now() });
  assert.equal((await waiting).latitude, kandy.latitude); assert.equal(removed, 1);
});

test("Expo adapter requests GPS accuracy and a removable subscription, rather than balanced one-shot acquisition", async () => {
  const requests = [], watchers = [];
  const native = { Accuracy: { High: 4 }, getForegroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    watchPositionAsync: async (options, next) => { requests.push(options); watchers.push(next); return { remove() {} }; } };
  let adapter;
  load("src/services/foreground-location.service.ts", {
    "expo-location": native,
    "@/src/utils/foregroundSharing": { ForegroundSharing: class { constructor(value) { adapter = value; } } },
    "@/src/utils/acquireDeviceFix": { acquireDeviceFix },
    "@/src/services/location.service": { publishTechnicianLocation() {} },
  });
  const initial = adapter.current(); await Promise.resolve();
  assert.equal(requests[0].accuracy, native.Accuracy.High); assert.equal(requests[0].distanceInterval, 0);
  watchers[0]({ coords: kandy, timestamp: Date.now() }); await initial;
  const stop = await adapter.watch(() => {}, () => {});
  assert.equal(requests[1].accuracy, native.Accuracy.High); assert.equal(requests[1].timeInterval, 30000);
  assert.equal(requests[1].distanceInterval, 100); stop();
});
