import { getEvidenceDashboardForDatabase, type EvidenceReviewItem } from "./status.ts";
import {
  CollectionPreparationConflictError,
  CollectionPreparationValidationError,
  prepareSourceItemVersionForReview,
} from "./collection-preparation.ts";
import { reviewSourceItemVersion, type SourceItemReviewReceipt } from "./review.ts";

/** The durable identity used in both the review and audit ledgers. */
export const AUTOMATIC_EVIDENCE_REVIEWER_ID = "evidence-auto-review:v1";

export type AutomaticEvidenceReviewDecision = {
  decision: "approved" | "rejected";
  rationale: string;
};

export type AutomaticEvidenceReviewSummary = {
  approved: number;
  attempted: number;
  conflicts: number;
  prepared: number;
  rejected: number;
  remaining: number;
  skipped: number;
};

/**
 * This is deliberately a source-routing decision, not a political judgement.
 * A direct election source or an exact candidate match is retained as a
 * machine-classified citation. Everything else is withheld but retained,
 * rather than being guessed into a candidate dossier.
 */
export function automaticEvidenceReviewDecision(
  item: Pick<EvidenceReviewItem, "candidateAssociations" | "collectionReason">,
): AutomaticEvidenceReviewDecision {
  const exactCandidateMatch = item.candidateAssociations.length > 0
    && item.candidateAssociations.every((candidate) => candidate.confidence >= 0.98);
  const directElectionSource = item.collectionReason.sourceScope.electionFocused;

  if (item.collectionReason.route === "evidence-review" && (directElectionSource || exactCandidateMatch)) {
    return {
      decision: "approved",
      rationale: "Automatic triage v1 approved this exact election-source or candidate match as citation metadata. No claim, stance, ranking or political judgement was inferred.",
    };
  }

  return {
    decision: "rejected",
    rationale: "Automatic triage v1 withheld this record because it did not meet the direct election-evidence threshold. It remains retained for audit and can be restored after human reconsideration.",
  };
}

function isActionable(item: EvidenceReviewItem) {
  return item.editorialState === "pending"
    && item.collectionReasonState === "frozen"
    && Boolean(
      item.latest_version_id
      && item.content_hash
      && item.collectionReasonHash
      && item.collectionReasonRuleset,
    );
}

function isPending(item: EvidenceReviewItem) {
  return item.editorialState === "pending";
}

function hasReviewableHead(item: EvidenceReviewItem) {
  return Boolean(item.latest_version_id && item.content_hash);
}

async function prepareMissingAssessments(
  db: D1Database,
  items: EvidenceReviewItem[],
  limit: number,
) {
  let prepared = 0;
  let skipped = 0;
  const missing = items.filter((item) => (
    isPending(item)
    && item.collectionReasonState !== "frozen"
    && hasReviewableHead(item)
  ));

  for (const item of missing.slice(0, limit)) {
    try {
      const receipt = await prepareSourceItemVersionForReview(db, {
        actorId: AUTOMATIC_EVIDENCE_REVIEWER_ID,
        expectedContentHash: item.content_hash!,
        expectedVersionId: item.latest_version_id!,
        itemId: item.id,
      });
      if (!receipt.idempotent) prepared += 1;
    } catch (error) {
      if (
        error instanceof CollectionPreparationConflictError
        || error instanceof CollectionPreparationValidationError
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { prepared, skipped };
}

/**
 * Drains a bounded portion of the private evidence inbox. The bounded batch
 * keeps a scheduled invocation predictable; later runs continue until no
 * version remains pending. Conflicts are left untouched for the next pass.
 */
export async function automaticallyReviewEvidenceLibrary(
  db: D1Database,
  options: { limit?: number } = {},
): Promise<AutomaticEvidenceReviewSummary> {
  const limit = Math.max(1, Math.min(options.limit ?? 80, 120));
  let dashboard = await getEvidenceDashboardForDatabase(db);
  const preparation = await prepareMissingAssessments(db, dashboard.reviewItems, limit);
  if (preparation.prepared > 0) {
    dashboard = await getEvidenceDashboardForDatabase(db);
  }
  const pending = dashboard.reviewItems.filter(isActionable);
  const summary: AutomaticEvidenceReviewSummary = {
    approved: 0,
    attempted: 0,
    conflicts: 0,
    prepared: preparation.prepared,
    rejected: 0,
    remaining: pending.length,
    skipped: dashboard.reviewItems.filter(isPending).length - pending.length + preparation.skipped,
  };

  for (const item of pending) {
    if (summary.approved + summary.rejected >= limit) break;
    const autoDecision = automaticEvidenceReviewDecision(item);
    summary.attempted += 1;
    try {
      const receipt: SourceItemReviewReceipt = await reviewSourceItemVersion(db, {
        candidateIds: autoDecision.decision === "approved"
          ? item.candidateAssociations.map((candidate) => candidate.candidacyId).sort()
          : [],
        candidateSuggestionFingerprint: item.candidateSuggestionFingerprint,
        constituencyIds: autoDecision.decision === "approved"
          ? item.constituencyAssociations.map((association) => association.id).sort()
          : [],
        decision: autoDecision.decision,
        expectedCollectionReasonHash: item.collectionReasonHash!,
        expectedCollectionRuleset: item.collectionReasonRuleset,
        expectedContentHash: item.content_hash!,
        expectedPreviousReviewId: null,
        expectedVersionId: item.latest_version_id!,
        itemId: item.id,
        rationale: autoDecision.rationale,
        reviewKind: "source-version",
        reviewerId: AUTOMATIC_EVIDENCE_REVIEWER_ID,
        reviewerType: "system",
        skipRuntimeGuardInitialization: true,
        scopeSuggestionFingerprint: item.collectionScopeSuggestionFingerprint,
        topicIds: autoDecision.decision === "approved"
          ? item.topicAssociations.map((association) => association.id).sort()
          : [],
      });
      if (receipt.decision === "approved") summary.approved += 1;
      else summary.rejected += 1;
    } catch (error) {
      // A changed source/version is intentionally retried on a later pass;
      // never overwrite a newer collection assessment or human decision.
      if (error instanceof Error && /changed|stale|current|already/i.test(error.message)) {
        summary.conflicts += 1;
        continue;
      }
      throw error;
    }
  }

  const after = await getEvidenceDashboardForDatabase(db);
  const afterPending = after.reviewItems.filter(isActionable);
  summary.remaining = afterPending.length;
  summary.skipped = after.reviewItems.filter(isPending).length - afterPending.length;

  return summary;
}
