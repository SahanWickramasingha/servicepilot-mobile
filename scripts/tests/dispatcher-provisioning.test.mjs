import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { initializeApp as clientApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, confirmPasswordReset } from "firebase/auth";
import * as clientDb from "firebase/firestore";

const projectId = "demo-servicepilot-dispatcher";
for (const value of [process.env.FIREBASE_AUTH_EMULATOR_HOST, process.env.FIRESTORE_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(value ?? "")) throw new Error("Local Auth and Firestore emulators required");
}
if ((process.env.GCLOUD_PROJECT ?? projectId) !== projectId) throw new Error("Demo project only");
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const rootRequire = createRequire(import.meta.url), ts = rootRequire("typescript");
const { initializeApp, deleteApp: deleteAdminApp } = require("firebase-admin/app");
const { getAuth: adminAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { createDispatcherProvisioner, ProvisioningError, normalizeDispatcher } = require("./lib/services/dispatcher-provisioning.service.js");
const { createDispatcherServer } = require("./lib/dispatcher-server.js");
const app = initializeApp({ projectId }, "dispatcher-provisioning-tests");
const db = getFirestore(app), auth = adminAuth(app), sessions = [], servers = [];
const origin = "http://localhost:5173", continueUrl = `${origin}/login`;
const password = "Only-for-local-dispatcher-tests-42";
clientDb.setLogLevel("silent"); // Expected rules denials need no verbose RPC logs.
let admin, customer, dispatcher, inactive;
function service(overrides = {}) {
  return createDispatcherProvisioner({ auth, db, continueUrl, sendSetupEmail: async () => "emulated", ...overrides });
}
const input = (label = randomUUID()) => ({ fullName: "  Test   Dispatcher  ", email: `${label}@example.test`, requestId: randomUUID() });
const bearer = (session) => `Bearer ${session.token}`;
async function session(role, status = "active") {
  const uid = `caller-${randomUUID()}`, email = `${uid}@example.test`;
  await auth.createUser({ uid, email, password });
  await db.doc(`users/${uid}`).set({ uid, email, fullName: "Emulator Caller", role, accountStatus: status });
  const app = clientApp({ projectId, apiKey: "emulator-only" }, uid), sessionAuth = getAuth(app), firestore = clientDb.getFirestore(app);
  connectAuthEmulator(sessionAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  clientDb.connectFirestoreEmulator(firestore, host, Number(port));
  const credential = await signInWithEmailAndPassword(sessionAuth, email, password);
  const result = { app, auth: sessionAuth, db: firestore, uid, token: await credential.user.getIdToken() };
  sessions.push(result); return result;
}
before(async () => {
  admin = await session("super_admin"); customer = await session("customer");
  dispatcher = await session("dispatcher"); inactive = await session("super_admin", "disabled");
});
after(async () => {
  for (const server of servers) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
  for (const item of sessions) { await clientDb.terminate(item.db); await deleteApp(item.app); }
  await db.terminate(); await deleteAdminApp(app);
});

test("missing/invalid/expired/revoked tokens fail before profile reads or writes", async () => {
  const backend = service();
  for (const value of [undefined, "", "Basic bad", "Bearer malformed"]) {
    await assert.rejects(backend.create(value, input()), (error) => error.status === 401);
  }
  for (const code of ["auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token"]) {
    let reads = 0;
    const stub = service({ auth: { verifyIdToken: async (_, checkRevoked) => {
      assert.equal(checkRevoked, true); throw { code };
    } }, db: { doc() { reads++; throw new Error("Must not read"); } } });
    await assert.rejects(stub.create("Bearer fixture", input()), (error) => error.status === 401);
    assert.equal(reads, 0);
  }
});

test("Customer, Dispatcher, disabled and missing-status Super Admin callers are denied", async () => {
  for (const caller of [customer, dispatcher, inactive]) {
    await assert.rejects(service().create(bearer(caller), input()), (error) => error.status === 403);
  }
  const noStatus = await session("super_admin");
  await db.doc(`users/${noStatus.uid}`).update({ accountStatus: null });
  await assert.rejects(service().create(bearer(noStatus), input()), (error) => error.status === 403);
});

test("active Super Admin creates server-owned profile and audit without exposing a password", async () => {
  const body = input(), backend = service();
  const result = await backend.create(bearer(admin), body);
  assert.equal(result.emailDelivery, "emulated");
  assert.match(result.uid, /^dispatcher-/); assert.match(result.dispatcherId, /^DSP-\d{4}-[A-F0-9]{32}$/);
  const account = await auth.getUser(result.uid), profile = (await db.doc(`users/${result.uid}`).get()).data();
  assert.equal(account.emailVerified, false); assert.equal(profile.emailVerified, false);
  assert.equal(profile.fullName, "Test Dispatcher"); assert.equal(profile.role, "dispatcher");
  assert.equal(profile.accountStatus, "active"); assert.equal(profile.invitationStatus, "pending");
  assert.equal(profile.createdBy, admin.uid); assert.ok(profile.createdAt.toMillis() > 0);
  const audits = await db.collection("audit_logs").where("targetUid", "==", result.uid).get();
  assert.equal(audits.size, 1); assert.equal(audits.docs[0].data().actorUid, admin.uid);
  for (const value of [profile, result, audits.docs[0].data()]) {
    assert.equal(Object.keys(value).some((key) => /password|token|credential/i.test(key)), false);
  }
});

test("forged actor UID, role, verification, ID, status and password payload fields are rejected", async () => {
  for (const key of ["actorUid", "createdBy", "role", "emailVerified", "dispatcherId", "accountStatus", "temporaryPassword"]) {
    await assert.rejects(service().create(bearer(admin), { ...input(), [key]: "forged" }), (error) => error.status === 400);
  }
  for (const body of [input(), { ...input(), fullName: "x" }, { ...input(), email: "invalid" }, { ...input(), fullName: "bad\nname" }]) {
    if (body.fullName === "  Test   Dispatcher  " && body.email.includes("@")) {
      assert.equal(normalizeDispatcher({ ...body, email: "  TEST@EXAMPLE.TEST  " }).email, "test@example.test");
    } else assert.throws(() => normalizeDispatcher(body), ProvisioningError);
  }
  for (const email of ["a,b@example.test", "Name<a@example.test>", "a;other@example.test", "a..b@example.test", "a@-bad.test", "a@example.test\r\nBcc: other@example.test"]) {
    assert.throws(() => normalizeDispatcher({ ...input(), email }), ProvisioningError);
  }
});

test("duplicate pre-existing email never deletes or changes its Auth account", async () => {
  const body = input(), original = await auth.createUser({ email: body.email, password });
  let deletes = 0;
  const proxy = new Proxy(auth, { get(target, key) {
    if (key === "deleteUser") return async () => { deletes++; throw new Error("Must not delete pre-existing account"); };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  await assert.rejects(service({ auth: proxy }).create(bearer(admin), body), (error) => error.code === "already-exists");
  assert.equal((await auth.getUserByEmail(body.email)).uid, original.uid); assert.equal(deletes, 0);
});

test("repeated/concurrent submissions create one account, one profile and one audit", async () => {
  let deliveries = 0;
  const backend = service({ sendSetupEmail: async () => { deliveries++; return "emulated"; } }), body = input();
  const requests = await Promise.allSettled(Array.from({ length: 4 }, () => backend.create(bearer(admin), body)));
  const successes = requests.filter((item) => item.status === "fulfilled");
  assert.ok(successes.length >= 1);
  const uid = successes[0].value.uid;
  assert.ok(successes.every((item) => item.value.uid === uid));
  const replay = await backend.create(bearer(admin), body); assert.equal(replay.uid, uid);
  assert.equal((await db.collection("users").where("email", "==", body.email).get()).size, 1);
  assert.equal((await db.collection("audit_logs").where("targetUid", "==", uid).get()).size, 1);
  assert.equal(deliveries, 1);
  await assert.rejects(backend.create(bearer(admin), { ...body, fullName: "Different Name" }), (error) => error.code === "request-conflict");
  const other = input();
  const racing = await Promise.allSettled([backend.create(bearer(admin), other), backend.create(bearer(admin), { ...other, requestId: randomUUID() })]);
  assert.equal(racing.filter((item) => item.status === "fulfilled").length, 1);
});

function failingProfileDb() {
  let fail = true;
  return new Proxy(db, { get(target, key) {
    if (key === "runTransaction") return (handler) => target.runTransaction((tx) => handler(new Proxy(tx, { get(transaction, method) {
      if (method === "create") return (ref, value) => {
        if (fail && ref.path.startsWith("users/")) { fail = false; throw new Error("Synthetic profile-write failure"); }
        return transaction.create(ref, value);
      };
      const value = Reflect.get(transaction, method); return typeof value === "function" ? value.bind(transaction) : value;
    } })));
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
}

test("profile-write failure rolls back only the newly created Auth user; retry succeeds", async () => {
  const body = input(), backend = service({ db: failingProfileDb() });
  await assert.rejects(backend.create(bearer(admin), body), (error) => error.code === "unavailable");
  await assert.rejects(auth.getUserByEmail(body.email), (error) => error.code === "auth/user-not-found");
  assert.equal((await db.collection("users").where("email", "==", body.email).get()).size, 0);
  const result = await backend.create(bearer(admin), body); assert.equal(result.emailDelivery, "emulated");
});

test("rollback failure retains a recovery record and blocks duplicate creation", async () => {
  const body = input();
  const proxy = new Proxy(auth, { get(target, key) {
    if (key === "deleteUser") return async () => { throw new Error("Synthetic rollback failure"); };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  const backend = service({ db: failingProfileDb(), auth: proxy });
  await assert.rejects(backend.create(bearer(admin), body), (error) => error.code === "operation-recovery-required");
  await assert.rejects(backend.create(bearer(admin), body), (error) => error.code === "operation-recovery-required");
  assert.ok((await auth.getUserByEmail(body.email)).uid);
});

test("email failure preserves the account/audit and safe resend does not create duplicates", async () => {
  let broken = true, deliveries = 0;
  const backend = service({ sendSetupEmail: async () => { deliveries++; if (broken) throw new Error("Synthetic email failure"); return "emulated"; } });
  const body = input(), result = await backend.create(bearer(admin), body);
  assert.equal(result.emailDelivery, "failed"); assert.ok(await auth.getUser(result.uid));
  assert.equal((await db.doc(`users/${result.uid}`).get()).data().invitationDeliveryStatus, "failed");
  broken = false;
  const resent = await backend.resend(bearer(admin), { uid: result.uid });
  assert.equal(resent.emailDelivery, "emulated"); assert.equal(resent.uid, result.uid);
  await backend.resend(bearer(admin), { uid: result.uid }); assert.equal(deliveries, 2);
  assert.equal((await db.collection("audit_logs").where("targetUid", "==", result.uid).get()).size, 1);
  assert.equal((await db.collection("users").where("email", "==", body.email).get()).size, 1);
  await assert.rejects(backend.resend(bearer(customer), { uid: result.uid }), (error) => error.status === 403);
});

test("actual revoked/expired emulator ID tokens are rejected", async () => {
  const revoked = await session("super_admin");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await auth.revokeRefreshTokens(revoked.uid);
  await assert.rejects(service().create(bearer(revoked), input()), (error) => error.status === 401);
  const parts = admin.token.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  parts[1] = Buffer.from(JSON.stringify({ ...payload, exp: 1 })).toString("base64url");
  await assert.rejects(service().create(`Bearer ${parts.join(".")}`, input()), (error) => error.status === 401);
});

test("disabled Auth user and missing authoritative caller profile are rejected", async () => {
  const disabled = await session("super_admin");
  await auth.updateUser(disabled.uid, { disabled: true });
  await assert.rejects(service().create(bearer(disabled), input()), (error) => error.status === 401);
  const missing = await session("super_admin");
  await db.doc(`users/${missing.uid}`).delete();
  await assert.rejects(service().create(bearer(missing), input()), (error) => error.status === 403);
});

test("Firebase password setup link works without exposing the temporary password or switching the caller", async () => {
  let setupLink;
  const backend = service({ sendSetupEmail: async (_, link) => { setupLink = link; return "emulated"; } });
  const body = input(), caller = admin.auth.currentUser;
  const result = await backend.create(bearer(admin), body);
  const code = new URL(setupLink).searchParams.get("oobCode"); assert.ok(code);
  const app = clientApp({ projectId, apiKey: "emulator-only" }, `invite-${randomUUID()}`), inviteAuth = getAuth(app);
  connectAuthEmulator(inviteAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  try {
    await confirmPasswordReset(inviteAuth, code, password);
    const login = await signInWithEmailAndPassword(inviteAuth, body.email, password);
    assert.equal(login.user.uid, result.uid); assert.equal(admin.auth.currentUser, caller);
    assert.equal((await db.doc(`users/${result.uid}`).get()).data().emailVerified, false);
  } finally { await deleteApp(app); }
});

test("browser roles including Super Admin cannot directly create/delete dispatcher profiles or forge audit/operations", async () => {
  const created = await service().create(bearer(admin), input());
  for (const caller of [admin, customer, dispatcher, inactive]) {
    const uid = `browser-${randomUUID()}`;
    await assert.rejects(clientDb.setDoc(clientDb.doc(caller.db, "users", uid), {
      uid, dispatcherId: "FORGED", fullName: "Browser Dispatcher", email: "browser@example.test", role: "dispatcher",
      accountStatus: "active", invitationStatus: "pending", createdBy: caller.uid,
      createdAt: clientDb.serverTimestamp(), updatedAt: clientDb.serverTimestamp(),
    }), (error) => error.code === "permission-denied");
    await assert.rejects(clientDb.deleteDoc(clientDb.doc(caller.db, "users", created.uid)), (error) => error.code === "permission-denied");
    await assert.rejects(clientDb.setDoc(clientDb.doc(caller.db, "audit_logs", uid), {
      action: "SUPER_ADMIN_CREATED_DISPATCHER", actorUid: caller.uid, actorRole: "super_admin", targetUid: created.uid,
      targetType: "dispatcher", metadata: {}, createdAt: clientDb.serverTimestamp(),
    }), (error) => error.code === "permission-denied");
    for (const collection of ["dispatcher_provisioning_operations", "dispatcher_provisioning_emails", "dispatcher_invitation_deliveries"]) {
      await assert.rejects(clientDb.setDoc(clientDb.doc(caller.db, collection, uid), { status: "complete" }), (error) => error.code === "permission-denied");
      await assert.rejects(clientDb.getDoc(clientDb.doc(caller.db, collection, uid)), (error) => error.code === "permission-denied");
    }
  }
});

test("existing dispatcher invitation acceptance remains permitted without changing trusted fields", async () => {
  await db.doc(`users/${dispatcher.uid}`).update({ dispatcherId: "DSP-LEGACY", invitationStatus: "pending", createdBy: admin.uid, invitationDeliveryStatus: "sent" });
  assert.equal((await service().resend(bearer(admin), { uid: dispatcher.uid })).emailDelivery, "emulated");
  await clientDb.updateDoc(clientDb.doc(dispatcher.db, "users", dispatcher.uid), { invitationStatus: "accepted", updatedAt: clientDb.serverTimestamp() });
  assert.equal((await db.doc(`users/${dispatcher.uid}`).get()).data().invitationStatus, "accepted");
  await assert.rejects(clientDb.updateDoc(clientDb.doc(dispatcher.db, "users", dispatcher.uid), { createdBy: dispatcher.uid }), (error) => error.code === "permission-denied");
});

function frontendService(settings, config = { auth: admin.auth }) {
  const source = readFileSync(new URL("../../admin-web/src/services/dispatcherProvisioningService.ts", import.meta.url), "utf8")
    .replaceAll("import.meta", `(${JSON.stringify({ env: settings })})`);
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  new Function("exports", "require", output)(exports, (id) => {
    assert.equal(id, "../firebase/config"); return config;
  });
  return exports;
}

test("frontend calls actual HTTP backend and leaves primary Super Admin session unchanged", async () => {
  const server = createDispatcherServer(service(), origin); servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = frontendService({ VITE_DISPATCHER_API_URL: base, DEV: true });
  const user = admin.auth.currentUser, body = input();
  const result = await client.createDispatcherInvitation(body);
  assert.equal(admin.auth.currentUser, user); assert.equal(result.emailDelivery, "emulated");
  assert.equal((await db.doc(`users/${result.uid}`).get()).data().createdBy, user.uid);
  assert.equal((await client.createDispatcherInvitation(body)).uid, result.uid);
  const noConfig = frontendService({});
  await assert.rejects(noConfig.createDispatcherInvitation(input()), /backend is not configured/);
  const forbiddenOrigin = await fetch(`${base}/v1/dispatchers`, { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(forbiddenOrigin.status, 403);
  const missingToken = await fetch(`${base}/v1/dispatchers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(missingToken.status, 401);
});

test("standalone server starts with emulator-only runtime configuration and rejects unauthenticated HTTP", async () => {
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port; await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../functions/lib/dispatcher-main.js", import.meta.url))], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEBUG: "",
      GOOGLE_CLOUD_PROJECT: projectId, DISPATCHER_MODE: "emulator", DISPATCHER_ADMIN_ORIGIN: origin,
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST, PORT: String(port),
    },
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Standalone emulator server did not start")), 10000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Standalone server exited before readiness")); });
      child.stdout.on("data", (chunk) => {
        if (chunk.toString().includes("Dispatcher provisioning server ready")) { clearTimeout(timer); resolve(); }
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}/v1/dispatchers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, 401);
  } finally {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await stopped;
    }
  }
});
