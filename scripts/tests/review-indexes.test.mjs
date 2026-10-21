import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { performanceTestDependency } from "../lib/performance-test-deps.mjs";
import { renderHarness } from "../lib/performance-render-harness.mjs";

function load(path, deps = {}, dev = false, logger = console) {
  const result = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", "__DEV__", "console", code)(result, (id) => {
    if (id in deps) return deps[id];
    const shared = performanceTestDependency(id, deps); if (shared) return shared;
    throw new Error(`Missing dependency ${id}`);
  }, dev, logger);
  return result;
}
const rating = load("src/utils/technicianRating.ts");
const readJson = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));

test("diagnostics distinguish missing/building indexes from other preconditions and omit arbitrary private message content", () => {
  const logs = [], logger = { warn: (...args) => logs.push(args) };
  const diagnostics = load("src/utils/reviewDiagnostics.ts", {}, true, logger);
  const target = { projectId: "servicepilot-756d9", databaseId: "(default)", emulator: false };
  for (const [code, message, reason] of [
    ["failed-precondition", "The query requires an index. You can create it here: https://console.firebase.google.com/?token=secret", "index-required"],
    ["firestore/failed-precondition", "The query requires an index. That index is currently building and cannot be used yet.", "index-building"],
    ["failed-precondition", "Some unrelated precondition: users/private-customer. Feedback: private", "other-precondition"],
    ["permission-denied", "Missing or insufficient permissions. Bearer secret", "access-denied"],
    ["unavailable", "The client is offline. private comment", "network"],
  ]) {
    const error = Object.assign(new Error(message), { code });
    assert.equal(diagnostics.reviewFailureDetails(error).reason, reason);
    diagnostics.reportReviewQueryFailure(error, "head-listener", target);
  }
  const serialized = JSON.stringify(logs);
  assert.ok(!/secret|private-customer|private comment|Feedback|Bearer/.test(serialized));
  assert.ok(serialized.includes("The query requires an index."));
  assert.ok(serialized.includes('"databaseId":"(default)"'));
  assert.equal(logs[0][1].code, "failed-precondition");
  load("src/utils/reviewDiagnostics.ts", {}, false, logger).reportReviewQueryFailure(new Error("private"), "legacy-page", target);
  assert.equal(logs.length, 5, "Production builds do not log review failures");
});

function serviceFixture() {
  const reads = [], listeners = [], auth = { currentUser: { uid: "technician" } };
  const result = { docs: [], metadata: { fromCache: false, hasPendingWrites: false } };
  const sdk = {
    collection: (_, name) => ({ collection: name, constraints: [] }),
    query: (source, ...constraints) => ({ ...source, constraints: [...source.constraints, ...constraints] }),
    where: (field, op, value) => ({ kind: "filter", field, op, value }),
    orderBy: (field, direction = "asc") => ({ kind: "order", field, direction }),
    documentId: () => "__name__", limit: (value) => ({ kind: "limit", value }), startAfter: (...values) => ({ kind: "cursor", values }),
    count: () => "count", average: (field) => ({ average: field }),
    onSnapshot: (query, options, next) => { listeners.push({ query, next }); return () => {}; },
    getAggregateFromServer: async (query, fields) => { reads.push({ stage: "summary", query, fields }); return { data: () => ({ count: 0, average: null }) }; },
    getCountFromServer: async (query) => { reads.push({ stage: "dated-count", query }); return { data: () => ({ count: 0 }) }; },
    getDocsFromServer: async (query) => { reads.push({ stage: "page", query }); return result; },
  };
  const service = load("src/services/technician.service.ts", { "firebase/firestore": sdk, "@/src/firebase/config": { auth, db: {} },
    "@/src/constants/serviceRequests": {}, "@/functions/src/domain/map": {}, "@/functions/src/domain/serviceAreas": {},
    "@/functions/src/domain/mapProjection": {}, "@/functions/src/domain/availability": {}, "@/src/utils/technicianRating": rating });
  return { service, reads, listeners, result };
}

// Equality/IN fields form the index prefix; either prefix field order is valid.
// __name__ inherits the last field's direction unless explicitly configured.
function covers(index, source) {
  if (index.collectionGroup !== source.collection || index.queryScope !== "COLLECTION") return false;
  const fields = index.fields.map((field) => ({ ...field }));
  if (fields.at(-1)?.fieldPath !== "__name__") fields.push({ fieldPath: "__name__", order: fields.at(-1).order });
  const filters = source.constraints.filter((c) => c.kind === "filter");
  const prefix = fields.slice(0, filters.length);
  if (!filters.every((filter) => prefix.some((field) => field.fieldPath === filter.field && field.order))) return false;
  const ordered = source.constraints.filter((c) => c.kind === "order");
  const tail = fields.slice(filters.length);
  return ordered.length ? ordered.every((order, i) => tail[i]?.fieldPath === order.field && tail[i]?.order === order.direction.toUpperCase().replace("DESC", "DESCENDING").replace(/^ASC$/, "ASCENDING"))
    : tail.length === 1 && tail[0].fieldPath === "__name__" && tail[0].order === "ASCENDING";
}

test("the configured production index file covers actual head, cursor pages, legacy ordering and full-history aggregation queries", async () => {
  const config = readJson("firebase.json"), indexes = readJson(config.firestore.indexes).indexes;
  assert.equal(config.firestore.indexes, "firestore.indexes.json");
  assert.equal(readJson(".firebaserc").projects.default, "servicepilot-756d9");
  const f = serviceFixture(), stop = f.service.subscribeToTechnicianReviews("technician", () => {}, (error) => { throw error; });
  try {
    f.listeners[0].next(f.result); await new Promise((resolve) => setImmediate(resolve));
    await f.service.getTechnicianReviewsPage("technician", { kind: "dated", createdAt: "timestamp", id: "last", includeUndated: true });
    await f.service.getTechnicianReviewsPage("technician", { kind: "undated", id: "legacy-last" });
    assert.equal(f.reads.length, 4);
    for (const source of [f.listeners[0].query, ...f.reads.map((read) => read.query)]) {
      assert.deepEqual(source.constraints.filter((c) => c.kind === "filter"), [
        { kind: "filter", field: "technicianId", op: "==", value: "technician" },
        { kind: "filter", field: "rating", op: "in", value: [1, 2, 3, 4, 5] },
      ]);
      assert.ok(indexes.some((index) => covers(index, source)), JSON.stringify(source));
    }
    const summary = f.reads.find((read) => read.stage === "summary");
    assert.deepEqual(summary.fields, { count: "count", average: { average: "rating" } });
    for (const read of f.reads.filter((read) => read.stage !== "page")) {
      assert.ok(!read.query.constraints.some((c) => ["limit", "cursor"].includes(c.kind)), "Full summary must never inherit a page limit or cursor");
    }
    for (const source of [f.listeners[0].query, ...f.reads.filter((read) => read.stage === "page").map((read) => read.query)]) {
      assert.deepEqual(source.constraints.filter((c) => c.kind === "limit"), [{ kind: "limit", value: 20 }]);
    }
    const pages = f.reads.filter((read) => read.stage === "page");
    assert.deepEqual(pages.map((read) => read.query.constraints.find((c) => c.kind === "cursor").values), [["timestamp", "last"], ["legacy-last"]]);
    const reversed = indexes.map((index) => ({ ...index, fields: index.fields.map((field) => field.fieldPath === "createdAt" ? { ...field, order: "ASCENDING" } : field) }));
    assert.ok(!reversed.some((index) => covers(index, f.listeners[0].query)), "An incorrect ordering direction must fail this audit");
  } finally { stop(); }
});

test("customer profile uses one concise failure with one working Retry and retains technician details/service actions", () => {
  for (const status of ["error", "stale"]) {
    let retries = 0;
    const technician = { uid: "technician", fullName: "Gihan", specialization: "Electrical", serviceDivision: "Kandy", availability: "available" };
    const ratings = { status, summary: status === "stale" ? { count: 0, average: 0 } : null,
      reviews: [], errorMessage: "Reviews are temporarily unavailable.", retry: () => retries++ };
    const h = renderHarness("app/(tabs)/technician-profile.tsx", { initial: [technician, false, ""], dependencies: {
      "expo-router": { router: {}, useLocalSearchParams: () => ({ id: "technician" }) },
      "firebase/auth": {}, "@/src/firebase/config": { auth: { currentUser: { uid: "customer" } } },
      "@/src/services/technician.service": {}, "@/src/hooks/useTechnicianReviews": { useTechnicianReviews: () => ratings },
      "@/src/components/reviews/ReviewPhotos": { ReviewPhotos: "ReviewPhotos" },
    } });
    try {
      h.render();
      const feedback = h.elements().find((element) => typeof element.type === "function" && element.type.name === "TechnicianRatingStatus");
      feedback.type(feedback.props);
      const texts = h.elements().filter((element) => element.type === "Text").map((element) => [element.props.children].flat(Infinity).join(""));
      assert.equal(texts.filter((text) => text === ratings.errorMessage).length, 1);
      assert.ok(texts.includes("Professional Details")); assert.ok(texts.some((text) => text.includes("Request Service")));
      assert.ok(!texts.includes("No reviews yet")); assert.ok(!texts.includes("No ratings yet"));
      const buttons = h.elements().filter((element) => element.type === "TouchableOpacity" && element.props.accessibilityLabel === "Retry reviews");
      assert.equal(buttons.length, 1); buttons[0].props.onPress(); assert.equal(retries, 1);
    } finally { h.cleanup(); }
  }
});
