import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const policy = {};
new Function("exports", ts.transpileModule(readFileSync(new URL("../../functions/src/domain/booking.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(policy);

test("booking actors require the authoritative active role and approval; absent legacy accountStatus stays compatible", () => {
  for (const role of ["customer", "technician"]) {
    const valid = { role, technicianApprovalStatus: "approved" };
    policy.bookingAccount(valid, role);
    policy.bookingAccount({ ...valid, accountStatus: "active" }, role);
    for (const profile of [undefined, { ...valid, role: "dispatcher" }, { ...valid, accountStatus: "disabled" },
      { ...valid, accountStatus: "deleted" }, { ...valid, accountStatus: "unknown" }, { ...valid, lifecyclePending: true }]) {
      assert.throws(() => policy.bookingAccount(profile, role), (error) => error.code === "booking/account");
    }
    if (role === "technician") assert.throws(() => policy.bookingAccount({ ...valid, technicianApprovalStatus: "pending" }, role));
  }
});

test("saved request technician identity supports current and legacy records and rejects conflicts or missing IDs", () => {
  for (const job of [{ technicianId: "tech" }, { assignedTechnicianId: "tech" }, { technicianId: "", assignedTechnicianId: "tech" },
    { technicianId: "tech", assignedTechnicianId: "tech" }]) assert.equal(policy.bookingTechnician(job), "tech");
  for (const job of [{}, { technicianId: 1 }, { technicianId: "tech-a", assignedTechnicianId: "tech-b" }]) {
    assert.throws(() => policy.bookingTechnician(job), (error) => error.code === "booking/conflict");
  }
});

test("the existing request state machine permits only established actions, including legacy statuses", () => {
  const statuses = ["requested", "pending", "accepted", "assigned", "in_progress", "completed", "cancelled", "rejected"];
  const targets = ["accepted", "rejected", "in_progress", "completed", "cancelled"];
  for (const actor of ["customer", "technician"]) for (const from of statuses) for (const to of targets) {
    const allowed = actor === "customer" ? ["requested", "pending"].includes(from) && to === "cancelled"
      : ["requested", "pending"].includes(from) && ["accepted", "rejected"].includes(to)
        || ["accepted", "assigned"].includes(from) && ["in_progress", "cancelled"].includes(to)
        || from === "in_progress" && to === "completed";
    if (allowed) policy.requireBookingTransition(from, to, actor);
    else assert.throws(() => policy.requireBookingTransition(from, to, actor), /already changed/);
  }
});

test("conflict, account, permission and ambiguous-network failures provide an actionable retry without claiming persistence", () => {
  const conflict = new policy.BookingError("booking/conflict", "Refresh this booking.");
  assert.equal(policy.actionableBookingError(conflict), conflict);
  for (const [code, expected] of [["permission-denied", /Verify your account/], ["unauthenticated", /Verify your account/],
    ["unavailable", /retry the same submission/], ["deadline-exceeded", /retry the same submission/], ["aborted", /Refresh/]]) {
    const error = policy.actionableBookingError(Object.assign(new Error("Technical details"), { code }));
    assert.equal(error.code, code); assert.match(error.message, expected); assert.ok(!error.message.includes("Technical details"));
  }
});
