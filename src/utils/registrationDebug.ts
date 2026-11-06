type FirebaseLikeError = {
  code?: unknown;
  message?: unknown;
};

type RegistrationLogPayload = {
  step: string;
  uid?: string | null;
  firebaseErrorCode?: string | null;
  firebaseErrorMessage?: string | null;
  [key: string]: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function getFirebaseErrorCode(error: unknown): string | null {
  return asString((error as FirebaseLikeError | undefined)?.code);
}

export function getFirebaseErrorMessage(error: unknown): string | null {
  return asString((error as FirebaseLikeError | undefined)?.message);
}

const failureStages = new Set([
  "auth-create", "recovery-authentication", "profile-initialization", "profile-create",
  "profile-existence-read", "profile-create-transaction", "profile-server-confirmation",
  "send-verification", "registration-cleanup", "profile-payload-validation", "profile-existing-validation", "unknown",
  "verification-check", "verification-refresh", "profile-email-verification",
]);
const firestoreCodes = new Set([
  "cancelled", "unknown", "invalid-argument", "deadline-exceeded", "not-found", "already-exists",
  "permission-denied", "resource-exhausted", "failed-precondition", "aborted", "out-of-range",
  "unimplemented", "internal", "unavailable", "data-loss", "unauthenticated",
]);

// One JSON line survives release logcat formatting. No raw error, account ID,
// message, credential or payload is serialized, including in development.
export function logRegistrationFailure(error: unknown, fallbackStage: string, context?: {
  appVersion?: unknown; projectId?: unknown;
}): void {
  const step = (error as { registrationStep?: unknown } | null)?.registrationStep;
  const stage = typeof step === "string" && failureStages.has(step) ? step :
    failureStages.has(fallbackStage) ? fallbackStage : "unknown";
  const originalCode = getFirebaseErrorCode(error);
  const code = originalCode && (firestoreCodes.has(originalCode) || /^(auth|firestore|registration)\/[a-z][a-z0-9-]{0,63}$/.test(originalCode)) ? originalCode : "registration/unknown";
  const appVersion = typeof context?.appVersion === "string" && /^\d{1,8}(\.\d{1,8}){0,3}([+-][A-Za-z0-9.-]{1,32})?$/.test(context.appVersion) ? context.appVersion : "unknown";
  const projectId = typeof context?.projectId === "string" && /^[a-z][a-z0-9-]{4,62}$/.test(context.projectId) ? context.projectId : "unknown";
  console.warn(`[registration-failure] ${JSON.stringify({ stage, code, appVersion, projectId })}`);
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");

  if (!name || !domain) {
    return "[invalid-email-format]";
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return `***${digits.slice(-2)}`;
}

function describeString(value: string) {
  const trimmed = value.trim();

  return {
    present: trimmed.length > 0,
    length: trimmed.length,
  };
}

function safeProfileValue(fieldName: string, value: unknown): unknown {
  if (value === undefined) {
    return "[undefined]";
  }

  if (value === null) {
    return "[null]";
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return "[non-primitive-value]";
  }

  switch (fieldName) {
    case "uid":
    case "role":
    case "technicianApprovalStatus":
    case "emailVerified":
    case "specialization":
    case "experience":
    case "serviceAreas":
    case "serviceDivision":
      return value.trim();

    case "email":
      return maskEmail(value.trim().toLowerCase());

    case "phone":
      return maskPhone(value);

    case "fullName":
    case "address":
    case "qualifications":
    case "certifications":
      return describeString(value);

    default:
      return describeString(value);
  }
}

export function getSafeProfileDebugValues(
  profilePayload: Record<string, unknown>
) {
  const fieldNames = Object.keys(profilePayload);
  const safeValues = fieldNames.reduce<Record<string, unknown>>(
    (accumulator, fieldName) => {
      accumulator[fieldName] = safeProfileValue(
        fieldName,
        profilePayload[fieldName]
      );

      return accumulator;
    },
    {}
  );

  return {
    profileFieldNames: fieldNames,
    safeProfileValues: safeValues,
  };
}

export function logRegistrationDebug(payload: RegistrationLogPayload): void {
  // Legacy call sites may still construct payloads; never print them.
  void payload;
}

export function logRegistrationError(payload: RegistrationLogPayload): void {
  // The coordinator reports the original failure once using the strict schema.
  void payload;
}
