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

export type EvidenceDashboard = {
  auditHeadHash: string;
  auditSequence: number;
  counts: {
    pendingReview: number;
    snapshots: number;
    sourceItems: number;
    sources: number;
  };
  recentRuns: EvidenceRunStatus[];
  reviewItems: EvidenceReviewItem[];
  sources: EvidenceSourceStatus[];
};

export async function getEvidenceDashboard(): Promise<EvidenceDashboard> {
  const { DB: db } = getEvidenceBindings();
  const [sourceRows, runRows, reviewRows, countRow, auditRow] = await Promise.all([
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
        `SELECT
          (SELECT COUNT(*) FROM sources WHERE active = 1) AS sources,
          (SELECT COUNT(*) FROM source_items) AS source_items,
          (SELECT COUNT(*) FROM source_snapshots) AS snapshots,
          (SELECT COUNT(*) FROM source_items WHERE review_state = 'unreviewed') AS pending_review`,
      )
      .first<{
        pending_review: number;
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
    counts: {
      pendingReview: countRow?.pending_review ?? 0,
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
