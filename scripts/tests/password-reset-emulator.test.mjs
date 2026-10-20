import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, sendPasswordResetEmail,
  verifyPasswordResetCode, confirmPasswordReset, applyActionCode, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { loadResetModule, resetController, resetDom } from "../lib/password-reset-harness.mjs";

const projectId = "demo-servicepilot-review-author", host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? "") || (process.env.GCLOUD_PROJECT ?? projectId) !== projectId) {
  throw new Error("Disposable demo Auth emulator only.");
}
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const trusted = adminApp({ projectId }, "password-reset-tests"), admin = getAuth(trusted), apps = [];
const api = { sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset, applyActionCode };
const oldPassword = "Local-only-old-password-42", nextPassword = "Local-only-next-password-42";
after(async () => { for (const app of apps) await deleteApp(app); await deleteAdmin(trusted); });
function client() {
  const app = initializeApp({ projectId, apiKey: "emulator-only" }, randomUUID()); apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true }); return auth;
}
async function account() {
  const uid = `reset-${randomUUID()}`, email = `${uid}@example.test`;
  await admin.createUser({ uid, email, password: oldPassword, emailVerified: false }); return { uid, email };
}
async function resetCode(email) {
  const response = await fetch(`http://${host}/emulator/v1/projects/${projectId}/oobCodes`);
  if (!response.ok) throw new Error("Local emulator action endpoint unavailable.");
  const data = await response.json();
  const entry = data.oobCodes?.findLast((item) => item.email === email && item.requestType === "PASSWORD_RESET");
  assert.ok(entry?.oobCode, "No local reset action was created.");
  return entry.oobCode; // Never print, assert-equal, write or serialize this code.
}

test("actual mobile reset service sends an email action; hosted controller validates/resets it; old password fails, new password works and reuse fails", async () => {
  const target = await account(), actionAuth = client(), dom = resetDom();
  const service = loadResetModule("src/services/auth.service.ts", {
    "@/src/firebase/config": { auth: actionAuth }, "firebase/auth": api,
    "@/src/utils/registrationDebug": { getFirebaseErrorCode: (error) => error?.code },
  });
  await service.resetPassword(target.email);
  const code = await resetCode(target.email);
  const controller = resetController.startEmailActionPage({ api, auth: actionAuth, document: dom.document, mode: "resetPassword", code });
  await controller.ready; assert.equal(dom.node("resetFields").disabled, false);
  assert.equal(actionAuth.currentUser, null);
  dom.node("newPassword").value = nextPassword; dom.node("confirmPassword").value = nextPassword;
  await dom.event("resetForm");
  assert.equal(dom.node("title").textContent, "Password Reset"); assert.equal(dom.node("newPassword").value, "");
  assert.equal(actionAuth.currentUser, null);
  const login = client();
  await assert.rejects(signInWithEmailAndPassword(login, target.email, oldPassword), (error) => ["auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(error.code));
  await signInWithEmailAndPassword(login, target.email, nextPassword); assert.equal(login.currentUser.uid, target.uid); await signOut(login);
  const reused = resetDom(), second = resetController.startEmailActionPage({ api, auth: actionAuth, document: reused.document, mode: "resetPassword", code });
  await second.ready; assert.equal(reused.node("resetFields").disabled, true); assert.equal(reused.node("resetForm").hidden, true);
  assert.notEqual(reused.node("title").textContent, "Password Reset");
  controller.dispose(); second.dispose();
});

test("invalid reset code never enables form; reset action cannot sign in or replace another account's session", async () => {
  const owner = await account(), target = await account(), primary = client(), actionAuth = client();
  await signInWithEmailAndPassword(primary, owner.email, oldPassword);
  const originalUser = primary.currentUser;
  const invalid = resetDom(), bad = resetController.startEmailActionPage({ api, auth: actionAuth, document: invalid.document, mode: "resetPassword", code: "invalid-fixture-code" });
  await bad.ready; assert.equal(invalid.node("resetFields").disabled, true); bad.dispose();
  await sendPasswordResetEmail(actionAuth, target.email); const code = await resetCode(target.email);
  await verifyPasswordResetCode(actionAuth, code); await confirmPasswordReset(actionAuth, code, nextPassword);
  assert.equal(primary.currentUser, originalUser); assert.equal(actionAuth.currentUser, null); await signOut(primary);
});

test("existing verifyEmail action works against Auth emulator without calling reset APIs", async () => {
  const target = await account(), actionAuth = client(), dom = resetDom();
  const link = await admin.generateEmailVerificationLink(target.email);
  const code = new URL(link).searchParams.get("oobCode");
  const controller = resetController.startEmailActionPage({ api, auth: actionAuth, document: dom.document, mode: "verifyEmail", code });
  await controller.ready;
  assert.equal(dom.node("title").textContent, "Email Verified"); assert.equal((await admin.getUser(target.uid)).emailVerified, true);
  assert.equal(actionAuth.currentUser, null); assert.equal(dom.node("resetForm").hidden, true); controller.dispose();
});

test("local Hosting serves the real handler/modules with no-referrer and no-store; staged config can reach only demo Auth", async () => {
  const origin = "http://127.0.0.1:5008";
  const response = await fetch(`${origin}/auth/action`);
  assert.equal(response.status, 200); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.ok(response.headers.get("cache-control")?.includes("no-store"));
  const html = await response.text(); assert.match(html, /id="resetFields" disabled/); assert.match(html, /id="resetForm"[^>]*hidden/);
  for (const file of ["action-controller.js", "action-config.js"]) {
    const module = await fetch(`${origin}/auth/${file}`); assert.equal(module.status, 200);
    if (file === "action-config.js") {
      const text = await module.text(); assert.match(text, /demo-servicepilot-review-author/); assert.ok(!text.includes("servicepilot-756d9"));
    }
  }
});
