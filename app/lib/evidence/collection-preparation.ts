import { election } from "./catalogue.ts";
import {
  appendLegacyCollectionAssessment,
  prepareCollectionAssessment,
} from "./collection-assessment.ts";
import { projectCollectionReason } from "./collection-reason.ts";
import {
  deleteCurrentKeywordSignalsSql,
  insertCurrentKeywordSignalSql,
  projectKeywordCollectionSignals,
} from "./collection-signals.ts";
import { ensureEvidenceTriggers } from "./triggers.ts";

export type CollectionPreparationInput = {
  actorId: string;
  expectedContentHash: string;
  expectedVersionId: string;
  itemId: string;
};

export type CollectionPreparationReceipt = {
  auditEventHash: string;
  auditSequence: number;
  collectionReasonHash: string;
  collectionRoute: "evidence-review" | "context-monitoring" | "broad-monitoring";
  collectionRuleset: string;
  contentHash: string;
  createdAt: string;
  idempotent: boolean;
  itemId: string;
  versionId: string;
};

type CurrentItemVersion = {
  content_hash: string | null;
  latest_version_id: string | null;
  parser_version: string;
  payload: string;
  payload_hash: string;
  source_id: string;
  version_id: string;
};

type CandidateMatcher = { full_name: string; id: string };

type StoredPreparation = {
  audit_action: string;
  audit_collection_reason_hash: string | null;
  audit_collection_route: string | null;
  audit_collection_ruleset: string | null;
  audit_entity_id: string;
  audit_entity_type: string;
  audit_event_hash: string;
  audit_sequence: number;
  audit_source_item_id: string | null;
  canonical_reason_hash: string;
  canonical_reason_json: string;
  created_at: string;
  route: CollectionPreparationReceipt["collectionRoute"];
  ruleset_id: string;
};

export class CollectionPreparationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectionPreparationValidationError";
  }
}

export class CollectionPreparationConflictError extends Error {
  constructor(message = "This source changed before preparation completed. Refresh and try again.") {
    super(message);
    this.name = "CollectionPreparationConflictError";
  }
}

export class CollectionPreparationNotFoundError extends Error {
  constructor() {
    super("The source item could not be found.");
    this.name = "CollectionPreparationNotFoundError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function immutableReviewText(item: CurrentItemVersion) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(item.payload);
  } catch {
    throw new CollectionPreparationValidationError(
      "The immutable source version is not valid JSON and cannot be prepared safely.",
    );
  }
  const payload = record(parsed);
  if (!payload) {
    throw new CollectionPreparationValidationError(
      "The immutable source version has no reviewable metadata.",
    );
  }

  if (item.parser_version === "feed-v1") {
    const title = boundedText(payload.title, 500);
    if (!title) {
      throw new CollectionPreparationValidationError(
        "The immutable feed version has no title and cannot be prepared safely.",
      );
    }
    return {
      itemType: boundedText(payload.itemType, 80) || "news",
      summary: boundedText(payload.summary, 5_000),
      title,
    };
  }

  if (item.parser_version === "candidate-directory-v1") {
    const candidate = record(payload.candidate);
    const title = boundedText(candidate?.fullName, 500);
    const constituency = boundedText(candidate?.constituencyName, 200);
    if (!title) {
      throw new CollectionPreparationValidationError(
        "The immutable candidate-directory version has no candidate name.",
      );
    }
    return {
      itemType: "candidate-profile",
      summary: constituency
        ? `Listed in the captured candidate directory under ${constituency}; official nomination has not yet been verified.`
        : "Candidate directory identity observed.",
      title,
    };
  }

  if (item.parser_version === "candidate-profile-v1") {
    const title = boundedText(payload.candidateName, 500);
    const paragraphs = Array.isArray(payload.biographyParagraphs)
      ? payload.biographyParagraphs
      : [];
    if (!title) {
      throw new CollectionPreparationValidationError(
        "The immutable candidate-profile version has no candidate name.",
      );
    }
    return {
      itemType: "candidate-profile",
      summary: boundedText(paragraphs[0], 5_000) || "Candidate profile observed.",
      title,
    };
  }

  throw new CollectionPreparationValidationError(
    "This parser version does not have a deterministic preparation rule.",
  );
}

function signalStatements(input: {
  db: D1Database;
  itemId: string;
  projection: ReturnType<typeof projectKeywordCollectionSignals>;
  versionId: string;
}) {
  const statements = [
    input.db.prepare(deleteCurrentKeywordSignalsSql).bind(
      input.itemId,
      input.itemId,
      input.versionId,
    ),
  ];
  for (const [entityType, signals] of [
    ["candidacy", input.projection.candidates],
    ["constituency", input.projection.constituencies],
    ["topic", input.projection.topics],
  ] as const) {
    for (const signal of signals) {
      statements.push(input.db.prepare(insertCurrentKeywordSignalSql).bind(
        input.itemId,
        entityType,
        signal.id,
        signal.mentionText,
        signal.confidence,
        input.itemId,
        input.versionId,
      ));
    }
  }
  return statements;
}

async function loadCurrentItemVersion(db: D1Database, itemId: string) {
  return db.prepare(
    `SELECT items.latest_version_id, items.content_hash,
            versions.id AS version_id, versions.payload, versions.payload_hash,
            versions.parser_version, runs.source_id
       FROM source_items items
       LEFT JOIN source_item_versions versions
         ON versions.id = items.latest_version_id
        AND versions.source_item_id = items.id
       LEFT JOIN ingestion_runs runs ON runs.id = versions.ingestion_run_id
      WHERE items.id = ?`,
  ).bind(itemId).first<CurrentItemVersion>();
}

function assertExactHead(item: CurrentItemVersion, input: CollectionPreparationInput) {
  if (
    item.latest_version_id !== input.expectedVersionId
    || item.version_id !== input.expectedVersionId
    || item.content_hash !== input.expectedContentHash
    || item.payload_hash !== input.expectedContentHash
    || !item.source_id
  ) throw new CollectionPreparationConflictError();
}

export async function prepareSourceItemVersionForReview(
  db: D1Database,
  input: CollectionPreparationInput,
): Promise<CollectionPreparationReceipt> {
  await ensureEvidenceTriggers(db);
  const item = await loadCurrentItemVersion(db, input.itemId);
  if (!item) throw new CollectionPreparationNotFoundError();
  assertExactHead(item, input);

  const text = immutableReviewText(item);
  const candidates = await db.prepare(
    `SELECT candidacies.id, people.full_name
       FROM candidacies
       JOIN people ON people.id = candidacies.person_id
      WHERE candidacies.election_id = ?
        AND candidacies.declaration_status != 'source-removed'
      ORDER BY candidacies.id`,
  ).bind(election.id).all<CandidateMatcher>();
  const projection = projectKeywordCollectionSignals(
    `${text.title}\n${text.summary}`,
    candidates.results.map((candidate) => ({ id: candidate.id, label: candidate.full_name })),
  );
  const reason = projectCollectionReason({
    candidates: projection.candidates,
    constituencies: projection.constituencies,
    itemType: text.itemType,
    sourceFeedType: item.parser_version === "feed-v1" ? "rss" : "candidate-directory",
    sourceId: item.source_id,
    sourceName: item.source_id,
    summary: text.summary,
    title: text.title,
    topics: projection.topics,
  });
  const assessment = await prepareCollectionAssessment(input.expectedVersionId, reason);

  let created: boolean;
  try {
    created = await appendLegacyCollectionAssessment({
      actor: { id: input.actorId, type: "admin" },
      assessment,
      buildStatements: () => signalStatements({
        db,
        itemId: input.itemId,
        projection,
        versionId: input.expectedVersionId,
      }),
      db,
      sourceItemId: input.itemId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/stale|competing collection assessment|does not match/i.test(message)) {
      throw new CollectionPreparationConflictError();
    }
    throw error;
  }

  const stored = await db.prepare(
    `SELECT assessment.ruleset_id, assessment.route,
            assessment.canonical_reason_json, assessment.canonical_reason_hash,
            assessment.created_at, audit.sequence AS audit_sequence,
            audit.event_hash AS audit_event_hash, audit.action AS audit_action,
            audit.entity_type AS audit_entity_type,
            audit.entity_id AS audit_entity_id,
            json_extract(audit.payload, '$.sourceItemId') AS audit_source_item_id,
            json_extract(audit.payload, '$.collectionReasonHash')
              AS audit_collection_reason_hash,
            json_extract(audit.payload, '$.collectionRoute') AS audit_collection_route,
            json_extract(audit.payload, '$.collectionRuleset') AS audit_collection_ruleset
       FROM source_items items
       JOIN source_item_versions versions
         ON versions.id = items.latest_version_id
        AND versions.source_item_id = items.id
        AND versions.payload_hash = items.content_hash
       JOIN source_item_version_collection_assessments assessment
         ON assessment.source_item_version_id = versions.id
       JOIN audit_events audit ON audit.id = assessment.created_by_audit_event_id
      WHERE items.id = ?
        AND items.latest_version_id = ?
        AND items.content_hash = ?`,
  ).bind(
    input.itemId,
    input.expectedVersionId,
    input.expectedContentHash,
  ).first<StoredPreparation>();
  if (
    !stored
    || stored.ruleset_id !== assessment.rulesetId
    || stored.route !== assessment.route
    || stored.canonical_reason_hash !== assessment.canonicalReasonHash
    || stored.canonical_reason_json !== assessment.canonicalReasonJson
    || stored.audit_action !== "source-item.relevance-assessed"
    || stored.audit_entity_type !== "source-item-version"
    || stored.audit_entity_id !== input.expectedVersionId
    || stored.audit_source_item_id !== input.itemId
    || stored.audit_collection_reason_hash !== assessment.canonicalReasonHash
    || stored.audit_collection_route !== assessment.route
    || stored.audit_collection_ruleset !== assessment.rulesetId
  ) throw new CollectionPreparationConflictError();

  return {
    auditEventHash: stored.audit_event_hash,
    auditSequence: stored.audit_sequence,
    collectionReasonHash: stored.canonical_reason_hash,
    collectionRoute: stored.route,
    collectionRuleset: stored.ruleset_id,
    contentHash: input.expectedContentHash,
    createdAt: stored.created_at,
    idempotent: !created,
    itemId: input.itemId,
    versionId: input.expectedVersionId,
  };
}
