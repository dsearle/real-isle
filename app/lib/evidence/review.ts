import { appendAuditEventWithStatements } from "./audit.ts";
import { fingerprintCandidateSuggestions } from "./candidate-association.ts";
import { readVerifiedCollectionReason } from "./collection-assessment.ts";
import { deterministicId, sha256Hex } from "./integrity.ts";
import { fingerprintScopeSuggestions } from "./scope-association.ts";
import {
  normalizeReviewRationale,
  SourceItemReviewValidationError,
  type SourceItemReviewDecision,
} from "./review-validation.ts";
import {
  insertSourceItemCandidateAssignmentReviewSql,
  insertSourceItemReviewSql,
  updateSourceItemReviewStateSql,
} from "./review-sql.ts";
import { ensureEvidenceTriggers } from "./triggers.ts";

export {
  normalizeReviewRationale,
  SourceItemReviewValidationError,
  type SourceItemReviewDecision,
} from "./review-validation.ts";

export type SourceItemReviewInput = {
  candidateIds: string[];
  candidateSuggestionFingerprint: string;
  constituencyIds: string[];
  decision: SourceItemReviewDecision;
  expectedCollectionReasonHash: string;
  expectedCollectionRuleset: string;
  expectedContentHash: string;
  expectedPreviousReviewId: string | null;
  expectedVersionId: string;
  itemId: string;
  rationale: string;
  reviewKind: "candidate-assignment" | "source-version";
  reviewerId: string;
  /**
   * System triage is intentionally auditable as a system action rather than
   * being presented as a founder or editor decision.  API callers omit this
   * field and therefore remain admin reviews.
   */
  reviewerType?: "admin" | "system";
  /** Internal batch workers initialise the runtime guards once before looping. */
  skipRuntimeGuardInitialization?: boolean;
  scopeSuggestionFingerprint: string;
  topicIds: string[];
};

export type SourceItemReviewReceipt = {
  auditEventHash: string;
  auditSequence: number;
  candidateIds: string[];
  constituencyIds: string[];
  createdAt: string;
  decision: SourceItemReviewDecision;
  collectionReasonHash: string;
  collectionRuleset: string;
  idempotent: boolean;
  publicationState: string;
  reviewKind: "candidate-assignment" | "source-version";
  reviewId: string;
  reviewState: string;
  supersedesReviewId: string | null;
  topicIds: string[];
  versionId: string;
};

type ExistingReview = {
  created_at: string;
  decision: string;
  rationale: string;
  reviewer_id: string;
  supersedes_review_id: string | null;
};

type CurrentReview = {
  audit_sequence: number | null;
  decision: string;
  id: string;
  supersedes_review_id: string | null;
};

type ReviewAudit = {
  collection_reason_hash: string | null;
  collection_ruleset: string | null;
  event_hash: string;
  scope_suggestion_fingerprint: string | null;
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

type ScopeAssociation = {
  confidence: number | null;
  entity_id: string;
  entity_type: "constituency" | "topic";
  match_method: string | null;
  mention_text: string | null;
};

type ScopeAssociationDecision = {
  confidence: number;
  entityId: string;
  entityType: "constituency" | "topic";
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

type FrozenCollectionAssessment = {
  canonical_reason_hash: string;
  canonical_reason_json: string;
  route: string;
  ruleset_id: string;
};

function auditActionForReviewKind(reviewKind: SourceItemReviewInput["reviewKind"]) {
  return reviewKind === "candidate-assignment"
    ? "source-item.candidate-assignment-reviewed"
    : "source-item.reviewed";
}

function targetTypeForReviewKind(reviewKind: SourceItemReviewInput["reviewKind"]) {
  return reviewKind === "candidate-assignment"
    ? "source-item-version-assignment"
    : "source-item-version";
}

async function currentReviewForTarget(
  db: D1Database,
  reviewKind: SourceItemReviewInput["reviewKind"],
  versionId: string,
) {
  const auditAction = auditActionForReviewKind(reviewKind);
  const targetType = targetTypeForReviewKind(reviewKind);
  return db
    .prepare(
      `SELECT current_review.id, current_review.decision,
              current_review.supersedes_review_id,
              MAX(audit.sequence) AS audit_sequence
         FROM reviews current_review
         LEFT JOIN audit_events audit
           ON audit.action = ?
          AND audit.entity_type = 'source-item-version'
          AND audit.entity_id = current_review.target_id
          AND json_extract(audit.payload, '$.reviewId') = current_review.id
        WHERE current_review.target_type = ?
          AND current_review.target_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM reviews successor
             WHERE successor.supersedes_review_id = current_review.id
          )
        GROUP BY current_review.id, current_review.decision,
                 current_review.supersedes_review_id
        LIMIT 1`,
    )
    .bind(auditAction, targetType, versionId)
    .first<CurrentReview>();
}

async function reviewIdForDecision(
  reviewKind: SourceItemReviewInput["reviewKind"],
  versionId: string,
  decision: SourceItemReviewDecision,
  expectedPreviousReviewId: string | null,
) {
  const targetType = targetTypeForReviewKind(reviewKind);
  return expectedPreviousReviewId
    ? deterministicId(
        "review",
        targetType,
        versionId,
        "supersedes",
        expectedPreviousReviewId,
        decision,
      )
    : deterministicId("review", targetType, versionId);
}

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

async function scopeSuggestionsForReview(
  db: D1Database,
  itemId: string,
): Promise<ScopeAssociationDecision[]> {
  const proposals = await db
    .prepare(
      `SELECT proposals.entity_type, proposals.entity_id,
              proposals.mention_text, proposals.match_method, proposals.confidence
         FROM item_entities proposals
         JOIN policy_topics topics
           ON proposals.entity_type = 'topic'
          AND topics.id = proposals.entity_id
          AND topics.active = 1
        WHERE proposals.item_id = ?
          AND proposals.entity_type = 'topic'
        UNION ALL
       SELECT proposals.entity_type, proposals.entity_id,
              proposals.mention_text, proposals.match_method, proposals.confidence
         FROM item_entities proposals
         JOIN constituencies
           ON proposals.entity_type = 'constituency'
          AND constituencies.id = proposals.entity_id
        WHERE proposals.item_id = ?
          AND proposals.entity_type = 'constituency'
        ORDER BY entity_type, entity_id`,
    )
    .bind(itemId, itemId)
    .all<ScopeAssociation>();
  return proposals.results.map((association) => ({
    confidence: association.confidence ?? 0,
    entityId: association.entity_id,
    entityType: association.entity_type,
    matchMethod: association.match_method ?? "unrecorded-match-method",
    mentionText: association.mention_text ?? association.entity_id,
  }));
}

async function scopeAssociationDecisions(
  db: D1Database,
  suggestions: ScopeAssociationDecision[],
  constituencyIds: string[],
  topicIds: string[],
) {
  const selected = new Set([
    ...constituencyIds.map((id) => `constituency:${id}`),
    ...topicIds.map((id) => `topic:${id}`),
  ]);
  const suggested = new Set(
    suggestions.map((suggestion) => `${suggestion.entityType}:${suggestion.entityId}`),
  );
  const addedConstituencyIds = constituencyIds.filter(
    (id) => !suggested.has(`constituency:${id}`),
  );
  const addedTopicIds = topicIds.filter((id) => !suggested.has(`topic:${id}`));
  const added: ScopeAssociationDecision[] = [];

  if (addedConstituencyIds.length) {
    const placeholders = addedConstituencyIds.map(() => "?").join(", ");
    const rows = await db
      .prepare(`SELECT id, name FROM constituencies WHERE id IN (${placeholders}) ORDER BY id`)
      .bind(...addedConstituencyIds)
      .all<{ id: string; name: string }>();
    if (rows.results.length !== addedConstituencyIds.length) {
      throw new SourceItemReviewValidationError(
        "One or more reviewer-added constituencies are no longer available.",
      );
    }
    added.push(...rows.results.map((row) => ({
      confidence: 1,
      entityId: row.id,
      entityType: "constituency" as const,
      matchMethod: "reviewer-added-v1",
      mentionText: row.name,
    })));
  }
  if (addedTopicIds.length) {
    const placeholders = addedTopicIds.map(() => "?").join(", ");
    const rows = await db
      .prepare(
        `SELECT id, name FROM policy_topics
          WHERE active = 1 AND id IN (${placeholders}) ORDER BY id`,
      )
      .bind(...addedTopicIds)
      .all<{ id: string; name: string }>();
    if (rows.results.length !== addedTopicIds.length) {
      throw new SourceItemReviewValidationError(
        "One or more reviewer-added topics are no longer active.",
      );
    }
    added.push(...rows.results.map((row) => ({
      confidence: 1,
      entityId: row.id,
      entityType: "topic" as const,
      matchMethod: "reviewer-added-v1",
      mentionText: row.name,
    })));
  }
  if (added.some((association) => !selected.has(
    `${association.entityType}:${association.entityId}`,
  ))) {
    throw new SourceItemReviewValidationError(
      "One or more reviewer-added routes could not be verified.",
    );
  }
  return {
    confirmed: [
      ...suggestions.filter((suggestion) => (
        selected.has(`${suggestion.entityType}:${suggestion.entityId}`)
      )),
      ...added,
    ].sort((left, right) => {
      if (left.entityType !== right.entityType) return left.entityType < right.entityType ? -1 : 1;
      return left.entityId < right.entityId ? -1 : left.entityId > right.entityId ? 1 : 0;
    }),
    rejected: suggestions.filter((suggestion) => (
      !selected.has(`${suggestion.entityType}:${suggestion.entityId}`)
    )),
  };
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
      `SELECT decision, rationale, reviewer_id, supersedes_review_id, created_at
         FROM reviews WHERE id = ?`,
    )
    .bind(reviewId)
    .first<ExistingReview>();
  if (!review) return null;
  if (
    review.decision !== input.decision ||
    review.rationale !== rationale ||
    review.reviewer_id !== input.reviewerId ||
    review.supersedes_review_id !== input.expectedPreviousReviewId
  ) {
    throw new SourceItemReviewConflictError();
  }
  const audit = await db
    .prepare(
      `SELECT sequence, event_hash,
              json_extract(payload, '$.collectionReasonHash') AS collection_reason_hash,
              json_extract(payload, '$.collectionRuleset') AS collection_ruleset,
              json_extract(payload, '$.scopeSuggestionFingerprint') AS scope_suggestion_fingerprint
         FROM audit_events
        WHERE action = ?
          AND entity_type = 'source-item-version'
          AND entity_id = ?
          AND json_extract(payload, '$.reviewId') = ?
        ORDER BY sequence DESC LIMIT 1`,
    )
    .bind(auditAction, input.expectedVersionId, reviewId)
    .first<ReviewAudit>();
  if (!audit) {
    throw new Error("The stored review has no matching audit event.");
  }
  if (
    audit.collection_reason_hash !== input.expectedCollectionReasonHash
    || audit.collection_ruleset !== input.expectedCollectionRuleset
    || audit.scope_suggestion_fingerprint !== input.scopeSuggestionFingerprint
  ) {
    throw new SourceItemReviewConflictError(
      "This source version was reviewed against a different collection assessment.",
    );
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
  const successor = await db
    .prepare("SELECT id FROM reviews WHERE supersedes_review_id = ? LIMIT 1")
    .bind(reviewId)
    .first<{ id: string }>();
  if (successor) throw new SourceItemReviewConflictError();
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
  const frozenScope = await db
    .prepare(
      `SELECT entity_type, entity_id
         FROM source_item_version_entities
        WHERE source_item_version_id = ?
          AND review_id = ?
          AND entity_type IN ('constituency', 'topic')
          AND confirmation_state = 'confirmed'
        ORDER BY entity_type, entity_id`,
    )
    .bind(input.expectedVersionId, reviewId)
    .all<{ entity_id: string; entity_type: "constituency" | "topic" }>();
  const frozenConstituencyIds = frozenScope.results
    .filter((association) => association.entity_type === "constituency")
    .map((association) => association.entity_id);
  const frozenTopicIds = frozenScope.results
    .filter((association) => association.entity_type === "topic")
    .map((association) => association.entity_id);
  if (
    frozenConstituencyIds.length !== input.constituencyIds.length
    || frozenConstituencyIds.some((id, index) => id !== input.constituencyIds[index])
    || frozenTopicIds.length !== input.topicIds.length
    || frozenTopicIds.some((id, index) => id !== input.topicIds[index])
  ) {
    throw new SourceItemReviewConflictError(
      "This source version already has a different topic or constituency routing decision.",
    );
  }
  return {
    auditEventHash: audit.event_hash,
    auditSequence: audit.sequence,
    candidateIds: frozenCandidateIds,
    constituencyIds: frozenConstituencyIds,
    createdAt: review.created_at,
    decision: input.decision,
    collectionReasonHash: input.expectedCollectionReasonHash,
    collectionRuleset: input.expectedCollectionRuleset,
    idempotent: true,
    publicationState: currentItem.publication_state,
    reviewKind,
    reviewId,
    reviewState: currentItem.review_state,
    supersedesReviewId: review.supersedes_review_id,
    topicIds: frozenTopicIds,
    versionId: input.expectedVersionId,
  };
}

export async function reviewSourceItemVersion(
  db: D1Database,
  input: SourceItemReviewInput,
): Promise<SourceItemReviewReceipt> {
  if (!input.skipRuntimeGuardInitialization) await ensureEvidenceTriggers(db);
  const normalizedInput = {
    ...input,
    candidateIds: [...new Set(input.candidateIds)].sort(),
    constituencyIds: [...new Set(input.constituencyIds)].sort(),
    expectedPreviousReviewId: input.expectedPreviousReviewId ?? null,
    topicIds: [...new Set(input.topicIds)].sort(),
  };
  if (
    normalizedInput.decision === "rejected"
    && (
      normalizedInput.candidateIds.length > 0
      || normalizedInput.constituencyIds.length > 0
      || normalizedInput.topicIds.length > 0
    )
  ) {
    throw new SourceItemReviewValidationError(
      "Rejected evidence cannot be routed to a candidate, topic or constituency section.",
    );
  }
  if (
    normalizedInput.reviewKind === "candidate-assignment"
    && (normalizedInput.constituencyIds.length > 0 || normalizedInput.topicIds.length > 0)
  ) {
    throw new SourceItemReviewValidationError(
      "Candidate filing decisions cannot change topic or constituency routing.",
    );
  }
  const rationale = normalizeReviewRationale(input.decision, input.rationale);
  const item = await db
    .prepare(
      `SELECT latest_version_id, latest_snapshot_id, content_hash,
              review_state, publication_state
         FROM source_items WHERE id = ?`,
    )
    .bind(input.itemId)
    .first<SourceItemForReview>();
  if (!item) throw new SourceItemReviewNotFoundError();
  const collectionAssessment = await db
    .prepare(
      `SELECT canonical_reason_hash, canonical_reason_json, route, ruleset_id
         FROM source_item_version_collection_assessments
        WHERE source_item_version_id = ?`,
    )
    .bind(input.expectedVersionId)
    .first<FrozenCollectionAssessment>();
  if (!collectionAssessment) {
    throw new SourceItemReviewConflictError(
      "This source version does not yet have a frozen collection assessment. Refresh after it has been assessed.",
    );
  }
  if (
    collectionAssessment.canonical_reason_hash !== input.expectedCollectionReasonHash
    || collectionAssessment.ruleset_id !== input.expectedCollectionRuleset
  ) {
    throw new SourceItemReviewConflictError(
      "The reason for collecting this source changed while you were reviewing it. Refresh and check the frozen assessment.",
    );
  }
  const frozenCollectionReason = await readVerifiedCollectionReason({
    canonical_reason_hash: collectionAssessment.canonical_reason_hash,
    canonical_reason_json: collectionAssessment.canonical_reason_json,
    collection_route: collectionAssessment.route,
    collection_ruleset_id: collectionAssessment.ruleset_id,
  });
  if (!frozenCollectionReason) {
    throw new SourceItemReviewConflictError(
      "The frozen collection assessment could not be verified. Nothing was changed.",
    );
  }

  const reviewKind = input.reviewKind;
  const currentSourceReview = await currentReviewForTarget(
    db,
    "source-version",
    input.expectedVersionId,
  );
  if (reviewKind === "candidate-assignment" && currentSourceReview && !currentSourceReview.audit_sequence) {
    throw new Error("The stored source review has no matching audit event.");
  }
  if (
    reviewKind === "candidate-assignment"
    && (
      item.review_state !== "approved"
      || item.publication_state !== "published"
      || currentSourceReview?.decision !== "approved"
      || currentSourceReview.supersedes_review_id !== null
    )
  ) {
    throw new SourceItemReviewConflictError(
      "Candidate filing can only be reconciled against a current approved source version.",
    );
  }
  const currentTargetReview = reviewKind === "source-version"
    ? currentSourceReview
    : await currentReviewForTarget(db, "candidate-assignment", input.expectedVersionId);
  if (currentTargetReview && !currentTargetReview.audit_sequence) {
    throw new Error("The stored current review has no matching audit event.");
  }
  const currentLegacyAssignmentReview = reviewKind === "source-version"
    && currentTargetReview?.decision === "approved"
    && currentTargetReview.supersedes_review_id === null
    ? await currentReviewForTarget(db, "candidate-assignment", input.expectedVersionId)
    : null;
  if (currentLegacyAssignmentReview && !currentLegacyAssignmentReview.audit_sequence) {
    throw new Error("The stored current candidate assignment has no matching audit event.");
  }
  const reviewId = await reviewIdForDecision(
    reviewKind,
    input.expectedVersionId,
    input.decision,
    normalizedInput.expectedPreviousReviewId,
  );
  const auditAction = auditActionForReviewKind(reviewKind);
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
  if ((currentTargetReview?.id ?? null) !== normalizedInput.expectedPreviousReviewId) {
    throw new SourceItemReviewConflictError(
      "This editorial decision changed while you were reviewing it. Refresh before reconsidering it.",
    );
  }
  if (currentTargetReview?.decision === input.decision) {
    throw new SourceItemReviewValidationError(
      `This source is already ${input.decision}. Choose the other decision to reconsider it.`,
    );
  }
  const staleSourceReview = reviewKind === "source-version" && (
    item.latest_version_id !== input.expectedVersionId ||
    item.content_hash !== input.expectedContentHash ||
    (
      currentTargetReview
        ? item.review_state !== currentTargetReview.decision
        : !["unreviewed", "needs-update"].includes(item.review_state)
    )
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
  const nextPublicationState = reviewKind === "source-version"
    ? input.decision === "approved" ? "published" : "withheld"
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
  const currentScopeSuggestions = reviewKind === "source-version"
    && normalizedInput.decision === "approved"
    ? await scopeSuggestionsForReview(db, normalizedInput.itemId)
    : [];
  if (
    reviewKind === "source-version"
    && normalizedInput.decision === "approved"
    && await fingerprintScopeSuggestions(currentScopeSuggestions.map((association) => ({
      confidence: association.confidence,
      entityType: association.entityType,
      id: association.entityId,
      matchMethod: association.matchMethod,
      mentionText: association.mentionText,
    }))) !== normalizedInput.scopeSuggestionFingerprint
  ) {
    throw new SourceItemReviewConflictError(
      "The detected topic or constituency suggestions changed while you were reviewing them. Refresh and check the current set.",
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
  const scopeAssociations = reviewKind === "source-version"
    && normalizedInput.decision === "approved"
    ? await scopeAssociationDecisions(
        db,
        currentScopeSuggestions,
        normalizedInput.constituencyIds,
        normalizedInput.topicIds,
      )
    : { confirmed: [], rejected: [] };
  const previousAssociationReviewIds = [
    currentTargetReview?.id,
    currentLegacyAssignmentReview?.id,
  ].filter((reviewId): reviewId is string => Boolean(reviewId));
  const previouslyConfirmedCandidates = previousAssociationReviewIds.length > 0
    ? await db
        .prepare(
          `SELECT entity_id
             FROM source_item_version_entities
            WHERE source_item_version_id = ?
              AND review_id IN (${previousAssociationReviewIds.map(() => "?").join(", ")})
              AND entity_type = 'candidacy'
              AND confirmation_state = 'confirmed'
            ORDER BY entity_id`,
        )
        .bind(input.expectedVersionId, ...previousAssociationReviewIds)
        .all<{ entity_id: string }>()
    : { results: [] as Array<{ entity_id: string }> };
  const candidatesNeedingAnalysis = [...new Set([
    ...previouslyConfirmedCandidates.results.map((candidate) => candidate.entity_id),
    ...candidateAssociations.map((association) => association.entityId),
  ])].sort();

  try {
    const audit = await appendAuditEventWithStatements(
      db,
      {
        action: auditAction,
        actorId: input.reviewerId,
        actorType: input.reviewerType ?? "admin",
        entityId: input.expectedVersionId,
        entityType: "source-item-version",
        payload: {
          contentHash: input.expectedContentHash,
          candidateAssociations,
          candidateSuggestionFingerprint: normalizedInput.candidateSuggestionFingerprint,
          collectionReasonHash: input.expectedCollectionReasonHash,
          collectionRuleset: input.expectedCollectionRuleset,
          decision: input.decision,
          itemId: input.itemId,
          nextPublicationState,
          nextReviewState: expectedReviewState,
          previousPublicationState: item.publication_state,
          previousReviewState: item.review_state,
          rationaleHash,
          rejectedCandidateAssociations: rejectedAssociations,
          confirmedScopeAssociations: scopeAssociations.confirmed,
          rejectedScopeAssociations: scopeAssociations.rejected,
          reviewKind,
          reviewId,
          scopeSuggestionFingerprint: normalizedInput.scopeSuggestionFingerprint,
          snapshotId: item.latest_snapshot_id,
          supersedesReviewId: normalizedInput.expectedPreviousReviewId,
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
              normalizedInput.expectedPreviousReviewId,
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
                item.review_state,
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
        for (const association of scopeAssociations.confirmed) {
          statements.push(
            db
              .prepare(
                `INSERT INTO source_item_version_entities (
                   source_item_version_id, entity_type, entity_id, mention_text,
                   match_method, confidence, review_id, confirmation_state, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
              )
              .bind(
                input.expectedVersionId,
                association.entityType,
                association.entityId,
                association.mentionText,
                association.matchMethod,
                association.confidence,
                reviewId,
                createdAt,
              ),
          );
        }
        for (const association of scopeAssociations.rejected) {
          statements.push(
            db
              .prepare(
                `INSERT INTO source_item_version_entities (
                   source_item_version_id, entity_type, entity_id, mention_text,
                   match_method, confidence, review_id, confirmation_state, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, 'rejected', ?)`,
              )
              .bind(
                input.expectedVersionId,
                association.entityType,
                association.entityId,
                association.mentionText,
                association.matchMethod,
                association.confidence,
                reviewId,
                createdAt,
              ),
          );
        }
        for (const candidateId of candidatesNeedingAnalysis) {
          statements.push(
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
              .bind(candidateId),
          );
        }
        return statements;
      },
    );
    return {
      auditEventHash: audit.eventHash,
      auditSequence: audit.sequence,
      candidateIds: normalizedInput.candidateIds,
      constituencyIds: normalizedInput.constituencyIds,
      createdAt,
      decision: input.decision,
      collectionReasonHash: input.expectedCollectionReasonHash,
      collectionRuleset: input.expectedCollectionRuleset,
      idempotent: false,
      publicationState: nextPublicationState,
      reviewKind,
      reviewId,
      reviewState: expectedReviewState,
      supersedesReviewId: normalizedInput.expectedPreviousReviewId,
      topicIds: normalizedInput.topicIds,
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
