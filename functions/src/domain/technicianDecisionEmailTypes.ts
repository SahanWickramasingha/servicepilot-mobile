/** Public response contract; no server implementation or provider credentials. */
export type DecisionEmailStatus = "not_requested" | "pending" | "submitted" | "failed" | "not_configured" | "unknown";
export type DecisionEmailResult = { technicianUid: string; revision: string; status: DecisionEmailStatus; retryable: boolean };
export type DecisionEmailMessage = { from: string; to: string[]; subject: string; text: string; html: string };
