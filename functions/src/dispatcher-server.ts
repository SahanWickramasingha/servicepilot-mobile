import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ProvisioningError, type createDispatcherProvisioner } from "./services/dispatcher-provisioning.service";

import type { createAccountLifecycleService } from "./services/account-lifecycle.service";

type Provisioner = ReturnType<typeof createDispatcherProvisioner>;
export function createDispatcherServer(provisioner: Provisioner, allowedOrigin: string, lifecycle?: ReturnType<typeof createAccountLifecycleService>) {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Vary", "Origin");
    const origin = request.headers.origin;
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body));
    };
    if (origin && origin !== allowedOrigin) {
      reply(403, { code: "permission-denied", message: "This origin is not allowed." });
      return;
    }
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204); response.end(); return;
    }
    const action = request.url === "/v1/dispatchers" ? provisioner.create :
      request.url === "/v1/dispatchers/resend-invitation" ? provisioner.resend :
        request.url === "/v1/accounts/lifecycle" ? lifecycle?.change : null;
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
      reply(200, await action(request.headers.authorization, body));
    } catch (error) {
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
