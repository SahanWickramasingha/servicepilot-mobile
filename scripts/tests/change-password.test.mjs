import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url), ts = require("typescript");
function load(path, dependencies, timers = {}) {
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("exports", "require", "setTimeout", "clearTimeout", output)(exports, (id) => {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, timers.setTimeout, timers.clearTimeout);
  return exports;
}

// Synthetic credentials only. No Firebase initialization, requests, or production writes.
const current = "old-password", next = "new-password";
function serviceHarness({ reauthenticate, update } = {}) {
  const calls = [];
  const user = { uid: "fixture-user", email: "fixture@example.test", isAnonymous: false, providerData: [{ providerId: "password" }] };
  const auth = { currentUser: user };
  const service = load("src/services/auth.service.ts", {
    "@/src/firebase/config": { auth },
    "@/src/utils/registrationDebug": { getFirebaseErrorCode: (error) => error?.code ?? null },
    "firebase/auth": {
      EmailAuthProvider: { PROVIDER_ID: "password", credential: (email, password) => {
        calls.push("credential"); assert.equal(email, user.email); assert.equal(password, current);
        return { fixture: true };
      } },
      reauthenticateWithCredential: async (value, credential) => {
        calls.push("reauthenticate"); assert.equal(value, user); assert.deepEqual(credential, { fixture: true });
        await reauthenticate?.(auth);
      },
      updatePassword: async (value, password) => {
        calls.push("update"); assert.equal(value, user); assert.equal(password, next);
        await update?.(auth);
      },
    },
  });
  return { ...service, auth, user, calls };
}
const fail = (code) => { throw { code, message: "Raw error must never reach the UI" }; };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

// Follow the repository's existing hook/JSX harness pattern: test the actual screen
// handler and rendered props without adding a native renderer dependency.
function screenHarness(changePassword) {
  const slots = [], effects = [], timers = new Map();
  let cursor = 0, tree, unmounted = false, lateWrites = 0, backs = 0, timerId = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => {
        if (unmounted) lateWrites++;
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useRef(current) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current };
      return slots[index];
    },
    useEffect(effect) {
      const index = cursor++;
      if (!(index in slots)) effects.push(() => { slots[index] = { cleanup: effect() }; });
    },
  };
  const jsx = (type, props) => ({ type, props });
  const component = load("app/(auth)/change-password.tsx", {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "expo-router": { router: { back: () => backs++ } },
    "@/src/services/auth.service": { changePassword },
    "react-native": {
      ActivityIndicator: "ActivityIndicator", KeyboardAvoidingView: "KeyboardAvoidingView",
      Platform: { OS: "android" }, ScrollView: "ScrollView", StatusBar: "StatusBar",
      StyleSheet: { create: (value) => value }, Text: "Text", TextInput: "TextInput",
      TouchableOpacity: "TouchableOpacity", View: "View",
    },
    "lucide-react-native": Object.fromEntries(["ArrowLeft", "CheckCircle2", "Eye", "EyeOff", "LockKeyhole", "ShieldCheck"].map((name) => [name, name])),
  }, {
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  }).default;
  const flatten = (element) => !element || typeof element !== "object" ? [] :
    [element, ...[element.props?.children].flat(Infinity).flatMap(flatten)];
  const elements = () => flatten(tree);
  const render = () => { cursor = 0; tree = component(); while (effects.length) effects.shift()(); };
  const inputs = () => elements().filter((element) => element.type === "TextInput");
  const text = () => elements().filter((element) => element.type === "Text").map((element) => element.props.children).join(" ");
  render();
  return {
    render, inputs, text,
    fill(values = [current, next, next]) { inputs().forEach((input, index) => input.props.onChangeText(values[index])); render(); },
    button: () => elements().find((element) => element.props?.accessibilityRole === "button"),
    unmount() { unmounted = true; for (const slot of slots) slot?.cleanup?.(); },
    flushTimers() { for (const [id, callback] of timers) { timers.delete(id); callback(); } },
    pendingTimers: () => timers.size, lateWrites: () => lateWrites, backs: () => backs,
  };
}

test("service awaits reauthentication before updating the same authenticated user", async () => {
  const pending = deferred();
  const h = serviceHarness({ reauthenticate: () => pending.promise });
  const saving = h.changePassword(current, next, next);
  assert.deepEqual(h.calls, ["credential", "reauthenticate"]);
  pending.resolve(); await saving;
  assert.deepEqual(h.calls, ["credential", "reauthenticate", "update"]);
});

test("service rejects missing session and non-password accounts before any Firebase operation", async () => {
  for (const variant of ["missing", "email", "provider", "anonymous"]) {
    const h = serviceHarness();
    if (variant === "missing") h.auth.currentUser = null;
    if (variant === "email") h.user.email = null;
    if (variant === "provider") h.user.providerData = [{ providerId: "google.com" }];
    if (variant === "anonymous") h.user.isAnonymous = true;
    await assert.rejects(h.changePassword(current, next, next), variant === "missing" ? /sign in/ : /email\/password accounts only/);
    assert.deepEqual(h.calls, []);
  }
});

test("service validates missing current password, short new password, mismatch and reuse before Firebase", async () => {
  for (const [values, message] of [
    [["", next, next], /current password/], [[current, "short", "short"], /at least 8/],
    [[current, next, "mismatch"], /must match/], [[current, current, current], /different/],
  ]) {
    const h = serviceHarness();
    await assert.rejects(h.changePassword(...values), message);
    assert.deepEqual(h.calls, []);
  }
});

test("an eight-character password and linked password provider are accepted; passwords are not trimmed", async () => {
  const values = [];
  const user = { email: "fixture@example.test", providerData: [{ providerId: "google.com" }, { providerId: "password" }] };
  const service = load("src/services/auth.service.ts", {
    "@/src/firebase/config": { auth: { currentUser: user } },
    "@/src/utils/registrationDebug": { getFirebaseErrorCode: (error) => error?.code },
    "firebase/auth": {
      EmailAuthProvider: { PROVIDER_ID: "password", credential: (email, password) => { values.push(password); return {}; } },
      reauthenticateWithCredential: async () => {}, updatePassword: async (_, password) => { values.push(password); },
    },
  });
  await service.changePassword(" old ", "  new   ", "  new   ");
  assert.deepEqual(values, [" old ", "  new   "]);
});

for (const [code, message] of [
  ["auth/wrong-password", /current password is incorrect/],
  ["auth/invalid-credential", /current password is incorrect/],
  ["auth/invalid-login-credentials", /current password is incorrect/],
  ["auth/weak-password", /stronger password/],
  ["auth/password-does-not-meet-requirements", /stronger password/],
  ["auth/network-request-failed", /Check your connection/],
  ["auth/too-many-requests", /Too many attempts/],
  ["auth/requires-recent-login", /sign in again/],
  ...["auth/user-token-expired", "auth/invalid-user-token", "auth/user-not-found", "auth/user-disabled", "auth/user-mismatch"]
    .map((code) => [code, /session is no longer valid/]),
  ["auth/unknown", /Unable to change your password/],
]) {
  test(`service maps ${code} safely from either Firebase stage`, async () => {
    for (const stage of ["reauthenticate", "update"]) {
      const h = serviceHarness({ [stage]: () => fail(code) });
      await assert.rejects(h.changePassword(current, next, next), (error) => {
        assert.match(error.message, message);
        assert.doesNotMatch(error.message, /Raw error/);
        return true;
      });
      assert.equal(h.calls.includes("update"), stage === "update");
    }
  });
}

test("logout/account switch during reauthentication prevents updating the captured account", async () => {
  for (const replacement of [null, { uid: "another-user" }]) {
    const h = serviceHarness({ reauthenticate: (auth) => { auth.currentUser = replacement; } });
    await assert.rejects(h.changePassword(current, next, next), /sign in again/);
    assert.equal(h.calls.includes("update"), false);
  }
});

test("an account switch while Firebase updates cannot report success for the new session", async () => {
  const service = serviceHarness({ update: (auth) => { auth.currentUser = { uid: "another-user" }; } });
  const h = screenHarness(service.changePassword);
  h.fill(); await h.button().props.onPress(); h.render();
  assert.match(h.text(), /session is no longer valid/);
  assert.doesNotMatch(h.text(), /updated successfully/);
  assert.equal(h.pendingTimers(), 0);
});

test("screen waits for Firebase update, blocks rapid taps, clears fields and then returns", async () => {
  const pending = deferred();
  const service = serviceHarness({ update: () => pending.promise });
  const h = screenHarness(service.changePassword);
  h.fill();
  const onPress = h.button().props.onPress;
  const saving = onPress();
  await onPress(); // Same render, before React has committed the loading state.
  await settle(); h.render();
  assert.deepEqual(service.calls, ["credential", "reauthenticate", "update"]);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.button().props.accessibilityState.busy, true);
  assert.ok(h.inputs().every((input) => input.props.editable === false));
  assert.doesNotMatch(h.text(), /updated successfully/);
  assert.equal(h.pendingTimers(), 0);
  pending.resolve(); await saving; h.render();
  assert.match(h.text(), /Password updated successfully/);
  assert.ok(h.inputs().every((input) => input.props.value === ""));
  assert.equal(h.button().props.disabled, true);
  await onPress(); // A previously captured callback cannot resubmit after success.
  assert.equal(service.calls.filter((call) => call === "update").length, 1);
  h.flushTimers(); assert.equal(h.backs(), 1);
});

for (const stage of ["reauthenticate", "update"]) {
  test(`${stage} failure never displays success or navigates; retry remains possible`, async () => {
    const service = serviceHarness({ [stage]: () => fail("auth/network-request-failed") });
    const h = screenHarness(service.changePassword);
    h.fill(); await h.button().props.onPress(); h.render();
    assert.match(h.text(), /Check your connection/);
    assert.doesNotMatch(h.text(), /updated successfully/);
    assert.equal(h.button().props.disabled, false);
    assert.equal(h.button().props.accessibilityState.busy, false);
    assert.equal(service.calls.includes("update"), stage === "update");
    assert.equal(h.pendingTimers(), 0);
    h.flushTimers(); assert.equal(h.backs(), 0);
  });
}

test("screen blocks invalid forms and explains unavailable sessions/providers without success", async () => {
  const service = serviceHarness();
  const h = screenHarness(service.changePassword);
  for (const values of [["", next, next], [current, "short", "short"], [current, next, "mismatch"], [current, current, current]]) {
    h.fill(values); assert.equal(h.button().props.disabled, true);
    await h.button().props.onPress(); assert.deepEqual(service.calls, []);
  }
  service.auth.currentUser = null;
  h.fill(); await h.button().props.onPress(); h.render();
  assert.match(h.text(), /sign in before changing/); assert.doesNotMatch(h.text(), /updated successfully/);
  service.auth.currentUser = service.user; service.user.providerData = [];
  await h.button().props.onPress(); h.render();
  assert.match(h.text(), /email\/password accounts only/); assert.deepEqual(service.calls, []);
});

test("unmount during either success or failure prevents state writes and navigation", async () => {
  for (const succeeds of [true, false]) {
    const pending = deferred();
    const h = screenHarness(() => pending.promise);
    h.fill(); const saving = h.button().props.onPress(); h.unmount();
    if (succeeds) pending.resolve(); else pending.reject(new Error("Fixture failure"));
    await saving;
    assert.equal(h.lateWrites(), 0); assert.equal(h.pendingTimers(), 0);
    h.flushTimers(); assert.equal(h.backs(), 0);
  }
});

test("unmount after success cancels the delayed back navigation", async () => {
  const h = screenHarness(async () => {});
  h.fill(); await h.button().props.onPress(); h.render();
  assert.equal(h.pendingTimers(), 1); h.unmount();
  assert.equal(h.pendingTimers(), 0); h.flushTimers();
  assert.equal(h.backs(), 0); assert.equal(h.lateWrites(), 0);
});
