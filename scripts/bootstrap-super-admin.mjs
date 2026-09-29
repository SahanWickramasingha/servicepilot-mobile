import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const requireFromFunctions = createRequire(
  new URL("../functions/package.json", import.meta.url)
);

const {
  applicationDefault,
  cert,
  initializeApp,
} = requireFromFunctions("firebase-admin/app");
const { getAuth } = requireFromFunctions("firebase-admin/auth");
const {
  FieldValue,
  getFirestore,
} = requireFromFunctions("firebase-admin/firestore");

const PROJECT_ID = "servicepilot-756d9";

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

async function readBootstrapInput() {
  const rl = createInterface({ input, output });

  try {
    const envEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    const email =
      envEmail ||
      (
        await rl.question("Super Admin email: ")
      ).trim().toLowerCase();

    const envName = process.env.SUPER_ADMIN_FULL_NAME?.trim();
    const fullName =
      envName ||
      (
        await rl.question("Super Admin full name [ServicePilot Admin]: ")
      ).trim() ||
      "ServicePilot Admin";

    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!email) {
      throw new Error("SUPER_ADMIN_EMAIL is required.");
    }

    return {
      email,
      fullName,
      password,
    };
  } finally {
    rl.close();
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const { email, fullName, password } = await readBootstrapInput();

  if (!validateEmail(email)) {
    throw new Error("Super Admin email is invalid.");
  }

  initializeApp({
    credential: readServiceAccountCredential(),
    projectId: PROJECT_ID,
  });

  const auth = getAuth();
  const db = getFirestore();

  let user;

  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }

    if (!password) {
      throw new Error(
        "SUPER_ADMIN_PASSWORD is required when creating a new Super Admin Auth user."
      );
    }

    user = await auth.createUser({
      email,
      password,
      displayName: fullName,
      disabled: false,
      emailVerified: false,
    });
  }

  await auth.updateUser(user.uid, {
    displayName: fullName,
    disabled: false,
  });

  const profileRef = db.collection("users").doc(user.uid);
  const profileSnapshot = await profileRef.get();
  const now = FieldValue.serverTimestamp();

  await profileRef.set(
    {
      uid: user.uid,
      fullName,
      email,
      role: "super_admin",
      accountStatus: "active",
      createdAt: profileSnapshot.exists
        ? profileSnapshot.data()?.createdAt ?? now
        : now,
      updatedAt: now,
    },
    { merge: true }
  );

  console.log(
    `Super Admin bootstrap complete for ${email} (uid: ${user.uid}).`
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Super Admin bootstrap failed."
  );
  process.exitCode = 1;
});
