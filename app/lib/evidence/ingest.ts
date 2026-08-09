import type { EvidenceBindings } from "../../../db";
import { appendAuditEventWithStatements } from "./audit";
import {
  candidateCatalogue,
  constituencyCatalogue,
  election,
  monitoredSources,
  policyTopicCatalogue,
  type MonitoredSource,
} from "./catalogue";
import { parseFeed, type NormalizedFeedItem } from "./feed";
import { deterministicId, randomId, sha256Hex, stableJson } from "./integrity";
import { fetchBounded, type BoundedResponse } from "./network";
import { seedEvidenceReferenceData } from "./seed";

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS_PER_FEED = 12;
const FEED_CONTENT_TYPES = [
  "application/atom+xml",
  "application/rss+xml",
  "application/xml",
  "text/xml",
] as const;

type IngestionActor = {
  id: string;
  type: "system" | "admin";
};

export type IngestionCommand = {
  actor: IngestionActor;
  force?: boolean;
  idempotencyKey: string;
  limit?: number;
  sourceIds?: string[];
  trigger: "traffic" | "scheduler" | "manual";
};

export type SourceRunResult = {
  changed: number;
  discovered: number;
  errors: number;
  inserted: number;
  runId: string | null;
  sourceId: string;
  status: "succeeded" | "no_change" | "partial" | "failed" | "locked" | "replayed";
  unchanged: number;
};

export type IngestionResult = {
  invocationId: string;
  runs: SourceRunResult[];
};

type SourceState = {
  consecutive_failures: number;
  etag: string | null;
  last_modified: string | null;
};

type ExistingItem = {
  author: string | null;
  canonical_url: string;
  content_hash: string | null;
  external_id: string | null;
  id: string;
  latest_snapshot_id: string | null;
  latest_version_id: string | null;
  published_at: string | null;
  summary: string;
  title: string;
};

type SnapshotRow = {
  chain_hash: string;
  id: string;
};

type StoredSnapshot = {
  chainHash: string;
  contentHash: string;
  id: string;
  inserted: boolean;
};

function plusMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 900);
}

function effectiveExternalId(item: NormalizedFeedItem, existing?: ExistingItem | null) {
  return item.externalId ?? existing?.external_id ?? null;
}

function effectivePublishedAt(item: NormalizedFeedItem, existing?: ExistingItem | null) {
  return item.publishedAt ?? existing?.published_at ?? null;
}

function feedItemPayload(item: NormalizedFeedItem, existing?: ExistingItem | null) {
  return stableJson({
    author: item.author,
    canonicalUrl: item.url,
    documentHash: null,
    externalId: effectiveExternalId(item, existing),
    publishedAt: effectivePublishedAt(item, existing),
    summary: item.summary,
    title: item.title,
  });
}

function feedItemChanged(item: NormalizedFeedItem, existing: ExistingItem) {
  return (
    existing.canonical_url !== item.url ||
    existing.external_id !== effectiveExternalId(item, existing) ||
    existing.title !== item.title ||
    existing.summary !== item.summary ||
    existing.author !== item.author ||
    existing.published_at !== effectivePublishedAt(item, existing)
  );
}

function isBoundedResponse(
  response: BoundedResponse | { status: 304; resolvedUrl: string },
): response is BoundedResponse {
  return response.status !== 304;
}

async function acquireLease(
  db: D1Database,
  source: MonitoredSource,
  force: boolean,
  now: string,
) {
  const leaseToken = randomId("lease");
  const leaseExpiresAt = plusMinutes(new Date(now), 5);
  const dueClause = force ? "" : "AND (next_check_at IS NULL OR next_check_at <= ?)";
  const statement = db.prepare(
    `UPDATE sources
     SET lease_token = ?, lease_expires_at = ?, last_attempt_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND active = 1
       AND (lease_expires_at IS NULL OR lease_expires_at < ?)
       ${dueClause}`,
  );
  const result = force
    ? await statement.bind(leaseToken, leaseExpiresAt, now, source.id, now).run()
    : await statement.bind(leaseToken, leaseExpiresAt, now, source.id, now, now).run();
  return result.meta.changes > 0 ? leaseToken : null;
}

async function releaseLease(db: D1Database, sourceId: string, leaseToken: string) {
  await db
    .prepare(
      `UPDATE sources
       SET lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND lease_token = ?`,
    )
    .bind(sourceId, leaseToken)
    .run();
}

async function r2StoreContent(
  bucket: R2Bucket,
  contentHash: string,
  response: BoundedResponse,
  sourceId: string,
) {
  const storageKey = `snapshots/v1/sha256/${contentHash.slice(0, 2)}/${contentHash}`;
  if (!(await bucket.head(storageKey))) {
    await bucket.put(storageKey, response.bytes, {
      customMetadata: {
        contentSha256: contentHash,
        sourceId,
      },
      httpMetadata: { contentType: response.contentType },
    });
  }
  return storageKey;
}

async function storeSnapshot(input: {
  bindings: EvidenceBindings;
  captureUrl: string;
  itemId: string | null;
  response: BoundedResponse;
  runId: string;
  source: MonitoredSource;
}) {
  const { DB: db, SNAPSHOTS: bucket } = input.bindings;
  const contentHash = await sha256Hex(input.response.bytes);
  const existing = await db
    .prepare(
      `SELECT id, chain_hash FROM source_snapshots
       WHERE ingestion_run_id = ? AND capture_url = ? AND content_hash = ?`,
    )
    .bind(input.runId, input.captureUrl, contentHash)
    .first<SnapshotRow>();
  if (existing) {
    return {
      chainHash: existing.chain_hash,
      contentHash,
      id: existing.id,
      inserted: false,
    } satisfies StoredSnapshot;
  }

  const previous = input.itemId
    ? await db
        .prepare(
          `SELECT ss.id, ss.chain_hash
           FROM source_item_heads heads
           JOIN source_snapshots ss ON ss.id = heads.latest_snapshot_id
           WHERE heads.source_item_id = ?`,
        )
        .bind(input.itemId)
        .first<SnapshotRow>()
    : await db
        .prepare(
          `SELECT id, chain_hash FROM source_snapshots
           WHERE source_id = ? AND item_id IS NULL AND capture_url = ?
           ORDER BY captured_at DESC LIMIT 1`,
        )
        .bind(input.source.id, input.captureUrl)
        .first<SnapshotRow>();
  const capturedAt = new Date().toISOString();
  const id = await deterministicId("snapshot", input.runId, input.captureUrl, contentHash);
  const chainHash = await sha256Hex(
    stableJson({
      capturedAt,
      captureUrl: input.captureUrl,
      contentHash,
      itemId: input.itemId,
      previousChainHash: previous?.chain_hash ?? null,
      sourceId: input.source.id,
    }),
  );
  const storageKey = await r2StoreContent(bucket, contentHash, input.response, input.source.id);
  const responseMetadata = stableJson({
    etag: input.response.etag,
    lastModified: input.response.lastModified,
    resolvedUrl: input.response.resolvedUrl,
    status: input.response.status,
  });

  await db
    .prepare(
      `INSERT INTO source_snapshots (
        id, source_id, item_id, ingestion_run_id, capture_url, resolved_url,
        captured_at, http_status, content_type, byte_length, content_hash,
        storage_key, retention_outcome, etag, last_modified, response_metadata,
        previous_snapshot_id, chain_hash, capture_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stored-private', ?, ?, ?, ?, ?, 'http-fetch-v1')`,
    )
    .bind(
      id,
      input.source.id,
      input.itemId,
      input.runId,
      input.captureUrl,
      input.response.resolvedUrl,
      capturedAt,
      input.response.status,
      input.response.contentType,
      input.response.bytes.byteLength,
      contentHash,
      storageKey,
      input.response.etag,
      input.response.lastModified,
      responseMetadata,
      previous?.id ?? null,
      chainHash,
    )
    .run();

  if (input.itemId) {
    await db
      .prepare(
        `INSERT INTO source_item_heads (source_item_id, latest_snapshot_id, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(source_item_id) DO UPDATE SET
           latest_snapshot_id = excluded.latest_snapshot_id,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(input.itemId, id)
      .run();
  }

  return { chainHash, contentHash, id, inserted: true } satisfies StoredSnapshot;
}

function containsTerm(searchableText: string, term: string) {
  const escaped = term
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(
    searchableText,
  );
}

function entityMatchStatements(db: D1Database, itemId: string, searchableText: string) {
  const normalized = searchableText.normalize("NFKC").toLowerCase();
  const statements: D1PreparedStatement[] = [
    db
      .prepare("DELETE FROM item_entities WHERE item_id = ? AND match_method = 'deterministic-keyword-v1'")
      .bind(itemId),
  ];

  for (const candidate of candidateCatalogue) {
    if (!containsTerm(normalized, candidate.fullName)) continue;
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO item_entities (
            item_id, entity_type, entity_id, mention_text, match_method, confidence
          ) VALUES (?, 'candidacy', ?, ?, 'deterministic-keyword-v1', 0.98)`,
        )
        .bind(itemId, `${election.id}:${candidate.id}`, candidate.fullName),
    );
  }
  for (const constituency of constituencyCatalogue) {
    const constituencyTerms =
      constituency.name === "Middle"
        ? ["constituency of middle", "middle constituency"]
        : [constituency.name];
    if (!constituencyTerms.some((term) => containsTerm(normalized, term))) continue;
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO item_entities (
            item_id, entity_type, entity_id, mention_text, match_method, confidence
          ) VALUES (?, 'constituency', ?, ?, 'deterministic-keyword-v1', 0.9)`,
        )
        .bind(itemId, constituency.id, constituency.name),
    );
  }
  for (const topic of policyTopicCatalogue) {
    const keyword = topic.keywords.find((candidate) => containsTerm(normalized, candidate));
    if (!keyword) continue;
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO item_entities (
            item_id, entity_type, entity_id, mention_text, match_method, confidence
          ) VALUES (?, 'topic', ?, ?, 'deterministic-keyword-v1', 0.7)`,
        )
        .bind(itemId, topic.id, keyword),
    );
  }
  return statements;
}

async function runItemStatement(input: {
  db: D1Database;
  error?: string;
  itemId: string;
  outcome: string;
  runId: string;
  snapshotId: string | null;
  sourceItemVersionId: string;
  urlHash: string;
}) {
  const id = await deterministicId("observation", input.runId, input.itemId);
  return input.db
    .prepare(
      `INSERT INTO ingestion_run_items (
        id, ingestion_run_id, source_item_id, snapshot_id, source_item_version_id, outcome,
        observed_url_hash, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ingestion_run_id, source_item_id) DO NOTHING`,
    )
    .bind(
      id,
      input.runId,
      input.itemId,
      input.snapshotId,
      input.sourceItemVersionId,
      input.outcome,
      input.urlHash,
      input.error ?? null,
    );
}

async function processFeedItem(input: {
  bindings: EvidenceBindings;
  feedSnapshotId: string;
  item: NormalizedFeedItem;
  runId: string;
  source: MonitoredSource;
}) {
  const db = input.bindings.DB;
  if (input.source.storeFullContent) {
    throw new Error("Full-document capture must use a dedicated rights-aware connector.");
  }
  const now = new Date().toISOString();
  const canonicalUrlHash = await sha256Hex(input.item.url);
  const itemId = await deterministicId(
    "item",
    input.source.id,
    input.item.externalId ?? input.item.url,
  );
  const existingByExternalId = input.item.externalId
    ? await db
        .prepare(
          `SELECT id, external_id, canonical_url, title, summary, author, published_at,
                  content_hash, latest_snapshot_id, latest_version_id
           FROM source_items WHERE source_id = ? AND external_id = ?`,
        )
        .bind(input.source.id, input.item.externalId)
        .first<ExistingItem>()
    : null;
  const existing =
    existingByExternalId ??
    (await db
      .prepare(
        `SELECT id, external_id, canonical_url, title, summary, author, published_at,
                content_hash, latest_snapshot_id, latest_version_id
         FROM source_items WHERE source_id = ? AND canonical_url_hash = ?`,
      )
      .bind(input.source.id, canonicalUrlHash)
      .first<ExistingItem>());

  const resolvedItemId = existing?.id ?? itemId;
  const snapshotId = input.feedSnapshotId;
  const payload = feedItemPayload(input.item, existing);
  const payloadHash = await sha256Hex(payload);
  const versionId = await deterministicId("itemversion", resolvedItemId, payloadHash);
  const outcome = !existing
    ? "new"
    : existing.content_hash === payloadHash
      ? "unchanged"
      : "changed";
  const observationStatement = await runItemStatement({
    db,
    itemId: resolvedItemId,
    outcome,
    runId: input.runId,
    snapshotId,
    sourceItemVersionId: versionId,
    urlHash: canonicalUrlHash,
  });

  const buildStatements = () => {
    const statements: D1PreparedStatement[] = [];
    if (!existing) {
      statements.push(
        db
          .prepare(
            `INSERT INTO source_items (
              id, source_id, external_id, canonical_url, canonical_url_hash,
              item_type, title, summary, author, published_at, first_seen_at,
              last_seen_at, source_tier
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            itemId,
            input.source.id,
            effectiveExternalId(input.item, existing),
            input.item.url,
            canonicalUrlHash,
            input.source.itemType,
            input.item.title,
            input.item.summary,
            input.item.author,
            effectivePublishedAt(input.item, existing),
            now,
            now,
            input.source.sourceTier,
          ),
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO source_item_versions (
            id, source_item_id, ingestion_run_id, snapshot_id, observed_at,
            payload, payload_hash, parser_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'feed-v1')
          ON CONFLICT(source_item_id, payload_hash) DO NOTHING`,
        )
        .bind(versionId, resolvedItemId, input.runId, snapshotId, now, payload, payloadHash),
      db
        .prepare(
          `UPDATE source_items SET
            external_id = ?, canonical_url = ?, canonical_url_hash = ?, title = ?, summary = ?, author = ?,
            published_at = ?, last_seen_at = ?,
            latest_snapshot_id = ?, latest_version_id = ?, content_hash = ?,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          effectiveExternalId(input.item, existing),
          input.item.url,
          canonicalUrlHash,
          input.item.title,
          input.item.summary,
          input.item.author,
          effectivePublishedAt(input.item, existing),
          now,
          snapshotId,
          versionId,
          payloadHash,
          resolvedItemId,
        ),
      ...entityMatchStatements(
        db,
        resolvedItemId,
        `${input.item.title}\n${input.item.summary}`,
      ),
      observationStatement,
    );
    return statements;
  };

  if (outcome !== "unchanged") {
    await appendAuditEventWithStatements(
      db,
      {
        action: outcome === "new" ? "source-item.discovered" : "source-item.changed",
        actorId: "evidence-monitor",
        actorType: "system",
        entityId: resolvedItemId,
        entityType: "source-item",
        payload: {
          payloadHash,
          snapshotId,
          sourceId: input.source.id,
          title: input.item.title,
          urlHash: canonicalUrlHash,
        },
      },
      buildStatements,
    );
  } else {
    await db.batch(buildStatements());
  }

  return { outcome };
}

async function markRunFailed(
  db: D1Database,
  source: MonitoredSource,
  runId: string,
  leaseToken: string,
  sourceState: SourceState,
  error: unknown,
  feedSnapshot: StoredSnapshot | null,
) {
  const finishedAt = new Date();
  const failures = sourceState.consecutive_failures + 1;
  const backoffMinutes = Math.min(360, Math.max(15, 15 * 2 ** Math.min(failures - 1, 5)));
  const message = errorMessage(error);
  const messageHash = await sha256Hex(message);
  await appendAuditEventWithStatements(
    db,
    {
      action: "ingestion-run.failed",
      actorId: "evidence-monitor",
      actorType: "system",
      entityId: runId,
      entityType: "ingestion-run",
      payload: {
        errorHash: messageHash,
        feedContentHash: feedSnapshot?.contentHash ?? null,
        sourceId: source.id,
      },
    },
    (audit) => [
      db
        .prepare(
          `UPDATE ingestion_runs
           SET status = 'failed', finished_at = ?, error_count = 1, error_summary = ?,
               feed_snapshot_id = ?, audit_head_hash = ?
           WHERE id = ?`,
        )
        .bind(
          finishedAt.toISOString(),
          message,
          feedSnapshot?.id ?? null,
          audit.eventHash,
          runId,
        ),
      db
        .prepare(
          `UPDATE sources SET
            consecutive_failures = ?, last_error = ?, next_check_at = ?,
            lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND lease_token = ?`,
        )
        .bind(failures, message, plusMinutes(finishedAt, backoffMinutes), source.id, leaseToken),
    ],
  );
}

async function runSource(
  bindings: EvidenceBindings,
  source: MonitoredSource,
  command: IngestionCommand,
  leaseToken: string,
) {
  const db = bindings.DB;
  const runId = randomId("run");
  const startedAt = new Date().toISOString();
  const idempotencyKey = `${command.idempotencyKey}:${source.id}`;
  const replay = await db
    .prepare("SELECT id, status FROM ingestion_runs WHERE idempotency_key = ?")
    .bind(idempotencyKey)
    .first<{ id: string; status: string }>();
  if (replay) {
    await releaseLease(db, source.id, leaseToken);
    return {
      changed: 0,
      discovered: 0,
      errors: 0,
      inserted: 0,
      runId: replay.id,
      sourceId: source.id,
      status: replay.status === "failed" || replay.status === "partial" ? replay.status : "replayed",
      unchanged: 0,
    } satisfies SourceRunResult;
  }

  await db
    .prepare(
      `INSERT INTO ingestion_runs (
        id, source_id, trigger, idempotency_key, actor_type, actor_id,
        parser_version, status, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'feed-v1', 'running', ?)`,
    )
    .bind(
      runId,
      source.id,
      command.trigger,
      idempotencyKey,
      command.actor.type,
      command.actor.id,
      startedAt,
    )
    .run();
  const sourceState =
    (await db
      .prepare("SELECT etag, last_modified, consecutive_failures FROM sources WHERE id = ?")
      .bind(source.id)
      .first<SourceState>()) ?? { consecutive_failures: 0, etag: null, last_modified: null };

  let capturedFeedSnapshot: StoredSnapshot | null = null;
  try {
    const feedResponse = await fetchBounded(source.feedUrl, source, {
      acceptedContentTypes: FEED_CONTENT_TYPES,
      etag: sourceState.etag,
      lastModified: sourceState.last_modified,
      maximumBytes: MAX_FEED_BYTES,
    });
    if (!isBoundedResponse(feedResponse)) {
      const finishedAt = new Date();
      await appendAuditEventWithStatements(
        db,
        {
          action: "ingestion-run.no-change",
          actorId: command.actor.id,
          actorType: command.actor.type,
          entityId: runId,
          entityType: "ingestion-run",
          payload: { httpStatus: 304, sourceId: source.id },
        },
        (audit) => [
          db
            .prepare(
              `UPDATE ingestion_runs SET
                 status = 'no_change', finished_at = ?, http_status = 304, audit_head_hash = ?
               WHERE id = ?`,
            )
            .bind(finishedAt.toISOString(), audit.eventHash, runId),
          db
            .prepare(
              `UPDATE sources SET
                last_success_at = ?, last_error = NULL, consecutive_failures = 0,
                next_check_at = ?, lease_token = NULL, lease_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND lease_token = ?`,
            )
            .bind(
              finishedAt.toISOString(),
              plusMinutes(finishedAt, source.pollIntervalMinutes),
              source.id,
              leaseToken,
            ),
        ],
      );
      return {
        changed: 0,
        discovered: 0,
        errors: 0,
        inserted: 0,
        runId,
        sourceId: source.id,
        status: "no_change",
        unchanged: 0,
      } satisfies SourceRunResult;
    }

    const feedSnapshot = await storeSnapshot({
      bindings,
      captureUrl: source.feedUrl,
      itemId: null,
      response: feedResponse,
      runId,
      source,
    });
    capturedFeedSnapshot = feedSnapshot;
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(feedResponse.bytes);
    const feedItems = parseFeed(xml, source.feedUrl)
      .filter(
        (item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index,
      );
    const knownRows = await db
      .prepare(
        `SELECT id, external_id, canonical_url, title, summary, author, published_at,
                content_hash, latest_snapshot_id, latest_version_id
         FROM source_items WHERE source_id = ?`,
      )
      .bind(source.id)
      .all<ExistingItem>();
    const knownByExternalId = new Map(
      knownRows.results
        .filter((item): item is ExistingItem & { external_id: string } => Boolean(item.external_id))
        .map((item) => [item.external_id, item]),
    );
    const knownByUrl = new Map(knownRows.results.map((item) => [item.canonical_url, item]));
    const pendingItems = feedItems.filter((item) => {
      const existing =
        (item.externalId ? knownByExternalId.get(item.externalId) : undefined) ??
        knownByUrl.get(item.url);
      return !existing || feedItemChanged(item, existing);
    });
    const items = pendingItems.slice(0, MAX_ITEMS_PER_FEED);
    const selectedItems = new Set(items);
    const pendingProcessedCount = items.length;
    for (const item of feedItems) {
      if (items.length >= MAX_ITEMS_PER_FEED) break;
      if (selectedItems.has(item)) continue;
      selectedItems.add(item);
      items.push(item);
    }
    const deferredItemCount = Math.max(0, pendingItems.length - pendingProcessedCount);
    const counts = { changed: 0, errors: 0, inserted: 0, unchanged: 0 };
    const itemErrors: Array<{ message: string; stage: string; urlHash: string }> = [];

    for (const item of items) {
      const urlHash = await sha256Hex(item.url);
      try {
        const result = await processFeedItem({
          bindings,
          feedSnapshotId: feedSnapshot.id,
          item,
          runId,
          source,
        });
        if (result.outcome === "new") counts.inserted += 1;
        else if (result.outcome === "changed") counts.changed += 1;
        else counts.unchanged += 1;
      } catch (error) {
        counts.errors += 1;
        itemErrors.push({ message: errorMessage(error), stage: "item-processing", urlHash });
      }
    }

    const finishedAt = new Date();
    const status = counts.errors > 0 ? "partial" : counts.inserted + counts.changed > 0 ? "succeeded" : "no_change";
    const errorSummary = itemErrors.length ? stableJson(itemErrors.slice(0, 6)) : null;
    const errorSummaryHash = errorSummary ? await sha256Hex(errorSummary) : null;
    await appendAuditEventWithStatements(
      db,
      {
        action: "ingestion-run.completed",
        actorId: command.actor.id,
        actorType: command.actor.type,
        entityId: runId,
        entityType: "ingestion-run",
        payload: {
          changed: counts.changed,
          deferred: deferredItemCount,
          discovered: feedItems.length,
          errors: counts.errors,
          errorSummaryHash,
          feedContentHash: feedSnapshot.contentHash,
          inserted: counts.inserted,
          processed: items.length,
          sourceId: source.id,
          status,
          unchanged: counts.unchanged,
        },
      },
      (audit) => [
        db
          .prepare(
            `UPDATE ingestion_runs SET
              status = ?, finished_at = ?, discovered_count = ?, processed_item_count = ?,
              deferred_item_count = ?, new_item_count = ?,
              changed_item_count = ?, unchanged_item_count = ?, error_count = ?,
              error_summary = ?, feed_snapshot_id = ?, audit_head_hash = ?, http_status = ?
             WHERE id = ?`,
          )
          .bind(
            status,
            finishedAt.toISOString(),
            feedItems.length,
            items.length,
            deferredItemCount,
            counts.inserted,
            counts.changed,
            counts.unchanged,
            counts.errors,
            errorSummary,
            feedSnapshot.id,
            audit.eventHash,
            feedResponse.status,
            runId,
          ),
        db
          .prepare(
            `UPDATE sources SET
              etag = ?, last_modified = ?, last_success_at = ?, last_error = ?,
              consecutive_failures = 0, next_check_at = ?,
              last_new_item_at = CASE WHEN ? > 0 THEN ? ELSE last_new_item_at END,
              lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND lease_token = ?`,
          )
          .bind(
            feedResponse.etag,
            feedResponse.lastModified,
            finishedAt.toISOString(),
            errorSummary,
            plusMinutes(finishedAt, source.pollIntervalMinutes),
            counts.inserted,
            finishedAt.toISOString(),
            source.id,
            leaseToken,
          ),
      ],
    );
    return {
      ...counts,
      discovered: feedItems.length,
      runId,
      sourceId: source.id,
      status,
    } satisfies SourceRunResult;
  } catch (error) {
    await markRunFailed(
      db,
      source,
      runId,
      leaseToken,
      sourceState,
      error,
      capturedFeedSnapshot,
    );
    return {
      changed: 0,
      discovered: 0,
      errors: 1,
      inserted: 0,
      runId,
      sourceId: source.id,
      status: "failed",
      unchanged: 0,
    } satisfies SourceRunResult;
  } finally {
    await releaseLease(db, source.id, leaseToken);
  }
}

export async function runEvidenceIngestion(
  bindings: EvidenceBindings,
  command: IngestionCommand,
): Promise<IngestionResult> {
  await seedEvidenceReferenceData(bindings.DB);
  const allowedSourceIds = new Set(command.sourceIds ?? monitoredSources.map((source) => source.id));
  const limit = Math.max(1, Math.min(command.limit ?? 2, 6));
  const sources = monitoredSources
    .filter((source) => source.active && allowedSourceIds.has(source.id));
  const runs: SourceRunResult[] = [];
  let acquired = 0;

  for (const source of sources) {
    if (acquired >= limit) break;
    const now = new Date().toISOString();
    const leaseToken = await acquireLease(bindings.DB, source, Boolean(command.force), now);
    if (!leaseToken) {
      if (command.force || command.sourceIds?.includes(source.id)) {
        runs.push({
          changed: 0,
          discovered: 0,
          errors: 0,
          inserted: 0,
          runId: null,
          sourceId: source.id,
          status: "locked",
          unchanged: 0,
        });
      }
      continue;
    }
    acquired += 1;
    runs.push(await runSource(bindings, source, command, leaseToken));
  }
  return { invocationId: command.idempotencyKey, runs };
}

export async function runDueIngestion(bindings: EvidenceBindings) {
  const tenMinuteWindow = Math.floor(Date.now() / 600_000);
  return runEvidenceIngestion(bindings, {
    actor: { id: "evidence-monitor", type: "system" },
    idempotencyKey: `traffic:${tenMinuteWindow}`,
    limit: 1,
    trigger: "traffic",
  });
}
