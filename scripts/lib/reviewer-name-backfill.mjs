export class ReviewerNameBackfillError extends Error {}

function validId(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && !value.includes("/");
}

function realName(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().toLowerCase() !== "customer";
}

/** Only repair missing/placeholder snapshots; preserve real historical author snapshots. */
export function proposeReviewerNameChange(reviewId, review, customer, serviceRequest) {
  if (!validId(reviewId) || !review ||
      ![review.customerId, review.technicianId, review.requestId].every(validId)) {
    throw new ReviewerNameBackfillError("The review must have valid persisted identity fields.");
  }
  if (!serviceRequest || serviceRequest.customerId !== review.customerId || serviceRequest.status !== "completed") {
    throw new ReviewerNameBackfillError("The review is not linked to its customer's completed request.");
  }
  const current = validId(serviceRequest.technicianId) ? serviceRequest.technicianId : undefined;
  const legacy = validId(serviceRequest.assignedTechnicianId) ? serviceRequest.assignedTechnicianId : undefined;
  if ((current && legacy && current !== legacy) || (current ?? legacy) !== review.technicianId) {
    throw new ReviewerNameBackfillError("The request's canonical technician does not match the review.");
  }
  if (!customer || customer.role !== "customer" ||
      (customer.uid !== undefined && customer.uid !== review.customerId)) {
    throw new ReviewerNameBackfillError("The review author does not have a matching Customer profile.");
  }
  if (realName(review.customerName)) return null;
  if (!realName(customer.fullName) || customer.fullName.length > 80) {
    throw new ReviewerNameBackfillError("The authoritative Customer profile has no usable author name.");
  }
  return {
    reviewId,
    technicianId: review.technicianId,
    customerId: review.customerId,
    requestId: review.requestId,
    customerName: { from: review.customerName ?? null, to: customer.fullName },
  };
}

export async function backfillReviewerName(db, { reviewId, apply = false, expectedName }) {
  if (!validId(reviewId)) throw new ReviewerNameBackfillError("Provide a single valid --review-id.");
  if (apply && !realName(expectedName)) {
    throw new ReviewerNameBackfillError("--apply requires the --expected-name verified in the dry-run.");
  }
  const reviewRef = db.collection("service_reviews").doc(reviewId);
  const inspect = async (reader) => {
    const snapshot = await reader.get(reviewRef);
    if (!snapshot.exists) throw new ReviewerNameBackfillError("Review not found.");
    const review = snapshot.data();
    if (![review.customerId, review.technicianId, review.requestId].every(validId)) {
      throw new ReviewerNameBackfillError("The persisted review has invalid identity fields.");
    }
    const customer = await reader.get(db.collection("users").doc(review.customerId));
    const request = await reader.get(db.collection("service_requests").doc(review.requestId));
    const proposal = proposeReviewerNameChange(reviewId, review, customer.data(), request.data());
    if (proposal && expectedName !== undefined && proposal.customerName.to !== expectedName) {
      throw new ReviewerNameBackfillError("The authoritative author name differs from --expected-name; run a new dry-run.");
    }
    return proposal;
  };
  if (!apply) return inspect({ get: (ref) => ref.get() });
  // Re-read every authoritative document on retries. A competing repair cannot be overwritten.
  return db.runTransaction(async (transaction) => {
    const proposal = await inspect(transaction);
    if (proposal) transaction.update(reviewRef, { customerName: proposal.customerName.to });
    return proposal;
  });
}
