// Standalone Node entry. Deliberately NOT exported from the Cloud Functions index.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createTransport } from "nodemailer";
import { env } from "node:process";
import { URL } from "node:url";
import process from "node:process";
import { setTimeout, clearTimeout } from "node:timers";
import { createDispatcherServer } from "./dispatcher-server";
import { createDispatcherProvisioner } from "./services/dispatcher-provisioning.service";

import { createAccountLifecycleService } from "./services/account-lifecycle.service";
import { createBookingScheduleService } from "./services/booking-schedule.service";
import { createBookingReadiness } from "./services/booking-readiness";

const emulatorMode = env.DISPATCHER_MODE === "emulator";
// Default preserves the combined Admin Web host. The local booking profile
// mounts only scheduling; it needs neither SMTP nor Auth account-management IAM.
const services = env.DISPATCHER_SERVICES ?? "all";
if (!["all", "booking"].includes(services)) throw new Error("DISPATCHER_SERVICES must be all or booking.");
const bookingOnly = services === "booking";
const projectId = env.GOOGLE_CLOUD_PROJECT;
if (env.BOOKING_RUNTIME_PRODUCTION === "1" && (env.DISPATCHER_MODE !== "production" || services !== "booking" || projectId !== "servicepilot-756d9")) {
  throw new Error("Release booking hosting requires production booking-only mode and servicepilot-756d9.");
}
if (!projectId || !["emulator", "production"].includes(env.DISPATCHER_MODE ?? "")) {
  throw new Error("Set DISPATCHER_MODE and GOOGLE_CLOUD_PROJECT explicitly.");
}
if (emulatorMode) {
  if (!projectId.startsWith("demo-") || ![env.FIREBASE_AUTH_EMULATOR_HOST, env.FIRESTORE_EMULATOR_HOST]
    .every((host) => /^(127\.0\.0\.1|localhost):\d+$/.test(host ?? ""))) {
    throw new Error("Emulator mode requires a demo project and loopback Auth/Firestore emulators.");
  }
} else if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Production mode must not use Firebase emulator endpoints.");
}
const origin = env.DISPATCHER_ADMIN_ORIGIN;
if ((!bookingOnly && !origin) || (origin && (new URL(origin).origin !== origin ||
  (!emulatorMode && !origin.startsWith("https://"))))) {
  throw new Error("Set DISPATCHER_ADMIN_ORIGIN to the exact trusted web origin (HTTPS in production).");
}
const app = initializeApp({ projectId, ...(emulatorMode ? {} : { credential: applicationDefault() }) });
const readiness = createBookingReadiness(async () => {
  await Promise.all([
    // A nonexistent probe UID establishes Auth read access without creating a user.
    getAuth(app).getUser("servicepilot-readiness-probe").catch((error: { code?: string }) => {
      if (error.code !== "auth/user-not-found") throw error;
    }),
    getFirestore(app).doc("_runtime_health/booking").get(),
  ]);
});
const smtpPort = Number(env.DISPATCHER_SMTP_PORT);
if (!bookingOnly && !emulatorMode && (!env.DISPATCHER_SMTP_HOST || !env.DISPATCHER_SMTP_USER || !env.DISPATCHER_SMTP_PASSWORD ||
  !env.DISPATCHER_SMTP_FROM || /[\r\n]/.test(env.DISPATCHER_SMTP_FROM) || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
  throw new Error("Configure the dispatcher SMTP host, port, user, password and from address on the server.");
}
const transport = emulatorMode || bookingOnly ? null : createTransport({
  host: env.DISPATCHER_SMTP_HOST, port: smtpPort, secure: smtpPort === 465, requireTLS: smtpPort !== 465,
  auth: { user: env.DISPATCHER_SMTP_USER, pass: env.DISPATCHER_SMTP_PASSWORD },
  connectionTimeout: 15000, socketTimeout: 20000, logger: false, debug: false,
});
const provisioner = bookingOnly ? null : createDispatcherProvisioner({
  auth: getAuth(app), db: getFirestore(app), continueUrl: `${origin}/login`,
  sendSetupEmail: async (email, resetLink) => {
    if (!transport) return "emulated"; // No external email, and never claim it was delivered.
    const receipt = await transport.sendMail({
      from: env.DISPATCHER_SMTP_FROM, to: { name: "", address: email }, subject: "Set up your ServicePilot Dispatcher account",
      text: `You have been invited to ServicePilot as a Dispatcher. Set your password using this Firebase link:\n\n${resetLink}\n\nIf you did not expect this invitation, contact your ServicePilot administrator.`,
    });
    if (!receipt.accepted?.length || receipt.rejected?.length) throw new Error("Invitation was not accepted by the mail transport.");
    return "sent";
  },
});
const port = Number(env.PORT ?? 8789);
const bookingOrigin = env.BOOKING_WEB_ORIGIN;
if (bookingOrigin && (new URL(bookingOrigin).origin !== bookingOrigin || (!emulatorMode && !bookingOrigin.startsWith("https://")))) {
  throw new Error("BOOKING_WEB_ORIGIN must be an exact trusted web origin (HTTPS in production).");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid provisioning server port.");
const server = createDispatcherServer(provisioner, origin,
  bookingOnly ? undefined : createAccountLifecycleService({ auth: getAuth(app), db: getFirestore(app) }),
  createBookingScheduleService({ auth: getAuth(app), db: getFirestore(app) }), bookingOrigin, readiness);
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(port, emulatorMode ? "127.0.0.1" : (env.DISPATCHER_BIND_ADDRESS ?? "127.0.0.1"), () => {
  console.info(bookingOnly ? "Standalone booking server ready" : "Dispatcher provisioning server ready", { mode: env.DISPATCHER_MODE, services, port });
});
let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => {
  if (shuttingDown) return;
  shuttingDown = true;
  // Stop accepting new work, drain existing requests, then let the platform stop
  // the process. Lost acknowledgements still reconcile/retry idempotently.
  const deadline = setTimeout(() => process.exit(1), 25000);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); process.exit(0); });
});
