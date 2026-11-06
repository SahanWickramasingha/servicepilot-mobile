import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url), ts = require("typescript");
function load(path, dependencies) {
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("exports", "require", output)(exports, (id) => {
    if (id.endsWith(".png")) return "fixture-image";
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  });
  return exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function memoryStorage() {
  const values = new Map();
  return { values, getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); } };
}
function nativeModule(sdk, storage) {
  return load("src/firebase/authPersistence.native.ts", {
    "firebase/auth": sdk, "@react-native-async-storage/async-storage": { default: storage },
  });
}

test("installed RN SDK persists ON across restart/offline, clears OFF across restart, and honors logout", async () => {
  // Use the actual installed React Native Auth entry. Only native storage and
  // HTTP are replaced; synthetic responses can never reach a Firebase project.
  const sdk = require(join(dirname(require.resolve("@firebase/auth/package.json")), "dist/rn/index.js"));
  const { initializeApp, deleteApp } = require("firebase/app");
  const originalFetch = globalThis.fetch, storage = memoryStorage();
  let offline = false, app, requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.ok(String(url).includes("key=fixture-api-key"));
    // Reject while reading the body so the SDK's HTTP timeout is cleared first.
    // The SDK maps this transport failure to auth/network-request-failed.
    if (offline) return { ok: true, json: async () => { throw new Error("Synthetic offline failure"); } };
    const body = JSON.parse(options.body);
    const email = body.email ?? (body.idToken === "synthetic-access-fixture-b" ? "b@example.test" : "a@example.test");
    const uid = email.startsWith("b") ? "fixture-b" : "fixture-a";
    const payload = String(url).includes("accounts:lookup") ? {
      users: [{ localId: uid, email, emailVerified: true,
        providerUserInfo: [{ providerId: "password", rawId: email, email }] }],
    } : { localId: uid, email, idToken: `synthetic-access-${uid}`, refreshToken: "synthetic-refresh", expiresIn: "3600" };
    return { ok: true, json: async () => payload };
  };
  const start = () => {
    app = initializeApp({ apiKey: "fixture-api-key", projectId: "demo-servicepilot-persistence" }, "persistence-fixture");
    const persistence = nativeModule(sdk, storage);
    return { persistence, auth: persistence.createAppAuth(app) };
  };
  try {
    let run = start();
    await run.persistence.applyLoginPersistence(run.auth, true);
    await sdk.signInWithEmailAndPassword(run.auth, "a@example.test", "synthetic-password");
    assert.equal(run.auth.currentUser.uid, "fixture-a");
    assert.equal(storage.values.size, 1);
    // Fast Refresh reuses the same initialized Auth without signing out.
    assert.equal(run.persistence.createAppAuth(app), run.auth);
    await deleteApp(app);

    offline = true; run = start();
    await run.persistence.waitForAuthReady(run.auth);
    assert.equal(run.auth.currentUser.uid, "fixture-a");
    await run.persistence.applyLoginPersistence(run.auth, false);
    assert.equal(storage.values.size, 0);
    assert.equal(run.auth.currentUser.uid, "fixture-a"); // No logout on selection/background.
    await deleteApp(app);

    run = start(); await run.persistence.waitForAuthReady(run.auth);
    assert.equal(run.auth.currentUser, null); // OFF does not restore after restart.
    offline = false;
    await run.persistence.applyLoginPersistence(run.auth, true);
    await sdk.signInWithEmailAndPassword(run.auth, "b@example.test", "synthetic-password");
    assert.equal(run.auth.currentUser.uid, "fixture-b");
    await deleteApp(app);
    run = start(); await run.persistence.waitForAuthReady(run.auth);
    assert.equal(run.auth.currentUser.uid, "fixture-b");
    await sdk.signOut(run.auth);
    assert.equal(storage.values.size, 0);
    await deleteApp(app);
    run = start(); await run.persistence.waitForAuthReady(run.auth);
    assert.equal(run.auth.currentUser, null);
    assert.ok(requests > 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (app) await deleteApp(app);
  }
});

test("native storage/persistence failures reject before sign-in and never silently ignore selection", async () => {
  const calls = [], ready = deferred(), storage = memoryStorage();
  let broken = false;
  const sdk = {
    getReactNativePersistence() { return "native-local"; },
    inMemoryPersistence: "memory",
    setPersistence: async (_, choice) => { calls.push(choice); if (broken) throw new Error("Synthetic SDK failure"); },
  };
  const module = nativeModule(sdk, storage), auth = { authStateReady: () => ready.promise };
  const pending = module.applyLoginPersistence(auth, true);
  await settle(); assert.deepEqual(calls, []);
  ready.resolve(); await pending; assert.deepEqual(calls, ["native-local"]);
  await module.applyLoginPersistence(auth, false); assert.deepEqual(calls, ["native-local", "memory"]);
  storage.setItem = async () => { throw new Error("Private raw storage details"); };
  await assert.rejects(module.applyLoginPersistence(auth, true), /Unable to save your sign-in/);
  assert.equal(calls.length, 2);
  broken = true;
  await assert.rejects(module.applyLoginPersistence(auth, false), /Unable to turn off saved sign-in/);
});

test("a failed native restoration is surfaced before routes can treat it as logout", async () => {
  let tracked;
  const storage = memoryStorage();
  storage.getItem = async () => { throw new Error("Synthetic native storage failure"); };
  const module = nativeModule({ getReactNativePersistence(value) { tracked = value; return "local"; } }, storage);
  await assert.rejects(tracked.getItem("synthetic-key"), /Device authentication storage is unavailable/);
  await assert.rejects(module.waitForAuthReady({ authStateReady: async () => {} }), /close and reopen/);
});

test("Expo web uses browser or memory persistence; errors reject", async () => {
  const choices = [];
  let broken = false;
  const module = load("src/firebase/authPersistence.ts", { "firebase/auth": {
    browserLocalPersistence: "browser-local", inMemoryPersistence: "memory",
    setPersistence: async (_, choice) => { choices.push(choice); if (broken) throw new Error("Synthetic storage failure"); },
  } });
  const auth = { authStateReady: async () => {} };
  await module.applyLoginPersistence(auth, true); await module.applyLoginPersistence(auth, false);
  assert.deepEqual(choices, ["browser-local", "memory"]);
  broken = true;
  await assert.rejects(module.applyLoginPersistence(auth, true), /Check browser storage settings/);
});

function serviceHarness(applyLoginPersistence) {
  const calls = [], auth = {};
  const service = load("src/services/auth.service.ts", {
    "@/src/firebase/config": { auth },
    "@/src/firebase/authPersistence": { applyLoginPersistence: async (value, choice) => {
      assert.equal(value, auth); calls.push(["persistence", choice]); await applyLoginPersistence?.(choice);
    } },
    "@/src/utils/registrationDebug": {},
    "@/src/services/foreground-location.service": { foregroundSharing: { stop: async () => calls.push(["stop-sharing"]) } },
    "firebase/auth": { signInWithEmailAndPassword: async (value, email, password) => {
      assert.equal(value, auth); assert.equal(email, "fixture@example.test"); assert.equal(password, "synthetic-password");
      calls.push(["sign-in"]); return { user: { uid: "fixture" } };
    }, signOut: async () => calls.push(["sign-out"]) },
  });
  return { ...service, calls };
}

test("login service awaits the actual ON/OFF choice before calling Firebase sign-in", async () => {
  for (const choice of [true, false]) {
    const waiting = deferred(), h = serviceHarness(() => waiting.promise);
    const saving = h.loginUser(" fixture@example.test ", "synthetic-password", choice);
    await settle(); assert.deepEqual(h.calls, [["persistence", choice]]);
    waiting.resolve(); await saving;
    assert.deepEqual(h.calls, [["persistence", choice], ["sign-in"]]);
  }
  const h = serviceHarness(); await h.loginUser("fixture@example.test", "synthetic-password");
  assert.deepEqual(h.calls[0], ["persistence", false]);
});

test("persistence failure prevents sign-in; logout still stops sharing before sign-out", async () => {
  const h = serviceHarness(() => { throw new Error("Synthetic persistence failure"); });
  await assert.rejects(h.loginUser("fixture@example.test", "synthetic-password", true), /persistence failure/);
  assert.deepEqual(h.calls, [["persistence", true]]);
  await h.logoutUser();
  assert.deepEqual(h.calls.slice(1), [["stop-sharing"], ["sign-out"]]);
});

function hookRuntime(dependencies) {
  const slots = [], effects = [];
  let cursor = 0, mounted = true, lateWrites = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => {
        if (!mounted) lateWrites++;
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useRef(current) { const index = cursor++; return slots[index] ??= { current }; },
    useEffect(effect, deps) {
      const index = cursor++, prior = slots[index];
      if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
        effects.push(() => { prior?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const native = Object.fromEntries(["ActivityIndicator", "Alert", "KeyboardAvoidingView", "ScrollView", "StatusBar", "Text", "Image", "TextInput", "TouchableOpacity", "View"].map((key) => [key, key]));
  Object.assign(native, { Platform: { OS: "android" }, StyleSheet: { create: (value) => value } });
  return {
    load: (path) => load(path, { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "react-native": native, "@/src/services/registration.service": {},
      "@/src/components/auth/AccountSessionContext": { useAccountSession: () => ({ retry() {} }) }, ...dependencies }),
    render(fn) { cursor = 0; const value = fn(); while (effects.length) effects.shift()(); return value; },
    unmount() { mounted = false; slots.forEach((slot) => slot?.cleanup?.()); },
    lateWrites: () => lateWrites,
  };
}
const flatten = (element) => !element || typeof element !== "object" ? [] :
  [element, ...[element.props?.children].flat(Infinity).flatMap(flatten)];

test("login checkbox reaches authentication for both selections; rapid taps cannot race persistence", async () => {
  for (const remember of [true, false]) {
    const calls = [], pending = deferred();
    const h = hookRuntime({
      "expo-router": { router: { replace() {} }, useLocalSearchParams: () => ({}) },
      "@/src/services/auth.service": { loginUser: async (...args) => { calls.push(args); return pending.promise; } },
      "@/src/firebase/config": { auth: {} }, "@/src/services/user.service": {}, "lucide-react-native": {},
      "@/functions/src/domain/accountSession": load("functions/src/domain/accountSession.ts", {}),
    });
    const screen = h.load("app/(auth)/login.tsx").default;
    let tree = h.render(screen);
    const inputs = flatten(tree).filter((item) => item.type === "TextInput");
    inputs[0].props.onChangeText("fixture@example.test"); inputs[1].props.onChangeText("synthetic-password");
    if (remember) flatten(tree).find((item) => item.props.accessibilityRole === "checkbox").props.onPress();
    tree = h.render(screen);
    const button = flatten(tree).find((item) => item.type === "TouchableOpacity" &&
      flatten(item).some((child) => child.type === "Text" && child.props.children === "Login"));
    const saving = button.props.onPress(); await button.props.onPress();
    assert.equal(calls.length, 1); assert.equal(calls[0][2], remember);
    pending.reject(Object.assign(new Error("Unable to apply persistence"), { code: "auth/persistence-unavailable" }));
    await saving; tree = h.render(screen);
    assert.ok(flatten(tree).some((item) => item.props.children === "Unable to apply persistence"));
  }
});

function accessHarness() {
  const auth = { currentUser: null }, routes = [];
  const context = { state: { phase: "checking" }, retries: 0 };
  const h = hookRuntime({
    "expo-router": { router: { replace: route => routes.push(route) } },
    "@/src/firebase/config": { auth },
    "@/src/components/auth/AccountSessionContext": { useAccountSession: () => ({ state: context.state, retry: () => { context.retries++; } }) },
    "@/src/services/user.service": { getDashboardRouteForRole: role => role === "technician" ? "/technician" : "/(tabs)" },
  });
  const { useMobileSessionAccess } = h.load("src/hooks/useMobileSessionAccess.ts");
  return { ...h, auth, routes, context, state: (roles = "customer", startup = false) => h.render(() => useMobileSessionAccess(roles, startup)),
    emit(phase, role = "customer", user = { uid: "a" }, message) {
      auth.currentUser = user;
      context.state = { phase, user, profile: { role }, message };
    } };
}

test("guards consume the shared root decision and cannot authorize while account checks are pending", () => {
  const h = accessHarness(); assert.equal(h.state().checking, true); assert.equal(h.state().allowed, false); assert.deepEqual(h.routes, []);
  h.emit("ready"); assert.equal(h.state().allowed, true); assert.deepEqual(h.routes, []);
});

test("recoverable root errors keep content blocked and retry the authoritative observer", () => {
  const h = accessHarness(); h.emit("error", "customer", { uid: "a" }, "Unable to confirm access. Your sign-in has been kept.");
  const state = h.state(); assert.equal(state.allowed, false); assert.match(state.errorMessage, /sign-in has been kept/);
  state.retry(); assert.equal(h.context.retries, 1); assert.equal(h.auth.currentUser.uid, "a"); assert.deepEqual(h.routes, []);
});

test("an old or same-UID replacement state cannot authorize or route the current account", () => {
  const h = accessHarness(); h.emit("ready"); const original = h.auth.currentUser;
  h.auth.currentUser = { uid: original.uid }; assert.equal(h.state().allowed, false); assert.deepEqual(h.routes, []);
  h.auth.currentUser = { uid: "b" }; assert.equal(h.state().allowed, false); assert.deepEqual(h.routes, []);
});

test("startup and protected routes preserve authoritative role, verification, setup and approval decisions", () => {
  for (const [phase, destination] of [["awaiting-verification", "/verify-email"], ["profile-setup", "/profile-setup"], ["approval-pending", "/technician-pending"]]) {
    const h = accessHarness(); h.emit(phase, "technician"); assert.equal(h.state().allowed, false); assert.deepEqual(h.routes, [destination]);
  }
  const h = accessHarness(); h.emit("ready", "technician"); assert.equal(h.state("", true).allowed, false); assert.deepEqual(h.routes, ["/technician"]);
  const wrongRole = accessHarness(); wrongRole.emit("ready", "technician"); assert.equal(wrongRole.state("customer").allowed, false);
  assert.deepEqual(wrongRole.routes, ["/technician"]);
});

test("denied sessions cannot render protected content; only the root observer owns sign-out", () => {
  const h = accessHarness(); h.emit("denied", "customer", { uid: "a" }, "Contact support");
  assert.equal(h.state().allowed, false); assert.equal(h.routes[0].pathname, "/login"); assert.equal(h.routes[0].params.accessMessage, "Contact support");
  h.context.state = { phase: "signed-out" }; h.auth.currentUser = null; h.state(); assert.equal(h.routes.at(-1), "/login");
});

test("root gate does not mount routes until restoration settles and blocks storage failures", async () => {
  for (const succeeds of [true, false]) {
    const pending = deferred(), h = hookRuntime({
      "@/src/firebase/config": { auth: {} },
      "@/src/firebase/authPersistence": { waitForAuthReady: () => pending.promise },
      "./LiveAccountGate": { LiveAccountGate: "LiveAccountGate" },
    });
    const { AuthSessionGate } = h.load("src/components/auth/AuthSessionGate.tsx");
    const render = () => h.render(() => AuthSessionGate({ children: "protected-routes" }));
    assert.ok(!flatten(render()).some((item) => item.props.children === "protected-routes"));
    if (succeeds) pending.resolve(); else pending.reject(new Error("Synthetic storage failure"));
    await settle(); const tree = render();
    if (succeeds) assert.equal(tree.props.children, "protected-routes");
    else assert.ok(flatten(tree).some((item) => item.props.accessibilityRole === "alert"));
  }
});
