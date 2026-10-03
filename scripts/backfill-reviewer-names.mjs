import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { backfillReviewerName, ReviewerNameBackfillError } from "./lib/reviewer-name-backfill.mjs";

const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { applicationDefault, cert, initializeApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore } = requireFromFunctions("firebase-admin/firestore");
const PROJECT_ID = "servicepilot-756d9";

function credential() {
  const specifiedPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const defaultPath = ["service-account.json", "serviceAccountKey.json"]
    .map((name) => fileURLToPath(new URL(`../secrets/${name}`, import.meta.url)))
    .find(existsSync);
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const path = specifiedPath || defaultPath;
  if (!rawKey && !path) return applicationDefault();
  let key;
  try {
    key = JSON.parse(rawKey || readFileSync(path, "utf8"));
  } catch {
    throw new ReviewerNameBackfillError("Unable to read local Admin credentials. Credential contents will not be logged.");
  }
  if (key.project_id !== PROJECT_ID) throw new ReviewerNameBackfillError("Admin credential project does not match servicepilot-756d9.");
  return cert(key);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { apply: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--apply" && !options.apply) options.apply = true;
    else if (arg === "--review-id" && !options.reviewId) options.reviewId = args[++index];
    else if (arg === "--expected-name" && options.expectedName === undefined) options.expectedName = args[++index];
    else throw new ReviewerNameBackfillError("Usage: node scripts/backfill-reviewer-names.mjs --review-id <id> [--expected-name <name> --apply]");
    if ((arg === "--review-id" || arg === "--expected-name") && (!args[index] || args[index].startsWith("--"))) {
      throw new ReviewerNameBackfillError("Missing argument value.");
    }
  }
  if (!options.reviewId) throw new ReviewerNameBackfillError("--review-id is required; broad production migrations are not supported.");
  if (options.apply && !options.expectedName) throw new ReviewerNameBackfillError("--apply requires --expected-name from the verified dry-run.");
  return options;
}

async function main() {
  const options = parseArgs();
  const app = initializeApp({ projectId: PROJECT_ID, credential: credential() });
  const db = getFirestore(app); // Explicitly use this project's (default) database.
  const timeout = setTimeout(() => {
    console.error("Reviewer-name operation timed out. Re-run a dry-run to check its state.");
    process.exit(1);
  }, 45000);
  try {
    const proposal = await backfillReviewerName(db, options);
    // Only names and identity references; never comments, profile documents, or credentials.
    console.log(JSON.stringify({
      projectId: PROJECT_ID,
      databaseId: "(default)",
      dryRun: !options.apply,
      reviewerNameChanges: proposal ? [proposal] : [],
    }, null, 2));
  } finally {
    clearTimeout(timeout);
    await db.terminate();
  }
}

main().catch((error) => {
  // Do not dump SDK errors: they may include credential paths or internal details.
  const safeMessage = error instanceof ReviewerNameBackfillError
    ? error.message : `Reviewer-name operation failed (code: ${String(error?.code ?? "unknown")}).`;
  console.error(safeMessage);
  process.exitCode = 1;
});
