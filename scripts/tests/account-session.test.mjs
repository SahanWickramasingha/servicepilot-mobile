import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(path, deps) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("exports", "require", code)(exports, (id) => {
    if (id.endsWith(".png")) return "local-fixture-image";
    assert.ok(id in deps, `Unexpected dependency ${id}`); return deps[id];
  });
  return exports;
}
const domain = load("functions/src/domain/accountSession.ts", {});
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test("session policy preserves legacy profiles, blocks inactive/pending/invalid states and never refreshes an old sign-in into access", () => {
  const { accountSessionDenial: deny } = domain;
  assert.equal(deny({}), null); assert.equal(deny({ accountStatus: "active" }), null);
  for (const status of ["disabled", "deleted", "unknown", null]) assert.ok(deny({ accountStatus: status }));
  assert.ok(deny(null)); assert.ok(deny({ lifecyclePending: true }));
  for (const cutoff of [100, null, "100", Number.NaN]) assert.ok(deny({ sessionRevokedAt: cutoff }, 100));
  assert.ok(deny({ sessionRevokedAt: 100 }, 99)); assert.ok(deny({ sessionRevokedAt: 100 }));
  assert.equal(deny({ sessionRevokedAt: 100 }, 101), null);
});

function mobileHarness() {
  let authListener, stoppedAuth = 0;
  const streams = [], events = [], auth = { currentUser: null };
  const { observeAccountSession } = load("src/services/account-session.service.ts", {
    "firebase/auth": { onAuthStateChanged: (_, next) => { authListener = next; return () => { stoppedAuth++; }; } },
    "firebase/firestore": { doc: (_, collection, uid) => ({ collection, uid }), onSnapshot: (ref, next, error) => {
      const stream = { ref, next, error, stopped: false }; streams.push(stream); return () => { stream.stopped = true; };
    } },
    "@/src/firebase/config": { auth, db: {} }, "@/functions/src/domain/accountSession": domain,
  });
  const stop = observeAccountSession({ denied: (message) => events.push(["denied", message]), error: (message) => events.push(["error", message]), allowed: () => events.push(["allowed"]) });
  return { auth, streams, events, stop, stoppedAuth: () => stoppedAuth, emit(user) { auth.currentUser = user; authListener(user); },
    profile(value, index = streams.length - 1) { return streams[index].next({ exists: () => value !== null, data: () => value }); } };
}

test("mobile live profile changes deny active clients; listener errors block UI without silently discarding the session", async () => {
  const h = mobileHarness(); h.emit({ uid: "a", getIdTokenResult: async () => ({ claims: { auth_time: 50 } }) });
  assert.deepEqual(h.streams[0].ref, { collection: "users", uid: "a" });
  await h.profile({ accountStatus: "active" }); assert.deepEqual(h.events.at(-1), ["allowed"]);
  for (const profile of [{ accountStatus: "disabled" }, { accountStatus: "deleted" }, { lifecyclePending: true }, { sessionRevokedAt: 50 }]) {
    await h.profile(profile); assert.equal(h.events.at(-1)[0], "denied");
  }
  h.streams[0].error(new Error("Connection problem"));
  assert.equal(h.events.at(-1)[0], "error"); assert.equal(h.auth.currentUser.uid, "a");
  h.stop(); assert.equal(h.streams[0].stopped, true); assert.equal(h.stoppedAuth(), 1);
});

test("mobile account switches, newer snapshots and unmount discard stale async token results and callbacks", async () => {
  const h = mobileHarness(), pending = deferred();
  h.emit({ uid: "a", getIdTokenResult: () => pending.promise });
  const old = h.profile({ sessionRevokedAt: 100 });
  h.emit({ uid: "b" }); assert.equal(h.streams[0].stopped, true);
  await h.profile({ accountStatus: "active" }); pending.resolve({ claims: { auth_time: 99 } }); await old;
  assert.deepEqual(h.events, [["allowed"]]);
  await h.profile({ accountStatus: "deleted" }, 0); assert.equal(h.events.length, 1);
  h.stop(); await h.profile({ accountStatus: "disabled" }); h.streams[1].error();
  assert.equal(h.events.length, 1);
  const second = mobileHarness(), wait = deferred();
  second.emit({ uid: "a", getIdTokenResult: () => wait.promise });
  const older = second.profile({ sessionRevokedAt: 100 });
  await second.profile({ accountStatus: "disabled" });
  wait.resolve({ claims: { auth_time: 101 } }); await older;
  assert.equal(second.events.length, 1); assert.equal(second.events[0][0], "denied"); second.stop();
});

function hooks(dependencies) {
  const slots = [], effects = [];
  let cursor = 0, mounted = true, late = 0;
  const jsx = (type, props) => ({ type, props });
  const react = {
    createContext: () => ({ Provider: "Provider" }),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { if (!mounted) late++; slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(fn) { return fn(); },
    useEffect(effect, deps) { const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) effects.push(() => {
        previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() };
      }); },
  };
  return { load: (path) => load(path, { react, "react/jsx-runtime": { jsx, jsxs: jsx }, ...dependencies }),
    render(fn) { cursor = 0; const value = fn(); while (effects.length) effects.shift()(); return value; },
    unmount() { mounted = false; slots.forEach((slot) => slot?.cleanup?.()); }, late: () => late };
}

test("web live status closes AdminRoute profile, signs out with clear denial, preserves invitation acceptance and account cleanup", async () => {
  let authListener, signOuts = 0;
  const streams = [], writes = [], auth = { currentUser: null };
  const h = hooks({
    "firebase/auth": { onAuthStateChanged: (_, next) => { authListener = next; return () => undefined; },
      signOut: async () => { signOuts++; auth.currentUser = null; authListener(null); } },
    "firebase/firestore": { doc: (_, collection, uid) => ({ collection, uid }), serverTimestamp: () => "server-time",
      updateDoc: async (ref, patch) => { writes.push({ ref, patch }); },
      onSnapshot: (ref, next, error) => { const item = { ref, next, error, stopped: false }; streams.push(item); return () => { item.stopped = true; }; } },
    "../firebase/config": { auth, db: {} }, "../../../functions/src/domain/accountSession": domain,
  });
  const { AdminAuthProvider } = h.load("admin-web/src/auth/AdminAuthContext.tsx");
  const state = () => h.render(() => AdminAuthProvider({ children: "routes" })).props.value;
  state(); auth.currentUser = { uid: "dispatcher" }; authListener(auth.currentUser);
  const snapshot = (value) => ({ id: "dispatcher", exists: () => true, data: () => value });
  await streams[0].next(snapshot({ role: "dispatcher", accountStatus: "active", invitationStatus: "pending" }));
  assert.equal(state().profile.invitationStatus, "accepted"); assert.equal(writes.length, 1);
  await streams[0].next(snapshot({ role: "dispatcher", accountStatus: "disabled" }));
  assert.equal(state().profile, null); assert.match(state().accessDenied, /disabled/); assert.equal(signOuts, 1);
  assert.equal(streams[0].stopped, true);
  auth.currentUser = { uid: "next" }; authListener(auth.currentUser);
  await streams[0].next(snapshot({ role: "super_admin", accountStatus: "active" }));
  assert.equal(state().profile, null);
  await streams[1].next(snapshot({ role: "super_admin", accountStatus: "active" }));
  assert.equal(state().profile.role, "super_admin");
  h.unmount(); await streams[1].next(snapshot({ role: "super_admin", accountStatus: "disabled" }));
  assert.equal(h.late(), 0);
});

test("forced revocation stops local GPS and signs out even when ordinary remote cleanup would fail; new account is protected", async () => {
  const calls = [], auth = { currentUser: { uid: "a" } };
  const service = load("src/services/auth.service.ts", {
    "@/src/firebase/config": { auth }, "@/src/firebase/authPersistence": {}, "@/src/utils/registrationDebug": {},
    "firebase/auth": { signOut: async () => { calls.push("sign-out"); } },
    "@/src/services/foreground-location.service": { foregroundSharing: {
      endRevokedSession: () => calls.push("local-stop"), stop: async () => { calls.push("remote-stop"); throw new Error("permission denied"); },
    } },
  });
  await service.logoutRevokedUser(); assert.deepEqual(calls, ["local-stop", "sign-out"]);
  await assert.rejects(service.logoutUser()); assert.equal(calls.at(-1), "remote-stop");
  const signingOut = service.logoutRevokedUser(); auth.currentUser = { uid: "b" }; await signingOut;
  assert.deepEqual(calls, ["local-stop", "sign-out", "remote-stop"]);
});

test("admin lifecycle dialog prevents duplicate clicks before busy prop rerenders", async () => {
  const pending = deferred(); let submits = 0;
  const h = hooks({ "lucide-react": {}, "../services/accountLifecycleService": {
    accountRoleLabel: () => "Customer", getEffectiveAccountStatus: (value) => value ?? "active",
  } });
  const { AccountLifecycleDialog } = h.load("admin-web/src/components/AccountLifecycleActions.tsx");
  const tree = h.render(() => AccountLifecycleDialog({ action: "disable", account: { id: "test" }, busy: false, error: "", onCancel() {},
    onConfirm: async () => { submits++; await pending.promise; } }));
  function flatten(node) { return !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)]; }
  const button = flatten(tree).find((node) => node.props.className === "primary-action");
  const first = button.props.onClick(); await button.props.onClick(); assert.equal(submits, 1);
  pending.resolve(); await first; await button.props.onClick(); assert.equal(submits, 2);
});


test("Admin Web emulator mode is explicit development-only and never redirects normal sessions", () => {
  const text = readFileSync(new URL("../../admin-web/src/firebase/config.ts", import.meta.url), "utf8");
  for (const [settings, demo] of [[{ DEV: true, VITE_USE_FIREBASE_EMULATORS: "1" }, true],
    [{ DEV: false, VITE_USE_FIREBASE_EMULATORS: "1" }, false], [{ DEV: true }, false], [{ DEV: true, VITE_USE_FIREBASE_EMULATORS: "0" }, false]]) {
    const calls = [], exports = {};
    const source = text.replaceAll("import.meta", `(${JSON.stringify({ env: settings })})`);
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    let configured;
    const deps = {
      "firebase/app": { getApps: () => [], initializeApp: (options) => { configured = options; return { options }; } },
      "firebase/auth": { getAuth: () => "auth", connectAuthEmulator: (...args) => calls.push(args) },
      "firebase/firestore": { getFirestore: () => "db", connectFirestoreEmulator: (...args) => calls.push(args) },
    };
    new Function("exports", "require", code)(exports, (id) => deps[id]);
    assert.equal(configured.projectId, demo ? "demo-servicepilot-review-author" : "servicepilot-756d9");
    assert.equal(calls.length, demo ? 2 : 0);
    if (demo) assert.deepEqual(calls, [["auth", "http://127.0.0.1:9197", { disableWarnings: true }], ["db", "127.0.0.1", 8187]]);
  }
});


test("lifecycle frontend preserves retry ID on uncertain failures and clears superseded IDs", async () => {
  const calls = []; let failure = new Error("Network outcome unconfirmed");
  const api = load("admin-web/src/services/accountLifecycleService.ts", {
    "./dispatcherProvisioningService": { callAccountLifecycleBackend: async (body) => { calls.push(body); if (failure) throw failure; } },
  });
  const input = { actorUid: "local-admin", target: { uid: "target", role: "forged-role" }, action: "disable" };
  await assert.rejects(api.updateManagedAccountLifecycle(input));
  failure = null; await api.updateManagedAccountLifecycle(input);
  assert.deepEqual(calls[0], calls[1]); assert.deepEqual(Object.keys(calls[0]).sort(), ["action", "requestId", "targetUid"]);
  await api.updateManagedAccountLifecycle(input); assert.notEqual(calls[2].requestId, calls[1].requestId);
  failure = Object.assign(new Error("Superseded"), { code: "request-conflict" });
  await assert.rejects(api.updateManagedAccountLifecycle(input));
  failure = null; await api.updateManagedAccountLifecycle(input);
  assert.notEqual(calls[3].requestId, calls[4].requestId);
});

test("existing callable map API rejects stale and pending sessions before querying the directory", async () => {
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const api = load("functions/src/services/map.service.ts", {
    "firebase-functions/v2/https": { HttpsError }, "../domain/accountSession": domain,
    "../domain/map": { DISTRICTS: [{ id: "kandy" }] },
  });
  for (const [profile, authTime, allowed] of [
    [{ role: "customer", accountStatus: "disabled" }, 200, false],
    [{ role: "customer", lifecyclePending: true }, 200, false],
    [{ role: "customer", sessionRevokedAt: 100 }, 100, false],
    [{ role: "customer", sessionRevokedAt: 100 }, 101, true],
    [{ role: "customer" }, undefined, true],
  ]) {
    let queries = 0;
    const query = { where: () => query, get: async () => ({ docs: [] }) };
    const db = { doc: () => ({ get: async () => ({ data: () => profile }) }), collection: () => { queries++; return query; } };
    const promise = api.readMapTechnicians(db, { uid: "local", token: { email_verified: true, auth_time: authTime } }, { districtId: "kandy" });
    if (allowed) assert.deepEqual(await promise, []);
    else await assert.rejects(promise, (error) => error.code === "permission-denied");
    assert.equal(queries, allowed ? 1 : 0);
  }
});

test("mobile login keeps Remember Me selection and shows clear revoked/disabled denial before routing", async () => {
  for (const scenario of ["active", "disabled-profile", "old-session", "disabled-auth"]) {
    const calls = [], routes = [];
    const user = { uid: "fixture", emailVerified: true, reload: async () => { calls.push("reload"); },
      getIdTokenResult: async () => ({ claims: { auth_time: 100 } }) };
    const profile = { role: "customer", emailVerified: true, accountStatus: scenario === "disabled-profile" ? "disabled" : "active",
      ...(scenario === "old-session" ? { sessionRevokedAt: 100 } : {}) };
    const native = Object.fromEntries(["ActivityIndicator", "Alert", "KeyboardAvoidingView", "ScrollView", "StatusBar", "Text", "Image", "TextInput", "TouchableOpacity", "View"].map((key) => [key, key]));
    Object.assign(native, { Platform: { OS: "android" }, StyleSheet: { create: (value) => value } });
    const h = hooks({
      "react-native": native, "lucide-react-native": {},
      "expo-router": { router: { replace: (route) => routes.push(route) }, useLocalSearchParams: () => ({}) },
      "@/src/firebase/config": { auth: { currentUser: user } }, "@/functions/src/domain/accountSession": domain,
      "@/src/services/auth.service": { loginUser: async (_, __, remember) => {
        assert.equal(remember, false); if (scenario === "disabled-auth") throw { code: "auth/user-disabled" };
        return { user };
      }, logoutRevokedUser: async () => { calls.push("revoked-logout"); }, logoutUser: async () => { calls.push("ordinary-logout"); } },
      "@/src/services/user.service": { getUserProfile: async () => profile, getMobileAccessDecision: () => ({ allowed: true }),
        getDashboardRouteForRole: () => "/(tabs)" },
    });
    const screen = h.load("app/(auth)/login.tsx").default;
    const flatten = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)];
    const fields = flatten(h.render(screen)).filter((node) => node.type === "TextInput");
    fields[0].props.onChangeText("fixture@example.test"); fields[1].props.onChangeText("synthetic-password");
    const tree = h.render(screen);
    const button = flatten(tree).find((node) => node.type === "TouchableOpacity" &&
      flatten(node).some((child) => child.type === "Text" && child.props.children === "Login"));
    await button.props.onPress();
    if (scenario === "active") { assert.deepEqual(routes, ["/(tabs)"]); assert.deepEqual(calls, ["reload"]); }
    else {
      assert.deepEqual(routes, []);
      assert.ok(flatten(h.render(screen)).some((node) => node.type === "Text" &&
        typeof node.props.children === "string" && /disabled|previous session/.test(node.props.children)));
      assert.deepEqual(calls, scenario === "disabled-auth" ? [] : ["revoked-logout"]);
    }
  }
});
