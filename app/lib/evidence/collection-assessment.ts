import type { AppendedAuditEvent } from "./audit.ts";
import { appendAuditEventWithStatements } from "./audit.ts";
import {
  type CollectionReason,
  type CollectionRoute,
} from "./collection-reason.ts";
import { sha256Hex, stableJson } from "./integrity.ts";

export const collectionAssessmentNoUpdateSql = `CREATE TRIGGER IF NOT EXISTS collection_assessments_no_update
BEFORE UPDATE ON source_item_version_collection_assessments
BEGIN SELECT RAISE(ABORT, 'collection assessments are immutable'); END`;

export const collectionAssessmentNoDeleteSql = `CREATE TRIGGER IF NOT EXISTS collection_assessments_no_delete
BEFORE DELETE ON source_item_version_collection_assessments
BEGIN SELECT RAISE(ABORT, 'collection assessments are immutable'); END`;

export const collectionAssessmentCurrentVersionGuardSql = `CREATE TRIGGER IF NOT EXISTS collection_assessment_current_version_guard
BEFORE INSERT ON source_item_version_collection_assessments
WHEN NOT EXISTS (
  SELECT 1
    FROM source_item_versions versions
    JOIN source_items items ON items.id = versions.source_item_id
    JOIN audit_events audit ON audit.id = NEW.created_by_audit_event_id
   WHERE versions.id = NEW.source_item_version_id
     AND items.latest_version_id = versions.id
     AND items.content_hash = versions.payload_hash
     AND audit.action = 'source-item.relevance-assessed'
     AND audit.entity_type = 'source-item-version'
     AND audit.entity_id = versions.id
     AND json_extract(audit.payload, '$.sourceItemId') = items.id
     AND json_extract(audit.payload, '$.collectionReasonHash') = NEW.canonical_reason_hash
     AND json_extract(audit.payload, '$.collectionRoute') = NEW.route
     AND json_extract(audit.payload, '$.collectionRuleset') = NEW.ruleset_id
)
BEGIN SELECT RAISE(ABORT, 'collection assessment target is stale'); END`;

export const legacyCollectionAssessmentBacklogSql = `SELECT items.id AS source_item_id,
       items.latest_version_id AS source_item_version_id,
       items.item_type, items.title, items.summary, items.first_seen_at,
       sources.id AS source_id, sources.name AS source_name,
       sources.feed_type AS source_feed_type
  FROM source_items items
  JOIN sources ON sources.id = items.source_id
  LEFT JOIN source_item_version_collection_assessments assessments
    ON assessments.source_item_version_id = items.latest_version_id
 WHERE items.latest_version_id IS NOT NULL
   AND assessments.source_item_version_id IS NULL
 ORDER BY CASE WHEN items.review_state IN ('unreviewed', 'needs-update') THEN 0 ELSE 1 END,
          items.first_seen_at DESC, items.id
 LIMIT ?`;

export type PreparedCollectionAssessment = {
  canonicalReasonHash: string;
  canonicalReasonJson: string;
  route: CollectionRoute;
  rulesetId: string;
  sourceItemVersionId: string;
};

export type PersistedCollectionAssessmentRow = {
  canonical_reason_hash: string | null;
  canonical_reason_json: string | null;
  collection_route: string | null;
  collection_ruleset_id: string | null;
};

type StoredCollectionAssessmentIdentity = {
  canonical_reason_hash: string;
  canonical_reason_json: string;
  route: string;
  ruleset_id: string;
};

type AssessmentActor = {
  id: string;
  type: "system" | "admin";
};

function isSignalArray(value: unknown) {
  return Array.isArray(value) && value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const signal = entry as Record<string, unknown>;
    return typeof signal.confidence === "number"
      && typeof signal.id === "string"
      && typeof signal.label === "string"
      && typeof signal.matchMethod === "string"
      && typeof signal.mentionText === "string";
  });
}

function isCollectionReason(value: unknown): value is CollectionReason {
  if (!value || typeof value !== "object") return false;
  const reason = value as Record<string, unknown>;
  const scope = reason.sourceScope;
  return isSignalArray(reason.candidates)
    && isSignalArray(reason.constituencies)
    && isSignalArray(reason.electionSignals)
    && isSignalArray(reason.topics)
    && typeof reason.reason === "string"
    && (reason.route === "evidence-review"
      || reason.route === "context-monitoring"
      || reason.route === "broad-monitoring")
    && typeof reason.routeLabel === "string"
    && typeof reason.ruleId === "string"
    && Boolean(scope)
    && typeof scope === "object"
    && typeof (scope as Record<string, unknown>).electionFocused === "boolean"
    && typeof (scope as Record<string, unknown>).id === "string"
    && typeof (scope as Record<string, unknown>).label === "string";
}

export async function prepareCollectionAssessment(
  sourceItemVersionId: string,
  reason: CollectionReason,
): Promise<PreparedCollectionAssessment> {
  const canonicalReasonJson = stableJson(reason);
  return {
    canonicalReasonHash: await sha256Hex(canonicalReasonJson),
    canonicalReasonJson,
    route: reason.route,
    rulesetId: reason.ruleId,
    sourceItemVersionId,
  };
}

export function insertCollectionAssessmentStatement(
  db: D1Database,
  assessment: PreparedCollectionAssessment,
  auditEvent: AppendedAuditEvent,
) {
  return db
    .prepare(
      `INSERT INTO source_item_version_collection_assessments (
        source_item_version_id, ruleset_id, route, canonical_reason_json,
        canonical_reason_hash, created_by_audit_event_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      assessment.sourceItemVersionId,
      assessment.rulesetId,
      assessment.route,
      assessment.canonicalReasonJson,
      assessment.canonicalReasonHash,
      auditEvent.id,
      auditEvent.createdAt,
    );
}

async function storedCollectionAssessment(
  db: D1Database,
  sourceItemVersionId: string,
) {
  return db
    .prepare(
      `SELECT ruleset_id, route, canonical_reason_json, canonical_reason_hash
         FROM source_item_version_collection_assessments
        WHERE source_item_version_id = ?`,
    )
    .bind(sourceItemVersionId)
    .first<StoredCollectionAssessmentIdentity>();
}

function storedAssessmentMatches(
  stored: StoredCollectionAssessmentIdentity,
  expected: PreparedCollectionAssessment,
) {
  return stored.canonical_reason_hash === expected.canonicalReasonHash
    && stored.canonical_reason_json === expected.canonicalReasonJson
    && stored.route === expected.route
    && stored.ruleset_id === expected.rulesetId;
}

export async function hasCollectionAssessment(
  db: D1Database,
  sourceItemVersionId: string,
) {
  return Boolean(await storedCollectionAssessment(db, sourceItemVersionId));
}

export function shouldAppendLegacyCollectionAssessment(
  versionChanged: boolean,
  assessmentAlreadyFrozen: boolean,
) {
  return !versionChanged && !assessmentAlreadyFrozen;
}

export async function appendLegacyCollectionAssessment(input: {
  actor: AssessmentActor;
  assessment: PreparedCollectionAssessment;
  buildStatements?: () => D1PreparedStatement[];
  db: D1Database;
  sourceItemId: string;
}) {
  const existing = await storedCollectionAssessment(
    input.db,
    input.assessment.sourceItemVersionId,
  );
  if (existing) {
    if (storedAssessmentMatches(existing, input.assessment)) return false;
    throw new Error(
      `The frozen collection assessment for ${input.assessment.sourceItemVersionId} does not match the deterministic assessment.`,
    );
  }

  try {
    await appendAuditEventWithStatements(
      input.db,
      {
        action: "source-item.relevance-assessed",
        actorId: input.actor.id,
        actorType: input.actor.type,
        entityId: input.assessment.sourceItemVersionId,
        entityType: "source-item-version",
        payload: {
          collectionReasonHash: input.assessment.canonicalReasonHash,
          collectionRoute: input.assessment.route,
          collectionRuleset: input.assessment.rulesetId,
          sourceItemId: input.sourceItemId,
        },
      },
      input.buildStatements ?? (() => []),
      (event) => [insertCollectionAssessmentStatement(input.db, input.assessment, event)],
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("source_item_version_collection_assessments")) throw error;
    const winner = await storedCollectionAssessment(
      input.db,
      input.assessment.sourceItemVersionId,
    );
    if (winner && storedAssessmentMatches(winner, input.assessment)) return false;
    throw new Error(
      `A competing collection assessment for ${input.assessment.sourceItemVersionId} did not match the deterministic assessment.`,
      { cause: error },
    );
  }
}

export async function readVerifiedCollectionReason(
  row: PersistedCollectionAssessmentRow,
): Promise<CollectionReason | null> {
  if (
    !row.canonical_reason_json
    || !row.canonical_reason_hash
    || !row.collection_route
    || !row.collection_ruleset_id
  ) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.canonical_reason_json);
  } catch {
    return null;
  }
  if (!isCollectionReason(parsed)) return null;
  if (stableJson(parsed) !== row.canonical_reason_json) return null;
  if (await sha256Hex(row.canonical_reason_json) !== row.canonical_reason_hash) return null;
  if (parsed.route !== row.collection_route || parsed.ruleId !== row.collection_ruleset_id) {
    return null;
  }
  return parsed;
}
