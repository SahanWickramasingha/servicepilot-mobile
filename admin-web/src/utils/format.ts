export function timestampMillis(value: unknown): number {
  if (!value) {
    return 0;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const millis = new Date(value).getTime();
    return Number.isNaN(millis) ? 0 : millis;
  }

  return 0;
}

export function formatDateTime(value: unknown): string {
  const millis = timestampMillis(value);

  if (!millis) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(millis));
}

export function formatDate(value: unknown): string {
  const millis = timestampMillis(value);

  if (!millis) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(millis));
}

export function displayText(value: unknown, fallback = "Not provided") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

export function statusLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "Unknown";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function initials(name?: string, email?: string): string {
  const source = name?.trim() || email?.trim() || "SA";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
