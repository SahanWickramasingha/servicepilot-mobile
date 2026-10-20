import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { renderHarness } from "../lib/performance-render-harness.mjs";
import { loadResetModule, resetController, resetDom, deferredReset } from "../lib/password-reset-harness.mjs";

function page(overrides = {}, input = {}) {
  const dom = resetDom(), calls = [];
  const api = { verifyPasswordResetCode: async () => { calls.push("verify-reset"); return "fixture@example.test"; },
    confirmPasswordReset: async () => { calls.push("confirm-reset"); },
    sendPasswordResetEmail: async () => { calls.push("send-reset"); },
    applyActionCode: async () => { calls.push("verify-email"); }, ...overrides };
  const controller = resetController.startEmailActionPage({ api, auth: {}, document: dom.document, mode: "resetPassword", code: "synthetic-code", ...input });
  return { ...dom, ...controller, calls };
}
const failure = (code) => { throw { code, message: "Raw sensitive provider details must not reach the page" }; };
function password(h, first = "Local-only-password-42", second = first) {
  h.node("newPassword").value = first; h.node("confirmPassword").value = second;
}

test("mobile auth service normalizes email and returns neutral outcomes without leaking whether accounts exist", async () => {
  for (const code of [null, "auth/user-not-found", "auth/user-disabled"]) {
    let calls = 0;
    const api = loadResetModule("src/services/auth.service.ts", {
      "@/src/firebase/config": { auth: {} }, "@/src/utils/registrationDebug": { getFirebaseErrorCode: (error) => error?.code },
      "firebase/auth": { sendPasswordResetEmail: async (_, email) => { calls++; assert.equal(email, "fixture@example.test"); if (code) failure(code); } },
    });
    await api.resetPassword("  FIXTURE@EXAMPLE.TEST  "); assert.equal(calls, 1);
    await assert.rejects(api.resetPassword("invalid"), /valid email/); assert.equal(calls, 1);
  }
});

test("mobile reset errors safely distinguish malformed email, network, throttling and generic failures", async () => {
  for (const [code, message] of [["auth/invalid-email", /valid email/], ["auth/network-request-failed", /connection/],
    ["auth/too-many-requests", /wait/], ["auth/internal-error", /try again later/]]) {
    const api = loadResetModule("src/services/auth.service.ts", {
      "@/src/firebase/config": { auth: {} }, "@/src/utils/registrationDebug": { getFirebaseErrorCode: (error) => error?.code },
      "firebase/auth": { sendPasswordResetEmail: async () => failure(code) },
    });
    await assert.rejects(api.resetPassword("fixture@example.test"), (error) => message.test(error.message) && !error.message.includes("Raw sensitive"));
  }
});

test("hosted form remains disabled until code validation; confirmation must succeed before success and fields are then cleared", async () => {
  const verification = deferredReset(), confirmation = deferredReset(); let confirms = 0;
  const h = page({ verifyPasswordResetCode: () => verification.promise,
    confirmPasswordReset: async (_, code, next) => { confirms++; assert.ok(code === "synthetic-code"); assert.ok(next === "Local-only-password-42"); await confirmation.promise; } });
  assert.equal(h.node("resetFields").disabled, true); password(h); await h.event("resetForm"); assert.equal(confirms, 0);
  verification.resolve("fixture@example.test"); await h.ready;
  assert.equal(h.node("resetFields").disabled, false); assert.equal(h.node("resetForm").hidden, false);
  const saving = h.event("resetForm"); await h.event("resetForm");
  assert.equal(confirms, 1); assert.notEqual(h.node("title").textContent, "Password Reset");
  confirmation.resolve(); await saving;
  assert.equal(h.node("title").textContent, "Password Reset"); assert.equal(h.node("resetForm").hidden, true);
  assert.equal(h.node("newPassword").value, ""); assert.equal(h.node("confirmPassword").value, "");
  await h.event("resetForm"); assert.equal(confirms, 1); h.dispose();
});

test("missing/duplicate/unsupported action data never enables reset or invokes a password operation", async () => {
  for (const input of [{ code: "" }, { code: null }, { invalidQuery: true }, { mode: "recoverEmail" }, { mode: null }]) {
    const h = page({}, input); await h.ready; password(h); await h.event("resetForm");
    assert.equal(h.node("resetFields").disabled, true); assert.deepEqual(h.calls, []); h.dispose();
  }
});

test("expired, invalid and used codes fail safely during either validation or confirmation", async () => {
  for (const code of ["auth/expired-action-code", "auth/invalid-action-code", "auth/user-disabled", "auth/user-not-found"]) {
    for (const stage of ["verifyPasswordResetCode", "confirmPasswordReset"]) {
      const h = page({ [stage]: async () => failure(code) }); await h.ready;
      password(h); await h.event("resetForm");
      assert.equal(h.node("resetForm").hidden, true); assert.equal(h.node("resetFields").disabled, true);
      assert.notEqual(h.node("title").textContent, "Password Reset"); assert.equal(h.node("freshForm").hidden, false);
      assert.match(h.node("message").textContent, /expired|invalid|used/); h.dispose();
    }
  }
});

test("short/mismatched passwords are rejected before Firebase; visibility toggles are accessible", async () => {
  const h = page(); await h.ready;
  password(h, "short"); await h.event("resetForm"); assert.match(h.node("resetError").textContent, /8 characters/);
  password(h, "Local-only-password-42", "mismatch"); await h.event("resetForm"); assert.match(h.node("resetError").textContent, /must match/);
  assert.ok(!h.calls.includes("confirm-reset"));
  await h.event("showPassword", "click"); assert.equal(h.node("newPassword").type, "text");
  assert.equal(h.node("showPassword").attributes["aria-pressed"], "true");
  await h.event("showPassword", "click"); assert.equal(h.node("newPassword").type, "password"); h.dispose();
});

test("policy, network and rate-limit errors never show success and permit a safe retry", async () => {
  for (const code of ["auth/weak-password", "auth/password-does-not-meet-requirements", "auth/network-request-failed", "auth/too-many-requests"]) {
    let fail = true;
    const h = page({ confirmPasswordReset: async () => { if (fail) failure(code); } }); await h.ready; password(h);
    await h.event("resetForm"); assert.notEqual(h.node("title").textContent, "Password Reset");
    assert.equal(h.node("resetFields").disabled, false); assert.ok(h.node("resetError").textContent);
    assert.ok(!h.node("resetError").textContent.includes("Raw sensitive"));
    fail = false; await h.event("resetForm"); assert.equal(h.node("title").textContent, "Password Reset"); h.dispose();
  }
});

test("validation network failure offers retry and does not enable the password form early", async () => {
  let offline = true;
  const h = page({ verifyPasswordResetCode: async () => { if (offline) failure("auth/network-request-failed"); return "fixture@example.test"; } });
  await h.ready; assert.equal(h.node("resetFields").disabled, true); assert.equal(h.node("retryAction").hidden, false);
  offline = false; await h.event("retryAction", "click"); assert.equal(h.node("resetFields").disabled, false); h.dispose();
});

test("fresh reset requests are neutral for existing/missing accounts, guard duplicate taps and handle bad email/network/rate limits", async () => {
  for (const code of [null, "auth/user-not-found", "auth/user-disabled"]) {
    const wait = deferredReset(); let sends = 0;
    const h = page({ sendPasswordResetEmail: async () => { sends++; await wait.promise; if (code) failure(code); } }, { code: "" });
    await h.ready; h.node("freshEmail").value = "fixture@example.test";
    const sending = h.event("freshForm"); await h.event("freshForm"); assert.equal(sends, 1);
    wait.resolve(); await sending; assert.equal(h.node("freshMessage").textContent, resetController.RESET_REQUEST_CONFIRMATION); h.dispose();
  }
  for (const code of ["auth/network-request-failed", "auth/too-many-requests"]) {
    const h = page({ sendPasswordResetEmail: async () => failure(code) }, { code: "" }); await h.ready;
    h.node("freshEmail").value = "bad"; await h.event("freshForm"); assert.match(h.node("freshMessage").textContent, /valid email/);
    h.node("freshEmail").value = "fixture@example.test"; await h.event("freshForm");
    assert.notEqual(h.node("freshMessage").textContent, resetController.RESET_REQUEST_CONFIRMATION); assert.equal(h.node("freshSubmit").disabled, false); h.dispose();
  }
});

test("existing verifyEmail mode still uses applyActionCode exclusively and retains its result/error states", async () => {
  for (const [code, title] of [[null, "Email Verified"], ["auth/expired-action-code", "Verification Link Expired"],
    ["auth/invalid-action-code", "Email Already Verified"], ["auth/network-request-failed", "Unable to Verify Email"]]) {
    let calls = 0;
    const h = page({ applyActionCode: async () => { calls++; if (code) failure(code); } }, { mode: "verifyEmail" }); await h.ready;
    assert.equal(calls, 1); assert.deepEqual(h.calls, []); assert.equal(h.node("title").textContent, title);
    assert.equal(h.node("resetFields").disabled, true); assert.equal(h.node("requestFresh").hidden, true); h.dispose();
  }
});

test("page disposal clears secrets and ignores late verification/reset callbacks", async () => {
  for (const stage of ["verifyPasswordResetCode", "confirmPasswordReset"]) {
    const wait = deferredReset(), h = page({ [stage]: () => wait.promise });
    let saving;
    if (stage === "confirmPasswordReset") { await h.ready; password(h); saving = h.event("resetForm"); }
    const title = h.node("title").textContent; h.dispose(); wait.resolve("fixture@example.test"); await (saving ?? h.ready);
    assert.equal(h.node("title").textContent, title); assert.equal(h.node("newPassword").value, ""); assert.equal(h.node("resetFields").disabled, true);
  }
});

test("real hosted bootstrap strips URL before SDK imports, ignores malicious apiKey/continueUrl, and uses isolated memory Auth", async () => {
  const html = readFileSync(new URL("../../public/auth/action.html", import.meta.url), "utf8");
  assert.match(html, /name="referrer" content="no-referrer"/); assert.match(html, /\[hidden\].*display: none !important/);
  const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replaceAll("import(", "loadModule(").replace("void boot();", "return boot();");
  const dom = resetDom(), imported = [], auth = {};
  const config = loadResetModule("public/auth/action-config.js").actionConfig;
  const window = { location: { pathname: "/auth/action", hostname: "servicepilot-756d9.web.app", search: "?mode=resetPassword&oobCode=synthetic-code&apiKey=attacker&continueUrl=https://evil.example" },
    history: { replaceState(state, _, path) { assert.equal(state, null); assert.equal(path, "/auth/action"); window.location.search = ""; } }, addEventListener() {} };
  const api = { inMemoryPersistence: "memory", initializeAuth: (_, settings) => { assert.equal(settings.persistence, "memory"); return auth; },
    verifyPasswordResetCode: async () => "fixture@example.test" };
  await new Function("window", "document", "loadModule", source)(window, dom.document, async (url) => {
    assert.equal(window.location.search, ""); imported.push(url);
    if (url.endsWith("firebase-app.js")) return { initializeApp: (settings, name) => { assert.equal(settings.projectId, "servicepilot-756d9"); assert.notEqual(settings.apiKey, "attacker"); assert.equal(name, "servicepilot-email-action"); return {}; } };
    if (url.endsWith("firebase-auth.js")) return api;
    if (url.endsWith("action-controller.js")) return resetController;
    return { actionConfig: config };
  });
  assert.equal(imported.length, 4); assert.equal(dom.node("primaryAction").href, "servicepilotmobile://login");
  assert.equal(dom.node("secondaryAction").href, "/login"); assert.equal(dom.node("resetFields").disabled, false);
});

test("mobile screen awaits Firebase, blocks duplicate taps, preserves neutral copy and ignores completion after unmount", async () => {
  for (const unmount of [false, true]) {
    const wait = deferredReset(); let calls = 0;
    const h = renderHarness("app/(auth)/forgot-password.tsx", { effects: true, dependencies: {
      "expo-router": { router: { back() {}, replace() {} } },
      "@/src/services/auth.service": { resetPassword: async () => { calls++; await wait.promise; } },
    } });
    h.render(); h.elements().find((e) => e.type === "TextInput").props.onChangeText("fixture@example.test"); h.render();
    const button = h.elements().find((e) => e.type === "TouchableOpacity" && e.props.disabled === false && e.props.onPress?.constructor.name === "AsyncFunction");
    const pending = button.props.onPress(); await button.props.onPress(); assert.equal(calls, 1);
    if (unmount) h.cleanup(); wait.resolve(); await pending; h.render();
    const text = h.elements().filter((e) => e.type === "Text").map((e) => e.props.children).join(" ");
    assert.equal(text.includes("If an eligible account exists"), !unmount);
  }
});
