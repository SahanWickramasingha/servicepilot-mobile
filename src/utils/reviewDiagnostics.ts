export type ReviewQueryStage = "head-listener" | "head-refresh" | "overall-summary" | "dated-count" | "dated-page" | "legacy-page" | "confirmation-timeout";
export type ReviewQueryTarget = { projectId?: string; databaseId: string; emulator: boolean };

/** Only allow known server sentences into diagnostics. Arbitrary Firebase messages
 * can contain document paths, field values or credentials; never log the error object. */
export function reviewFailureDetails(error: unknown) {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = typeof value?.code === "string" && /^(?:firestore\/)?[a-z-]+$/.test(value.code)
    ? value.code.replace(/^firestore\//, "") : "unknown";
  const message = typeof value?.message === "string" ? value.message : "";
  const sentences = message.match(/The query requires an index\.|That index is currently building and cannot be used yet\.|The index is not ready(?: yet)?\.|Missing or insufficient permissions\.|The client is offline\./gi);
  const reason = code === "failed-precondition"
    ? /index.*(?:building|not ready)/i.test(message) ? "index-building"
      : /query requires an index/i.test(message) ? "index-required" : "other-precondition"
    : code === "permission-denied" ? "access-denied"
      : ["unavailable", "deadline-exceeded"].includes(code) ? "network" : "other";
  return { code, reason, serverMessage: sentences?.join(" ") || "Nonstandard message omitted for privacy." };
}

export function reportReviewQueryFailure(error: unknown, stage: ReviewQueryStage, target?: ReviewQueryTarget) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.warn("[ServicePilot reviews]", {
    ...target, stage, collection: "service_reviews", ...reviewFailureDetails(error),
    filters: "technicianId == target; rating in [1,2,3,4,5]",
    ordering: stage === "overall-summary" ? "none; count + average(rating)"
      : stage === "legacy-page" ? "documentId DESC; limit 20"
        : "createdAt DESC, documentId DESC; pages limited to 20; dated count unbounded aggregate",
  });
}
