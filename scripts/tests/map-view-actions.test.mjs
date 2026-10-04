import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
const functions = createRequire(new URL("../../functions/package.json", import.meta.url));
const domain = functions("./lib/domain/map.js"), areas = functions("./lib/domain/serviceAreas.js");
const dependencies = { "@/functions/src/domain/map": domain, "@/functions/src/domain/serviceAreas": areas };
function load(path, deps) {
  const output = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const result = {}; new Function("exports", "require", output)(result, (id) => deps[id]); return result;
}
const actions = load("src/utils/mapViewActions.ts", dependencies);
const kandy = domain.DISTRICTS.find((d) => d.id === "kandy");
const technician = { uid: "test-tech", serviceDistrictIds: ["colombo", "kandy"],
  serviceAreasByDistrict: { kandy: "lk-postal-20400-peradeniya" } };

test("service view uses the saved district association and a verified town reference, separate from GPS", () => {
  const saved = structuredClone(technician);
  const reference = actions.technicianServiceAreaReference(technician, "kandy");
  assert.equal(reference.district, kandy); assert.equal(reference.label, "Service area: Peradeniya, Kandy");
  assert.match(reference.detail, /Town reference only.*service boundary unavailable/);
  assert.deepEqual(reference.townReference, { latitude: 7.2622, longitude: 80.5841 });
  assert.deepEqual(technician, saved); assert.equal("latitude" in reference, false); assert.equal("radius" in reference, false);
  assert.equal(actions.technicianServiceAreaReference(technician, "galle").district.id, "colombo");
});

test("older district-only, technician-provided and missing-coverage profiles do not gain invented coordinates", () => {
  assert.equal(actions.technicianServiceAreaReference({ uid: "old", serviceDistrictIds: ["kandy"] }, "kandy").label, "Service area: Kandy");
  const other = actions.technicianServiceAreaReference({ ...technician, serviceAreasByDistrict: { kandy: "other:Local town" } }, "kandy");
  assert.match(other.label, /Local town, Kandy \(technician-provided\)/); assert.match(other.detail, /District boundary only/);
  assert.equal(actions.technicianServiceAreaReference({ uid: "none", serviceDistrictIds: [] }, "kandy"), undefined);
});

test("relative zoom clamps Google levels and preserves camera centre, pitch and heading", () => {
  const camera = { center: { latitude: 20, longitude: -15 }, pitch: 30, heading: 50, zoom: 11 };
  assert.deepEqual(actions.relativeCameraZoom(camera, 1), { zoom: 12 });
  assert.deepEqual(actions.relativeCameraZoom(camera, -1), { zoom: 10 });
  assert.deepEqual(actions.relativeCameraZoom({ zoom: 20 }, 1), { zoom: 20 });
  assert.deepEqual(actions.relativeCameraZoom({ zoom: 0 }, -1), { zoom: 0 });
  assert.equal(camera.zoom, 11); assert.deepEqual(camera.center, { latitude: 20, longitude: -15 });
  assert.deepEqual(actions.relativeCameraZoom({ altitude: 4000 }, 1), { altitude: 2000 });
  assert.deepEqual(actions.relativeCameraZoom({ altitude: 4000 }, -1), { altitude: 8000 });
  assert.equal(actions.relativeCameraZoom({ zoom: NaN, altitude: -1 }, 1), undefined);
});

const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function nativeHarness() {
  const slots = [], queue = [], animations = []; let cursor = 0, props, tree, deferred;
  const instance = { camera: { center: { latitude: 7.1, longitude: 80.8 }, zoom: 10, heading: 20, pitch: 10 },
    getCamera: async () => deferred ? new Promise((resolve) => { deferred = resolve; }) : instance.camera,
    animateCamera: (update) => { animations.push({ camera: update }); instance.camera = { ...instance.camera, ...update }; },
    animateToRegion: (region) => animations.push({ region }), fitToCoordinates() {} };
  function memo(value, deps) { const index = cursor++, prior = slots[index];
    if (!prior || deps.some((v, i) => !Object.is(v, prior.deps[i]))) slots[index] = { value, deps };
    return slots[index].value; }
  const react = {
    useState: (initial) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef: (current) => { const index = cursor++; if (!(index in slots)) slots[index] = { current }; return slots[index]; },
    useCallback: (fn, deps) => memo(fn, deps),
    useEffect: (fn, deps) => { const index = cursor++, prior = slots[index];
      if (!prior || !deps || deps.some((v, i) => !Object.is(v, prior.deps[i]))) queue.push(() => { prior?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); },
  };
  const make = (type, props) => { if (type === "MapView") props.ref.current = instance; return { type, props }; };
  const grouping = load("src/utils/technicianMarkerGroups.ts", {});
  const native = load("src/components/maps/TechnicianMap.native.tsx", {
    react, "react/jsx-runtime": { jsx: make, jsxs: make },
    "react-native": { Platform: { OS: "android" }, PixelRatio: { get: () => 3 }, StyleSheet: { create: (s) => s },
      View: "View", Text: "Text", Pressable: "Pressable", AccessibilityInfo: { announceForAccessibility() {} } },
    "react-native-maps": { default: "MapView", Polygon: "Polygon", Marker: "Marker", Circle: "Circle", PROVIDER_GOOGLE: "google" },
    "lucide-react-native": { Wrench: "Wrench", MapPinned: "MapPinned", Plus: "Plus", Minus: "Minus" },
    "@/src/utils/technicianMarkerGroups": grouping, "@/src/utils/mapViewActions": actions,
  });
  const flatten = (element) => !element || typeof element !== "object" ? [] : [element, ...[element.props?.children].flat(Infinity).flatMap(flatten)];
  const render = (next = props) => { props = next; cursor = 0; tree = native.default(props); while (queue.length) queue.shift()(); return tree; };
  return { instance, animations, render, elements: () => flatten(tree),
    ready: () => { flatten(tree).find((e) => e.type === "MapView").props.onMapReady(); render(); },
    deferCamera: () => { deferred = true; }, resolveCamera: () => { const resolve = deferred; deferred = undefined; resolve(instance.camera); },
    cleanup: () => { for (const slot of slots) slot?.cleanup?.(); } };
}

test("native service-area focus leaves GPS pins untouched; GPS updates do not steal the view; Show location returns", () => {
  const h = nativeHarness(), point = { id: "test-tech", title: "Technician", latitude: 7.095, longitude: 80.865 };
  let props = { district: kandy, points: [point], focusLocation: { id: point.id, sequence: 1, phase: "ready", point } };
  h.render(props); h.ready(); assert.equal(h.animations.at(-1).region.latitude, point.latitude);
  props = { ...props, focusLocation: undefined, serviceArea: { ...actions.technicianServiceAreaReference(technician, "kandy"), sequence: 2 } };
  h.render(props); const count = h.animations.length;
  assert.equal(h.animations.at(-1).region.latitude, props.serviceArea.townReference.latitude);
  assert.ok(h.elements().some((e) => e.type === "Marker" && e.props.pinColor === "#F59E0B"));
  const moved = { ...point, latitude: 7.096 };
  h.render({ ...props, points: [moved] }); assert.equal(h.animations.length, count);
  const pin = h.elements().find((e) => e.type?.name === "WrenchPin"); assert.deepEqual(pin.props.group, [moved]);
  h.render({ ...props, points: [moved], serviceArea: undefined, focusLocation: { id: point.id, sequence: 3, phase: "ready", point: moved } });
  assert.equal(h.animations.at(-1).region.latitude, moved.latitude);
  assert.equal(h.elements().some((e) => e.type === "Polygon" && e.props.strokeColor === "#F59E0B"), false); h.cleanup();
});

test("native location focus waits for shared GPS, retries on explicit actions and never falls back when sharing stops", () => {
  const h = nativeHarness(), focusLocation = { id: "test-tech", sequence: 1, phase: "checking" };
  let props = { district: kandy, points: [], focusLocation };
  h.render(props); h.ready(); const count = h.animations.length;
  assert.ok(h.elements().some((e) => e.type === "Text" && e.props.children === "Checking shared GPS location"));
  h.render(props); assert.equal(h.animations.length, count);
  const point = { id: "test-tech", title: "Technician", latitude: 7.095, longitude: 80.865, stale: true };
  props = { ...props, points: [point] }; h.render(props);
  assert.equal(h.animations.length, count);
  props = { ...props, focusLocation: { ...focusLocation, phase: "stale", point } }; h.render(props);
  assert.equal(h.animations.length, count);
  const fresh = { ...point, stale: false };
  props = { ...props, points: [fresh], focusLocation: { ...focusLocation, phase: "ready", point: fresh } }; h.render(props);
  assert.equal(h.animations.at(-1).region.latitude, point.latitude);
  const focused = h.animations.length;
  const moved = { ...fresh, latitude: 7.105 };
  props = { ...props, points: [moved] }; h.render(props); assert.equal(h.animations.length, focused);
  props = { ...props, focusLocation: { id: point.id, sequence: 2, phase: "ready", point: moved } }; h.render(props);
  assert.equal(h.animations.at(-1).region.latitude, moved.latitude);
  const beforeOff = h.animations.length;
  h.render({ ...props, points: [], focusLocation: { id: point.id, sequence: 3, phase: "unavailable" } });
  assert.equal(h.animations.length, beforeOff); assert.equal(h.elements().some((e) => e.type?.name === "WrenchPin"), false);
  assert.equal(h.elements().some((e) => e.type === "Marker"), false); h.cleanup();
});

test("visible service overlay follows a newly saved town without moving GPS and retains the district-only fallback", () => {
  const h = nativeHarness(), point = { id: "test-tech", title: "Technician", latitude: 7.095, longitude: 80.865 };
  const props = { district: kandy, points: [point], serviceArea: { ...actions.technicianServiceAreaReference(technician, "kandy"), sequence: 1 } };
  h.render(props); h.ready();
  const edited = { ...technician, serviceAreasByDistrict: { kandy: "lk-postal-20800-katugastota" } };
  h.render({ ...props, serviceArea: { ...actions.technicianServiceAreaReference(edited, "kandy"), sequence: 1 } });
  assert.equal(h.animations.at(-1).region.latitude, 7.3276);
  assert.ok(h.elements().some((e) => e.type === "Marker" && e.props.title === "Service area: Katugastota, Kandy"));
  assert.deepEqual(h.elements().find((e) => e.type?.name === "WrenchPin").props.group, [point]);
  h.render({ ...props, serviceArea: { ...actions.technicianServiceAreaReference({ ...technician, serviceAreasByDistrict: {} }, "kandy"), sequence: 1 } });
  assert.equal(h.animations.at(-1).region.latitude, (kandy.bounds[0] + kandy.bounds[2]) / 2);
  assert.ok(h.elements().some((e) => e.type === "Polygon" && e.props.strokeColor === "#F59E0B"));
  assert.equal(h.elements().some((e) => e.type === "Marker"), false); h.cleanup();
});

test("native controls read the current camera and a late zoom result cannot undo service-area navigation", async () => {
  const h = nativeHarness(); h.render({ district: kandy, points: [] }); h.ready();
  const map = h.elements().find((e) => e.type === "MapView");
  assert.equal(map.props.minZoomLevel, 0); assert.equal(map.props.maxZoomLevel, 20);
  h.instance.camera = { ...h.instance.camera, zoom: 13 };
  h.elements().find((e) => e.props?.accessibilityLabel === "Zoom in").props.onPress(); await settle();
  assert.deepEqual(h.animations.at(-1).camera, { zoom: 14 }); assert.equal(h.instance.camera.center.latitude, 7.1); h.cleanup();
  const pending = nativeHarness(); pending.render({ district: kandy, points: [] }); pending.ready(); pending.deferCamera();
  pending.elements().find((e) => e.props?.accessibilityLabel === "Zoom out").props.onPress(); await settle();
  pending.render({ district: kandy, points: [], serviceArea: { ...actions.technicianServiceAreaReference(technician, "kandy"), sequence: 1 } });
  pending.resolveCamera(); await settle();
  assert.equal(pending.animations.some((item) => item.camera), false); pending.cleanup();
});

test("customer subscriptions keep the open card/banner authoritative through town edits and repeated action switches", async () => {
  const slots = [], queue = [], locationListeners = new Map(), snapshots = new Map(); let cursor = 0, tree, directory, pendingRead;
  const memo = (value, deps) => { const index = cursor++, prior = slots[index];
    if (!prior || deps.some((v, i) => !Object.is(v, prior.deps[i]))) slots[index] = { value, deps };
    return slots[index].value; };
  const react = {
    useState: (initial) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef: (current) => { const index = cursor++; if (!(index in slots)) slots[index] = { current }; return slots[index]; },
    useCallback: (fn, deps) => memo(fn, deps), useMemo: (fn, deps) => memo(fn(), deps),
    useEffect: (fn, deps) => { const index = cursor++, prior = slots[index];
      if (!prior || !deps || deps.some((v, i) => !Object.is(v, prior.deps[i]))) queue.push(() => { prior?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); },
  };
  const auth = { currentUser: { uid: "customer-test" } };
  const make = (type, props) => ({ type, props });
  const screen = load("app/(tabs)/map.tsx", {
    react, "react/jsx-runtime": { jsx: make, jsxs: make },
    "expo-router": { router: {}, useFocusEffect: (fn) => react.useEffect(fn, [fn]) },
    "firebase/auth": { onAuthStateChanged: (_auth, next) => { next(auth.currentUser); return () => {}; } },
    "react-native": { View: "View", Text: "Text", ScrollView: "ScrollView", Pressable: "Pressable", Modal: "Modal",
      ActivityIndicator: "ActivityIndicator", StatusBar: "StatusBar", StyleSheet: { create: (s) => s },
      AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) } },
    "lucide-react-native": {}, "@/src/firebase/config": { auth },
    "@/src/hooks/useCustomerMapLocation": { useCustomerMapLocation: () => ({}) },
    "@/src/components/maps/DistrictPicker": { DistrictPicker: "DistrictPicker" },
    "@/src/components/maps/TechnicianMap": { default: "TechnicianMap" },
    "@/src/constants/serviceRequests": { SERVICE_CATEGORIES: ["Electrical"] },
    "@/src/services/location.service": {
      getLatestMapLocation: async (id) => pendingRead ? pendingRead : snapshots.get(id) ?? { location: null },
      subscribeToMapTechnicians: (_district, _category, count, next) => { assert.equal(count, 1); directory = next; return () => {}; },
      subscribeToMapLocation: (id, next) => { locationListeners.set(id, (point, updatedAtMs) => {
        snapshots.set(id, { location: point, updatedAtMs: updatedAtMs ?? point?.updatedAtMs }); next(point, updatedAtMs);
      }); return () => locationListeners.delete(id); },
    },
    "@/functions/src/domain/map": domain, "@/functions/src/domain/serviceAreas": areas,
    "@/functions/src/domain/mapProjection": { MAP_MAX_ITEMS: 24 },
    "@/src/utils/mapViewActions": actions, "@/src/utils/mapServiceError": {},
  });
  const flatten = (element) => !element || typeof element !== "object" ? [] : [element, ...[element.props?.children].flat(Infinity).flatMap(flatten)];
  const render = () => { cursor = 0; tree = screen.default(); while (queue.length) queue.shift()(); };
  const map = () => flatten(tree).find((e) => e.type === "TechnicianMap").props;
  const card = () => flatten(tree).find((e) => e.type?.name === "TechnicianCard").props;
  const priorFrame = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = (fn) => fn();
  try {
    render(); const saved = { ...technician, serviceDistrictIds: ["colombo", "kandy"], fullName: "Test Technician", specialization: "Electrical", averageRating: 4, reviewCount: 3 };
    directory({ items: [saved], hasMore: false }); render();
    // Select Kandy as the live filter; this starts a fresh bounded subscription.
    flatten(tree).find((e) => e.type === "DistrictPicker").props.onChange(["kandy"]); render();
    directory({ items: [saved], hasMore: false }); render();
    card().onShowServiceArea(saved.uid); render();
    assert.equal(map().serviceArea.label, "Service area: Peradeniya, Kandy");
    const firstSequence = map().serviceArea.sequence;
    const updated = { ...saved, serviceAreasByDistrict: { kandy: "lk-postal-20800-katugastota" } };
    directory({ items: [updated], hasMore: false }); render();
    assert.equal(card().technician.serviceAreasByDistrict.kandy, updated.serviceAreasByDistrict.kandy);
    assert.equal(map().serviceArea.label, "Service area: Katugastota, Kandy"); assert.equal(map().serviceArea.sequence, firstSequence);
    const shared = { latitude: 7.095, longitude: 80.865, updatedAtMs: Date.now() };
    locationListeners.get(saved.uid)(shared); render();
    for (let repeat = 0; repeat < 3; repeat++) {
      await card().onShowLocation(saved.uid); render();
      assert.equal(map().serviceArea, undefined); assert.equal(map().focusLocation.id, saved.uid);
      assert.equal(map().points[0].latitude, shared.latitude); assert.match(map().focusLocationStatus, /Updated/);
      card().onShowServiceArea(saved.uid); render();
      assert.equal(map().focusLocation, undefined); assert.equal(map().serviceArea.label, "Service area: Katugastota, Kandy");
      assert.equal(map().points[0].longitude, shared.longitude);
    }
    // A cached/listener point must never consume the action before the selected UID's server result.
    let resolveRead; pendingRead = new Promise((resolve) => { resolveRead = resolve; });
    const verifying = card().onShowLocation(saved.uid); render();
    assert.equal(map().focusLocation.phase, "checking"); assert.equal(map().focusLocation.point, undefined);
    const newest = { ...shared, latitude: 7.105, updatedAtMs: shared.updatedAtMs + 1000 };
    resolveRead({ location: newest, updatedAtMs: newest.updatedAtMs }); await verifying; pendingRead = undefined; render();
    assert.equal(map().focusLocation.phase, "ready"); assert.equal(map().focusLocation.point.latitude, newest.latitude);
    assert.equal(map().points[0].latitude, newest.latitude);
    // A newer OFF emission wins even if an older server read completes later.
    pendingRead = new Promise((resolve) => { resolveRead = resolve; });
    const raced = card().onShowLocation(saved.uid); render();
    locationListeners.get(saved.uid)(null, newest.updatedAtMs + 1000); render();
    resolveRead({ location: newest, updatedAtMs: newest.updatedAtMs }); await raced; pendingRead = undefined; render();
    assert.equal(map().focusLocation.phase, "unavailable"); assert.equal(map().points.length, 0);
    // Service-area navigation cancels an unresolved location action.
    pendingRead = new Promise((resolve) => { resolveRead = resolve; });
    const cancelled = card().onShowLocation(saved.uid); render(); card().onShowServiceArea(saved.uid); render();
    resolveRead({ location: newest, updatedAtMs: newest.updatedAtMs }); await cancelled; pendingRead = undefined; render();
    assert.equal(map().focusLocation, undefined); assert.match(map().serviceArea.label, /Katugastota/);
    // Choosing another marker also cancels an unresolved server read for this technician.
    pendingRead = new Promise((resolve) => { resolveRead = resolve; });
    const reselection = card().onShowLocation(saved.uid); render(); map().onSelect(["another-technician"]); render();
    resolveRead({ location: newest, updatedAtMs: newest.updatedAtMs }); await reselection; pendingRead = undefined; render();
    assert.equal(map().focusLocation, undefined); assert.equal(map().selectedId, "another-technician");
    await card().onShowLocation(saved.uid); render();
    assert.equal(map().points.length, 0); assert.equal(map().serviceArea, undefined); assert.match(map().focusLocationStatus, /Location unavailable/);
    directory({ items: [{ ...updated, serviceAreasByDistrict: {} }], hasMore: false }); render();
    card().onShowServiceArea(saved.uid); render(); assert.match(map().serviceArea.detail, /District boundary only/);
  } finally { globalThis.requestAnimationFrame = priorFrame; for (const slot of slots) slot?.cleanup?.(); }
});

test("native camera waits for authoritative action coordinates and does not focus stale or unverified points", () => {
  const h = nativeHarness(), cached = { id: "test-tech", title: "Tech", latitude: 7.295, longitude: 80.635 };
  const props = { district: kandy, points: [cached], focusLocation: { id: cached.id, sequence: 1, phase: "checking" } };
  h.render(props); h.ready(); const count = h.animations.length;
  h.render({ ...props, points: [{ ...cached, latitude: 7.305 }] }); assert.equal(h.animations.length, count);
  const fresh = { latitude: 7.095, longitude: 80.865 };
  h.render({ ...props, focusLocation: { ...props.focusLocation, phase: "ready", point: fresh } });
  assert.equal(h.animations.at(-1).region.latitude, fresh.latitude);
  const focused = h.animations.length;
  for (const phase of ["stale", "unavailable", "error"]) {
    h.render({ ...props, focusLocation: { id: cached.id, sequence: ++props.focusLocation.sequence, phase, point: cached } });
    assert.equal(h.animations.length, focused);
  }
  // OFF or expiry can arrive after verification but before the native map is ready to focus.
  for (const points of [[], [{ ...cached, stale: true }]]) {
    h.render({ ...props, points, focusLocation: { id: cached.id, sequence: ++props.focusLocation.sequence, phase: "ready", point: fresh } });
    assert.equal(h.animations.length, focused);
  }
  h.cleanup();
});
