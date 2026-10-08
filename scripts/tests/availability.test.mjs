import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url), ts = require("typescript");
const availability = require("../../functions/lib/domain/availability.js");
const projection = require("../../functions/lib/domain/mapProjection.js");
function load(path, deps) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("exports", "require", code)(exports, (id) => {
    if (!(id in deps)) throw new Error(`Missing test dependency: ${id}`);
    return deps[id];
  });
  return exports;
}

test("three declared states share labels and booking gates; legacy and invalid values never confirm Available", () => {
  for (const [value, label, permitted] of [["available", "Available", true], ["busy", "Busy", false], ["offline", "Offline", false]]) {
    assert.equal(availability.readTechnicianAvailability(value), value);
    assert.equal(availability.availabilityDisplay(value).label, label);
    assert.equal(availability.availabilityDisplay(value).canRequest, permitted);
    if (permitted) assert.doesNotThrow(() => availability.requireAvailableTechnician(value));
    else assert.throws(() => availability.requireAvailableTechnician(value), /New requests require Available/);
  }
  for (const value of [undefined, null, "Available", "unknown", true, 1, {}, []]) {
    assert.equal(availability.readTechnicianAvailability(value), undefined);
    assert.equal(availability.availabilityDisplay(value).label, "Availability not set");
    assert.equal(availability.availabilityDisplay(value).canRequest, false);
    assert.throws(() => availability.requireAvailableTechnician(value));
  }
});

test("public projection copies only declared availability and never derives it from jobs, sharing or districts", () => {
  const profile = { role: "technician", fullName: "A Technician", technicianApprovalStatus: "approved",
    serviceDistrictIds: ["kandy"], sharingEnabled: true, completedJobs: 20, activeJobs: 2, address: "Private" };
  assert.equal("availability" in projection.buildMapProfile("tech", profile), false);
  for (const value of ["available", "busy", "offline"]) {
    const saved = projection.buildMapProfile("tech", { ...profile, availability: value });
    assert.equal(saved.availability, value);
    assert.equal("activeJobs" in saved, false); assert.equal("address" in saved, false); assert.equal("sharingEnabled" in saved, false);
  }
  assert.equal("availability" in projection.buildMapProfile("tech", { ...profile, availability: true }), false);
});

function lifecycleFixture(path) {
  const states = [], effects = [], subscriptions = [];
  let cursor = 0, authNext, authStopped = false;
  const auth = { currentUser: null };
  const react = { useState: (initial) => {
    const index = cursor++; if (!(index in states)) states[index] = initial;
    return [states[index], (value) => { states[index] = value; }];
  }, useEffect: (fn) => effects.push(fn()) };
  const subscribe = (kind) => (id, next, error) => {
    const listener = { kind, id, next, error, stopped: false }; subscriptions.push(listener);
    return () => { listener.stopped = true; };
  };
  const hook = load(path, {
    react, "expo-router": { useLocalSearchParams: () => ({ id: "existing-job" }) },
    "firebase/auth": { onAuthStateChanged: (_auth, next) => { authNext = next; return () => { authStopped = true; }; } },
    "@/src/firebase/config": { auth },
    "@/src/services/request.service": { subscribeToServiceRequest: subscribe("job"), subscribeToTechnicianRequests: subscribe("jobs") },
    "@/src/services/user.service": { subscribeToUserProfile: subscribe("profile"), getMobileAccessDecision: () => ({ allowed: true }) },
  });
  const render = () => { cursor = 0; react.useEffect = () => {}; return (hook.useTechnicianRequest ?? hook.useTechnicianWorkspace)(); };
  (hook.useTechnicianRequest ?? hook.useTechnicianWorkspace)();
  return { subscriptions, render, change: (uid) => { auth.currentUser = uid ? { uid } : null; authNext(auth.currentUser); },
    cleanup: () => { for (const effect of effects) effect?.(); assert.equal(authStopped, true); } };
}

for (const path of ["src/hooks/useTechnicianWorkspace.ts", "src/hooks/useTechnicianRequest.ts"]) {
  test(`${path}: logout/account switching removes listeners, clears availability/jobs and ignores old callbacks`, () => {
    const h = lifecycleFixture(path);
    h.change("first");
    const oldProfile = h.subscriptions.find((s) => s.kind === "profile");
    const oldJobs = h.subscriptions.find((s) => s.kind !== "profile");
    oldProfile.next({ uid: "first", role: "technician", availability: "available" });
    oldJobs.next(oldJobs.kind === "job" ? { id: "existing-job", technicianId: "first" } : [{ id: "existing-job" }]);
    assert.equal(h.render().profile.availability, "available");
    h.change("second");
    assert.equal(oldProfile.stopped, true); assert.equal(oldJobs.stopped, true);
    assert.equal(h.render().profile, null);
    oldProfile.next({ uid: "first", role: "technician", availability: "available" });
    oldJobs.error(new Error("late callback"));
    assert.equal(h.render().profile, null); assert.equal(h.render().errorMessage, "");
    h.subscriptions.find((s) => s.kind === "profile" && s.id === "second").next({ uid: "second", role: "technician", availability: "offline" });
    assert.equal(h.render().profile.availability, "offline");
    h.change(null); assert.equal(h.render().profile, null);
    assert.ok(h.subscriptions.every((s) => s.stopped));
    h.cleanup();
  });
}
