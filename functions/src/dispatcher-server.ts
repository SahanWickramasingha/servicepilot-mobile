import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { ProvisioningError, type createDispatcherProvisioner } from "./services/dispatcher-provisioning.service";

import type { createAccountLifecycleService } from "./services/account-lifecycle.service";
import type { createBookingScheduleService } from "./services/booking-schedule.service";

type Provisioner = ReturnType<typeof createDispatcherProvisioner>;
export function createDispatcherServer(provisioner: Provisioner | null, allowedOrigin: string | undefined, lifecycle?: ReturnType<typeof createAccountLifecycleService>, scheduling?: ReturnType<typeof createBookingScheduleService>, bookingOrigin?: string, readiness?: () => Promise<boolean>) {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const booking = request.url === "/v1/bookings/schedule";
    const supplied = request.headers["x-booking-correlation-id"];
    const correlationId = typeof supplied === "string" && /^booking-[a-zA-Z0-9-]{8,80}$/.test(supplied) ? supplied : `booking-${randomUUID()}`;
    const started = Date.now();
    let requestTag: string | undefined;
    const trace = (stage: string, code?: unknown) => {
      if (!booking) return;
      const safeCode = typeof code === "number" || (typeof code === "string" && /^[a-zA-Z0-9/-]{1,64}$/.test(code)) ? code : undefined;
      console.info("[booking-trace]", JSON.stringify({ correlationId, requestTag, stage, code: safeCode,
        elapsedMs: Date.now() - started, status: response.statusCode,
        contentType: response.getHeader("Content-Type"), aborted: request.aborted }));
    };
    if (booking) {
      response.setHeader("X-Booking-Correlation-ID", correlationId);
      trace("received");
      response.once("finish", () => trace("response"));
      response.once("close", () => { if (!response.writableFinished) trace("connection-closed"); });
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Vary", "Origin");
    const origin = request.headers.origin;
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body));
    };
    if (request.method === "GET" && request.url === "/healthz") {
      reply(200, { status: "ok" }); return;
    }
    if (request.method === "GET" && request.url === "/readyz") {
      let ready = false;
      try { ready = readiness ? await readiness() : false; } catch { /* Fail closed; never expose provider details. */ }
      reply(ready ? 200 : 503, { status: ready ? "ready" : "unavailable" }); return;
    }
    if (origin && origin !== allowedOrigin && !(request.url === "/v1/bookings/schedule" && origin === bookingOrigin)) {
      reply(403, { code: "permission-denied", message: "This origin is not allowed." });
      return;
    }
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Booking-Correlation-ID");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204); response.end(); return;
    }
    const action = request.url === "/v1/dispatchers" ? provisioner?.create :
      request.url === "/v1/dispatchers/resend-invitation" ? provisioner?.resend :
        request.url === "/v1/accounts/lifecycle" ? lifecycle?.change :
          request.url === "/v1/bookings/schedule" ? scheduling?.change : null;
    if (request.method !== "POST" || !action) {
      reply(404, { code: "not-found", message: "Endpoint not found." }); return;
    }
    try {
      if (request.headers["content-type"]?.split(";")[0] !== "application/json") {
        throw new ProvisioningError(415, "invalid-argument", "A JSON request is required.");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 4096) throw new ProvisioningError(413, "invalid-argument", "Request body is too large.");
        chunks.push(Buffer.from(chunk));
      }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new ProvisioningError(400, "invalid-argument", "A valid JSON request is required.");
      }
      const candidateId = (body as { requestId?: unknown } | null)?.requestId;
      if (booking && typeof candidateId === "string") {
        requestTag = createHash("sha256").update(candidateId).digest("hex").slice(0, 16);
      }
      reply(200, booking && scheduling ? await scheduling.change(request.headers.authorization, body, trace) : await action(request.headers.authorization, body));
    } catch (error) {
      trace("failed", (error as { code?: unknown })?.code);
      if (response.destroyed) return;
      console.warn("Trusted backend request failed", {
        code: error instanceof ProvisioningError ? error.code : "unavailable",
      });
      if (error instanceof ProvisioningError) {
        reply(error.status, { code: error.code, message: error.message });
      } else {
        // No headers, body, token, mail content, or raw provider error is logged.
        reply(503, { code: "unavailable", message: "The backend is unavailable. Retry the same request shortly." });
      }
    }
  });
}
