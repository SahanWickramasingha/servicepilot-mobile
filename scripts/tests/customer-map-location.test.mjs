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
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture() {
  const states = [], listeners = new Set(); let cleanup, authChange, permission, next, removed = 0, watches = 0;
  const auth = { currentUser: { uid: "local-customer" } };
  const appState = { currentState: "active", addEventListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const location = { Accuracy: { High: 4 }, requestForegroundPermissionsAsync: () => new Promise((resolve) => { permission = resolve; }),
    hasServicesEnabledAsync: async () => true,
    watchPositionAsync: async (_, callback) => { watches++; next = callback; return { remove: () => removed++ }; } };
  const { useCustomerMapLocation: runHookHarness } = load("src/hooks/useCustomerMapLocation.ts", {
    react: { useRef: (current) => ({ current }), useCallback: (fn) => fn,
      useState: (value) => { const index = states.length; states.push(value); return [value, (next) => { states[index] = next; }]; } },
    "react-native": { AppState: appState }, "expo-router": { useFocusEffect: (fn) => { cleanup = fn(); } },
    "firebase/auth": { onAuthStateChanged: (_, fn) => { authChange = fn; fn(auth.currentUser); return () => {}; } },
    "expo-location": location, "@/src/firebase/config": { auth }, "@/src/utils/acquireDeviceFix": { acquireDeviceFix },
  });
  const hook = runHookHarness();
  return { hook, states, permission: (granted) => permission({ granted }), cleanup: () => cleanup(),
    change: (state) => { appState.currentState = state; for (const fn of [...listeners]) fn(state); },
    accountChange: () => { auth.currentUser = { uid: "another-customer" }; authChange(auth.currentUser); },
    sample: () => next({ coords: { latitude: 7, longitude: 80, accuracy: 5 }, timestamp: Date.now() }),
    watches: () => watches, removed: () => removed, listeners };
}

test("Android permission denial waits for foreground, shows feedback and never starts GPS", async () => {
  const f = fixture(), request = f.hook.requestLocation();
  f.change("background"); f.permission(false); await settle();
  assert.equal(f.watches(), 0); assert.equal(f.states[1], true);
  f.change("active"); await request;
  assert.match(f.states[2], /permission denied.*still browse/); assert.equal(f.states[0], undefined);
  assert.equal(f.states[1], false); assert.equal(f.listeners.size, 1); f.cleanup();
});

test("permission grant starts acquisition only in foreground and removes the temporary watcher", async () => {
  const f = fixture(), request = f.hook.requestLocation();
  f.change("background"); f.permission(true); await settle(); assert.equal(f.watches(), 0);
  f.change("active"); await settle(); assert.equal(f.watches(), 1);
  f.sample(); await request;
  assert.equal(f.states[0].latitude, 7); assert.equal(f.removed(), 1);
  assert.match(f.states[2], /straight-line/); f.change("background"); assert.equal(f.states[0], undefined); f.cleanup();
});

test("blur and account change cancel an unresolved permission request without a late watcher", async () => {
  for (const cancel of ["cleanup", "accountChange"]) {
    const f = fixture(), request = f.hook.requestLocation();
    f.change("background"); f[cancel](); f.permission(true); f.change("active"); await request;
    assert.equal(f.watches(), 0); assert.equal(f.states[0], undefined); assert.equal(f.states[1], false);
    if (cancel !== "cleanup") f.cleanup(); assert.equal(f.listeners.size, 0);
  }
});

test("background during acquisition cancels GPS and clears the customer sample", async () => {
  const f = fixture(), request = f.hook.requestLocation();
  f.permission(true); await settle(); assert.equal(f.watches(), 1);
  f.change("background"); await request;
  assert.equal(f.removed(), 1); assert.equal(f.states[0], undefined); assert.equal(f.states[1], false); f.cleanup();
});
