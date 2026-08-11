import { appendAuditEventWithStatements } from "./audit.ts";
import {
  backfillCandidateProfileBasisHashes,
  candidateProfileBasisFromRow,
  candidateProfileBasisRowSql,
  fingerprintCandidateProfileBasis,
  type CandidateProfileBasisRow,
  type CandidateProfileIdentityBasis,
} from "./candidate-profile-basis.ts";
import {
  candidateProfileVersionReviewGuardSql,
  insertCandidateProfileReviewSql,
  updateCandidateProfileReviewStateSql,
} from "./candidate-profile-review-sql.ts";
import { deterministicId } from "./integrity.ts";
import { normalizeReviewRationale, SourceItemReviewValidationError } from "./review-validation.ts";
import { ensureEvidenceTriggers } from "./triggers.ts";

export type CandidateProfileReviewDecision = "approved" | "rejected";

export type CandidateProfileReviewInput = {
  candidacyId: string;
  decision: CandidateProfileReviewDecision;
  expectedBasisHash: string;
  expectedPreviousReviewId: string | null;
  rationale: string;
  reviewerId: string;
};

export type CandidateProfileReviewReceipt = {
  auditEventHash: string;
  auditSequence: number;
  basisHash: string;
  candidacyId: string;
  createdAt: string;
  decision: CandidateProfileReviewDecision;
  idempotent: boolean;
  publicationState: "published" | "withheld";
  reviewId: string;
  reviewState: CandidateProfileReviewDecision;
  supersedesReviewId: string | null;
};

type CandidateProfileForReview = CandidateProfileBasisRow;

type StoredReview = {
  created_at: string;
  decision: CandidateProfileReviewDecision;
  rationale: string;
  reviewer_id: string;
  supersedes_review_id: string | null;
};

type ReviewHead = {
  audit_sequence: number | null;
  decision: CandidateProfileReviewDecision;
  id: string;
};
type ReviewAudit = { event_hash: string; sequence: number };

export class CandidateProfileReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateProfileReviewValidationError";
  }
}

export class CandidateProfileReviewConflictError extends Error {
  constructor(message = "This candidate identity changed or was already reviewed.") {
    super(message);
    this.name = "CandidateProfileReviewConflictError";
  }
}

export class CandidateProfileReviewNotFoundError extends Error {
  constructor() {
    super("The candidate profile could not be found.");
    this.name = "CandidateProfileReviewNotFoundError";
  }
}

async function reviewIdFor(input: CandidateProfileReviewInput) {
  return input.expectedPreviousReviewId
    ? deterministicId(
        "review",
        "candidate-profile-version",
        input.expectedBasisHash,
        "supersedes",
        input.expectedPreviousReviewId,
        input.decision,
      )
    : deterministicId("review", "candidate-profile-version", input.expectedBasisHash);
}

async function currentReviewHead(db: D1Database, basisHash: string, candidacyId: string) {
  return db
    .prepare(
      `SELECT review.id, review.decision, profile_audit.sequence AS audit_sequence
         FROM reviews review
         LEFT JOIN audit_events profile_audit
           ON profile_audit.action = 'candidate-profile.reviewed'
          AND profile_audit.entity_type = 'candidate-profile'
          AND profile_audit.entity_id = ?
          AND json_extract(profile_audit.payload, '$.reviewId') = review.id
          AND json_extract(profile_audit.payload, '$.basisHash') = review.target_id
          AND json_extract(profile_audit.payload, '$.decision') = review.decision
        WHERE review.target_type = 'candidate-profile-version'
          AND review.target_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM reviews successor
             WHERE successor.supersedes_review_id = review.id
          )
        LIMIT 1`,
    )
    .bind(candidacyId, basisHash)
    .first<ReviewHead>();
}

async function loadProfileForReview(db: D1Database, candidacyId: string) {
  return db
    .prepare(`${candidateProfileBasisRowSql} WHERE profiles.candidacy_id = ?`)
    .bind(candidacyId)
    .first<CandidateProfileForReview>();
}

function validateBasisManifest(basis: CandidateProfileIdentityBasis) {
  const hash = /^[0-9a-f]{64}$/;
  const id = /^[a-z0-9][a-z0-9:-]{0,159}$/;
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (
    !basis.fullName || basis.fullName.length > 200
    || !basis.affiliation || basis.affiliation.length > 120
    || !id.test(basis.candidacyId)
    || !id.test(basis.constituencyId)
    || !id.test(basis.observedConstituencyId)
    || !id.test(basis.personId)
    || !basis.constituencyName || basis.constituencyName.length > 120
    || !slug.test(basis.slug) || basis.slug.length > 160
    || !hash.test(basis.directoryPayloadHash)
    || !hash.test(basis.profileUrlHash)
    || !basis.directoryVersionId || basis.directoryVersionId.length > 200
    || basis.declarationStatus !== "prospective"
  ) {
    throw new CandidateProfileReviewValidationError(
      "The current candidate identity basis is incomplete or malformed.",
    );
  }
}

async function verifiedBasisForProfile(
  profile: CandidateProfileForReview,
  expectedBasisHash: string,
) {
  const basis = candidateProfileBasisFromRow(profile);
  validateBasisManifest(basis);
  const recomputedHash = await fingerprintCandidateProfileBasis(basis);
  if (
    profile.current_basis_hash !== expectedBasisHash
    || recomputedHash !== expectedBasisHash
  ) throw new CandidateProfileReviewConflictError("The candidate identity basis is stale or invalid.");
  return basis;
}

async function existingReceipt(
  db: D1Database,
  input: CandidateProfileReviewInput,
  reviewId: string,
  rationale: string,
): Promise<CandidateProfileReviewReceipt | null> {
  const review = await db
    .prepare(
      `SELECT decision, rationale, reviewer_id, supersedes_review_id, created_at
         FROM reviews WHERE id = ?`,
    )
    .bind(reviewId)
    .first<StoredReview>();
  if (!review) return null;
  if (
    review.decision !== input.decision
    || review.rationale !== rationale
    || review.reviewer_id !== input.reviewerId
    || review.supersedes_review_id !== input.expectedPreviousReviewId
  ) throw new CandidateProfileReviewConflictError();

  const [profile, head, audit] = await Promise.all([
    loadProfileForReview(db, input.candidacyId),
    currentReviewHead(db, input.expectedBasisHash, input.candidacyId),
    db.prepare(
      `SELECT sequence, event_hash
         FROM audit_events
        WHERE action = 'candidate-profile.reviewed'
          AND entity_type = 'candidate-profile'
          AND entity_id = ?
          AND json_extract(payload, '$.reviewId') = ?
          AND json_extract(payload, '$.basisHash') = ?
          AND json_extract(payload, '$.decision') = ?
        ORDER BY sequence DESC LIMIT 1`,
    ).bind(
      input.candidacyId,
      reviewId,
      input.expectedBasisHash,
      input.decision,
    ).first<ReviewAudit>(),
  ]);
  if (
    !profile
    || profile.declaration_status === "source-removed"
    || profile.review_state !== input.decision
    || head?.id !== reviewId
    || head.audit_sequence === null
  ) throw new CandidateProfileReviewConflictError();
  await verifiedBasisForProfile(profile, input.expectedBasisHash);
  if (!audit) throw new Error("The stored candidate profile review has no matching audit event.");
  return {
    auditEventHash: audit.event_hash,
    auditSequence: audit.sequence,
    basisHash: input.expectedBasisHash,
    candidacyId: input.candidacyId,
    createdAt: review.created_at,
    decision: input.decision,
    idempotent: true,
    publicationState: input.decision === "approved" ? "published" : "withheld",
    reviewId,
    reviewState: input.decision,
    supersedesReviewId: input.expectedPreviousReviewId,
  };
}

export async function reviewCandidateProfileVersion(
  db: D1Database,
  input: CandidateProfileReviewInput,
): Promise<CandidateProfileReviewReceipt> {
  await ensureEvidenceTriggers(db);
  // Older local stores may have been opened before this lifecycle existed.
  await db.prepare(candidateProfileVersionReviewGuardSql).run();
  await backfillCandidateProfileBasisHashes(db);

  let rationale: string;
  try {
    rationale = normalizeReviewRationale(input.decision, input.rationale);
  } catch (error) {
    if (error instanceof SourceItemReviewValidationError) {
      throw new CandidateProfileReviewValidationError(error.message);
    }
    throw error;
  }
  const reviewId = await reviewIdFor(input);
  const replay = await existingReceipt(db, input, reviewId, rationale);
  if (replay) return replay;

  const profile = await loadProfileForReview(db, input.candidacyId);
  if (!profile) throw new CandidateProfileReviewNotFoundError();
  if (!input.expectedBasisHash || profile.declaration_status === "source-removed") {
    throw new CandidateProfileReviewConflictError();
  }
  const identityBasis = await verifiedBasisForProfile(profile, input.expectedBasisHash);

  const head = await currentReviewHead(db, input.expectedBasisHash, input.candidacyId);
  if (head && head.audit_sequence === null) {
    throw new CandidateProfileReviewConflictError("The current decision has no matching audit event.");
  }
  if ((head?.id ?? null) !== input.expectedPreviousReviewId) {
    throw new CandidateProfileReviewConflictError();
  }
  if (head && head.decision === input.decision) {
    throw new CandidateProfileReviewConflictError("Choose the opposite decision to reconsider this profile.");
  }
  const expectedReviewState = head?.decision ?? profile.review_state;
  if (
    (!head && !["unreviewed", "needs-update"].includes(profile.review_state))
    || (head && profile.review_state !== head.decision)
  ) throw new CandidateProfileReviewConflictError();

  let audit: Awaited<ReturnType<typeof appendAuditEventWithStatements>>;
  try {
    audit = await appendAuditEventWithStatements(
      db,
      {
        action: "candidate-profile.reviewed",
        actorId: input.reviewerId,
        actorType: "reviewer",
        entityId: input.candidacyId,
        entityType: "candidate-profile",
        payload: {
          basisHash: input.expectedBasisHash,
          decision: input.decision,
          identityBasis,
          reviewId,
          supersedesReviewId: input.expectedPreviousReviewId,
        },
      },
      (event) => [
        db.prepare(insertCandidateProfileReviewSql).bind(
          reviewId,
          input.expectedBasisHash,
          input.decision,
          rationale,
          input.reviewerId,
          input.expectedPreviousReviewId,
          event.createdAt,
        ),
      ],
      () => [
        db.prepare(updateCandidateProfileReviewStateSql).bind(
          input.decision,
          input.decision,
          input.candidacyId,
          input.expectedBasisHash,
          expectedReviewState,
        ),
      ],
    );
  } catch (error) {
    const replayAfterRace = await existingReceipt(db, input, reviewId, rationale);
    if (replayAfterRace) return replayAfterRace;
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|stale|decision head|supersession|constraint/i.test(message)) {
      throw new CandidateProfileReviewConflictError();
    }
    throw error;
  }

  return {
    auditEventHash: audit.eventHash,
    auditSequence: audit.sequence,
    basisHash: input.expectedBasisHash,
    candidacyId: input.candidacyId,
    createdAt: audit.createdAt,
    decision: input.decision,
    idempotent: false,
    publicationState: input.decision === "approved" ? "published" : "withheld",
    reviewId,
    reviewState: input.decision,
    supersedesReviewId: input.expectedPreviousReviewId,
  };
}
