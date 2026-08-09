import { getEvidenceBindings } from "../../../db";

export type EvidenceSourceStatus = {
  active: number;
  consecutive_failures: number;
  id: string;
  last_error: string | null;
  last_success_at: string | null;
  name: string;
  next_check_at: string | null;
  source_tier: number;
};

export type EvidenceRunStatus = {
  changed_item_count: number;
  error_count: number;
  finished_at: string | null;
  id: string;
  new_item_count: number;
  source_name: string;
  started_at: string;
  status: string;
};

export type EvidenceReviewItem = {
  canonical_url: string;
  candidate_ids: string | null;
  first_seen_at: string;
  id: string;
  published_at: string | null;
  source_name: string;
  summary: string;
  title: string;
};

export type CandidateRegistryStatus = {
  candidacy_id: string;
  completeness_state: string;
  constituency_name: string;
  document_count: number;
  full_name: string;
  last_profile_checked_at: string | null;
  link_count: number;
  portrait_count: number;
  portrait_rights_state: string | null;
  profile_url: string;
  publication_state: string;
  review_state: string;
  slug: string;
};

export type EvidenceDashboard = {
  auditHeadHash: string;
  auditSequence: number;
  counts: {
    candidatePortraits: number;
    candidates: number;
    pendingReview: number;
    pendingCandidateReview: number;
    parsedCandidateProfiles: number;
    publishableCandidatePortraits: number;
    snapshots: number;
    sourceItems: number;
    sources: number;
  };
  candidateProfiles: CandidateRegistryStatus[];
  recentRuns: EvidenceRunStatus[];
  reviewItems: EvidenceReviewItem[];
  sources: EvidenceSourceStatus[];
};

export async function getEvidenceDashboard(): Promise<EvidenceDashboard> {
  const { DB: db } = getEvidenceBindings();
  const [sourceRows, runRows, reviewRows, candidateRows, countRow, auditRow] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, source_tier, active, last_success_at, next_check_at,
                consecutive_failures, last_error
         FROM sources ORDER BY source_tier, name`,
      )
      .all<EvidenceSourceStatus>(),
    db
      .prepare(
        `SELECT runs.id, runs.status, runs.started_at, runs.finished_at,
                runs.new_item_count, runs.changed_item_count, runs.error_count,
                sources.name AS source_name
         FROM ingestion_runs runs
         JOIN sources ON sources.id = runs.source_id
         ORDER BY runs.started_at DESC LIMIT 12`,
      )
      .all<EvidenceRunStatus>(),
    db
      .prepare(
        `SELECT items.id, items.title, items.summary, items.canonical_url,
                items.first_seen_at, items.published_at, sources.name AS source_name,
                GROUP_CONCAT(CASE WHEN entities.entity_type = 'candidacy' THEN entities.entity_id END) AS candidate_ids
         FROM source_items items
         JOIN sources ON sources.id = items.source_id
         LEFT JOIN item_entities entities ON entities.item_id = items.id
         WHERE items.review_state = 'unreviewed'
         GROUP BY items.id
         ORDER BY COALESCE(items.published_at, items.first_seen_at) DESC
         LIMIT 12`,
      )
      .all<EvidenceReviewItem>(),
    db
      .prepare(
        `SELECT profiles.candidacy_id, profiles.slug, profiles.profile_url,
                profiles.completeness_state, profiles.review_state,
                profiles.publication_state, profiles.last_profile_checked_at,
                people.full_name, constituencies.name AS constituency_name,
                (SELECT COUNT(*) FROM candidate_links links
                 WHERE links.candidacy_id = profiles.candidacy_id
                   AND links.verification_state != 'broken') AS link_count,
                (SELECT COUNT(*) FROM candidate_documents documents
                 WHERE documents.candidacy_id = profiles.candidacy_id
                   AND documents.last_seen_at = profiles.last_profile_checked_at) AS document_count,
                (SELECT COUNT(*) FROM candidate_media_assets media
                 WHERE media.candidacy_id = profiles.candidacy_id
                   AND media.last_seen_at IN (
                     profiles.last_directory_seen_at, profiles.last_profile_checked_at
                   )) AS portrait_count,
                (SELECT media.rights_state FROM candidate_media_assets media
                 WHERE media.candidacy_id = profiles.candidacy_id
                   AND media.last_seen_at IN (
                     profiles.last_directory_seen_at, profiles.last_profile_checked_at
                   )
                 ORDER BY CASE media.variant
                   WHEN 'profile-body' THEN 0
                   WHEN 'profile-og' THEN 1
                   ELSE 2
                 END LIMIT 1) AS portrait_rights_state
         FROM candidate_profiles profiles
         JOIN candidacies ON candidacies.id = profiles.candidacy_id
         JOIN people ON people.id = candidacies.person_id
         JOIN constituencies ON constituencies.id = profiles.observed_constituency_id
         WHERE candidacies.declaration_status != 'source-removed'
         ORDER BY CASE profiles.completeness_state WHEN 'directory-only' THEN 0 ELSE 1 END,
                  profiles.review_state, people.sort_name
         LIMIT 12`,
      )
      .all<CandidateRegistryStatus>(),
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM sources WHERE active = 1) AS sources,
          (SELECT COUNT(*) FROM source_items) AS source_items,
          (SELECT COUNT(*) FROM source_snapshots) AS snapshots,
          (SELECT COUNT(*) FROM source_items WHERE review_state = 'unreviewed') AS pending_review,
          (SELECT COUNT(*) FROM candidate_profiles profiles
           JOIN candidacies ON candidacies.id = profiles.candidacy_id
           WHERE candidacies.declaration_status != 'source-removed') AS candidates,
          (SELECT COUNT(*) FROM candidate_profiles profiles
           JOIN candidacies ON candidacies.id = profiles.candidacy_id
           WHERE profiles.completeness_state = 'profile-parsed'
             AND candidacies.declaration_status != 'source-removed') AS parsed_candidate_profiles,
          (SELECT COUNT(*) FROM candidate_profiles profiles
           JOIN candidacies ON candidacies.id = profiles.candidacy_id
           WHERE profiles.review_state IN ('unreviewed', 'needs-update')
             AND candidacies.declaration_status != 'source-removed') AS pending_candidate_review,
          (SELECT COUNT(*) FROM candidate_media_assets media
           JOIN candidacies ON candidacies.id = media.candidacy_id
           WHERE media.media_kind = 'portrait'
             AND candidacies.declaration_status != 'source-removed') AS candidate_portraits,
          (SELECT COUNT(*) FROM candidate_media_assets media
           JOIN candidacies ON candidacies.id = media.candidacy_id
           WHERE media.media_kind = 'portrait'
             AND candidacies.declaration_status != 'source-removed'
             AND rights_state IN ('candidate-permission', 'redistributable')
             AND retention_outcome = 'stored-publishable') AS publishable_candidate_portraits`,
      )
      .first<{
        candidate_portraits: number;
        candidates: number;
        pending_review: number;
        pending_candidate_review: number;
        parsed_candidate_profiles: number;
        publishable_candidate_portraits: number;
        snapshots: number;
        source_items: number;
        sources: number;
      }>(),
    db
      .prepare(
        "SELECT next_sequence, last_event_hash FROM audit_chain_head WHERE chain_id = 1",
      )
      .first<{ last_event_hash: string; next_sequence: number }>(),
  ]);

  return {
    auditHeadHash: auditRow?.last_event_hash ?? "0".repeat(64),
    auditSequence: Math.max(0, (auditRow?.next_sequence ?? 1) - 1),
    candidateProfiles: candidateRows.results,
    counts: {
      candidatePortraits: countRow?.candidate_portraits ?? 0,
      candidates: countRow?.candidates ?? 0,
      pendingReview: countRow?.pending_review ?? 0,
      pendingCandidateReview: countRow?.pending_candidate_review ?? 0,
      parsedCandidateProfiles: countRow?.parsed_candidate_profiles ?? 0,
      publishableCandidatePortraits: countRow?.publishable_candidate_portraits ?? 0,
      snapshots: countRow?.snapshots ?? 0,
      sourceItems: countRow?.source_items ?? 0,
      sources: countRow?.sources ?? 0,
    },
    recentRuns: runRows.results,
    reviewItems: reviewRows.results,
    sources: sourceRows.results,
  };
}

export async function getEvidenceDashboardSafe() {
  try {
    return await getEvidenceDashboard();
  } catch {
    return null;
  }
}
