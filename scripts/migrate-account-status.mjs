import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const requireFromFunctions = createRequire(
  new URL("../functions/package.json", import.meta.url)
);

const {
  applicationDefault,
  cert,
  initializeApp,
} = requireFromFunctions("firebase-admin/app");
const {
  FieldValue,
  getFirestore,
} = requireFromFunctions("firebase-admin/firestore");

const PROJECT_ID = "servicepilot-756d9";
const TARGET_ROLES = ["customer", "technician"];
const DRY_RUN = process.env.DRY_RUN !== "false";

function readServiceAccountCredential() {
  const keyPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    "secrets/service-account.json";
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!rawKey) {
    if (existsSync(keyPath)) {
      return cert(JSON.parse(readFileSync(keyPath, "utf8")));
    }

    return applicationDefault();
  }

  try {
    return cert(JSON.parse(rawKey));
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY must be valid service-account JSON."
    );
  }
}

async function commitBatchIfNeeded(batch, operationCount) {
  if (operationCount === 0 || DRY_RUN) {
    return;
  }

  await batch.commit();
}

async function main() {
  initializeApp({
    credential: readServiceAccountCredential(),
    projectId: PROJECT_ID,
  });

  const db = getFirestore();
  const snapshot = await db
    .collection("users")
    .where("role", "in", TARGET_ROLES)
    .get();

  let scanned = 0;
  let missingStatus = 0;
  let updated = 0;
  let skippedWithStatus = 0;
  let batch = db.batch();
  let batchOperations = 0;

  for (const docSnapshot of snapshot.docs) {
    scanned += 1;

    const data = docSnapshot.data();

    if (Object.prototype.hasOwnProperty.call(data, "accountStatus")) {
      skippedWithStatus += 1;
      continue;
    }

    missingStatus += 1;
    updated += 1;

    if (!DRY_RUN) {
      batch.update(docSnapshot.ref, {
        accountStatus: "active",
        updatedAt: FieldValue.serverTimestamp(),
      });
      batchOperations += 1;

      if (batchOperations >= 450) {
        await batch.commit();
        batch = db.batch();
        batchOperations = 0;
      }
    }
  }

  await commitBatchIfNeeded(batch, batchOperations);

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        roles: TARGET_ROLES,
        scanned,
        missingStatus,
        updated: DRY_RUN ? 0 : updated,
        wouldUpdate: DRY_RUN ? updated : 0,
        skippedWithStatus,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Account status migration failed."
  );
  process.exitCode = 1;
});
