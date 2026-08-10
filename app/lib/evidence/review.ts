import { appendAuditEventWithStatements } from "./audit";
import { fingerprintCandidateSuggestions } from "./candidate-association";
import { deterministicId, sha256Hex } from "./integrity";
import {
  normalizeReviewRationale,
  SourceItemReviewValidationError,
  type SourceItemReviewDecision,
} from "./review-validation";
import {
  insertSourceItemCandidateAssignmentReviewSql,
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
  candidateIds: string[];
  candidateSuggestionFingerprint: string;
  decision: SourceItemReviewDecision;
  expectedContentHash: string;
  expectedVersionId: string;
  itemId: string;
  rationale: string;
  reviewKind: "candidate-assignment" | "source-version";
  reviewerId: string;
};

export type SourceItemReviewReceipt = {
  auditEventHash: string;
  auditSequence: number;
  candidateIds: string[];
  createdAt: string;
  decision: SourceItemReviewDecision;
  idempotent: boolean;
  publicationState: string;
  reviewKind: "candidate-assignment" | "source-version";
  reviewId: string;
  reviewState: string;
  versionId: string;
};

type ExistingReview = {
  created_at: string;
  decision: string;
  rationale: string;
  reviewer_id: string;
};

type PriorSourceReview = {
  audit_sequence: number | null;
  decision: string;
};

type ReviewAudit = {
  event_hash: string;
  sequence: number;
};

type CandidateAssociation = {
  confidence: number | null;
  entity_id: string;
  full_name: string;
  match_method: string | null;
  mention_text: string | null;
};

type CandidateAssociationDecision = {
  confidence: number;
  entityId: string;
  fullName: string;
  matchMethod: string;
  mentionText: string;
};

type SourceItemForReview = {
  content_hash: string | null;
  latest_snapshot_id: string | null;
  latest_version_id: string | null;
  publication_state: string;
  review_state: string;
};

async function candidateAssociationsForReview(
  db: D1Database,
  candidateIds: string[],
  suggestions: CandidateAssociationDecision[],
) {
  if (candidateIds.length === 0) return [];
  const placeholders = candidateIds.map(() => "?").join(", ");
  const candidates = await db
    .prepare(
      `SELECT candidacies.id AS entity_id, people.full_name
         FROM candidacies
         JOIN people ON people.id = candidacies.person_id
        WHERE candidacies.id IN (${placeholders})
          AND candidacies.declaration_status != 'source-removed'`,
    )
    .bind(...candidateIds)
    .all<CandidateAssociation>();
  if (candidates.results.length !== candidateIds.length) {
    throw new SourceItemReviewValidationError(
      "One or more selected candidates are no longer available for assignment.",
    );
  }
  return candidates.results
    .map((candidate) => {
      const suggestion = suggestions.find((entry) => entry.entityId === candidate.entity_id);
      return {
        confidence: suggestion?.confidence ?? 1,
        entityId: candidate.entity_id,
        fullName: candidate.full_name,
        matchMethod: suggestion?.matchMethod ?? "reviewer-added-v1",
        mentionText: suggestion?.mentionText ?? candidate.full_name,
      };
    })
    .sort((left, right) => left.entityId < right.entityId ? -1 : left.entityId > right.entityId ? 1 : 0);
}

async function candidateSuggestionsForReview(
  db: D1Database,
  itemId: string,
): Promise<CandidateAssociationDecision[]> {
  const proposals = await db
    .prepare(
      `SELECT candidacies.id AS entity_id, people.full_name,
              proposals.mention_text, proposals.match_method, proposals.confidence
         FROM item_entities proposals
         JOIN candidacies ON candidacies.id = proposals.entity_id
          AND candidacies.declaration_status != 'source-removed'
         JOIN people ON people.id = candidacies.person_id
        WHERE proposals.item_id = ?
          AND proposals.entity_type = 'candidacy'
        ORDER BY candidacies.id`,
    )
    .bind(itemId)
    .all<CandidateAssociation>();
  return proposals.results
    .map((candidate) => ({
      confidence: candidate.confidence ?? 0,
      entityId: candidate.entity_id,
      fullName: candidate.full_name,
      matchMethod: candidate.match_method ?? "unrecorded-match-method",
      mentionText: candidate.mention_text ?? candidate.full_name,
    }));
}

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
  auditAction: string,
  expectedReviewState: string,
  reviewKind: SourceItemReviewReceipt["reviewKind"],
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
        WHERE action = ?
          AND entity_type = 'source-item-version'
          AND entity_id = ?
        ORDER BY sequence DESC LIMIT 1`,
    )
    .bind(auditAction, input.expectedVersionId)
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
    currentItem.review_state !== expectedReviewState
  ) {
    throw new SourceItemReviewConflictError();
  }
  const frozenCandidates = await db
    .prepare(
      `SELECT entity_id
         FROM source_item_version_entities
        WHERE source_item_version_id = ?
          AND review_id = ?
          AND entity_type = 'candidacy'
          AND confirmation_state = 'confirmed'
        ORDER BY entity_id`,
    )
    .bind(input.expectedVersionId, reviewId)
    .all<{ entity_id: string }>();
  const frozenCandidateIds = frozenCandidates.results.map((candidate) => candidate.entity_id);
  if (
    frozenCandidateIds.length !== input.candidateIds.length ||
    frozenCandidateIds.some((candidateId, index) => candidateId !== input.candidateIds[index])
  ) {
    throw new SourceItemReviewConflictError(
      "This source version already has a different candidate dossier decision.",
    );
  }
  return {
    auditEventHash: audit.event_hash,
    auditSequence: audit.sequence,
    candidateIds: frozenCandidateIds,
    createdAt: review.created_at,
    decision: input.decision,
    idempotent: true,
    publicationState: currentItem.publication_state,
    reviewKind,
    reviewId,
    reviewState: currentItem.review_state,
    versionId: input.expectedVersionId,
  };
}

export async function reviewSourceItemVersion(
  db: D1Database,
  input: SourceItemReviewInput,
): Promise<SourceItemReviewReceipt> {
  await ensureEvidenceTriggers(db);
  const normalizedInput = {
    ...input,
    candidateIds: [...new Set(input.candidateIds)].sort(),
  };
  if (normalizedInput.decision === "rejected" && normalizedInput.candidateIds.length > 0) {
    throw new SourceItemReviewValidationError(
      "Rejected evidence cannot be assigned to a candidate dossier.",
    );
  }
  const rationale = normalizeReviewRationale(input.decision, input.rationale);
  const sourceReviewId = await deterministicId(
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

  const priorSourceReview = await db
    .prepare(
      `SELECT source_review.decision, audit.sequence AS audit_sequence
         FROM reviews source_review
         LEFT JOIN audit_events audit
           ON audit.action = 'source-item.reviewed'
          AND audit.entity_type = 'source-item-version'
          AND audit.entity_id = source_review.target_id
        WHERE source_review.id = ?
          AND source_review.target_type = 'source-item-version'
          AND source_review.target_id = ?
        ORDER BY audit.sequence DESC LIMIT 1`,
    )
    .bind(sourceReviewId, input.expectedVersionId)
    .first<PriorSourceReview>();
  if (input.reviewKind === "candidate-assignment" && priorSourceReview && !priorSourceReview.audit_sequence) {
    throw new Error("The stored source review has no matching audit event.");
  }
  const reviewKind = input.reviewKind;
  if (
    reviewKind === "candidate-assignment"
    && (item.review_state !== "approved" || priorSourceReview?.decision !== "approved")
  ) {
    throw new SourceItemReviewConflictError(
      "Candidate filing can only be reconciled against a current approved source version.",
    );
  }
  const reviewId = reviewKind === "candidate-assignment"
    ? await deterministicId("review", "source-item-version-assignment", input.expectedVersionId)
    : sourceReviewId;
  const auditAction = reviewKind === "candidate-assignment"
    ? "source-item.candidate-assignment-reviewed"
    : "source-item.reviewed";
  const expectedReviewState = reviewKind === "candidate-assignment"
    ? "approved"
    : input.decision;

  const replay = await existingReceipt(
    db,
    normalizedInput,
    auditAction,
    expectedReviewState,
    reviewKind,
    reviewId,
    rationale,
  );
  if (replay) return replay;
  const staleSourceReview = reviewKind === "source-version" && (
    item.latest_version_id !== input.expectedVersionId ||
    item.content_hash !== input.expectedContentHash ||
    !["unreviewed", "needs-update"].includes(item.review_state)
  );
  const staleAssignmentReview = reviewKind === "candidate-assignment" && (
    item.latest_version_id !== input.expectedVersionId ||
    item.content_hash !== input.expectedContentHash ||
    item.review_state !== "approved"
  );
  if (staleSourceReview || staleAssignmentReview) {
    throw new SourceItemReviewConflictError();
  }

  const createdAt = new Date().toISOString();
  const nextPublicationState = reviewKind === "source-version" && input.decision === "rejected"
    ? "withheld"
    : item.publication_state;
  const rationaleHash = await sha256Hex(rationale);
  const currentCandidateSuggestions = normalizedInput.decision === "approved"
    || reviewKind === "candidate-assignment"
    ? await candidateSuggestionsForReview(db, normalizedInput.itemId)
    : [];
  if (
    (normalizedInput.decision === "approved" || reviewKind === "candidate-assignment")
    && await fingerprintCandidateSuggestions(
      currentCandidateSuggestions.map((candidate) => ({
        candidacyId: candidate.entityId,
        confidence: candidate.confidence,
        matchMethod: candidate.matchMethod,
        mentionText: candidate.mentionText,
      })),
    ) !== normalizedInput.candidateSuggestionFingerprint
  ) {
    throw new SourceItemReviewConflictError(
      "The detected candidate suggestions changed while you were reviewing them. Refresh and check the current set.",
    );
  }
  const candidateAssociations = normalizedInput.decision === "approved"
    ? await candidateAssociationsForReview(
        db,
        normalizedInput.candidateIds,
        currentCandidateSuggestions,
      )
    : [];
  const rejectedAssociations = normalizedInput.decision === "approved"
    || reviewKind === "candidate-assignment"
    ? currentCandidateSuggestions.filter(
        (candidate) => !normalizedInput.candidateIds.includes(candidate.entityId),
      )
    : [];

  try {
    const audit = await appendAuditEventWithStatements(
      db,
      {
        action: auditAction,
        actorId: input.reviewerId,
        actorType: "admin",
        entityId: input.expectedVersionId,
        entityType: "source-item-version",
        payload: {
          contentHash: input.expectedContentHash,
          candidateAssociations,
          candidateSuggestionFingerprint: normalizedInput.candidateSuggestionFingerprint,
          decision: input.decision,
          itemId: input.itemId,
          nextPublicationState,
          nextReviewState: expectedReviewState,
          previousPublicationState: item.publication_state,
          previousReviewState: item.review_state,
          rationaleHash,
          rejectedCandidateAssociations: rejectedAssociations,
          reviewKind,
          reviewId,
          snapshotId: item.latest_snapshot_id,
          versionId: input.expectedVersionId,
        },
      },
      () => {
        const statements: D1PreparedStatement[] = [
          db
            .prepare(
              reviewKind === "candidate-assignment"
                ? insertSourceItemCandidateAssignmentReviewSql
                : insertSourceItemReviewSql,
            )
            .bind(
              reviewId,
              input.expectedVersionId,
              input.decision,
              rationale,
              input.reviewerId,
              createdAt,
            ),
        ];
        if (reviewKind === "source-version") {
          statements.push(
            db
              .prepare(updateSourceItemReviewStateSql)
              .bind(
                input.decision,
                input.decision,
                input.itemId,
                input.expectedVersionId,
                input.expectedContentHash,
              ),
          );
        }
        for (const association of candidateAssociations) {
          statements.push(
            db
              .prepare(
                `INSERT INTO source_item_version_entities (
                   source_item_version_id, entity_type, entity_id, mention_text,
                   match_method, confidence, review_id, confirmation_state, created_at
                 ) VALUES (?, 'candidacy', ?, ?, ?, ?, ?, 'confirmed', ?)`,
              )
              .bind(
                input.expectedVersionId,
                association.entityId,
                association.mentionText,
                association.matchMethod,
                association.confidence,
                reviewId,
                createdAt,
              ),
            db
              .prepare(
                `INSERT INTO candidate_intelligence_heads (
                   candidacy_id, analysis_state, publication_state,
                   desired_corpus_hash, stale_at, updated_at
                 ) VALUES (?, 'queued', 'private', NULL, NULL, CURRENT_TIMESTAMP)
                 ON CONFLICT(candidacy_id) DO UPDATE SET
                   analysis_state = CASE
                     WHEN candidate_intelligence_heads.published_revision_id IS NULL THEN 'queued'
                     ELSE 'needs-update'
                   END,
                   publication_state = CASE
                     WHEN candidate_intelligence_heads.published_revision_id IS NULL
                       THEN candidate_intelligence_heads.publication_state
                     ELSE 'withheld'
                   END,
                   desired_corpus_hash = NULL,
                   published_revision_id = NULL,
                   stale_at = CASE
                     WHEN candidate_intelligence_heads.published_revision_id IS NULL THEN NULL
                     ELSE CURRENT_TIMESTAMP
                   END,
                   updated_at = CURRENT_TIMESTAMP`,
              )
              .bind(association.entityId),
          );
        }
        for (const association of rejectedAssociations) {
          statements.push(
            db
              .prepare(
                `INSERT INTO source_item_version_entities (
                   source_item_version_id, entity_type, entity_id, mention_text,
                   match_method, confidence, review_id, confirmation_state, created_at
                 ) VALUES (?, 'candidacy', ?, ?, ?, ?, ?, 'rejected', ?)`,
              )
              .bind(
                input.expectedVersionId,
                association.entityId,
                association.mentionText,
                association.matchMethod,
                association.confidence,
                reviewId,
                createdAt,
              ),
          );
        }
        return statements;
      },
    );
    return {
      auditEventHash: audit.eventHash,
      auditSequence: audit.sequence,
      candidateIds: normalizedInput.candidateIds,
      createdAt,
      decision: input.decision,
      idempotent: false,
      publicationState: nextPublicationState,
      reviewKind,
      reviewId,
      reviewState: expectedReviewState,
      versionId: input.expectedVersionId,
    };
  } catch (error) {
    const replayAfterRace = await existingReceipt(
      db,
      normalizedInput,
      auditAction,
      expectedReviewState,
      reviewKind,
      reviewId,
      rationale,
    );
    if (replayAfterRace) return replayAfterRace;
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("review target is stale") ||
      message.includes("candidate assignment target is stale") ||
      message.includes("UNIQUE constraint failed: reviews")
    ) {
      throw new SourceItemReviewConflictError();
    }
    throw error;
  }
}
