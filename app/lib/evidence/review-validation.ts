export type SourceItemReviewDecision = "approved" | "rejected";

export class SourceItemReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceItemReviewValidationError";
  }
}

export function normalizeReviewRationale(
  decision: SourceItemReviewDecision,
  rationale: string,
) {
  const normalized = rationale.trim();
  if (decision === "rejected" && normalized.length < 20) {
    throw new SourceItemReviewValidationError(
      "Explain the rejection in at least 20 characters.",
    );
  }
  if (normalized.length > 500) {
    throw new SourceItemReviewValidationError("Review notes must be 500 characters or fewer.");
  }
  return normalized || "Approved after reviewing the cited source and captured version.";
}
