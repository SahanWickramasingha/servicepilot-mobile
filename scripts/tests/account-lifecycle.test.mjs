import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp as clientApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import * as clientDb from "firebase/firestore";

const projectId = "demo-servicepilot-dispatcher";
for (const value of [process.env.FIREBASE_AUTH_EMULATOR_HOST, process.env.FIRESTORE_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(value ?? "")) throw new Error("Local emulators required");
}
if ((process.env.GCLOUD_PROJECT ?? projectId) !== projectId) throw new Error("Demo project only");
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const rootRequire = createRequire(import.meta.url), ts = rootRequire("typescript");
const { initializeApp, deleteApp: deleteAdmin } = require("firebase-admin/app");
const { getAuth: adminAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { createAccountLifecycleService } = require("./lib/services/account-lifecycle.service.js");
const { createDispatcherServer } = require("./lib/dispatcher-server.js");
const app = initializeApp({ projectId }, "account-lifecycle-tests"), db = getFirestore(app), auth = adminAuth(app);
const sessions = [], servers = [], password = "Only-for-local-lifecycle-tests-42", origin = "http://localhost:5173";
clientDb.setLogLevel("silent");
let admin, customer, dispatcher, inactive;
async function session(role, status = "active") {
  const uid = `lifecycle-${randomUUID()}`, email = `${uid}@example.test`;
  await auth.createUser({ uid, email, password, emailVerified: true });
  await db.doc(`users/${uid}`).set({ uid, role, accountStatus: status, emailVerified: true,
    fullName: "Emulator Account", email, technicianApprovalStatus: "approved", serviceDistrictIds: ["kandy"] });
  const app = clientApp({ projectId, apiKey: "emulator-only" }, uid), sessionAuth = getAuth(app), firestore = clientDb.getFirestore(app);
  connectAuthEmulator(sessionAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  clientDb.connectFirestoreEmulator(firestore, host, Number(port));
  await signInWithEmailAndPassword(sessionAuth, email, password);
  const result = { uid, email, app, auth: sessionAuth, db: firestore, token: await sessionAuth.currentUser.getIdToken() };
  sessions.push(result); return result;
}
const bearer = (caller = admin) => `Bearer ${caller.token}`;
const input = (target, action = "disable") => ({ targetUid: target.uid, action, requestId: randomUUID() });
const service = (overrides = {}) => createAccountLifecycleService({ auth, db, ...overrides });
const data = async (path) => (await db.doc(path).get()).data();
const denied = (status) => (error) => error.status === status;
function proxyAuth(overrides) {
  return new Proxy(auth, { get(target, key) { return overrides[key] ?? (typeof target[key] === "function" ? target[key].bind(target) : target[key]); } });
}
before(async () => { admin = await session("super_admin"); customer = await session("customer");
  dispatcher = await session("dispatcher"); inactive = await session("super_admin", "disabled"); });
after(async () => {
  for (const server of servers) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
  for (const s of sessions) { await clientDb.terminate(s.db); await deleteApp(s.app); }
  await db.terminate(); await deleteAdmin(app);
});

test("missing, malformed, expired and revoked tokens are rejected before target access", async () => {
  for (const header of [undefined, "", "Basic wrong", "Bearer invalid"]) {
    await assert.rejects(service().change(header, input(customer)), denied(401));
  }
  for (const code of ["auth/id-token-expired", "auth/id-token-revoked"]) {
    const stub = service({ auth: { verifyIdToken: async (_, revoked) => { assert.equal(revoked, true); throw { code }; } },
      db: { doc() { assert.fail("Must not read a profile for invalid authentication"); } } });
    await assert.rejects(stub.change("Bearer fixture", input(customer)), denied(401));
  }
});

test("Customer, Dispatcher and inactive Super Admin denied; authoritative active Super Admin required", async () => {
  for (const caller of [customer, dispatcher, inactive, await session("technician")]) {
    await assert.rejects(service().change(bearer(caller), input(customer)), denied(403));
  }
  const revokedAdmin = await session("super_admin");
  await db.doc(`users/${revokedAdmin.uid}`).update({ sessionRevokedAt: Math.floor(Date.now() / 1000) });
  await assert.rejects(service().change(bearer(revokedAdmin), input(customer)), denied(401));
});

test("self-targeting, Super Admin targets, forged fields and invalid UID/action rejected", async () => {
  await assert.rejects(service().change(bearer(), input(admin)), denied(403));
  const other = await session("super_admin");
  await assert.rejects(service().change(bearer(), input(other)), denied(403));
  for (const field of ["actorUid", "actorRole", "targetRole", "role", "accountStatus"]) {
    await assert.rejects(service().change(bearer(), { ...input(customer), [field]: "super_admin" }), denied(400));
  }
  for (const patch of [{ targetUid: "../users/admin" }, { action: "purge" }, { requestId: "short" }]) {
    await assert.rejects(service().change(bearer(), { ...input(customer), ...patch }), denied(400));
  }
});

test("all three roles disable/enable/soft-delete; history, approval, verification and Auth identity preserved", async () => {
  for (const role of ["customer", "technician", "dispatcher"]) {
    const target = await session(role);
    await db.doc(`service_requests/history-${target.uid}`).set({ customerId: target.uid, status: "completed" });
    await db.doc(`service_reviews/history-${target.uid}`).set({ customerId: target.uid, rating: 5 });
    const backend = service();
    for (const action of ["disable", "enable", "delete", "delete"]) {
      const body = input(target, action), result = await backend.change(bearer(), body);
      assert.equal(result.outcome, "complete");
      assert.deepEqual(await backend.change(bearer(), body), result);
      const profile = await data(`users/${target.uid}`), account = await auth.getUser(target.uid);
      assert.equal(profile.accountStatus, action === "enable" ? "active" : action === "delete" ? "deleted" : "disabled");
      assert.equal(profile.lifecyclePending, false); assert.equal(account.disabled, action !== "enable");
      assert.equal(profile.technicianApprovalStatus, "approved"); assert.equal(profile.emailVerified, true);
      assert.equal(account.emailVerified, true); assert.equal(account.email, target.email);
    }
    await assert.rejects(backend.change(bearer(), input(target, "enable")), (e) => e.code === "deleted-account");
    assert.ok(await data(`service_requests/history-${target.uid}`)); assert.ok(await data(`service_reviews/history-${target.uid}`));
    const audits = await db.collection("audit_logs").where("targetUid", "==", target.uid).get();
    assert.equal(audits.size, 4);
    for (const audit of audits.docs) {
      assert.equal(audit.data().actorUid, admin.uid); assert.equal(audit.data().targetRole, role);
      assert.equal(audit.data().outcome, "complete"); assert.ok(audit.data().completedAt.toMillis() > 0);
    }
  }
});

test("same and conflicting concurrent requests serialize; completed old request cannot undo a newer action", async () => {
  const target = await session("customer"), body = input(target);
  let enter, release;
  const entered = new Promise((resolve) => { enter = resolve; });
  const wait = new Promise((resolve) => { release = resolve; });
  const backend = service({ auth: proxyAuth({ updateUser: async (...args) => { enter(); await wait; return auth.updateUser(...args); } }) });
  const running = backend.change(bearer(), body); await entered;
  await assert.rejects(service().change(bearer(), body), (e) => e.code === "operation-in-progress");
  await assert.rejects(service().change(bearer(), input(target, "enable")), denied(409));
  release(); await running;
  const enabled = input(target, "enable");
  await service().change(bearer(), enabled);
  await assert.rejects(service().change(bearer(), body), (e) => e.code === "request-conflict");
  assert.equal((await data(`users/${target.uid}`)).accountStatus, "active");
  await service().change(bearer(), input(target, "delete"));
  await assert.rejects(service().change(bearer(), enabled), (e) => e.code === "deleted-account");
});

test("Auth failure leaves account gated, map revoked, audit retryable; retry reconciles once", async () => {
  const target = await session("technician"), body = input(target);
  for (const collection of ["technician_locations", "technician_map_locations"]) {
    await db.doc(`${collection}/${target.uid}`).set({ technicianId: target.uid, sharingEnabled: true, latitude: 7.29, longitude: 80.63 });
  }
  const backend = service({ auth: proxyAuth({ updateUser: async () => { throw new Error("Injected Auth outage"); } }) });
  await assert.rejects(backend.change(bearer(), body), (e) => e.code === "lifecycle-incomplete");
  const profile = await data(`users/${target.uid}`);
  assert.equal(profile.accountStatus, "disabled"); assert.equal(profile.lifecyclePending, true);
  assert.equal((await data(`technician_map_profiles/${target.uid}`)).approved, false);
  for (const collection of ["technician_locations", "technician_map_locations"]) {
    const location = await data(`${collection}/${target.uid}`);
    assert.deepEqual(Object.keys(location).sort(), ["sharingEnabled", "technicianId", "updatedAt"]);
    assert.equal(location.sharingEnabled, false);
  }
  await assert.rejects(service().change(bearer(), input(target, "enable")), (e) => e.code === "pending-action");
  await service().change(bearer(), body);
  assert.equal((await auth.getUser(target.uid)).disabled, true);
  const audits = await db.collection("audit_logs").where("targetUid", "==", target.uid).get();
  assert.equal(audits.size, 1); assert.equal(audits.docs[0].data().outcome, "complete");
  await service().change(bearer(), input(target, "enable"));
  assert.equal((await data(`technician_map_profiles/${target.uid}`)).approved, true);
  assert.equal((await data(`technician_map_locations/${target.uid}`)).sharingEnabled, false);
  assert.equal((await data(`users/${target.uid}`)).availability, "offline");
});

function failingTransactionDb(failOn) {
  let count = 0;
  return new Proxy(db, { get(target, key) {
    if (key === "runTransaction") return (...args) => {
      count++;
      if (count === failOn) return Promise.reject(new Error("Injected Firestore transaction failure"));
      return target.runTransaction(...args);
    };
    return typeof target[key] === "function" ? target[key].bind(target) : target[key];
  } });
}

test("initial Firestore failure makes no Auth changes; enable completion failure remains inaccessible and retryable", async () => {
  const target = await session("customer"), body = input(target);
  let authCalls = 0;
  await assert.rejects(service({ db: failingTransactionDb(1), auth: proxyAuth({ updateUser: async () => { authCalls++; } }) }).change(bearer(), body));
  assert.equal(authCalls, 0); assert.equal((await data(`users/${target.uid}`)).accountStatus, "active");
  await service().change(bearer(), body);
  const enable = input(target, "enable");
  await assert.rejects(service({ db: failingTransactionDb(2) }).change(bearer(), enable), (e) => e.code === "lifecycle-incomplete");
  assert.equal((await auth.getUser(target.uid)).disabled, false);
  const profile = await data(`users/${target.uid}`);
  assert.equal(profile.accountStatus, "disabled"); assert.equal(profile.lifecyclePending, true);
  await service().change(bearer(), enable);
  assert.equal((await data(`users/${target.uid}`)).accountStatus, "active");
});

test("refresh revocation failure is not success; missing Auth disable/delete safe, enable cannot invent an account", async () => {
  const target = await session("customer"), body = input(target);
  await assert.rejects(service({ auth: proxyAuth({ revokeRefreshTokens: async () => { throw new Error("Injected revoke failure"); } }) }).change(bearer(), body),
    (e) => e.code === "lifecycle-incomplete");
  assert.equal((await auth.getUser(target.uid)).disabled, true);
  await service().change(bearer(), body);
  const uid = `missing-${randomUUID()}`;
  await db.doc(`users/${uid}`).set({ uid, role: "customer", accountStatus: "active" });
  await service().change(bearer(), input({ uid }));
  await assert.rejects(service().change(bearer(), input({ uid }, "enable")), (e) => e.code === "lifecycle-incomplete");
  assert.equal((await data(`users/${uid}`)).accountStatus, "disabled");
});

test("stalled running lock is never stolen or silently enabled", async () => {
  const target = await session("customer");
  await db.doc(`account_lifecycle_locks/${target.uid}`).set({ operationId: randomUUID(), action: "disable", outcome: "running", startedMs: 0 });
  await assert.rejects(service().change(bearer(), input(target)), (e) => e.code === "operation-recovery-required");
});

test("old token denied protected reads/writes during disable and after enable; own status readable and fresh sign-in accepted", async () => {
  const target = await session("customer"), ref = clientDb.doc(target.db, "notifications", target.uid);
  await db.doc(`notifications/${target.uid}`).set({ userId: target.uid, title: "Local test" });
  assert.equal((await clientDb.getDocFromServer(ref)).exists(), true);
  await service().change(bearer(), input(target));
  await assert.rejects(clientDb.getDocFromServer(ref), (e) => e.code === "permission-denied");
  assert.equal((await clientDb.getDocFromServer(clientDb.doc(target.db, "users", target.uid))).data().accountStatus, "disabled");
  await assert.rejects(clientDb.updateDoc(clientDb.doc(target.db, "users", target.uid), { fullName: "Changed", updatedAt: clientDb.serverTimestamp() }), (e) => e.code === "permission-denied");
  await service().change(bearer(), input(target, "enable"));
  await assert.rejects(clientDb.getDocFromServer(ref), (e) => e.code === "permission-denied");
  // auth_time is second-resolution; strict cutoff intentionally rejects same-second sign-ins.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await signOut(target.auth); await signInWithEmailAndPassword(target.auth, target.email, password);
  assert.equal((await clientDb.getDocFromServer(ref)).exists(), true);
});

test("browser cannot change lifecycle fields, forge audits or access server operation documents", async () => {
  for (const patch of [{ accountStatus: "disabled" }, { sessionRevokedAt: 0 }, { lifecyclePending: false }, { deletedBy: admin.uid }]) {
    await assert.rejects(clientDb.updateDoc(clientDb.doc(admin.db, "users", customer.uid), { ...patch, updatedAt: clientDb.serverTimestamp() }), (e) => e.code === "permission-denied");
  }
  await assert.rejects(clientDb.setDoc(clientDb.doc(admin.db, "audit_logs", `forged-${randomUUID()}`), {
    action: "SUPER_ADMIN_DISABLED_CUSTOMER", actorUid: admin.uid, actorRole: "super_admin", targetUid: customer.uid,
    targetRole: "customer", targetType: "user", createdAt: clientDb.serverTimestamp(),
  }), (e) => e.code === "permission-denied");
  for (const collection of ["account_lifecycle_requests", "account_lifecycle_locks"]) {
    await assert.rejects(clientDb.getDocFromServer(clientDb.doc(admin.db, collection, customer.uid)), (e) => e.code === "permission-denied");
  }
});

test("HTTP endpoint and actual browser service preserve primary Super Admin session, use retry ID, and do not send actor/role", async () => {
  const target = await session("dispatcher"), attempts = [];
  const lifecycle = service();
  const server = createDispatcherServer({}, origin, { change: async (header, body) => {
    attempts.push(body); return lifecycle.change(header, body);
  } }); servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const primary = admin.auth.currentUser;
  const provisionExports = {}, lifecycleExports = {};
  let source = readFileSync(new URL("../../admin-web/src/services/dispatcherProvisioningService.ts", import.meta.url), "utf8");
  source = source.replace(/const settings = .*?\.env;/, `const settings = { VITE_DISPATCHER_API_URL: "${base}", DEV: true };`);
  const compile = (text) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("exports", "require", compile(source))(provisionExports, () => ({ auth: admin.auth }));
  new Function("exports", "require", compile(readFileSync(new URL("../../admin-web/src/services/accountLifecycleService.ts", import.meta.url), "utf8")))(lifecycleExports, () => provisionExports);
  await lifecycleExports.updateManagedAccountLifecycle({ actorUid: "forged-local-namespace", target: { uid: target.uid, role: "super_admin" }, action: "disable" });
  assert.deepEqual(Object.keys(attempts[0]).sort(), ["action", "requestId", "targetUid"]);
  assert.equal(admin.auth.currentUser, primary); assert.equal((await auth.getUser(admin.uid)).disabled, false);
  const audits = await db.collection("audit_logs").where("targetUid", "==", target.uid).get();
  assert.equal(audits.docs[0].data().actorUid, admin.uid); assert.equal(audits.docs[0].data().targetRole, "dispatcher");
  const response = await fetch(`${base}/v1/accounts/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input(target)) });
  assert.equal(response.status, 401);
});

test("technician public eligibility and all coordinates revoked atomically before Auth, stale map reads denied", async () => {
  const tech = await session("technician"), browser = await session("customer");
  await db.doc(`technician_map_profiles/${tech.uid}`).set({ technicianId: tech.uid, approved: true, fullName: "Local Technician" });
  await db.doc(`technician_map_locations/${tech.uid}`).set({ technicianId: tech.uid, sharingEnabled: true, latCell: 729, lngCell: 8063, updatedAt: Timestamp.now() });
  const publicRef = clientDb.doc(browser.db, "technician_map_locations", tech.uid);
  assert.equal((await clientDb.getDocFromServer(publicRef)).data().sharingEnabled, true);
  await service({ auth: proxyAuth({ updateUser: async (...args) => {
    assert.equal((await data(`users/${tech.uid}`)).accountStatus, "disabled");
    assert.equal((await data(`technician_map_profiles/${tech.uid}`)).approved, false);
    assert.equal((await data(`technician_map_locations/${tech.uid}`)).sharingEnabled, false);
    return auth.updateUser(...args);
  } }) }).change(bearer(), input(tech));
  await assert.rejects(clientDb.getDocFromServer(publicRef), (e) => e.code === "permission-denied");
});


test("enable preserves pending technician approval and unverified email; legacy status-only disable reconciles Auth", async () => {
  const target = await session("technician");
  await auth.updateUser(target.uid, { emailVerified: false });
  await db.doc(`users/${target.uid}`).update({ accountStatus: "disabled", technicianApprovalStatus: "pending", emailVerified: false });
  assert.equal((await auth.getUser(target.uid)).disabled, false);
  await service().change(bearer(), input(target));
  assert.equal((await auth.getUser(target.uid)).disabled, true);
  await service().change(bearer(), input(target, "enable"));
  const profile = await data(`users/${target.uid}`);
  assert.equal(profile.technicianApprovalStatus, "pending"); assert.equal(profile.emailVerified, false);
  assert.equal((await auth.getUser(target.uid)).emailVerified, false);
  assert.equal((await data(`technician_map_profiles/${target.uid}`)).approved, false);
  assert.equal((await data(`technician_map_locations/${target.uid}`)).sharingEnabled, false);
});

test("lost final commit response is confirmed from its receipt without undoing access state or duplicating audit", async () => {
  const target = await session("customer");
  let calls = 0;
  const storage = new Proxy(db, { get(value, key) {
    if (key === "runTransaction") return async (...args) => {
      calls++;
      const result = await value.runTransaction(...args);
      if (calls === 2) throw new Error("Injected lost commit acknowledgement");
      return result;
    };
    return typeof value[key] === "function" ? value[key].bind(value) : value[key];
  } });
  const result = await service({ db: storage }).change(bearer(), input(target));
  assert.equal(result.outcome, "complete");
  assert.equal((await data(`users/${target.uid}`)).lifecyclePending, false);
  const audits = await db.collection("audit_logs").where("targetUid", "==", target.uid).get();
  assert.equal(audits.size, 1); assert.equal(audits.docs[0].data().outcome, "complete");
});
