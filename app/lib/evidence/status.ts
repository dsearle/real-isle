import { getEvidenceBindings } from "../../../db";

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
  source_name: string;
  started_at: string;
  status: string;
};

export type EvidenceReviewItem = {
  canonical_url: string;
  candidate_ids: string | null;
  content_hash: string | null;
  first_seen_at: string;
  id: string;
  item_type: string;
  latest_snapshot_id: string | null;
  publication_state: string;
  published_at: string | null;
  review_state: string;
  source_name: string;
  summary: string;
  title: string;
};

export type CandidateRegistryStatus = {
  biography_excerpt: string | null;
  biography_paragraph_count: number;
  candidacy_id: string;
  completeness_state: string;
  constituency_name: string;
  document_count: number;
  full_name: string;
  interview_count: number;
  last_profile_checked_at: string | null;
  link_count: number;
  manifesto_count: number;
  portrait_count: number;
  portrait_remote_url: string | null;
  portrait_rights_state: string | null;
  portrait_variant: string | null;
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
    pendingEditorial: number;
    pendingReview: number;
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
  pending_editorial: number;
  pending_review: number;
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

export async function getEvidenceDashboard(): Promise<EvidenceDashboard> {
  const { DB: db } = getEvidenceBindings();
  const [sourceRows, runRows, reviewRows, candidateRows, transcriptRows, countRow, auditRow] =
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
                  runs.audit_head_hash, sources.name AS source_name
           FROM ingestion_runs runs
           JOIN sources ON sources.id = runs.source_id
           ORDER BY runs.started_at DESC LIMIT 18`,
        )
        .all<EvidenceRunStatus>(),
      db
        .prepare(
          `SELECT items.id, items.item_type, items.title, items.summary,
                  items.canonical_url, items.first_seen_at, items.published_at,
                  items.review_state, items.publication_state, items.content_hash,
                  items.latest_snapshot_id, sources.name AS source_name,
                  GROUP_CONCAT(CASE WHEN entities.entity_type = 'candidacy' THEN entities.entity_id END) AS candidate_ids
           FROM source_items items
           JOIN sources ON sources.id = items.source_id
           LEFT JOIN item_entities entities ON entities.item_id = items.id
           WHERE items.review_state IN ('unreviewed', 'needs-update')
           GROUP BY items.id
           ORDER BY COALESCE(items.published_at, items.first_seen_at) DESC
           LIMIT 30`,
        )
        .all<EvidenceReviewItem>(),
      db
        .prepare(
          `SELECT profiles.candidacy_id, profiles.slug, profiles.profile_url,
                  profiles.completeness_state, profiles.review_state,
                  profiles.publication_state, profiles.last_profile_checked_at,
                  people.full_name, constituencies.name AS constituency_name,
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
           JOIN constituencies ON constituencies.id = profiles.observed_constituency_id
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
           ORDER BY constituencies.name, people.sort_name`,
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
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM sources WHERE active = 1) AS sources,
            (SELECT COUNT(*) FROM source_items) AS source_items,
            (SELECT COUNT(*) FROM source_snapshots) AS snapshots,
            (SELECT COUNT(*) FROM source_items
             WHERE review_state IN ('unreviewed', 'needs-update')) AS pending_review,
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
               AND media.retention_outcome != 'removed'
               AND candidacies.declaration_status != 'source-removed') AS candidate_portraits,
            (SELECT COUNT(*) FROM candidate_media_assets media
             JOIN candidacies ON candidacies.id = media.candidacy_id
             WHERE media.media_kind = 'portrait'
               AND candidacies.declaration_status != 'source-removed'
               AND media.publication_state = 'published'
               AND media.review_state = 'approved'
               AND media.rights_state IN ('candidate-permission', 'redistributable')
               AND media.retention_outcome = 'stored-publishable'
               AND media.content_snapshot_id IS NOT NULL
               AND media.content_hash IS NOT NULL
               AND media.storage_key IS NOT NULL
               AND media.content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))
              AS publishable_candidate_portraits,
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
      pendingCandidateReview: countRow?.pending_candidate_review ?? 0,
      pendingEditorial: countRow?.pending_editorial ?? 0,
      pendingReview: countRow?.pending_review ?? 0,
      parsedCandidateProfiles: countRow?.parsed_candidate_profiles ?? 0,
      publishableCandidatePortraits: countRow?.publishable_candidate_portraits ?? 0,
      reviews: countRow?.reviews ?? 0,
      snapshots: countRow?.snapshots ?? 0,
      sourceItems: countRow?.source_items ?? 0,
      sources: countRow?.sources ?? 0,
      transcriptSources: countRow?.transcript_sources ?? 0,
      transcriptsPublished: countRow?.transcripts_published ?? 0,
      transcriptsReadyForReview: countRow?.transcripts_ready_for_review ?? 0,
    },
    recentRuns: runRows.results,
    reviewItems: reviewRows.results,
    sources: sourceRows.results,
    transcriptQueue: transcriptRows.results,
  };
}

export async function getEvidenceDashboardSafe() {
  try {
    return await getEvidenceDashboard();
  } catch {
    return null;
  }
}
