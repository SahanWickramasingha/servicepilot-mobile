import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import * as firestore from "firebase/firestore";
const require = createRequire(import.meta.url), ts = require("typescript");
function loadTs(path, deps = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("exports", "require", "__DEV__", code)(exports, (id) => {
    if (id === "firebase/functions") throw new Error("Map must not import callable Functions");
    return deps[id] ?? require(id);
  }, false);
  return exports;
}
const errors = loadTs("src/utils/mapServiceError.ts");
const app = initializeApp({ projectId: "demo-map-transport", apiKey: "emulator-only" }, "map-transport-test");
const db = firestore.getFirestore(app);
const domain = require("../../functions/lib/domain/map.js"), projection = require("../../functions/lib/domain/mapProjection.js");
let reply = [], failure, querySeen, verifiedReads = 0;
const service = loadTs("src/services/location.service.ts", {
  "firebase/firestore": { ...firestore,
    getDocsFromServer: async (query) => {
      querySeen = query._query;
      if (failure) throw failure;
      return { docs: reply.map(([id, data]) => ({ id, ref: firestore.doc(db, "technician_map_profiles", id), data: () => data })), size: reply.length };
    },
    getDocFromServer: async (ref) => { verifiedReads++; return { id: ref.id, data: () => reply.find(([id]) => id === ref.id)[1] }; },
  },
  "@/src/firebase/config": { app, auth: { currentUser: null }, db },
  "@/src/utils/mapServiceError": errors, "@/functions/src/domain/map": domain,
  "@/functions/src/domain/mapProjection": projection,
});
after(async () => { await firestore.terminate(db); await deleteApp(app); });

test("bounded district/category Firestore queries verify approval without Functions", async () => {
  reply = [["fixture-tech", { fullName: "Fixture Technician", specialization: "Electrical", serviceDistrictIds: ["kandy"], averageRating: 4, reviewCount: 3 }]];
  const page = await service.getMapTechnicianPage("kandy", "Electrical", "earlier-tech");
  assert.equal(page.items[0].uid, "fixture-tech"); assert.equal(verifiedReads, 1);
  assert.equal(querySeen.path.canonicalString(), "technician_map_profiles"); assert.equal(querySeen.limit, 8);
  assert.deepEqual(querySeen.filters.map((filter) => [filter.field.canonicalString(), filter.op]), [["approved", "=="], ["serviceDistrictIds", "array-contains"], ["serviceCategory", "=="]]);
  assert.equal(querySeen.startAt.position[0].referenceValue.endsWith("/technician_map_profiles/earlier-tech"), true);
});
test("permission/authentication, offline and service errors remain distinct", async () => {
  for (const [code, kind] of [["permission-denied", "access"], ["unauthenticated", "access"], ["unavailable", "network"], ["deadline-exceeded", "network"], ["resource-exhausted", "service"], ["failed-precondition", "service"]]) {
    failure = { code };
    await assert.rejects(service.getMapTechnicians("kandy"), (error) => {
      assert.equal(error.kind, kind);
      assert.match(errors.mapServiceErrorMessage(error), kind === "access" ? /verified Customer/ : kind === "network" ? /connection and retry/ : /retry/i);
      return true;
    });
  }
  failure = undefined;
});
test("empty directory succeeds without follow-up profile reads", async () => {
  reply = []; const before = verifiedReads;
  assert.deepEqual(await service.getMapTechnicians("jaffna"), []); assert.equal(verifiedReads, before);
});
test("invalid district never starts a Firestore query", async () => {
  const before = querySeen;
  await assert.rejects(service.getMapTechnicians("invented"), /valid service district/); assert.equal(querySeen, before);
});
