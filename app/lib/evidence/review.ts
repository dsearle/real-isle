import { appendAuditEventWithStatements } from "./audit";
import { deterministicId, sha256Hex } from "./integrity";
import {
  normalizeReviewRationale,
  type SourceItemReviewDecision,
} from "./review-validation";
import {
  insertSourceItemReviewSql,
  updateSourceItemReviewStateSql,
} from "./review-sql";
import { ensureEvidenceTriggers } from "./triggers";

export {
  normalizeReviewRationale,
  SourceItemReviewValidationError,
  type SourceItemReviewDecision,
} from "./review-validation";

export type SourceItemReviewInput = {
  decision: SourceItemReviewDecision;
  expectedContentHash: string;
  expectedVersionId: string;
  itemId: string;
  rationale: string;
  reviewerId: string;
};

export type SourceItemReviewReceipt = {
  auditEventHash: string;
  auditSequence: number;
  createdAt: string;
  decision: SourceItemReviewDecision;
  idempotent: boolean;
  publicationState: string;
  reviewId: string;
  reviewState: SourceItemReviewDecision;
  versionId: string;
};

type ExistingReview = {
  created_at: string;
  decision: string;
  rationale: string;
  reviewer_id: string;
};

type ReviewAudit = {
  event_hash: string;
  sequence: number;
};

type SourceItemForReview = {
  content_hash: string | null;
  latest_snapshot_id: string | null;
  latest_version_id: string | null;
  publication_state: string;
  review_state: string;
};

export class SourceItemReviewConflictError extends Error {
  constructor(message = "This source changed or was already reviewed.") {
    super(message);
    this.name = "SourceItemReviewConflictError";
  }
}

export class SourceItemReviewNotFoundError extends Error {
  constructor() {
    super("The source record could not be found.");
    this.name = "SourceItemReviewNotFoundError";
  }
}

async function existingReceipt(
  db: D1Database,
  input: SourceItemReviewInput,
  reviewId: string,
  rationale: string,
): Promise<SourceItemReviewReceipt | null> {
  const review = await db
    .prepare(
      `SELECT decision, rationale, reviewer_id, created_at
         FROM reviews WHERE id = ?`,
    )
    .bind(reviewId)
    .first<ExistingReview>();
  if (!review) return null;
  if (
    review.decision !== input.decision ||
    review.rationale !== rationale ||
    review.reviewer_id !== input.reviewerId
  ) {
    throw new SourceItemReviewConflictError();
  }
  const audit = await db
    .prepare(
      `SELECT sequence, event_hash
         FROM audit_events
        WHERE action = 'source-item.reviewed'
          AND entity_type = 'source-item-version'
          AND entity_id = ?
        ORDER BY sequence DESC LIMIT 1`,
    )
    .bind(input.expectedVersionId)
    .first<ReviewAudit>();
  if (!audit) {
    throw new Error("The stored review has no matching audit event.");
  }
  const currentItem = await db
    .prepare(
      `SELECT latest_version_id, latest_snapshot_id, content_hash,
              review_state, publication_state
         FROM source_items WHERE id = ?`,
    )
    .bind(input.itemId)
    .first<SourceItemForReview>();
  if (
    !currentItem ||
    currentItem.latest_version_id !== input.expectedVersionId ||
    currentItem.content_hash !== input.expectedContentHash ||
    currentItem.review_state !== input.decision
  ) {
    throw new SourceItemReviewConflictError();
  }
  return {
    auditEventHash: audit.event_hash,
    auditSequence: audit.sequence,
    createdAt: review.created_at,
    decision: input.decision,
    idempotent: true,
    publicationState: currentItem.publication_state,
    reviewId,
    reviewState: input.decision,
    versionId: input.expectedVersionId,
  };
}

export async function reviewSourceItemVersion(
  db: D1Database,
  input: SourceItemReviewInput,
): Promise<SourceItemReviewReceipt> {
  await ensureEvidenceTriggers(db);
  const rationale = normalizeReviewRationale(input.decision, input.rationale);
  const reviewId = await deterministicId(
    "review",
    "source-item-version",
    input.expectedVersionId,
  );
  const item = await db
    .prepare(
      `SELECT latest_version_id, latest_snapshot_id, content_hash,
              review_state, publication_state
         FROM source_items WHERE id = ?`,
    )
    .bind(input.itemId)
    .first<SourceItemForReview>();
  if (!item) throw new SourceItemReviewNotFoundError();

  const replay = await existingReceipt(db, input, reviewId, rationale);
  if (replay) return replay;
  if (
    item.latest_version_id !== input.expectedVersionId ||
    item.content_hash !== input.expectedContentHash ||
    !["unreviewed", "needs-update"].includes(item.review_state)
  ) {
    throw new SourceItemReviewConflictError();
  }

  const createdAt = new Date().toISOString();
  const nextPublicationState =
    input.decision === "rejected" ? "withheld" : item.publication_state;
  const rationaleHash = await sha256Hex(rationale);

  try {
    const audit = await appendAuditEventWithStatements(
      db,
      {
        action: "source-item.reviewed",
        actorId: input.reviewerId,
        actorType: "admin",
        entityId: input.expectedVersionId,
        entityType: "source-item-version",
        payload: {
          contentHash: input.expectedContentHash,
          decision: input.decision,
          itemId: input.itemId,
          nextPublicationState,
          nextReviewState: input.decision,
          previousPublicationState: item.publication_state,
          previousReviewState: item.review_state,
          rationaleHash,
          reviewId,
          snapshotId: item.latest_snapshot_id,
          versionId: input.expectedVersionId,
        },
      },
      () => [
        db
          .prepare(insertSourceItemReviewSql)
          .bind(
            reviewId,
            input.expectedVersionId,
            input.decision,
            rationale,
            input.reviewerId,
            createdAt,
          ),
        db
          .prepare(updateSourceItemReviewStateSql)
          .bind(
            input.decision,
            input.decision,
            input.itemId,
            input.expectedVersionId,
            input.expectedContentHash,
          ),
      ],
    );
    return {
      auditEventHash: audit.eventHash,
      auditSequence: audit.sequence,
      createdAt,
      decision: input.decision,
      idempotent: false,
      publicationState: nextPublicationState,
      reviewId,
      reviewState: input.decision,
      versionId: input.expectedVersionId,
    };
  } catch (error) {
    const replayAfterRace = await existingReceipt(db, input, reviewId, rationale);
    if (replayAfterRace) return replayAfterRace;
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("review target is stale") ||
      message.includes("UNIQUE constraint failed: reviews")
    ) {
      throw new SourceItemReviewConflictError();
    }
    throw error;
  }
}
