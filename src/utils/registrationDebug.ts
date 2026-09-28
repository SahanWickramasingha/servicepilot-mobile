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

const isRegistrationDebugEnabled =
  (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ === true;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function getFirebaseErrorCode(error: unknown): string | null {
  return asString((error as FirebaseLikeError | undefined)?.code);
}

export function getFirebaseErrorMessage(error: unknown): string | null {
  return asString((error as FirebaseLikeError | undefined)?.message);
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
  if (!isRegistrationDebugEnabled) {
    return;
  }

  console.log("[registration-debug]", payload);
}

export function logRegistrationError(payload: RegistrationLogPayload): void {
  if (!isRegistrationDebugEnabled) {
    return;
  }

  console.error("[registration-debug]", payload);
}
