import { fingerprintCandidateSuggestions } from "./candidate-association.ts";
import {
  approvedCandidateProfileBasisSql,
  backfillCandidateProfileBasisHashes,
} from "./candidate-profile-basis.ts";
import { readVerifiedCollectionReason } from "./collection-assessment.ts";
import {
  COLLECTION_ROUTING_RULE,
  projectCollectionReason,
  type CollectionReason,
  type CollectionSignal,
} from "./collection-reason.ts";
import { ensureEvidenceTriggers } from "./triggers.ts";
import { fingerprintScopeSuggestions } from "./scope-association.ts";

type EvidenceDecisionHead = {
  createdAt: string;
  decision: "approved" | "rejected";
  id: string;
  rationale: string;
  reviewerId: string;
  supersedesReviewId: string | null;
};

export type EvidenceSourceStatus = {
  active: number;
  consecutive_failures: number;
  feed_type: string;
  id: string;
  last_attempt_at: string | null;
  last_error: string | null;
  last_new_item_at: string | null;
  last_success_at: string | null;
  lease_expires_at: string | null;
  name: string;
  next_check_at: string | null;
  poll_interval_minutes: number;
  source_tier: number;
};

export type EvidenceRunStatus = {
  audit_head_hash: string | null;
  changed_item_count: number;
  deferred_item_count: number;
  discovered_count: number;
  error_count: number;
  error_summary: string | null;
  finished_at: string | null;
  http_status: number | null;
  id: string;
  new_item_count: number;
  parser_version: string;
  processed_item_count: number;
  followed_by_clean_run: number;
  source_name: string;
  started_at: string;
  status: string;
};

export type EvidenceReviewItem = {
  association_review_only: number;
  assignmentDecisionCount: number;
  assignmentReviewAvailable: boolean;
  assignmentState: "approved" | "not-applicable" | "pending" | "rejected";
  canonical_url: string;
  candidateAssociations: Array<{
    candidacyId: string;
    confidence: number;
    constituencyName: string;
    fullName: string;
    matchMethod: string;
    mentionText: string;
  }>;
  candidate_ids: string | null;
  candidateSuggestionFingerprint: string;
  collectionScopeSuggestionFingerprint: string;
  collectionReason: CollectionReason;
  collectionReasonHash: string | null;
  collectionReasonRuleset: string;
  collectionReasonState: "frozen" | "not-yet-frozen";
  content_hash: string | null;
  constituencyAssociations: CollectionSignal[];
  currentAssignmentDecision: EvidenceDecisionHead | null;
  currentDecision: EvidenceDecisionHead | null;
  decisionCount: number;
  editorialState: "approved" | "pending" | "rejected";
  first_seen_at: string;
  id: string;
  item_type: string;
  latest_snapshot_id: string | null;
  latest_version_id: string | null;
  lastApprovedAssignmentCandidateIds: string[];
  lastApprovedCandidateIds: string[];
  lastApprovedConstituencyIds: string[];
  lastApprovedTopicIds: string[];
  publication_state: string;
  published_at: string | null;
  review_state: string;
  source_feed_type: string;
  source_id: string;
  source_name: string;
  summary: string;
  title: string;
  topicAssociations: CollectionSignal[];
};

type EvidenceReviewItemRow = Omit<
  EvidenceReviewItem,
  | "candidateAssociations"
  | "candidateSuggestionFingerprint"
  | "collectionScopeSuggestionFingerprint"
  | "collectionReason"
  | "constituencyAssociations"
  | "currentAssignmentDecision"
  | "currentDecision"
  | "assignmentDecisionCount"
  | "assignmentReviewAvailable"
  | "assignmentState"
  | "decisionCount"
  | "editorialState"
  | "lastApprovedAssignmentCandidateIds"
  | "lastApprovedCandidateIds"
  | "lastApprovedConstituencyIds"
  | "lastApprovedTopicIds"
  | "topicAssociations"
> & {
  candidate_associations_json: string;
  assignment_decision_count: number;
  assignment_review_available: number;
  canonical_reason_hash: string | null;
  canonical_reason_json: string | null;
  collection_route_hint: string;
  collection_route: string | null;
  collection_ruleset_id: string | null;
  constituency_associations_json: string;
  current_review_created_at: string | null;
  current_review_decision: string | null;
  current_review_id: string | null;
  current_review_rationale: string | null;
  current_reviewer_id: string | null;
  current_supersedes_review_id: string | null;
  current_assignment_review_created_at: string | null;
  current_assignment_review_decision: string | null;
  current_assignment_review_id: string | null;
  current_assignment_review_rationale: string | null;
  current_assignment_reviewer_id: string | null;
  current_assignment_supersedes_review_id: string | null;
  decision_count: number;
  editorial_state: string;
  last_approved_assignment_candidate_ids_json: string;
  last_approved_candidate_ids_json: string;
  last_approved_constituency_ids_json: string;
  last_approved_topic_ids_json: string;
  topic_associations_json: string;
};

function parseCandidateAssociations(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is EvidenceReviewItem["candidateAssociations"][number] => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Record<string, unknown>;
      return typeof candidate.candidacyId === "string"
        && typeof candidate.confidence === "number"
        && typeof candidate.constituencyName === "string"
        && typeof candidate.fullName === "string"
        && typeof candidate.matchMethod === "string"
        && typeof candidate.mentionText === "string";
    });
  } catch {
    return [];
  }
}

function parseCollectionSignals(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is CollectionSignal => {
      if (!entry || typeof entry !== "object") return false;
      const signal = entry as Record<string, unknown>;
      return typeof signal.confidence === "number"
        && typeof signal.id === "string"
        && typeof signal.label === "string"
        && typeof signal.matchMethod === "string"
        && typeof signal.mentionText === "string";
    });
  } catch {
    return [];
  }
}

function parseIdArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((entry): entry is string => (
      typeof entry === "string" && entry.length > 0 && entry.length <= 160
    )))].sort();
  } catch {
    return [];
  }
}

export type CandidateRegistryStatus = {
  affiliation: string;
  biography_excerpt: string | null;
  biography_paragraph_count: number;
  candidacy_id: string;
  completeness_state: string;
  constituency_name: string;
  constituency_id: string;
  current_basis_hash: string | null;
  current_profile_review_created_at: string | null;
  current_profile_review_decision: "approved" | "rejected" | null;
  current_profile_review_id: string | null;
  current_profile_review_rationale: string | null;
  declaration_status: string;
  directory_payload_hash: string;
  directory_version_id: string | null;
  profile_decision_count: number;
  document_count: number;
  dossier_evidence_count: number;
  full_name: string;
  intelligence_state: string;
  identity_source_url: string | null;
  interview_count: number;
  last_profile_checked_at: string | null;
  link_count: number;
  manifesto_count: number;
  portrait_count: number;
  portrait_remote_url: string | null;
  portrait_rights_state: string | null;
  portrait_variant: string | null;
  observed_constituency_id: string;
  observed_constituency_name: string;
  profile_snapshot_hash: string | null;
  profile_url: string;
  publication_state: string;
  review_state: string;
  slug: string;
  social_count: number;
  transcript_source_count: number;
};

export type TranscriptQueueItem = {
  access_state: string;
  attempt_count: number;
  candidate_name: string;
  constituency_name: string;
  id: string;
  input_kind: string;
  last_error: string | null;
  last_seen_at: string;
  platform: string;
  processing_state: string;
  retention_outcome: string;
  rights_state: string;
  source_title: string;
  source_url: string;
  transcript_id: string | null;
  transcript_publication_state: string | null;
  transcript_review_state: string | null;
};

export type EvidenceRoutingOption = {
  id: string;
  label: string;
};

export type EvidenceDashboard = {
  auditHeadHash: string;
  auditSequence: number;
  candidateProfiles: CandidateRegistryStatus[];
  counts: {
    candidateDocuments: number;
    candidateLinks: number;
    candidatePortraits: number;
    candidates: number;
    claims: number;
    pendingCandidateReview: number;
    pendingBroadMonitoring: number;
    pendingContextMonitoring: number;
    pendingEditorial: number;
    pendingEvidenceReview: number;
    pendingReview: number;
    approvedEvidence: number;
    rejectedEvidence: number;
    parsedCandidateProfiles: number;
    publishableCandidatePortraits: number;
    reviews: number;
    snapshots: number;
    sourceItems: number;
    sources: number;
    transcriptSources: number;
    transcriptsPublished: number;
    transcriptsReadyForReview: number;
  };
  recentRuns: EvidenceRunStatus[];
  reviewItems: EvidenceReviewItem[];
  routingOptions: {
    constituencies: EvidenceRoutingOption[];
    topics: EvidenceRoutingOption[];
  };
  sources: EvidenceSourceStatus[];
  transcriptQueue: TranscriptQueueItem[];
};

type CountRow = {
  candidate_documents: number;
  candidate_links: number;
  candidate_portraits: number;
  candidates: number;
  claims: number;
  pending_candidate_review: number;
  pending_broad_monitoring: number;
  pending_context_monitoring: number;
  pending_editorial: number;
  pending_evidence_review: number;
  pending_review: number;
  approved_evidence: number;
  rejected_evidence: number;
  pending_source_version_review: number;
  parsed_candidate_profiles: number;
  publishable_candidate_portraits: number;
  reviews: number;
  snapshots: number;
  source_items: number;
  sources: number;
  transcript_sources: number;
  transcripts_published: number;
  transcripts_ready_for_review: number;
};

const pendingReviewPredicate = `(
  items.review_state IN ('unreviewed', 'needs-update')
  OR (
    items.review_state = 'approved'
    AND EXISTS (
      SELECT 1 FROM reviews source_review
       WHERE source_review.target_type = 'source-item-version'
         AND source_review.target_id = items.latest_version_id
         AND source_review.decision = 'approved'
         AND source_review.supersedes_review_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM reviews source_successor
            WHERE source_successor.supersedes_review_id = source_review.id
         )
    )
    AND EXISTS (
      SELECT 1
        FROM item_entities candidate_match
        JOIN candidacies current_candidate
          ON current_candidate.id = candidate_match.entity_id
         AND current_candidate.declaration_status != 'source-removed'
       WHERE candidate_match.item_id = items.id
         AND candidate_match.entity_type = 'candidacy'
    )
    AND NOT EXISTS (
      SELECT 1 FROM reviews assignment_review
       WHERE assignment_review.target_type = 'source-item-version-assignment'
         AND assignment_review.target_id = items.latest_version_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM source_item_version_entities frozen
       WHERE frozen.source_item_version_id = items.latest_version_id
         AND frozen.entity_type = 'candidacy'
    )
  )
)`;

const projectedDirectEvidencePredicate = `(
  items.item_type = 'candidate-profile'
  OR sources.id IN ('manx-radio-election', 'manx-radio-candidates')
  OR EXISTS (
    SELECT 1 FROM item_entities candidate_signal
     WHERE candidate_signal.item_id = items.id
       AND candidate_signal.entity_type = 'candidacy'
  )
  OR LOWER(items.title || ' ' || items.summary) LIKE '%general election%'
  OR LOWER(items.title || ' ' || items.summary) LIKE '%house of keys%'
  OR LOWER(items.title || ' ' || items.summary) LIKE '%polling day%'
  OR LOWER(items.title || ' ' || items.summary) LIKE '%manifesto%'
  OR LOWER(items.title || ' ' || items.summary) LIKE '%candidate%'
  OR LOWER(items.title || ' ' || items.summary) LIKE '%election%'
  OR LOWER(items.title || ' ' || items.summary) LIKE '%mhk%'
)`;

const contextSignalPredicate = `EXISTS (
  SELECT 1 FROM item_entities context_signal
   WHERE context_signal.item_id = items.id
     AND context_signal.entity_type IN ('topic', 'constituency')
)`;

const collectionRouteExpression = `COALESCE(
  (
    SELECT frozen_assessment.route
      FROM source_item_version_collection_assessments frozen_assessment
     WHERE frozen_assessment.source_item_version_id = items.latest_version_id
  ),
  CASE
    WHEN ${projectedDirectEvidencePredicate} THEN 'evidence-review'
    WHEN ${contextSignalPredicate} THEN 'context-monitoring'
    ELSE 'broad-monitoring'
  END
)`;

const directEvidencePredicate = `(${collectionRouteExpression}) = 'evidence-review'`;
const contextualEvidencePredicate = `(${collectionRouteExpression}) = 'context-monitoring'`;

const currentOrPreviousApprovedSourceReviewSql = `(SELECT CASE
    WHEN source_review.decision = 'approved' THEN source_review.id
    ELSE source_review.supersedes_review_id
  END
  FROM reviews source_review
 WHERE source_review.target_type = 'source-item-version'
   AND source_review.target_id = items.latest_version_id
   AND NOT EXISTS (
     SELECT 1 FROM reviews source_successor
      WHERE source_successor.supersedes_review_id = source_review.id
   )
 LIMIT 1)`;

const currentOrPreviousEffectiveCandidateReviewSql = `(SELECT CASE
    WHEN approved_source.supersedes_review_id IS NULL
      AND EXISTS (
        SELECT 1 FROM reviews assignment_head
         WHERE assignment_head.target_type = 'source-item-version-assignment'
           AND assignment_head.target_id = items.latest_version_id
           AND NOT EXISTS (
             SELECT 1 FROM reviews assignment_successor
              WHERE assignment_successor.supersedes_review_id = assignment_head.id
           )
      )
    THEN (
      SELECT CASE WHEN assignment_head.decision = 'approved' THEN assignment_head.id ELSE NULL END
        FROM reviews assignment_head
       WHERE assignment_head.target_type = 'source-item-version-assignment'
         AND assignment_head.target_id = items.latest_version_id
         AND NOT EXISTS (
           SELECT 1 FROM reviews assignment_successor
            WHERE assignment_successor.supersedes_review_id = assignment_head.id
         )
       LIMIT 1
    )
    ELSE approved_source.id
  END
  FROM reviews approved_source
 WHERE approved_source.id = ${currentOrPreviousApprovedSourceReviewSql}
 LIMIT 1)`;

function lastApprovedEntityIdsSql(entityType: "candidacy" | "constituency" | "topic") {
  const effectiveReviewSql = entityType === "candidacy"
    ? currentOrPreviousEffectiveCandidateReviewSql
    : currentOrPreviousApprovedSourceReviewSql;
  return `COALESCE((
    SELECT json_group_array(entity_id)
      FROM (
        SELECT frozen.entity_id
          FROM source_item_version_entities frozen
         WHERE frozen.source_item_version_id = items.latest_version_id
           AND frozen.review_id = ${effectiveReviewSql}
           AND frozen.entity_type = '${entityType}'
           AND frozen.confirmation_state = 'confirmed'
         ORDER BY frozen.entity_id
      )
  ), '[]')`;
}

const lastApprovedAssignmentCandidateIdsSql = `COALESCE((
  SELECT json_group_array(entity_id)
    FROM (
      SELECT frozen.entity_id
        FROM source_item_version_entities frozen
       WHERE frozen.source_item_version_id = items.latest_version_id
         AND frozen.review_id = (
           SELECT CASE
             WHEN assignment_review.decision = 'approved' THEN assignment_review.id
             ELSE assignment_review.supersedes_review_id
           END
             FROM reviews assignment_review
            WHERE assignment_review.target_type = 'source-item-version-assignment'
              AND assignment_review.target_id = items.latest_version_id
              AND NOT EXISTS (
                SELECT 1 FROM reviews assignment_successor
                 WHERE assignment_successor.supersedes_review_id = assignment_review.id
              )
            LIMIT 1
         )
         AND frozen.entity_type = 'candidacy'
         AND frozen.confirmation_state = 'confirmed'
       ORDER BY frozen.entity_id
    )
), '[]')`;

export async function getEvidenceDashboardForDatabase(
  db: D1Database,
): Promise<EvidenceDashboard> {
  await ensureEvidenceTriggers(db);
  await backfillCandidateProfileBasisHashes(db);
  const [
    sourceRows,
    runRows,
    reviewRows,
    candidateRows,
    transcriptRows,
    constituencyRows,
    topicRows,
    countRow,
    auditRow,
  ] =
    await Promise.all([
      db
        .prepare(
          `SELECT id, name, feed_type, source_tier, active, poll_interval_minutes,
                  last_attempt_at, last_success_at, last_new_item_at, next_check_at,
                  lease_expires_at, consecutive_failures, last_error
           FROM sources ORDER BY source_tier, name`,
        )
        .all<EvidenceSourceStatus>(),
      db
        .prepare(
          `SELECT runs.id, runs.status, runs.started_at, runs.finished_at,
                  runs.discovered_count, runs.processed_item_count, runs.deferred_item_count,
                  runs.new_item_count, runs.changed_item_count, runs.error_count,
                  runs.error_summary, runs.http_status, runs.parser_version,
                  runs.audit_head_hash, sources.name AS source_name,
                  CASE WHEN runs.status IN ('failed', 'partial')
                    AND EXISTS (
                      SELECT 1 FROM ingestion_runs later
                       WHERE later.source_id = runs.source_id
                         AND later.started_at > runs.started_at
                         AND later.status IN ('succeeded', 'no_change')
                         AND (
                           runs.status = 'failed'
                           OR later.processed_item_count > 0
                         )
                    ) THEN 1 ELSE 0 END AS followed_by_clean_run
           FROM ingestion_runs runs
           JOIN sources ON sources.id = runs.source_id
           ORDER BY runs.started_at DESC LIMIT 18`,
        )
        .all<EvidenceRunStatus>(),
      db
        .prepare(
          `WITH review_candidates AS (
             SELECT items.id, items.item_type, items.title, items.summary,
                    items.canonical_url, items.first_seen_at, items.published_at,
                    items.review_state, items.publication_state, items.content_hash,
                    items.latest_snapshot_id, items.latest_version_id,
                    sources.id AS source_id, sources.name AS source_name,
                    sources.feed_type AS source_feed_type,
                    CASE items.review_state
                      WHEN 'approved' THEN 'approved'
                      WHEN 'rejected' THEN 'rejected'
                      ELSE 'pending'
                    END AS editorial_state,
                    (SELECT COUNT(*) FROM reviews decision_history
                      WHERE decision_history.target_type = 'source-item-version'
                        AND decision_history.target_id = items.latest_version_id)
                      AS decision_count,
                    (SELECT COUNT(*) FROM reviews assignment_history
                      WHERE assignment_history.target_type = 'source-item-version-assignment'
                        AND assignment_history.target_id = items.latest_version_id)
                      AS assignment_decision_count,
                    (SELECT current_review.id FROM reviews current_review
                      WHERE current_review.target_type = 'source-item-version'
                        AND current_review.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews successor
                           WHERE successor.supersedes_review_id = current_review.id
                        ) LIMIT 1) AS current_review_id,
                    (SELECT current_review.decision FROM reviews current_review
                      WHERE current_review.target_type = 'source-item-version'
                        AND current_review.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews successor
                           WHERE successor.supersedes_review_id = current_review.id
                        ) LIMIT 1) AS current_review_decision,
                    (SELECT current_review.rationale FROM reviews current_review
                      WHERE current_review.target_type = 'source-item-version'
                        AND current_review.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews successor
                           WHERE successor.supersedes_review_id = current_review.id
                        ) LIMIT 1) AS current_review_rationale,
                    (SELECT current_review.reviewer_id FROM reviews current_review
                      WHERE current_review.target_type = 'source-item-version'
                        AND current_review.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews successor
                           WHERE successor.supersedes_review_id = current_review.id
                        ) LIMIT 1) AS current_reviewer_id,
                    (SELECT current_review.created_at FROM reviews current_review
                      WHERE current_review.target_type = 'source-item-version'
                        AND current_review.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews successor
                           WHERE successor.supersedes_review_id = current_review.id
                        ) LIMIT 1) AS current_review_created_at,
                    (SELECT current_review.supersedes_review_id FROM reviews current_review
                      WHERE current_review.target_type = 'source-item-version'
                        AND current_review.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews successor
                           WHERE successor.supersedes_review_id = current_review.id
                        ) LIMIT 1) AS current_supersedes_review_id,
                    (SELECT current_assignment.id FROM reviews current_assignment
                      WHERE current_assignment.target_type = 'source-item-version-assignment'
                        AND current_assignment.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews assignment_successor
                           WHERE assignment_successor.supersedes_review_id = current_assignment.id
                        ) LIMIT 1) AS current_assignment_review_id,
                    (SELECT current_assignment.decision FROM reviews current_assignment
                      WHERE current_assignment.target_type = 'source-item-version-assignment'
                        AND current_assignment.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews assignment_successor
                           WHERE assignment_successor.supersedes_review_id = current_assignment.id
                        ) LIMIT 1) AS current_assignment_review_decision,
                    (SELECT current_assignment.rationale FROM reviews current_assignment
                      WHERE current_assignment.target_type = 'source-item-version-assignment'
                        AND current_assignment.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews assignment_successor
                           WHERE assignment_successor.supersedes_review_id = current_assignment.id
                        ) LIMIT 1) AS current_assignment_review_rationale,
                    (SELECT current_assignment.reviewer_id FROM reviews current_assignment
                      WHERE current_assignment.target_type = 'source-item-version-assignment'
                        AND current_assignment.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews assignment_successor
                           WHERE assignment_successor.supersedes_review_id = current_assignment.id
                        ) LIMIT 1) AS current_assignment_reviewer_id,
                    (SELECT current_assignment.created_at FROM reviews current_assignment
                      WHERE current_assignment.target_type = 'source-item-version-assignment'
                        AND current_assignment.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews assignment_successor
                           WHERE assignment_successor.supersedes_review_id = current_assignment.id
                        ) LIMIT 1) AS current_assignment_review_created_at,
                    (SELECT current_assignment.supersedes_review_id FROM reviews current_assignment
                      WHERE current_assignment.target_type = 'source-item-version-assignment'
                        AND current_assignment.target_id = items.latest_version_id
                        AND NOT EXISTS (
                          SELECT 1 FROM reviews assignment_successor
                           WHERE assignment_successor.supersedes_review_id = current_assignment.id
                        ) LIMIT 1) AS current_assignment_supersedes_review_id,
                    (SELECT frozen.canonical_reason_json
                       FROM source_item_version_collection_assessments frozen
                      WHERE frozen.source_item_version_id = items.latest_version_id)
                      AS canonical_reason_json,
                    (SELECT frozen.canonical_reason_hash
                       FROM source_item_version_collection_assessments frozen
                      WHERE frozen.source_item_version_id = items.latest_version_id)
                      AS canonical_reason_hash,
                    (SELECT frozen.route
                       FROM source_item_version_collection_assessments frozen
                      WHERE frozen.source_item_version_id = items.latest_version_id)
                      AS collection_route,
                    (SELECT frozen.ruleset_id
                       FROM source_item_version_collection_assessments frozen
                      WHERE frozen.source_item_version_id = items.latest_version_id)
                      AS collection_ruleset_id,
                    CASE WHEN items.review_state = 'approved'
                      AND EXISTS (
                        SELECT 1 FROM reviews source_review
                         WHERE source_review.target_type = 'source-item-version'
                           AND source_review.target_id = items.latest_version_id
                           AND source_review.decision = 'approved'
                           AND source_review.supersedes_review_id IS NULL
                           AND NOT EXISTS (
                             SELECT 1 FROM reviews source_successor
                              WHERE source_successor.supersedes_review_id = source_review.id
                           )
                      )
                      AND EXISTS (
                        SELECT 1
                          FROM item_entities candidate_match
                          JOIN candidacies current_candidate
                            ON current_candidate.id = candidate_match.entity_id
                           AND current_candidate.declaration_status != 'source-removed'
                         WHERE candidate_match.item_id = items.id
                           AND candidate_match.entity_type = 'candidacy'
                      )
                      AND NOT EXISTS (
                        SELECT 1 FROM reviews assignment_review
                         WHERE assignment_review.target_type = 'source-item-version-assignment'
                           AND assignment_review.target_id = items.latest_version_id
                      )
                      AND NOT EXISTS (
                        SELECT 1 FROM source_item_version_entities frozen
                         WHERE frozen.source_item_version_id = items.latest_version_id
                           AND frozen.entity_type = 'candidacy'
                      )
                      THEN 1 ELSE 0 END AS association_review_only,
                    CASE WHEN items.review_state = 'approved'
                      AND items.publication_state = 'published'
                      AND EXISTS (
                        SELECT 1 FROM reviews source_review
                         WHERE source_review.target_type = 'source-item-version'
                           AND source_review.target_id = items.latest_version_id
                           AND source_review.decision = 'approved'
                           AND source_review.supersedes_review_id IS NULL
                           AND NOT EXISTS (
                             SELECT 1 FROM reviews source_successor
                              WHERE source_successor.supersedes_review_id = source_review.id
                           )
                      )
                      AND EXISTS (
                        SELECT 1
                          FROM item_entities candidate_match
                          JOIN candidacies current_candidate
                            ON current_candidate.id = candidate_match.entity_id
                           AND current_candidate.declaration_status != 'source-removed'
                         WHERE candidate_match.item_id = items.id
                           AND candidate_match.entity_type = 'candidacy'
                      )
                      AND (
                        EXISTS (
                          SELECT 1 FROM reviews assignment_review
                           WHERE assignment_review.target_type = 'source-item-version-assignment'
                             AND assignment_review.target_id = items.latest_version_id
                             AND NOT EXISTS (
                               SELECT 1 FROM reviews assignment_successor
                                WHERE assignment_successor.supersedes_review_id = assignment_review.id
                             )
                        )
                        OR (
                          NOT EXISTS (
                            SELECT 1 FROM reviews assignment_review
                             WHERE assignment_review.target_type = 'source-item-version-assignment'
                               AND assignment_review.target_id = items.latest_version_id
                          )
                          AND NOT EXISTS (
                            SELECT 1 FROM source_item_version_entities frozen
                             WHERE frozen.source_item_version_id = items.latest_version_id
                               AND frozen.entity_type = 'candidacy'
                          )
                        )
                      )
                      THEN 1 ELSE 0 END AS assignment_review_available,
                    COALESCE((
                      SELECT json_group_array(json_object(
                        'candidacyId', candidate_matches.entity_id,
                        'fullName', people.full_name,
                        'constituencyName', constituencies.name,
                        'matchMethod', candidate_matches.match_method,
                        'mentionText', candidate_matches.mention_text,
                        'confidence', candidate_matches.confidence
                      ))
                      FROM item_entities candidate_matches
                      JOIN candidacies ON candidacies.id = candidate_matches.entity_id
                      JOIN people ON people.id = candidacies.person_id
                      JOIN constituencies ON constituencies.id = candidacies.constituency_id
                      WHERE candidate_matches.item_id = items.id
                        AND candidate_matches.entity_type = 'candidacy'
                        AND candidacies.declaration_status != 'source-removed'
                    ), '[]') AS candidate_associations_json,
                    COALESCE((
                      SELECT json_group_array(json_object(
                        'id', topic_matches.entity_id,
                        'label', topics.name,
                        'matchMethod', topic_matches.match_method,
                        'mentionText', topic_matches.mention_text,
                        'confidence', topic_matches.confidence
                      ))
                      FROM item_entities topic_matches
                      JOIN policy_topics topics ON topics.id = topic_matches.entity_id
                      WHERE topic_matches.item_id = items.id
                        AND topic_matches.entity_type = 'topic'
                    ), '[]') AS topic_associations_json,
                    COALESCE((
                      SELECT json_group_array(json_object(
                        'id', constituency_matches.entity_id,
                        'label', constituencies.name,
                        'matchMethod', constituency_matches.match_method,
                        'mentionText', constituency_matches.mention_text,
                        'confidence', constituency_matches.confidence
                      ))
                      FROM item_entities constituency_matches
                      JOIN constituencies ON constituencies.id = constituency_matches.entity_id
                      WHERE constituency_matches.item_id = items.id
                        AND constituency_matches.entity_type = 'constituency'
                    ), '[]') AS constituency_associations_json,
                    ${lastApprovedEntityIdsSql("candidacy")}
                      AS last_approved_candidate_ids_json,
                    ${lastApprovedAssignmentCandidateIdsSql}
                      AS last_approved_assignment_candidate_ids_json,
                    ${lastApprovedEntityIdsSql("constituency")}
                      AS last_approved_constituency_ids_json,
                    ${lastApprovedEntityIdsSql("topic")}
                      AS last_approved_topic_ids_json,
                    (SELECT GROUP_CONCAT(candidate_ids.entity_id)
                       FROM item_entities candidate_ids
                      WHERE candidate_ids.item_id = items.id
                        AND candidate_ids.entity_type = 'candidacy') AS candidate_ids,
                    ${collectionRouteExpression} AS collection_route_hint
             FROM source_items items
             JOIN sources ON sources.id = items.source_id
             WHERE items.latest_version_id IS NOT NULL
           )
           SELECT * FROM review_candidates
            ORDER BY CASE editorial_state
              WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
              CASE collection_route_hint
              WHEN 'evidence-review' THEN 0
              WHEN 'context-monitoring' THEN 1
              ELSE 2 END,
              COALESCE(published_at, first_seen_at) DESC`,
        )
        .all<EvidenceReviewItemRow>(),
      db
        .prepare(
          `SELECT profiles.candidacy_id, profiles.slug, profiles.profile_url,
                  profiles.completeness_state, profiles.review_state,
                  profiles.publication_state, profiles.last_profile_checked_at,
                  profiles.current_basis_hash,
                  candidacies.affiliation, candidacies.declaration_status,
                  candidacies.constituency_id,
                  canonical_constituency.name AS constituency_name,
                  profiles.observed_constituency_id,
                  observed_constituency.name AS observed_constituency_name,
                  directory_observation.payload_hash AS directory_payload_hash,
                  json_extract(directory_observation.payload, '$.candidate.profileUrl')
                    AS identity_source_url,
                  COALESCE(
                    (SELECT versions.id FROM source_item_versions versions
                      WHERE versions.source_item_id = directory_observation.source_item_id
                        AND versions.snapshot_id = directory_observation.snapshot_id
                        AND versions.payload_hash = directory_observation.payload_hash
                        AND versions.parser_version = 'candidate-directory-v1'
                      ORDER BY versions.observed_at DESC, versions.created_at DESC LIMIT 1),
                    (SELECT versions.id FROM source_item_versions versions
                      WHERE versions.source_item_id = directory_observation.source_item_id
                        AND versions.payload_hash = directory_observation.payload_hash
                        AND versions.parser_version = 'candidate-directory-v1'
                        AND versions.observed_at <= directory_observation.observed_at
                      ORDER BY versions.observed_at DESC, versions.created_at DESC LIMIT 1)
                  ) AS directory_version_id,
                  profile_review.id AS current_profile_review_id,
                  profile_review.decision AS current_profile_review_decision,
                  profile_review.rationale AS current_profile_review_rationale,
                  profile_review.created_at AS current_profile_review_created_at,
                  (SELECT COUNT(*) FROM reviews profile_decision
                    WHERE profile_decision.target_type = 'candidate-profile-version'
                      AND profile_decision.target_id = profiles.current_basis_hash)
                    AS profile_decision_count,
                  people.full_name,
                  COALESCE(intelligence.analysis_state, 'missing') AS intelligence_state,
                  COALESCE(json_array_length(json_extract(profile_observation.payload, '$.biographyParagraphs')), 0)
                    AS biography_paragraph_count,
                  json_extract(profile_observation.payload, '$.biographyParagraphs[0]') AS biography_excerpt,
                  profile_snapshot.content_hash AS profile_snapshot_hash,
                  (SELECT COUNT(*) FROM candidate_links links
                   WHERE links.candidacy_id = profiles.candidacy_id
                     AND links.verification_state != 'broken'
                     AND links.last_seen_at = profile_observation.observed_at) AS link_count,
                  (SELECT COUNT(*) FROM candidate_links links
                   WHERE links.candidacy_id = profiles.candidacy_id
                     AND links.verification_state != 'broken'
                     AND links.last_seen_at = profile_observation.observed_at
                     AND links.link_type IN ('facebook', 'instagram', 'linkedin', 'x')) AS social_count,
                  (SELECT COUNT(*) FROM candidate_links links
                   WHERE links.candidacy_id = profiles.candidacy_id
                     AND links.verification_state != 'broken'
                     AND links.last_seen_at = profile_observation.observed_at
                     AND links.link_type IN ('interview-audio', 'interview-video', 'youtube')) AS interview_count,
                  (SELECT COUNT(*) FROM candidate_documents documents
                   WHERE documents.candidacy_id = profiles.candidacy_id
                     AND documents.last_seen_at = profile_observation.observed_at) AS document_count,
                  (SELECT COUNT(*) FROM candidate_documents documents
                   WHERE documents.candidacy_id = profiles.candidacy_id
                     AND documents.last_seen_at = profile_observation.observed_at
                     AND documents.document_kind = 'manifesto') AS manifesto_count,
                  (SELECT COUNT(*) FROM transcript_jobs jobs
                   WHERE jobs.candidacy_id = profiles.candidacy_id
                     AND jobs.processing_state != 'removed'
                     AND jobs.last_seen_at = profile_observation.observed_at) AS transcript_source_count,
                  (SELECT COUNT(*)
                     FROM source_item_version_entities frozen
                     JOIN source_item_versions versions
                       ON versions.id = frozen.source_item_version_id
                     JOIN source_items items
                       ON items.id = versions.source_item_id
                      AND items.latest_version_id = versions.id
                      AND items.content_hash = versions.payload_hash
                     JOIN reviews review
                       ON review.id = frozen.review_id
                      AND review.target_type IN ('source-item-version', 'source-item-version-assignment')
                      AND review.target_id = versions.id
                      AND review.decision = 'approved'
                      AND NOT EXISTS (
                        SELECT 1 FROM reviews successor
                         WHERE successor.supersedes_review_id = review.id
                      )
                      AND (
                        review.target_type = 'source-item-version'
                        OR EXISTS (
                          SELECT 1 FROM reviews source_review
                           WHERE source_review.target_type = 'source-item-version'
                             AND source_review.target_id = versions.id
                             AND source_review.decision = 'approved'
                             AND source_review.supersedes_review_id IS NULL
                             AND NOT EXISTS (
                               SELECT 1 FROM reviews source_successor
                                WHERE source_successor.supersedes_review_id = source_review.id
                             )
                        )
                      )
                    WHERE frozen.entity_type = 'candidacy'
                      AND frozen.entity_id = profiles.candidacy_id
                      AND frozen.confirmation_state = 'confirmed'
                      AND items.review_state = 'approved'
                      AND items.publication_state = 'published') AS dossier_evidence_count,
                  (SELECT COUNT(*) FROM candidate_media_assets media
                   WHERE media.candidacy_id = profiles.candidacy_id
                     AND media.media_kind = 'portrait'
                     AND media.last_seen_at IN (
                       directory_observation.observed_at, profile_observation.observed_at
                     )) AS portrait_count,
                  portrait.remote_url AS portrait_remote_url,
                  portrait.rights_state AS portrait_rights_state,
                  portrait.variant AS portrait_variant
           FROM candidate_profiles profiles
           JOIN candidacies ON candidacies.id = profiles.candidacy_id
           JOIN people ON people.id = candidacies.person_id
           JOIN constituencies canonical_constituency
             ON canonical_constituency.id = candidacies.constituency_id
           JOIN constituencies observed_constituency
             ON observed_constituency.id = profiles.observed_constituency_id
           LEFT JOIN candidate_intelligence_heads intelligence
             ON intelligence.candidacy_id = profiles.candidacy_id
           LEFT JOIN reviews profile_review
             ON profile_review.target_type = 'candidate-profile-version'
            AND profile_review.target_id = profiles.current_basis_hash
            AND NOT EXISTS (
              SELECT 1 FROM reviews profile_successor
               WHERE profile_successor.supersedes_review_id = profile_review.id
            )
            AND EXISTS (
              SELECT 1 FROM audit_events profile_audit
               WHERE profile_audit.action = 'candidate-profile.reviewed'
                 AND profile_audit.entity_type = 'candidate-profile'
                 AND profile_audit.entity_id = profiles.candidacy_id
                 AND json_extract(profile_audit.payload, '$.reviewId') = profile_review.id
                 AND json_extract(profile_audit.payload, '$.basisHash') = profiles.current_basis_hash
                 AND json_extract(profile_audit.payload, '$.decision') = profile_review.decision
            )
           LEFT JOIN candidate_profile_observations profile_observation
             ON profile_observation.id = profiles.current_profile_observation_id
           LEFT JOIN candidate_profile_observations directory_observation
             ON directory_observation.id = profiles.current_directory_observation_id
           LEFT JOIN source_snapshots profile_snapshot
             ON profile_snapshot.id = profile_observation.snapshot_id
           LEFT JOIN candidate_media_assets portrait
             ON portrait.id = (
               SELECT media.id FROM candidate_media_assets media
               WHERE media.candidacy_id = profiles.candidacy_id
                 AND media.media_kind = 'portrait'
                 AND media.retention_outcome != 'removed'
                 AND media.last_seen_at IN (
                   directory_observation.observed_at, profile_observation.observed_at
                 )
               ORDER BY CASE media.variant
                 WHEN 'profile-body' THEN 0 WHEN 'profile-og' THEN 1 ELSE 2 END,
                 media.last_seen_at DESC, media.id
               LIMIT 1
             )
           WHERE candidacies.declaration_status != 'source-removed'
           ORDER BY canonical_constituency.name, people.sort_name`,
        )
        .all<CandidateRegistryStatus>(),
      db
        .prepare(
          `SELECT jobs.id, jobs.input_kind, jobs.platform, jobs.source_url,
                  jobs.access_state, jobs.rights_state, jobs.retention_outcome,
                  jobs.processing_state, jobs.attempt_count, jobs.last_error,
                  jobs.last_seen_at, people.full_name AS candidate_name,
                  constituencies.name AS constituency_name,
                  COALESCE(documents.title, links.label, 'Interview source') AS source_title,
                  transcripts.id AS transcript_id,
                  transcripts.review_state AS transcript_review_state,
                  transcripts.publication_state AS transcript_publication_state
           FROM transcript_jobs jobs
           JOIN candidacies ON candidacies.id = jobs.candidacy_id
           JOIN people ON people.id = candidacies.person_id
           JOIN constituencies ON constituencies.id = candidacies.constituency_id
           LEFT JOIN candidate_documents documents ON documents.id = jobs.candidate_document_id
           LEFT JOIN candidate_links links ON links.id = jobs.candidate_link_id
           LEFT JOIN transcripts ON transcripts.job_id = jobs.id
             AND transcripts.revision_number = (
               SELECT MAX(latest.revision_number)
               FROM transcripts latest
               WHERE latest.job_id = jobs.id
             )
           WHERE candidacies.declaration_status != 'source-removed'
           ORDER BY CASE jobs.processing_state
             WHEN 'ready-for-review' THEN 0 WHEN 'failed' THEN 1 ELSE 2 END,
             jobs.last_seen_at DESC
           LIMIT 60`,
        )
        .all<TranscriptQueueItem>(),
      db
        .prepare("SELECT id, name AS label FROM constituencies ORDER BY name COLLATE NOCASE, id")
        .all<EvidenceRoutingOption>(),
      db
        .prepare(
          "SELECT id, name AS label FROM policy_topics WHERE active = 1 ORDER BY name COLLATE NOCASE, id",
        )
        .all<EvidenceRoutingOption>(),
      db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM sources WHERE active = 1) AS sources,
            (SELECT COUNT(*) FROM source_items) AS source_items,
            (SELECT COUNT(*) FROM source_snapshots) AS snapshots,
            (SELECT COUNT(*) FROM source_items items
             JOIN sources ON sources.id = items.source_id
             WHERE ${pendingReviewPredicate}) AS pending_review,
            (SELECT COUNT(*) FROM source_items items
             WHERE items.review_state = 'approved'
               AND items.publication_state = 'published'
               AND EXISTS (
                 SELECT 1 FROM reviews current_review
                  WHERE current_review.target_type = 'source-item-version'
                    AND current_review.target_id = items.latest_version_id
                    AND current_review.decision = 'approved'
                    AND NOT EXISTS (
                      SELECT 1 FROM reviews successor
                       WHERE successor.supersedes_review_id = current_review.id
                    )
               )) AS approved_evidence,
            (SELECT COUNT(*) FROM source_items items
             WHERE items.review_state = 'rejected'
               AND items.publication_state = 'withheld'
               AND EXISTS (
                 SELECT 1 FROM reviews current_review
                  WHERE current_review.target_type = 'source-item-version'
                    AND current_review.target_id = items.latest_version_id
                    AND current_review.decision = 'rejected'
                    AND NOT EXISTS (
                      SELECT 1 FROM reviews successor
                       WHERE successor.supersedes_review_id = current_review.id
                    )
               )) AS rejected_evidence,
            (SELECT COUNT(*) FROM source_items items
             JOIN sources ON sources.id = items.source_id
             WHERE ${pendingReviewPredicate}
               AND ${directEvidencePredicate}) AS pending_evidence_review,
            (SELECT COUNT(*) FROM source_items items
             JOIN sources ON sources.id = items.source_id
             WHERE ${pendingReviewPredicate}
               AND ${contextualEvidencePredicate}) AS pending_context_monitoring,
            (SELECT COUNT(*) FROM source_items items
             JOIN sources ON sources.id = items.source_id
             WHERE ${pendingReviewPredicate}
               AND NOT ${directEvidencePredicate}
               AND NOT ${contextualEvidencePredicate}) AS pending_broad_monitoring,
            (SELECT COUNT(*) FROM source_items
             WHERE review_state IN ('unreviewed', 'needs-update')) AS pending_source_version_review,
            (SELECT COUNT(*) FROM candidate_profiles profiles
             JOIN candidacies ON candidacies.id = profiles.candidacy_id
             WHERE candidacies.declaration_status != 'source-removed') AS candidates,
            (SELECT COUNT(*) FROM candidate_profiles profiles
             JOIN candidacies ON candidacies.id = profiles.candidacy_id
             WHERE profiles.completeness_state = 'profile-parsed'
               AND candidacies.declaration_status != 'source-removed') AS parsed_candidate_profiles,
            (SELECT COUNT(*) FROM candidate_profiles profiles
             JOIN candidacies ON candidacies.id = profiles.candidacy_id
             WHERE NOT ${approvedCandidateProfileBasisSql("profiles")}
               AND candidacies.declaration_status != 'source-removed') AS pending_candidate_review,
            (SELECT COUNT(*) FROM candidate_media_assets media
             JOIN candidacies ON candidacies.id = media.candidacy_id
             WHERE media.media_kind = 'portrait'
               AND media.retention_outcome != 'removed'
               AND candidacies.declaration_status != 'source-removed') AS candidate_portraits,
            0 AS publishable_candidate_portraits,
            (SELECT COUNT(*) FROM candidate_links) AS candidate_links,
            (SELECT COUNT(*) FROM candidate_documents) AS candidate_documents,
            (SELECT COUNT(*) FROM transcript_jobs WHERE processing_state != 'removed') AS transcript_sources,
            (SELECT COUNT(*) FROM transcripts WHERE review_state IN ('unreviewed', 'needs-update'))
              AS transcripts_ready_for_review,
            (SELECT COUNT(*) FROM transcripts WHERE publication_state = 'published') AS transcripts_published,
            (SELECT COUNT(*) FROM claims) AS claims,
            (SELECT COUNT(*) FROM reviews) AS reviews,
            ((SELECT COUNT(*) FROM source_items WHERE review_state IN ('unreviewed', 'needs-update'))
              + (SELECT COUNT(*) FROM candidate_profiles WHERE review_state IN ('unreviewed', 'needs-update'))
              + (SELECT COUNT(*) FROM candidate_links WHERE review_state IN ('unreviewed', 'needs-update'))
              + (SELECT COUNT(*) FROM candidate_media_assets WHERE review_state IN ('unreviewed', 'needs-update'))
              + (SELECT COUNT(*) FROM candidate_documents WHERE review_state IN ('unreviewed', 'needs-update'))
              + (SELECT COUNT(*) FROM transcripts WHERE review_state IN ('unreviewed', 'needs-update'))
              + (SELECT COUNT(*) FROM claims WHERE review_state IN ('unreviewed', 'needs-update')))
              AS pending_editorial`,
        )
        .first<CountRow>(),
      db
        .prepare("SELECT next_sequence, last_event_hash FROM audit_chain_head WHERE chain_id = 1")
        .first<{ last_event_hash: string; next_sequence: number }>(),
    ]);

  const reviewItems = await Promise.all(reviewRows.results.map(async (item) => {
    const {
      candidate_associations_json: candidateAssociationsJson,
      assignment_decision_count: assignmentDecisionCount,
      assignment_review_available: assignmentReviewAvailable,
      canonical_reason_hash: canonicalReasonHash,
      canonical_reason_json: canonicalReasonJson,
      collection_route: collectionRoute,
      collection_route_hint: _collectionRouteHint,
      collection_ruleset_id: collectionRulesetId,
      constituency_associations_json: constituencyAssociationsJson,
      current_review_created_at: currentReviewCreatedAt,
      current_review_decision: currentReviewDecision,
      current_review_id: currentReviewId,
      current_review_rationale: currentReviewRationale,
      current_reviewer_id: currentReviewerId,
      current_supersedes_review_id: currentSupersedesReviewId,
      current_assignment_review_created_at: currentAssignmentReviewCreatedAt,
      current_assignment_review_decision: currentAssignmentReviewDecision,
      current_assignment_review_id: currentAssignmentReviewId,
      current_assignment_review_rationale: currentAssignmentReviewRationale,
      current_assignment_reviewer_id: currentAssignmentReviewerId,
      current_assignment_supersedes_review_id: currentAssignmentSupersedesReviewId,
      decision_count: decisionCount,
      editorial_state: editorialState,
      last_approved_assignment_candidate_ids_json: lastApprovedAssignmentCandidateIdsJson,
      last_approved_candidate_ids_json: lastApprovedCandidateIdsJson,
      last_approved_constituency_ids_json: lastApprovedConstituencyIdsJson,
      last_approved_topic_ids_json: lastApprovedTopicIdsJson,
      topic_associations_json: topicAssociationsJson,
      ...reviewItem
    } = item;
    void _collectionRouteHint;
    const candidateAssociations = parseCandidateAssociations(candidateAssociationsJson);
    const constituencyAssociations = parseCollectionSignals(constituencyAssociationsJson);
    const topicAssociations = parseCollectionSignals(topicAssociationsJson);
    const frozenCollectionReason = await readVerifiedCollectionReason({
      canonical_reason_hash: canonicalReasonHash,
      canonical_reason_json: canonicalReasonJson,
      collection_route: collectionRoute,
      collection_ruleset_id: collectionRulesetId,
    });
    const collectionReason = frozenCollectionReason ?? projectCollectionReason({
      candidates: candidateAssociations.map((candidate) => ({
        confidence: candidate.confidence,
        id: candidate.candidacyId,
        label: candidate.fullName,
        matchMethod: candidate.matchMethod,
        mentionText: candidate.mentionText,
      })),
      constituencies: constituencyAssociations,
      itemType: reviewItem.item_type,
      sourceFeedType: reviewItem.source_feed_type,
      sourceId: reviewItem.source_id,
      sourceName: reviewItem.source_name,
      summary: reviewItem.summary,
      title: reviewItem.title,
      topics: topicAssociations,
    });
    const normalizedEditorialState: EvidenceReviewItem["editorialState"] =
      editorialState === "approved" || editorialState === "rejected"
        ? editorialState
        : "pending";
    const normalizedAssignmentState: EvidenceReviewItem["assignmentState"] =
      currentAssignmentReviewDecision === "approved" || currentAssignmentReviewDecision === "rejected"
        ? currentAssignmentReviewDecision
        : reviewItem.association_review_only ? "pending" : "not-applicable";
    return {
      ...reviewItem,
      assignmentDecisionCount,
      assignmentReviewAvailable: Boolean(assignmentReviewAvailable),
      assignmentState: normalizedAssignmentState,
      candidateAssociations,
      collectionReason,
      collectionReasonHash: frozenCollectionReason ? canonicalReasonHash : null,
      collectionReasonRuleset: frozenCollectionReason?.ruleId ?? COLLECTION_ROUTING_RULE,
      collectionReasonState: frozenCollectionReason
        ? "frozen" as const
        : "not-yet-frozen" as const,
      constituencyAssociations,
      currentAssignmentDecision: currentAssignmentReviewId
        && (currentAssignmentReviewDecision === "approved" || currentAssignmentReviewDecision === "rejected")
        && currentAssignmentReviewRationale
        && currentAssignmentReviewerId
        && currentAssignmentReviewCreatedAt
        ? {
            createdAt: currentAssignmentReviewCreatedAt,
            decision: currentAssignmentReviewDecision as "approved" | "rejected",
            id: currentAssignmentReviewId,
            rationale: currentAssignmentReviewRationale,
            reviewerId: currentAssignmentReviewerId,
            supersedesReviewId: currentAssignmentSupersedesReviewId,
          }
        : null,
      currentDecision: currentReviewId
        && (currentReviewDecision === "approved" || currentReviewDecision === "rejected")
        && currentReviewRationale
        && currentReviewerId
        && currentReviewCreatedAt
        ? {
            createdAt: currentReviewCreatedAt,
            decision: currentReviewDecision as "approved" | "rejected",
            id: currentReviewId,
            rationale: currentReviewRationale,
            reviewerId: currentReviewerId,
            supersedesReviewId: currentSupersedesReviewId,
          }
        : null,
      decisionCount,
      editorialState: normalizedEditorialState,
      lastApprovedAssignmentCandidateIds: parseIdArray(lastApprovedAssignmentCandidateIdsJson),
      lastApprovedCandidateIds: parseIdArray(lastApprovedCandidateIdsJson),
      lastApprovedConstituencyIds: parseIdArray(lastApprovedConstituencyIdsJson),
      lastApprovedTopicIds: parseIdArray(lastApprovedTopicIdsJson),
      candidateSuggestionFingerprint: await fingerprintCandidateSuggestions(
        candidateAssociations.map((candidate) => ({
          candidacyId: candidate.candidacyId,
          confidence: candidate.confidence,
          matchMethod: candidate.matchMethod,
          mentionText: candidate.mentionText,
        })),
      ),
      collectionScopeSuggestionFingerprint: await fingerprintScopeSuggestions([
        ...constituencyAssociations.map((association) => ({
          ...association,
          entityType: "constituency" as const,
        })),
        ...topicAssociations.map((association) => ({
          ...association,
          entityType: "topic" as const,
        })),
      ]),
      topicAssociations,
    };
  }));

  return {
    auditHeadHash: auditRow?.last_event_hash ?? "0".repeat(64),
    auditSequence: Math.max(0, (auditRow?.next_sequence ?? 1) - 1),
    candidateProfiles: candidateRows.results,
    counts: {
      candidateDocuments: countRow?.candidate_documents ?? 0,
      candidateLinks: countRow?.candidate_links ?? 0,
      candidatePortraits: countRow?.candidate_portraits ?? 0,
      candidates: countRow?.candidates ?? 0,
      claims: countRow?.claims ?? 0,
      approvedEvidence: countRow?.approved_evidence ?? 0,
      pendingCandidateReview: countRow?.pending_candidate_review ?? 0,
      pendingBroadMonitoring: countRow?.pending_broad_monitoring ?? 0,
      pendingContextMonitoring: countRow?.pending_context_monitoring ?? 0,
      pendingEditorial: (countRow?.pending_editorial ?? 0) + Math.max(
        0,
        (countRow?.pending_review ?? 0) - (countRow?.pending_source_version_review ?? 0),
      ),
      pendingEvidenceReview: countRow?.pending_evidence_review ?? 0,
      pendingReview: countRow?.pending_review ?? 0,
      parsedCandidateProfiles: countRow?.parsed_candidate_profiles ?? 0,
      publishableCandidatePortraits: countRow?.publishable_candidate_portraits ?? 0,
      rejectedEvidence: countRow?.rejected_evidence ?? 0,
      reviews: countRow?.reviews ?? 0,
      snapshots: countRow?.snapshots ?? 0,
      sourceItems: countRow?.source_items ?? 0,
      sources: countRow?.sources ?? 0,
      transcriptSources: countRow?.transcript_sources ?? 0,
      transcriptsPublished: countRow?.transcripts_published ?? 0,
      transcriptsReadyForReview: countRow?.transcripts_ready_for_review ?? 0,
    },
    recentRuns: runRows.results,
    reviewItems,
    routingOptions: {
      constituencies: constituencyRows.results,
      topics: topicRows.results,
    },
    sources: sourceRows.results,
    transcriptQueue: transcriptRows.results,
  };
}

export async function getEvidenceDashboard(): Promise<EvidenceDashboard> {
  const { getEvidenceBindings } = await import("../../../db/index.ts");
  return getEvidenceDashboardForDatabase(getEvidenceBindings().DB);
}

export async function getEvidenceDashboardSafe() {
  try {
    return await getEvidenceDashboard();
  } catch {
    return null;
  }
}
