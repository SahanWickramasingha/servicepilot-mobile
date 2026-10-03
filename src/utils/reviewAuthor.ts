/** Legacy placeholders are not author snapshots. Customer profiles stay private. */
export function normalizeReviewAuthorName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return name && name.toLowerCase() !== "customer" ? name : undefined;
}

export function getReviewDisplayName(review: { customerName?: string }): string | undefined {
  // Absence is unresolved identity, never a role or the current viewer's name.
  return normalizeReviewAuthorName(review.customerName);
}

export function getReviewerInitials(name: string | undefined): string {
  const author = normalizeReviewAuthorName(name);
  return author
    ? author.split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join("")
    : "?";
}
