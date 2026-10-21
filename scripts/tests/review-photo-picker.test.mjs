import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path, deps = {}) {
  const exports = {};
  new Function("exports", "require", ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports, (id) => {
    if (id in deps) return deps[id];
    if (id === "@/src/utils/reviewValidation") return load("src/utils/reviewValidation.ts");
    throw new Error(`Unexpected dependency ${id}`);
  }); return exports;
}
function pickerFixture({ assets = [{ uri: "source", width: 4000, height: 3000 }], canceled = false, denied = false, badSource = false, badOutput = false } = {}) {
  let options, savedOptions, uploadInput; const resizes = [];
  const jpeg = new Uint8Array([255, 216, 255, 224]), png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const originalFetch = globalThis.fetch, originalReader = globalThis.FileReader;
  globalThis.fetch = async (uri) => ({ blob: async () => {
    const data = uri === "output" ? badOutput ? png : jpeg : badSource ? new Uint8Array([0, 1, 2]) : png;
    return { size: data.length, data };
  } });
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { this.result = blob.data.buffer; this.onload(); }
  };
  const service = load("src/services/reviewPhotos.service.ts", {
    "expo-image-picker": { launchImageLibraryAsync: async (input) => { options = input;
      if (denied) throw new Error("Permission denied"); return { canceled, assets };
    } },
    "expo-image-manipulator": { SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: () => ({
      resize: (size) => resizes.push(size), release() {}, renderAsync: async () => ({ release() {}, saveAsync: async (input) => {
        savedOptions = input; return { uri: "output" };
      } }),
    }) } },
    "firebase/storage": { ref: (_, path) => path, uploadBytesResumable: (path, data, metadata) => {
      uploadInput = { path, data, metadata };
      return { cancel() {}, on: (_, progress, _fail, complete) => { queueMicrotask(() => { progress({ bytesTransferred: data.size, totalBytes: data.size }); complete(); }); } };
    } }, "@/src/firebase/config": { auth: { currentUser: { uid: "owner" }, onAuthStateChanged: () => () => {} }, storage: {} },
  });
  return { service, resizes, options: () => options, saveOptions: () => savedOptions,
    uploadInput: () => uploadInput,
    cleanup: () => { globalThis.fetch = originalFetch; globalThis.FileReader = originalReader; } };
}
test("the system picker requests only images, bounds selection, resizes and re-encodes validated bytes without prefilled content or broad permissions", async () => {
  const f = pickerFixture();
  try {
    const result = await f.service.pickReviewPhotos(3);
    assert.deepEqual(f.options().mediaTypes, ["images"]); assert.equal(f.options().selectionLimit, 3);
    assert.equal(f.options().allowsEditing, false); assert.equal(f.options().exif, false);
    assert.deepEqual(f.resizes, [{ width: 1600 }]); assert.deepEqual(f.saveOptions(), { format: "jpeg", compress: 0.8 });
    assert.deepEqual(result, [{ uri: "output", size: 4 }]);
  } finally { f.cleanup(); }
});
test("native uploads pass the selected file Blob to Firebase, avoiding unsupported typed-array Blob construction, and report progress", async () => {
  const f = pickerFixture(), progress = [];
  try {
    await f.service.uploadReviewPhoto("review_photos/owner/job_owner/abcdefghijklmnopqrst/0.jpg", { uri: "output", size: 4 },
      { customerId: "owner", requestId: "job", technicianId: "tech" }, "abcdefghijklmnopqrst", (fraction) => progress.push(fraction));
    assert.equal(f.uploadInput().data instanceof Uint8Array, false);
    assert.equal(f.uploadInput().data.size, 4); assert.deepEqual(progress, [1]);
    assert.equal(f.uploadInput().metadata.customMetadata.published, "false");
  } finally { f.cleanup(); }
});
test("cancellation and permission denial produce no selected photos, and the 5-photo limit cannot be bypassed", async () => {
  for (const config of [{ canceled: true }, { denied: true }, { assets: Array(6).fill({ uri: "source", width: 1, height: 1 }) }]) {
    const f = pickerFixture(config);
    try {
      if (config.canceled) assert.deepEqual(await f.service.pickReviewPhotos(5), []);
      else await assert.rejects(f.service.pickReviewPhotos(5), config.denied ? /denied/ : /at most/);
      await assert.rejects(f.service.pickReviewPhotos(0), /up to 5/);
    } finally { f.cleanup(); }
  }
});
test("forged image types, oversized files, excessive decoded dimensions and invalid processed output reject the whole selection", async () => {
  for (const config of [{ badSource: true }, { badOutput: true }, { assets: [{ uri: "source", width: 1, height: 1, fileSize: 16 * 1024 * 1024 }] },
    { assets: [{ uri: "source", width: 10000, height: 10000 }] }, { assets: [{ uri: "source", width: 0, height: NaN }] }]) {
    const f = pickerFixture(config);
    try { await assert.rejects(f.service.pickReviewPhotos(5)); } finally { f.cleanup(); }
  }
});
