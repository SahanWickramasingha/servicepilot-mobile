import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const output = ts.transpileModule(readFileSync(new URL("../../src/utils/foregroundSharing.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exports = {};
const errorExports = {};
new Function("exports", ts.transpileModule(readFileSync(new URL("../../src/utils/locationSharingError.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(errorExports);
new Function("exports", "require", output)(exports, (id) => id === "./locationSharingError" ? errorExports :
  ({ validCoordinate: (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 }));
const { ForegroundSharing } = exports;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(overrides = {}) {
  const state = { now: 100000, writes: [], removed: 0, timerRemoved: 0, permissionPrompts: [], watch: undefined, heartbeat: undefined };
  const point = () => ({ latitude: 6.9271, longitude: 79.8612, sampledAt: state.now, accuracy: 15 });
  const adapter = { now: () => state.now, permission: async (prompt) => { state.permissionPrompts.push(prompt); return true; },
    servicesEnabled: async () => true, current: async () => point(),
    watch: async (next, error) => { state.watch = next; state.watchError = error; return () => { state.removed++; }; },
    every: (callback, ms) => { assert.equal(ms, 90000); state.heartbeat = callback; return () => { state.timerRemoved++; }; },
    after: (callback, ms) => { state.pending = { callback, ms }; return () => { state.pending = undefined; }; },
    publish: async (uid, p) => { state.writes.push({ uid, point: p }); }, ...overrides };
  return { state, point, sharing: new ForegroundSharing(adapter), adapter };
}

test("opt-in permission, movement/time throttling, heartbeat, OFF and cleanup", async () => {
  const { state, point, sharing } = fixture();
  await sharing.setSession("tech-a");
  assert.equal(state.writes.length, 1); assert.equal(state.writes[0].point, undefined);
  assert.equal(sharing.getSnapshot().enabled, false);
  await sharing.enable();
  assert.equal(sharing.getSnapshot().status, "sharing"); assert.deepEqual(state.permissionPrompts, [true]);
  const initialWrites = state.writes.length;
  state.now += 10000; state.watch({ ...point(), latitude: 6.94 }); await flush();
  assert.equal(state.writes.length, initialWrites);
  state.now += 50000; state.watch({ ...point(), latitude: 6.94 }); await flush();
  assert.equal(state.writes.length, initialWrites + 1);
  state.now += 16000; state.watch({ ...point(), latitude: 6.94001 }); await flush();
  assert.equal(state.writes.length, initialWrites + 1);
  state.now += 90000; state.heartbeat(); await flush();
  assert.equal(state.writes.length, initialWrites + 2);
  await sharing.stop();
  assert.equal(state.removed, 1); assert.equal(state.timerRemoved, 1);
  assert.equal(state.writes.at(-1).point, undefined); assert.equal(sharing.getSnapshot().status, "off");
  state.watch(point()); await flush(); assert.equal(state.writes.at(-1).point, undefined);
  await sharing.cleanup(); await sharing.enable(); assert.equal(sharing.getSnapshot().enabled, false);
});

test("permission refusal and GPS failure revoke and present explicit error without a watcher", async () => {
  for (const overrides of [{ permission: async () => false }, { servicesEnabled: async () => false },
    { current: async () => { throw new Error("GPS unavailable"); } }]) {
    const { sharing, state } = fixture(overrides);
    await sharing.setSession("tech-a"); await sharing.enable();
    assert.equal(sharing.getSnapshot().enabled, false); assert.equal(sharing.getSnapshot().status, "error");
    assert.match(sharing.getSnapshot().error, /permission|GPS|services/);
    assert.equal(state.writes.at(-1).point, undefined);
  }
});

test("background stops the watcher and revokes, foreground resumes without permission prompt", async () => {
  const { sharing, state } = fixture();
  await sharing.setSession("tech-a"); await sharing.enable();
  await sharing.setActive(false);
  assert.equal(state.removed, 1); assert.equal(state.timerRemoved, 1);
  assert.equal(sharing.getSnapshot().status, "paused"); assert.equal(state.writes.at(-1).point, undefined);
  await sharing.setActive(true);
  assert.equal(sharing.getSnapshot().status, "sharing"); assert.deepEqual(state.permissionPrompts, [true, false]);
  await sharing.cleanup(); assert.equal(state.removed, 2);
});

test("OFF during pending permission never starts GPS or republishes", async () => {
  let resolvePermission;
  const { sharing, state } = fixture({ permission: () => new Promise((resolve) => { resolvePermission = resolve; }) });
  await sharing.setSession("tech-a"); const enabling = sharing.enable();
  await sharing.stop(); resolvePermission(true); await enabling;
  assert.equal(state.watch, undefined); assert.equal(sharing.getSnapshot().status, "off");
  assert.ok(state.writes.every((w) => !w.point));
});

test("OFF waits behind an in-flight write; its removal wins over late GPS callbacks", async () => {
  let release;
  const { sharing, state, point } = fixture();
  await sharing.setSession("tech-a");
  const originalPublish = sharing.adapter.publish;
  sharing.adapter.publish = async (uid, p) => { if (p) await new Promise((resolve) => { release = resolve; }); await originalPublish(uid, p); };
  const enabling = sharing.enable(); await flush();
  assert.ok(release); const stopping = sharing.stop(); state.watch(point()); release();
  await Promise.all([enabling, stopping]);
  assert.equal(state.writes.at(-1).point, undefined); assert.equal(sharing.getSnapshot().status, "off");
  assert.equal(state.timerRemoved, 0); assert.equal(state.removed, 1);
});

test("failed server revocation blocks logout completion, retry succeeds", async () => {
  const { sharing, state } = fixture(); await sharing.setSession("tech-a"); await sharing.enable();
  const originalPublish = sharing.adapter.publish;
  sharing.adapter.publish = async () => { throw new Error("offline"); };
  await assert.rejects(sharing.stop(), /before signing out/);
  assert.equal(state.removed, 1); assert.equal(sharing.getSnapshot().revokeFailed, true);
  sharing.adapter.publish = originalPublish; await sharing.stop();
  assert.equal(sharing.getSnapshot().status, "off"); assert.equal(sharing.getSnapshot().revokeFailed, false);
});

test("old cleanup cannot clear a new account session", async () => {
  const { sharing, state } = fixture(); await sharing.setSession("tech-a");
  const cleaning = sharing.cleanup(); const newSession = sharing.setSession("tech-b");
  await Promise.all([cleaning, newSession]); await sharing.enable();
  assert.equal(state.writes.at(-1).uid, "tech-b"); assert.ok(state.writes.at(-1).point);
  await sharing.cleanup();
});

test("old or invalid GPS data is not published and sharing is revoked", async () => {
  for (const bad of [{ latitude: 91, longitude: 80, sampledAt: 100000 },
    { latitude: 7, longitude: 80, sampledAt: 0 }, { latitude: 7, longitude: 80, sampledAt: 100000, accuracy: 4000 }]) {
    const { sharing, state } = fixture({ current: async () => bad });
    await sharing.setSession("tech-a"); await sharing.enable();
    assert.ok(state.writes.every((w) => !w.point)); assert.equal(sharing.getSnapshot().status, "error");
  }
});

test("switch stays OFF during acquisition and publishing, then enables only after the first saved fix", async () => {
  let deliver, save;
  const { sharing, point, adapter } = fixture({ current: () => new Promise((resolve) => { deliver = resolve; }) });
  await sharing.setSession("tech-a");
  const original = adapter.publish;
  adapter.publish = async (uid, p) => { if (p) await new Promise((resolve) => { save = resolve; }); await original(uid, p); };
  const enabling = sharing.enable(); await flush();
  assert.equal(sharing.getSnapshot().status, "starting"); assert.equal(sharing.getSnapshot().enabled, false);
  deliver(point()); await flush();
  assert.ok(save); assert.equal(sharing.getSnapshot().enabled, false);
  save(); await enabling;
  assert.equal(sharing.getSnapshot().status, "sharing"); assert.equal(sharing.getSnapshot().enabled, true);
  await sharing.stop();
});

test("acquisition timeout and publishing denial are distinct; Retry acquires and saves again", async () => {
  const { sharing, adapter, point, state } = fixture();
  let attempts = 0;
  adapter.current = async () => {
    attempts++;
    if (attempts === 1) throw new errorExports.LocationSharingError("acquisition", "location/acquisition-timeout", "Location acquisition timed out.");
    return point();
  };
  await sharing.setSession("tech-a"); await sharing.enable();
  assert.match(sharing.getSnapshot().error, /acquisition timed out/); assert.equal(sharing.getSnapshot().enabled, false);
  const publish = adapter.publish;
  adapter.publish = async (uid, p) => { if (p) throw Object.assign(new Error("Denied fixture"), { code: "permission-denied" }); await publish(uid, p); };
  await sharing.enable();
  assert.match(sharing.getSnapshot().error, /saving was denied/); assert.doesNotMatch(sharing.getSnapshot().error, /GPS.*unavailable/);
  assert.equal(sharing.getSnapshot().enabled, false);
  adapter.publish = publish; await sharing.enable();
  assert.equal(attempts, 3); assert.equal(sharing.getSnapshot().status, "sharing");
  assert.ok(state.writes.at(-1).point); await sharing.stop();
});

test("OFF cancels a pending acquisition and late callbacks cannot publish", async () => {
  let cancelled;
  const { sharing, state } = fixture({ current: (signal) => new Promise((_, reject) => {
    cancelled = signal;
    signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
  }) });
  await sharing.setSession("tech-a"); const enabling = sharing.enable(); await flush();
  await sharing.stop(); await enabling;
  assert.equal(cancelled.aborted, true); assert.equal(sharing.getSnapshot().status, "off");
  assert.ok(state.writes.every((write) => !write.point));
});

test("a newer watch fix during startup replaces the acquisition fix before the first publication", async () => {
  const { sharing, state, point, adapter } = fixture();
  const initial = point(), newer = { ...initial, latitude: 7.095, longitude: 80.865, sampledAt: initial.sampledAt + 1 };
  adapter.watch = async (next) => { state.watch = next; next(newer); return () => state.removed++; };
  await sharing.setSession("tech-a"); await sharing.enable();
  assert.deepEqual(state.writes.at(-1).point, newer);
  await sharing.stop();
});

test("movement during an in-flight first save is retained, throttled and cannot regress to an older callback", async () => {
  const { sharing, state, point, adapter } = fixture(); let release;
  await sharing.setSession("tech-a");
  const publish = adapter.publish;
  adapter.publish = async (uid, fix) => { if (fix && !release) await new Promise((resolve) => { release = resolve; }); await publish(uid, fix); };
  const starting = sharing.enable(); await flush();
  const older = point(); state.now += 1000;
  const moved = { ...point(), latitude: 7.095, longitude: 80.865 };
  state.watch(moved); release(); await starting; await flush();
  assert.equal(state.writes.filter((write) => write.point).length, 1); assert.ok(state.pending);
  state.now += 60000; state.watch(older); await flush();
  assert.equal(sharing.getSnapshot().status, "sharing");
  // A recent callback preserves the same device coordinate and allows the bounded write.
  state.watch({ ...moved, sampledAt: state.now }); await flush();
  assert.deepEqual(state.writes.at(-1).point, { ...moved, sampledAt: state.now });
  assert.equal(state.pending, undefined); await sharing.stop();
});

test("a single throttled movement is published at the next allowed interval; OFF cancels its pending write", async () => {
  const { sharing, state, point } = fixture();
  await sharing.setSession("tech-a"); await sharing.enable();
  const initial = state.writes.length;
  state.now += 1000; const moved = { ...point(), latitude: 7.095, longitude: 80.865 };
  state.watch(moved); await flush();
  assert.equal(state.writes.length, initial); assert.equal(state.pending.ms, 59000);
  const due = state.pending.callback; state.pending = undefined; state.now += 59000; due(); await flush();
  assert.equal(state.writes.length, initial + 1); assert.deepEqual(state.writes.at(-1).point, moved);
  state.now += 1000; state.watch({ ...point(), latitude: 7.295, longitude: 80.635 }); await flush();
  const cancelled = state.pending.callback;
  await sharing.stop(); assert.equal(state.pending, undefined);
  const stopped = state.writes.length; state.now += 59000; cancelled(); await flush();
  assert.equal(state.writes.length, stopped); assert.equal(state.writes.at(-1).point, undefined);
});

test("a previous account's in-flight save cannot throttle the new technician's first fix", async () => {
  const { sharing, state, adapter } = fixture(); let release;
  const publish = adapter.publish;
  adapter.publish = async (uid, point) => {
    if (uid === "tech-a" && point) await new Promise((resolve) => { release = resolve; });
    await publish(uid, point);
  };
  await sharing.setSession("tech-a"); const previous = sharing.enable(); await flush();
  const changed = sharing.setSession("tech-b"); release(); await previous; await changed;
  await sharing.enable();
  assert.equal(state.writes.at(-1).uid, "tech-b"); assert.ok(state.writes.at(-1).point);
  assert.equal(sharing.getSnapshot().status, "sharing"); await sharing.stop();
});
