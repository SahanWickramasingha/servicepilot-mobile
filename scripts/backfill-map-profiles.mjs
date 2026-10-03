// Trusted local Admin SDK only. Default dry-run; no credentials or private documents logged.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { backfillMapProfile } from "./lib/map-profile-backfill.mjs";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { applicationDefault, cert, initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const PROJECT = "servicepilot-756d9";
class InputError extends Error {}
function parseArgs() {
  const options = { apply: false, all: false };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply") options.apply = true;
    else if (args[i] === "--all") options.all = true;
    else if (args[i] === "--technician-id") options.uid = args[++i];
    else if (args[i] === "--confirm-project") options.confirm = args[++i];
    else throw new InputError("Usage: node scripts/backfill-map-profiles.mjs (--all | --technician-id <uid>) [--apply --confirm-project servicepilot-756d9]");
  }
  if (options.all === !!options.uid || options.uid && (!/^[^/]+$/.test(options.uid) || options.uid.startsWith("--"))) throw new InputError("Choose exactly one: --all or --technician-id <uid>.");
  if (options.apply && options.confirm !== PROJECT) throw new InputError("Apply requires --confirm-project servicepilot-756d9 after reviewing the dry-run.");
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new InputError("Unset FIRESTORE_EMULATOR_HOST before this explicitly project-scoped migration. Tests call the helper on demo fixtures.");
  return options;
}
function credential() {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    ["service-account.json", "serviceAccountKey.json"].map((name) => fileURLToPath(new URL(`../secrets/${name}`, import.meta.url))).find(existsSync);
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!path && !raw) return applicationDefault();
  let key;
  try { key = JSON.parse(raw || readFileSync(path, "utf8")); } catch { throw new InputError("Unable to read local Admin credentials. Contents will not be logged."); }
  if (key.project_id !== PROJECT) throw new InputError("Admin credential project must match servicepilot-756d9.");
  return cert(key);
}
async function main() {
  const options = parseArgs();
  const app = initializeApp({ projectId: PROJECT, credential: credential() }), db = getFirestore(app);
  const timeout = setTimeout(() => { console.error("Migration timed out. Inspect a new dry-run before retrying."); process.exit(1); }, 120000);
  try {
    // Stream in bounded pages; never load all private profiles at once.
    const proposals = [], skipped = [];
    async function inspect(uid) {
      try { const change = await backfillMapProfile(db, uid, options.apply); if (change) proposals.push(change); }
      catch (error) { if (["A Technician display name is required.", "Technician rating fields require validation.", "Technician service districts require validation."].includes(error.message)) skipped.push({ technicianId: uid, reason: error.message }); else throw error; }
    }
    if (options.uid) await inspect(options.uid);
    else {
      let cursor;
      do {
        let query = db.collection("users").where("role", "==", "technician").orderBy("__name__").limit(100);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        for (const item of page.docs) await inspect(item.id);
        cursor = page.size === 100 ? page.docs.at(-1) : undefined;
      } while (cursor);
    }
    console.log(JSON.stringify({ projectId: PROJECT, databaseId: "(default)", dryRun: !options.apply, mapProfileChanges: proposals, skipped }, null, 2));
  } finally { clearTimeout(timeout); await db.terminate(); await deleteApp(app); }
}
main().catch((error) => { console.error(error instanceof InputError ? error.message : `Map migration failed (code: ${String(error?.code ?? "unknown")}). Credential contents are never logged.`); process.exitCode = 1; });
