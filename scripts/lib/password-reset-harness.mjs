import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
export function loadResetModule(path, dependencies = {}) {
  const result = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, allowJs: true },
  }).outputText;
  new Function("exports", "require", code)(result, (id) => {
    assert.ok(id in dependencies, `Unexpected test dependency: ${id}`); return dependencies[id];
  });
  return result;
}
export function resetDom() {
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { value: "", textContent: "", type: "password", hidden: true, disabled: false,
      attributes: {}, callbacks: new Map(), focus() {},
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(event, callback) { this.callbacks.set(event, callback); },
      removeEventListener(event) { this.callbacks.delete(event); },
    });
    return nodes.get(id);
  } };
  document.getElementById("resetFields").disabled = true;
  const node = document.getElementById;
  return { document, node, event: (id, event = "submit") => node(id).callbacks.get(event)?.({ preventDefault() {} }) };
}
export const resetController = loadResetModule("public/auth/action-controller.js");
export function deferredReset() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
