// Generate a separate demo-only static site. Never change the production files.
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const root = resolve(".expo/password-reset-emulator");
await mkdir(join(root, "auth"), { recursive: true });
await mkdir(join(root, "assets/images"), { recursive: true });
for (const name of ["action.html", "action-controller.js"]) await copyFile(`public/auth/${name}`, join(root, "auth", name));
await copyFile("public/assets/images/servicepilot-logo.png", join(root, "assets/images/servicepilot-logo.png"));
await writeFile(join(root, "auth/action-config.js"), `export const actionConfig = ${JSON.stringify({
  firebase: { apiKey: "emulator-only", projectId: "demo-servicepilot-review-author", authDomain: "demo-servicepilot-review-author.firebaseapp.com" },
  mobileSignIn: "servicepilotmobile://login", webSignIn: "/", emulatorUrl: "http://127.0.0.1:9197",
})};\n`);
await writeFile(join(root, "index.html"), "<!doctype html><meta name=referrer content=no-referrer><title>Local ServicePilot Auth</title><p>Demo reset site only. Return to the mobile app to sign in. No production Firebase connection is configured here.</p>");
console.info("Prepared isolated demo auth site for loopback Hosting port 5008. Production files unchanged.");
