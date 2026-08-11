import type { EvidenceBindings } from "../../../db";
import { appendAuditEventWithStatements } from "./audit";
import {
  constituencyCatalogue,
  election,
  monitoredSources,
  type MonitoredSource,
} from "./catalogue";
import {
  candidateProfileMatchesExpectedIdentity,
  parseCandidateDirectory,
  parseCandidateProfile,
  type CandidateProfileDocument,
  type CandidateProfileLink,
} from "./candidate-html";
import { candidateDirectoryStatesSql } from "./candidate-directory-sql";
import {
  backfillCandidateProfileBasisHashes,
  fingerprintCandidateProfileBasis,
} from "./candidate-profile-basis";
import {
  appendLegacyCollectionAssessment,
  hasCollectionAssessment,
  legacyCollectionAssessmentBacklogSql,
  prepareCollectionAssessment,
  shouldAppendLegacyCollectionAssessment,
  type PreparedCollectionAssessment,
} from "./collection-assessment";
import {
  projectCollectionReason,
} from "./collection-reason";
import {
  runDueDocumentAcquisition,
  type DocumentAcquisitionSummary,
} from "./document-acquisition";
import {
  deleteCurrentKeywordSignalsSql,
  insertCurrentKeywordSignalSql,
  projectKeywordCollectionSignals,
} from "./collection-signals";
import { parseFeed, type NormalizedFeedItem } from "./feed";
import { deterministicId, randomId, sha256Hex, stableJson } from "./integrity";
import { rotateSourceIdsForWindow } from "./ingestion-scheduling";
import { analyzeReadableDocument } from "./machine-analysis";
import { fetchBounded, type BoundedResponse } from "./network";
import { seedEvidenceReferenceData } from "./seed";
import { ensureEvidenceTriggers } from "./triggers";

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS_PER_FEED = 12;
const MAX_CANDIDATE_HTML_BYTES = 2 * 1024 * 1024;
const MANX_RADIO_CRAWL_DELAY_MS = 8_250;
const HOST_RATE_LIMIT_ACQUIRE_TIMEOUT_MS = 50_000;
const HOST_RATE_LIMIT_LEASE_MS = 30_000;
const HOST_RATE_LIMIT_MAX_SLEEP_MS = 5_000;
const FEED_CONTENT_TYPES = [
  "application/atom+xml",
  "application/rss+xml",
  "application/xml",
  "text/xml",
] as const;
const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"] as const;

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
  documents: DocumentAcquisitionSummary | null;
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

type CandidateDirectoryState = {
  affiliation: string;
  candidacy_id: string;
  constituency_id: string;
  constituency_name: string;
  current_basis_hash: string | null;
  current_directory_version_id: string | null;
  current_profile_observation_id: string | null;
  current_profile_payload: string | null;
  current_profile_payload_hash: string | null;
  current_profile_snapshot_id: string | null;
  declaration_status: string;
  directory_payload_hash: string;
  full_name: string;
  people_profile_state: string;
  person_id: string;
  slug: string;
  verification_state: string;
};

type CandidateProfileDue = {
  candidacy_id: string;
  current_profile_payload_hash: string | null;
  current_source_item_version_id: string | null;
  full_name: string;
  profile_url: string;
  slug: string;
  source_item_id: string;
};

type CandidateMatcher = {
  full_name: string;
  id: string;
};

const candidateMatchersSql = `SELECT candidacies.id, people.full_name
  FROM candidacies
  JOIN people ON people.id = candidacies.person_id
 WHERE candidacies.election_id = ?
   AND candidacies.declaration_status != 'source-removed'
 ORDER BY candidacies.id`;

type LegacyCollectionItem = {
  first_seen_at: string;
  item_type: string;
  source_feed_type: string;
  source_id: string;
  source_item_id: string;
  source_name: string;
  source_item_version_id: string;
  summary: string;
  title: string;
};

type StoredSnapshot = {
  chainHash: string;
  contentHash: string;
  id: string;
  inserted: boolean;
};

type HostRateLimitState = {
  lease_expires_at_ms: number | null;
  lease_token: string | null;
  next_request_at_ms: number;
};

type HostRequestLease = {
  host: string;
  token: string;
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

function hostRequestInterval(rawUrl: string) {
  const host = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, "");
  const isManxRadio = host === "manxradio.com" || host.endsWith(".manxradio.com");
  return {
    host: isManxRadio ? "manxradio.com" : host,
    intervalMs: isManxRadio ? MANX_RADIO_CRAWL_DELAY_MS : 0,
  };
}

async function acquireHostRequestLease(
  db: D1Database,
  host: string,
  minimumIntervalMs: number,
) {
  await db
    .prepare(
      `INSERT INTO ingestion_host_rate_limits (
        host, minimum_interval_ms, next_request_at_ms
      ) VALUES (?, ?, 0)
      ON CONFLICT(host) DO UPDATE SET
        minimum_interval_ms = excluded.minimum_interval_ms,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(host, minimumIntervalMs)
    .run();

  const deadline = Date.now() + HOST_RATE_LIMIT_ACQUIRE_TIMEOUT_MS;
  while (true) {
    const now = Date.now();
    const token = randomId("host-request-lease");
    const acquired = await db
      .prepare(
        `UPDATE ingestion_host_rate_limits SET
          last_request_started_at_ms = ?,
          next_request_at_ms = ?,
          lease_token = ?,
          lease_expires_at_ms = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE host = ?
           AND next_request_at_ms <= ?
           AND (lease_token IS NULL OR lease_expires_at_ms <= ?)`,
      )
      .bind(
        now,
        now + minimumIntervalMs,
        token,
        now + HOST_RATE_LIMIT_LEASE_MS,
        host,
        now,
        now,
      )
      .run();
    if (acquired.meta.changes > 0) return { host, token } satisfies HostRequestLease;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`Timed out waiting for the persisted request slot for ${host}.`);
    }
    const state = await db
      .prepare(
        `SELECT next_request_at_ms, lease_token, lease_expires_at_ms
         FROM ingestion_host_rate_limits WHERE host = ?`,
      )
      .bind(host)
      .first<HostRateLimitState>();
    const currentTime = Date.now();
    const leaseReadyAt = state?.lease_token ? (state.lease_expires_at_ms ?? currentTime) : currentTime;
    const readyAt = Math.max(state?.next_request_at_ms ?? currentTime, leaseReadyAt);
    const sleepMs = Math.max(
      50,
      Math.min(readyAt - currentTime, HOST_RATE_LIMIT_MAX_SLEEP_MS, remainingMs),
    );
    await wait(sleepMs);
  }
}

async function releaseHostRequestLease(db: D1Database, lease: HostRequestLease) {
  await db
    .prepare(
      `UPDATE ingestion_host_rate_limits SET
        lease_token = NULL, lease_expires_at_ms = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE host = ? AND lease_token = ?`,
    )
    .bind(lease.host, lease.token)
    .run();
}

async function fetchBoundedWithHostLimit(
  db: D1Database,
  rawUrl: string,
  source: MonitoredSource,
  options: Parameters<typeof fetchBounded>[2],
) {
  const { host, intervalMs } = hostRequestInterval(rawUrl);
  if (intervalMs === 0) return fetchBounded(rawUrl, source, options);

  const lease = await acquireHostRequestLease(db, host, intervalMs);
  try {
    return await fetchBounded(rawUrl, source, options);
  } finally {
    // A token-qualified release cannot clear a successor's lease; expiry is the crash fallback.
    await releaseHostRequestLease(db, lease).catch(() => undefined);
  }
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
  promoteHead?: boolean;
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

  if (input.itemId && input.promoteHead !== false) {
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

function entityMatchProjection(
  db: D1Database,
  itemId: string,
  sourceItemVersionId: string,
  searchableText: string,
  candidateMatchers: CandidateMatcher[],
) {
  const projection = projectKeywordCollectionSignals(
    searchableText,
    candidateMatchers.map((candidate) => ({ id: candidate.id, label: candidate.full_name })),
  );
  const statements: D1PreparedStatement[] = [
    db
      .prepare(deleteCurrentKeywordSignalsSql)
      .bind(itemId, itemId, sourceItemVersionId),
  ];

  for (const candidate of projection.candidates) {
    statements.push(
      db
        .prepare(
          insertCurrentKeywordSignalSql,
        )
        .bind(
          itemId,
          "candidacy",
          candidate.id,
          candidate.mentionText,
          candidate.confidence,
          itemId,
          sourceItemVersionId,
        ),
    );
  }
  for (const constituency of projection.constituencies) {
    statements.push(
      db
        .prepare(
          insertCurrentKeywordSignalSql,
        )
        .bind(
          itemId,
          "constituency",
          constituency.id,
          constituency.mentionText,
          constituency.confidence,
          itemId,
          sourceItemVersionId,
        ),
    );
  }
  for (const topic of projection.topics) {
    statements.push(
      db
        .prepare(
          insertCurrentKeywordSignalSql,
        )
        .bind(
          itemId,
          "topic",
          topic.id,
          topic.mentionText,
          topic.confidence,
          itemId,
          sourceItemVersionId,
        ),
    );
  }
  return { ...projection, statements };
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
  const candidateMatchers = await db
    .prepare(candidateMatchersSql)
    .bind(election.id)
    .all<CandidateMatcher>();
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
  const outcome = !existing
    ? "new"
    : existing.content_hash === payloadHash && existing.latest_version_id
      ? "unchanged"
      : "changed";
  const versionId =
    outcome === "unchanged" && existing?.latest_version_id
      ? existing.latest_version_id
      : await deterministicId("itemversion", resolvedItemId, payloadHash, snapshotId);
  const entityProjection = entityMatchProjection(
    db,
    resolvedItemId,
    versionId,
    `${input.item.title}\n${input.item.summary}`,
    candidateMatchers.results,
  );
  const collectionReason = projectCollectionReason({
    candidates: entityProjection.candidates,
    constituencies: entityProjection.constituencies,
    itemType: input.source.itemType,
    sourceFeedType: input.source.feedType,
    sourceId: input.source.id,
    sourceName: input.source.name,
    summary: input.item.summary,
    title: input.item.title,
    topics: entityProjection.topics,
  });
  const collectionAssessment = await prepareCollectionAssessment(versionId, collectionReason);
  const collectionAssessmentAlreadyFrozen = outcome === "unchanged"
    && await hasCollectionAssessment(db, versionId);
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
          ON CONFLICT(id) DO NOTHING`,
        )
        .bind(versionId, resolvedItemId, input.runId, snapshotId, now, payload, payloadHash),
      db
        .prepare(
          `UPDATE source_items SET
            external_id = ?, canonical_url = ?, canonical_url_hash = ?, title = ?, summary = ?, author = ?,
            published_at = ?, last_seen_at = ?,
            latest_snapshot_id = ?, latest_version_id = ?, content_hash = ?,
            publication_state = CASE
              WHEN content_hash IS NOT ? AND publication_state = 'published' THEN 'withheld'
              ELSE publication_state
            END,
            review_state = CASE
              WHEN content_hash IS NOT ? AND review_state IN ('approved', 'rejected')
                THEN 'needs-update'
              ELSE review_state
            END,
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
          payloadHash,
          payloadHash,
          resolvedItemId,
        ),
      ...(outcome === "unchanged" ? [] : entityProjection.statements),
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
          collectionReasonHash: collectionAssessment.canonicalReasonHash,
          collectionRoute: collectionAssessment.route,
          collectionRuleset: collectionAssessment.rulesetId,
          payloadHash,
          snapshotId,
          sourceId: input.source.id,
          title: input.item.title,
          urlHash: canonicalUrlHash,
        },
      },
      buildStatements,
    );
    await appendLegacyCollectionAssessment({
      actor: { id: "evidence-monitor", type: "system" },
      assessment: collectionAssessment,
      db,
      sourceItemId: resolvedItemId,
    });
  } else {
    await db.batch(buildStatements());
    if (shouldAppendLegacyCollectionAssessment(
      outcome !== "unchanged",
      collectionAssessmentAlreadyFrozen,
    )) {
      await appendLegacyCollectionAssessment({
        actor: { id: "evidence-monitor", type: "system" },
        assessment: collectionAssessment,
        buildStatements: () => entityProjection.statements,
        db,
        sourceItemId: resolvedItemId,
      });
    }
  }

  return { outcome };
}

function normalizedName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function candidateSortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const last = parts.pop() ?? fullName;
  return `${last}, ${parts.join(" ")}`.trim();
}

function constituencyIdForName(name: string) {
  const normalized = normalizedName(name);
  const match = constituencyCatalogue.find(
    (constituency) => normalizedName(constituency.name) === normalized,
  );
  if (!match) throw new Error(`The candidate directory contains an unknown constituency: ${name}`);
  return match.id;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function candidateMediaStatement(input: {
  candidacyId: string;
  contentType: string | null;
  db: D1Database;
  height: number | null;
  observedAt: string;
  observationId: string;
  snapshotId: string;
  sourcePageUrl: string;
  url: string;
  variant: string;
  width: number | null;
}) {
  const remoteUrlHash = await sha256Hex(input.url);
  const id = await deterministicId("candidate-media", input.candidacyId, remoteUrlHash);
  return input.db
    .prepare(
      `INSERT INTO candidate_media_assets (
        id, candidacy_id, media_kind, variant, remote_url, remote_url_hash,
        source_page_url, source_observation_id, source_snapshot_id,
        rights_state, retention_outcome, content_type, width, height,
        first_seen_at, last_seen_at
      ) VALUES (?, ?, 'portrait', ?, ?, ?, ?, ?, ?, 'unknown', 'metadata-only', ?, ?, ?, ?, ?)
      ON CONFLICT(candidacy_id, remote_url_hash) DO UPDATE SET
        publication_state = CASE
          WHEN candidate_media_assets.review_state = 'approved'
            AND excluded.variant != 'directory-thumbnail'
            AND (
              candidate_media_assets.variant != excluded.variant
              OR candidate_media_assets.source_page_url != excluded.source_page_url
            )
          THEN 'withheld'
          ELSE candidate_media_assets.publication_state
        END,
        review_state = CASE
          WHEN candidate_media_assets.review_state = 'approved'
            AND excluded.variant != 'directory-thumbnail'
            AND (
              candidate_media_assets.variant != excluded.variant
              OR candidate_media_assets.source_page_url != excluded.source_page_url
            )
          THEN 'needs-update'
          ELSE candidate_media_assets.review_state
        END,
        variant = CASE
          WHEN candidate_media_assets.review_state IN ('unreviewed', 'needs-update')
            AND (
              candidate_media_assets.variant = 'directory-thumbnail'
              OR excluded.variant != 'directory-thumbnail'
            )
          THEN excluded.variant
          ELSE candidate_media_assets.variant
        END,
        source_page_url = CASE
          WHEN candidate_media_assets.review_state IN ('unreviewed', 'needs-update')
            AND (
              candidate_media_assets.variant = 'directory-thumbnail'
              OR excluded.variant != 'directory-thumbnail'
            )
          THEN excluded.source_page_url
          ELSE candidate_media_assets.source_page_url
        END,
        source_observation_id = CASE
          WHEN candidate_media_assets.review_state IN ('unreviewed', 'needs-update')
            AND (
              candidate_media_assets.variant = 'directory-thumbnail'
              OR excluded.variant != 'directory-thumbnail'
            )
          THEN excluded.source_observation_id
          ELSE candidate_media_assets.source_observation_id
        END,
        source_snapshot_id = CASE
          WHEN candidate_media_assets.review_state IN ('unreviewed', 'needs-update')
            AND (
              candidate_media_assets.variant = 'directory-thumbnail'
              OR excluded.variant != 'directory-thumbnail'
            )
          THEN excluded.source_snapshot_id
          ELSE candidate_media_assets.source_snapshot_id
        END,
        content_type = CASE
          WHEN candidate_media_assets.review_state IN ('unreviewed', 'needs-update')
          THEN COALESCE(excluded.content_type, candidate_media_assets.content_type)
          ELSE candidate_media_assets.content_type
        END,
        width = CASE
          WHEN candidate_media_assets.review_state IN ('unreviewed', 'needs-update')
          THEN COALESCE(excluded.width, candidate_media_assets.width)
          ELSE candidate_media_assets.width
        END,
        height = CASE
          WHEN candidate_media_assets.review_state IN ('unreviewed', 'needs-update')
          THEN COALESCE(excluded.height, candidate_media_assets.height)
          ELSE candidate_media_assets.height
        END,
        last_seen_at = excluded.last_seen_at,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      id,
      input.candidacyId,
      input.variant,
      input.url,
      remoteUrlHash,
      input.sourcePageUrl,
      input.observationId,
      input.snapshotId,
      input.contentType,
      input.width,
      input.height,
      input.observedAt,
      input.observedAt,
    );
}

async function candidateLinkStatement(input: {
  candidacyId: string;
  db: D1Database;
  link: CandidateProfileLink;
  observedAt: string;
  observationId: string;
}) {
  const urlHash = await sha256Hex(input.link.url);
  const id = await deterministicId("candidate-link", input.candidacyId, urlHash);
  return input.db
    .prepare(
      `INSERT INTO candidate_links (
        id, candidacy_id, link_type, label, url, url_hash, source_observation_id,
        verification_state, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'discovered', ?, ?)
      ON CONFLICT(candidacy_id, url_hash) DO UPDATE SET
        publication_state = CASE
          WHEN candidate_links.review_state = 'approved'
            AND (
              candidate_links.link_type != excluded.link_type
              OR candidate_links.label != excluded.label
            )
          THEN 'withheld'
          ELSE candidate_links.publication_state
        END,
        review_state = CASE
          WHEN candidate_links.review_state = 'approved'
            AND (
              candidate_links.link_type != excluded.link_type
              OR candidate_links.label != excluded.label
            )
          THEN 'needs-update'
          ELSE candidate_links.review_state
        END,
        link_type = CASE
          WHEN candidate_links.review_state IN ('unreviewed', 'needs-update')
          THEN excluded.link_type ELSE candidate_links.link_type END,
        label = CASE
          WHEN candidate_links.review_state IN ('unreviewed', 'needs-update')
          THEN excluded.label ELSE candidate_links.label END,
        source_observation_id = CASE
          WHEN candidate_links.review_state IN ('unreviewed', 'needs-update')
          THEN excluded.source_observation_id ELSE candidate_links.source_observation_id END,
        verification_state = CASE
          WHEN candidate_links.verification_state = 'broken' THEN 'discovered'
          ELSE candidate_links.verification_state END,
        last_seen_at = excluded.last_seen_at,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      id,
      input.candidacyId,
      input.link.kind,
      input.link.label,
      input.link.url,
      urlHash,
      input.observationId,
      input.observedAt,
      input.observedAt,
    );
}

async function candidateDocumentStatement(input: {
  candidacyId: string;
  db: D1Database;
  document: CandidateProfileDocument;
  observedAt: string;
  observationId: string;
  snapshotId: string;
}) {
  const urlHash = await sha256Hex(input.document.url);
  const id = await deterministicId("candidate-document", input.candidacyId, urlHash);
  return input.db
    .prepare(
      `INSERT INTO candidate_documents (
        id, candidacy_id, document_kind, title, canonical_url, canonical_url_hash,
        source_observation_id, source_snapshot_id, rights_state, processing_state,
        first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unknown', 'discovered', ?, ?)
      ON CONFLICT(candidacy_id, canonical_url_hash) DO UPDATE SET
        publication_state = CASE
          WHEN candidate_documents.review_state = 'approved'
            AND (
              candidate_documents.document_kind != excluded.document_kind
              OR candidate_documents.title != excluded.title
            )
          THEN 'withheld'
          ELSE candidate_documents.publication_state
        END,
        review_state = CASE
          WHEN candidate_documents.review_state = 'approved'
            AND (
              candidate_documents.document_kind != excluded.document_kind
              OR candidate_documents.title != excluded.title
            )
          THEN 'needs-update'
          ELSE candidate_documents.review_state
        END,
        document_kind = CASE
          WHEN candidate_documents.review_state IN ('unreviewed', 'needs-update')
          THEN excluded.document_kind ELSE candidate_documents.document_kind END,
        title = CASE
          WHEN candidate_documents.review_state IN ('unreviewed', 'needs-update')
          THEN excluded.title ELSE candidate_documents.title END,
        source_observation_id = CASE
          WHEN candidate_documents.review_state IN ('unreviewed', 'needs-update')
          THEN excluded.source_observation_id ELSE candidate_documents.source_observation_id END,
        source_snapshot_id = CASE
          WHEN candidate_documents.review_state IN ('unreviewed', 'needs-update')
          THEN excluded.source_snapshot_id ELSE candidate_documents.source_snapshot_id END,
        last_seen_at = excluded.last_seen_at,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      id,
      input.candidacyId,
      input.document.kind,
      input.document.title,
      input.document.url,
      urlHash,
      input.observationId,
      input.snapshotId,
      input.observedAt,
      input.observedAt,
    );
}

function youtubeVideoId(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let candidate = "";
    if (host === "youtu.be") candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      candidate = url.searchParams.get("v") ?? "";
      if (!candidate) {
        const parts = url.pathname.split("/").filter(Boolean);
        const marker = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
        candidate = marker >= 0 ? parts[marker + 1] ?? "" : "";
      }
    }
    return /^[\w-]{6,20}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function mediaPlatform(rawUrl: string) {
  const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
    return "youtube";
  }
  if (host === "captivate.fm" || host.endsWith(".captivate.fm")) return "captivate";
  return host;
}

async function transcriptJobFromLinkStatement(input: {
  candidacyId: string;
  db: D1Database;
  link: CandidateProfileLink;
  observedAt: string;
  observationId: string;
  snapshotId: string;
}) {
  const videoId = youtubeVideoId(input.link.url);
  const isAudio = input.link.kind === "interview-audio";
  const isInterviewVideo = input.link.kind === "interview-video";
  if (!videoId && !isAudio && !isInterviewVideo) return null;

  const urlHash = await sha256Hex(input.link.url);
  const linkId = await deterministicId("candidate-link", input.candidacyId, urlHash);
  const inputKind = videoId ? "youtube-caption" : "media-transcription";
  const id = await deterministicId("transcript-job", input.candidacyId, urlHash, inputKind);
  return input.db
    .prepare(
      `INSERT INTO transcript_jobs (
        id, candidacy_id, candidate_link_id, source_observation_id, source_snapshot_id,
        input_kind, platform, source_url, source_url_hash, external_media_id,
        access_state, rights_state, processing_state, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'permission-required', 'link-only', 'discovered', ?, ?)
      ON CONFLICT(candidacy_id, source_url_hash, input_kind) DO UPDATE SET
        external_media_id = COALESCE(excluded.external_media_id, transcript_jobs.external_media_id),
        access_state = CASE
          WHEN transcript_jobs.access_state = 'withdrawn' THEN 'permission-required'
          ELSE transcript_jobs.access_state END,
        processing_state = CASE
          WHEN transcript_jobs.processing_state = 'removed' THEN 'discovered'
          ELSE transcript_jobs.processing_state END,
        last_seen_at = excluded.last_seen_at,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      id,
      input.candidacyId,
      linkId,
      input.observationId,
      input.snapshotId,
      inputKind,
      mediaPlatform(input.link.url),
      input.link.url,
      urlHash,
      videoId,
      input.observedAt,
      input.observedAt,
    );
}

async function transcriptJobFromDocumentStatement(input: {
  candidacyId: string;
  db: D1Database;
  document: CandidateProfileDocument;
  observedAt: string;
  observationId: string;
  snapshotId: string;
}) {
  if (input.document.kind !== "transcript") return null;
  const urlHash = await sha256Hex(input.document.url);
  const documentId = await deterministicId("candidate-document", input.candidacyId, urlHash);
  const id = await deterministicId(
    "transcript-job",
    input.candidacyId,
    urlHash,
    "publisher-transcript",
  );
  return input.db
    .prepare(
      `INSERT INTO transcript_jobs (
        id, candidacy_id, candidate_document_id, source_observation_id, source_snapshot_id,
        input_kind, platform, source_url, source_url_hash, access_state, rights_state, processing_state,
        first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, 'publisher-transcript', ?, ?, ?, 'public-transcript-linked', 'unknown', 'discovered', ?, ?)
      ON CONFLICT(candidacy_id, source_url_hash, input_kind) DO UPDATE SET
        access_state = CASE
          WHEN transcript_jobs.access_state = 'withdrawn' THEN 'public-transcript-linked'
          ELSE transcript_jobs.access_state END,
        processing_state = CASE
          WHEN transcript_jobs.processing_state = 'removed' THEN 'discovered'
          ELSE transcript_jobs.processing_state END,
        last_seen_at = excluded.last_seen_at,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      id,
      input.candidacyId,
      documentId,
      input.observationId,
      input.snapshotId,
      mediaPlatform(input.document.url),
      input.document.url,
      urlHash,
      input.observedAt,
      input.observedAt,
    );
}

async function buildCandidateDirectoryStatements(input: {
  db: D1Database;
  entries: ReturnType<typeof parseCandidateDirectory>;
  runId: string;
  snapshotId: string;
  source: MonitoredSource;
}) {
  const observedAt = new Date().toISOString();
  const existingItems = await input.db
    .prepare(
      `SELECT id, external_id, canonical_url, title, summary, author, published_at,
              content_hash, latest_snapshot_id, latest_version_id
       FROM source_items WHERE source_id = ?`,
    )
    .bind(input.source.id)
    .all<ExistingItem>();
  const frozenAssessments = await input.db
    .prepare(
      `SELECT assessments.source_item_version_id
         FROM source_item_version_collection_assessments assessments
         JOIN source_item_versions versions
           ON versions.id = assessments.source_item_version_id
         JOIN source_items items ON items.id = versions.source_item_id
        WHERE items.source_id = ?`,
    )
    .bind(input.source.id)
    .all<{ source_item_version_id: string }>();
  const frozenVersionIds = new Set(
    frozenAssessments.results.map((assessment) => assessment.source_item_version_id),
  );
  const itemsByExternalId = new Map(
    existingItems.results
      .filter((item): item is ExistingItem & { external_id: string } => Boolean(item.external_id))
      .map((item) => [item.external_id, item]),
  );
  const directoryStates = await input.db
    .prepare(candidateDirectoryStatesSql)
    .all<CandidateDirectoryState>();
  const directoryStateBySlug = new Map(directoryStates.results.map((state) => [state.slug, state]));
  const statements: D1PreparedStatement[] = [];
  const assessments: PreparedCollectionAssessment[] = [];
  const legacyAssessments: Array<{
    assessment: PreparedCollectionAssessment;
    sourceItemId: string;
  }> = [];
  const counts = { changed: 0, inserted: 0, removed: 0, unchanged: 0 };
  const observedSlugs = new Set(input.entries.map((entry) => entry.slug));
  counts.removed = directoryStates.results.filter(
    (state) =>
      state.declaration_status !== "source-removed" && !observedSlugs.has(state.slug),
  ).length;
  counts.changed += counts.removed;

  for (const entry of input.entries) {
    const constituencyId = constituencyIdForName(entry.constituencyName);
    const personId = entry.slug;
    const candidacyId = `${election.id}:${entry.slug}`;
    const externalId = `candidate:${entry.slug}`;
    const profileUrlHash = await sha256Hex(entry.profileUrl);
    const existingItem = itemsByExternalId.get(externalId);
    const itemId = existingItem?.id ??
      (await deterministicId("item", input.source.id, externalId));
    const payload = stableJson({
      candidate: {
        constituencyId,
        constituencyName: entry.constituencyName,
        declarationStatus: "prospective",
        fullName: entry.name,
        profileUrl: entry.profileUrl,
        slug: entry.slug,
      },
      portrait: {
        retentionOutcome: "metadata-only",
        rightsState: "unknown",
        url: entry.portraitUrl,
        variant: "directory-thumbnail",
      },
      schema: "real-isle.candidate-directory-observation.v1",
      sourceId: input.source.id,
    });
    const payloadHash = await sha256Hex(payload);
    const observationId = await deterministicId(
      "candidate-observation",
      candidacyId,
      input.snapshotId,
      "directory",
    );
    const profileState = directoryStateBySlug.get(entry.slug);
    const previousHash = profileState?.directory_payload_hash;
    const hasParsedProfile = Boolean(profileState?.current_profile_observation_id);
    const summary = `Listed by ${input.source.name} under ${entry.constituencyName}; official nomination has not yet been verified.`;
    const profileVersionId = hasParsedProfile ? existingItem?.latest_version_id ?? null : null;
    let profileSummary = summary;
    if (profileState?.current_profile_payload) {
      try {
        const parsedPayload = JSON.parse(profileState.current_profile_payload) as {
          biographyParagraphs?: unknown;
        };
        if (
          Array.isArray(parsedPayload.biographyParagraphs) &&
          typeof parsedPayload.biographyParagraphs[0] === "string"
        ) {
          profileSummary = parsedPayload.biographyParagraphs[0];
        }
      } catch {
        profileSummary = summary;
      }
    }
    const outcome = !previousHash
      ? "new"
      : previousHash !== payloadHash ||
          profileState?.declaration_status === "source-removed" ||
          !profileState.current_directory_version_id
        ? "changed"
        : "unchanged";
    const versionId =
      outcome === "unchanged" && profileState?.current_directory_version_id
        ? profileState.current_directory_version_id
        : await deterministicId("itemversion", itemId, payloadHash, input.snapshotId);
    const basisFullName = profileState && profileState.people_profile_state !== "draft"
      ? profileState.full_name
      : entry.name;
    const basisConstituencyId = profileState?.verification_state === "unverified"
      ? constituencyId
      : profileState?.constituency_id ?? constituencyId;
    const basisDeclarationStatus = profileState?.verification_state === "unverified"
      ? "prospective"
      : profileState?.declaration_status ?? "prospective";
    const currentBasisHash = await fingerprintCandidateProfileBasis({
      affiliation: profileState?.affiliation ?? "Unconfirmed",
      candidacyId,
      constituencyId: basisConstituencyId,
      constituencyName: profileState?.verification_state === "unverified"
        ? entry.constituencyName
        : profileState?.constituency_name ?? entry.constituencyName,
      declarationStatus: basisDeclarationStatus,
      directoryPayloadHash: payloadHash,
      directoryVersionId: versionId,
      fullName: basisFullName,
      observedConstituencyId: constituencyId,
      personId: profileState?.person_id ?? personId,
      profileUrlHash,
      slug: entry.slug,
    });
    const collectionReason = projectCollectionReason({
      candidates: [{
        confidence: 1,
        id: candidacyId,
        label: entry.name,
        matchMethod: "candidate-directory-v1",
        mentionText: entry.name,
      }],
      constituencies: [{
        confidence: 1,
        id: constituencyId,
        label: entry.constituencyName,
        matchMethod: "candidate-directory-v1",
        mentionText: entry.constituencyName,
      }],
      itemType: input.source.itemType,
      sourceFeedType: input.source.feedType,
      sourceId: input.source.id,
      sourceName: input.source.name,
      summary,
      title: entry.name,
      topics: [],
    });
    const collectionAssessment = await prepareCollectionAssessment(versionId, collectionReason);
    if (shouldAppendLegacyCollectionAssessment(
      outcome !== "unchanged",
      frozenVersionIds.has(versionId),
    )) {
      legacyAssessments.push({ assessment: collectionAssessment, sourceItemId: itemId });
    } else if (outcome !== "unchanged") {
      assessments.push(collectionAssessment);
    }
    if (outcome === "new") counts.inserted += 1;
    else if (outcome === "changed") counts.changed += 1;
    else counts.unchanged += 1;

    statements.push(
      input.db
        .prepare(
          `INSERT INTO people (id, full_name, sort_name, profile_state, updated_at)
           VALUES (?, ?, ?, 'draft', CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             full_name = CASE WHEN people.profile_state = 'draft' THEN excluded.full_name ELSE people.full_name END,
             sort_name = CASE WHEN people.profile_state = 'draft' THEN excluded.sort_name ELSE people.sort_name END,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(personId, entry.name, candidateSortName(entry.name)),
      input.db
        .prepare(
          `INSERT INTO candidacies (
            id, election_id, person_id, constituency_id, affiliation,
            declaration_status, verification_state, updated_at
          ) VALUES (?, ?, ?, ?, 'Unconfirmed', 'prospective', 'unverified', CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            constituency_id = CASE
              WHEN candidacies.verification_state = 'unverified' THEN excluded.constituency_id
              ELSE candidacies.constituency_id
            END,
            declaration_status = CASE
              WHEN candidacies.verification_state = 'unverified' THEN 'prospective'
              ELSE candidacies.declaration_status
            END,
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(candidacyId, election.id, personId, constituencyId),
      input.db
        .prepare(
          `INSERT INTO source_items (
            id, source_id, external_id, canonical_url, canonical_url_hash,
            item_type, title, summary, first_seen_at, last_seen_at,
            latest_snapshot_id, latest_version_id, content_hash, source_tier
          ) VALUES (?, ?, ?, ?, ?, 'candidate-profile', ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            canonical_url = excluded.canonical_url,
            canonical_url_hash = excluded.canonical_url_hash,
            title = CASE WHEN ? = 1 THEN ? ELSE excluded.title END,
            summary = CASE WHEN ? = 1 THEN ? ELSE excluded.summary END,
            last_seen_at = excluded.last_seen_at,
            latest_snapshot_id = CASE
              WHEN ? = 1 THEN ? ELSE excluded.latest_snapshot_id END,
            latest_version_id = CASE
              WHEN ? = 1 THEN ? ELSE excluded.latest_version_id END,
            content_hash = CASE
              WHEN ? = 1 THEN ? ELSE excluded.content_hash END,
            publication_state = CASE
              WHEN ? = 0
                AND source_items.content_hash IS NOT excluded.content_hash
                AND source_items.publication_state = 'published'
                THEN 'withheld'
              ELSE source_items.publication_state
            END,
            review_state = CASE
              WHEN ? = 0
                AND source_items.content_hash IS NOT excluded.content_hash
                AND source_items.review_state IN ('approved', 'rejected')
                THEN 'needs-update'
              ELSE source_items.review_state
            END,
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          itemId,
          input.source.id,
          externalId,
          entry.profileUrl,
          profileUrlHash,
          entry.name,
          summary,
          observedAt,
          observedAt,
          input.snapshotId,
          versionId,
          payloadHash,
          input.source.sourceTier,
          hasParsedProfile ? 1 : 0,
          entry.name,
          hasParsedProfile ? 1 : 0,
          profileSummary,
          hasParsedProfile ? 1 : 0,
          profileState?.current_profile_snapshot_id ?? input.snapshotId,
          hasParsedProfile ? 1 : 0,
          profileVersionId ?? versionId,
          hasParsedProfile ? 1 : 0,
          profileState?.current_profile_payload_hash ?? payloadHash,
          hasParsedProfile ? 1 : 0,
          hasParsedProfile ? 1 : 0,
        ),
      input.db
        .prepare(
          `INSERT INTO source_item_versions (
            id, source_item_id, ingestion_run_id, snapshot_id, observed_at,
            payload, payload_hash, parser_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate-directory-v1')
          ON CONFLICT(id) DO NOTHING`,
        )
        .bind(versionId, itemId, input.runId, input.snapshotId, observedAt, payload, payloadHash),
      input.db
        .prepare(
          `INSERT INTO candidate_profile_observations (
            id, candidacy_id, source_id, source_item_id, snapshot_id,
            observation_type, observed_at, payload, payload_hash, parser_version
          ) VALUES (?, ?, ?, ?, ?, 'directory', ?, ?, ?, 'candidate-directory-v1')
          ON CONFLICT(candidacy_id, snapshot_id, observation_type) DO NOTHING`,
        )
        .bind(
          observationId,
          candidacyId,
          input.source.id,
          itemId,
          input.snapshotId,
          observedAt,
          payload,
          payloadHash,
        ),
      input.db
        .prepare(
          `INSERT INTO candidate_profiles (
            candidacy_id, slug, profile_url, profile_url_hash, observed_constituency_id,
            current_directory_observation_id, current_basis_hash,
            completeness_state, last_directory_seen_at,
            next_profile_check_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'directory-only', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(candidacy_id) DO UPDATE SET
            profile_url = excluded.profile_url,
            profile_url_hash = excluded.profile_url_hash,
            observed_constituency_id = excluded.observed_constituency_id,
            current_directory_observation_id = excluded.current_directory_observation_id,
            current_basis_hash = excluded.current_basis_hash,
            last_directory_seen_at = excluded.last_directory_seen_at,
            next_profile_check_at = CASE
              WHEN candidate_profiles.next_profile_check_at IS NULL THEN CURRENT_TIMESTAMP
              ELSE candidate_profiles.next_profile_check_at
            END,
            publication_state = CASE
              WHEN candidate_profiles.current_basis_hash IS NOT excluded.current_basis_hash
                AND candidate_profiles.publication_state = 'published' THEN 'withheld'
              ELSE candidate_profiles.publication_state
            END,
            review_state = CASE
              WHEN candidate_profiles.current_basis_hash IS NOT excluded.current_basis_hash
                AND candidate_profiles.review_state IN ('approved', 'rejected') THEN 'needs-update'
              ELSE candidate_profiles.review_state
            END,
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          candidacyId,
          entry.slug,
          entry.profileUrl,
          profileUrlHash,
          constituencyId,
          observationId,
          currentBasisHash,
          observedAt,
        ),
      await candidateMediaStatement({
        candidacyId,
        contentType: null,
        db: input.db,
        height: null,
        observedAt,
        observationId,
        snapshotId: input.snapshotId,
        sourcePageUrl: input.source.feedUrl,
        url: entry.portraitUrl,
        variant: "directory-thumbnail",
        width: null,
      }),
      input.db
        .prepare(
          `INSERT INTO ingestion_run_items (
            id, ingestion_run_id, source_item_id, snapshot_id, source_item_version_id,
            outcome, observed_url_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ingestion_run_id, source_item_id) DO NOTHING`,
        )
        .bind(
          await deterministicId("observation", input.runId, itemId),
          input.runId,
          itemId,
          input.snapshotId,
          versionId,
          outcome,
          profileUrlHash,
        ),
      input.db
        .prepare(
          `INSERT OR IGNORE INTO item_entities (
            item_id, entity_type, entity_id, mention_text, match_method, confidence
          ) VALUES (?, 'candidacy', ?, ?, 'candidate-directory-v1', 1)`,
        )
        .bind(itemId, candidacyId, entry.name),
    );
  }

  statements.push(
    input.db
      .prepare(
        `UPDATE candidacies SET declaration_status = 'source-removed', updated_at = CURRENT_TIMESTAMP
         WHERE election_id = ? AND verification_state = 'unverified'
           AND id IN (
             SELECT candidacy_id FROM candidate_profiles WHERE last_directory_seen_at != ?
           )`,
      )
      .bind(election.id, observedAt),
    input.db
      .prepare(
        `UPDATE candidate_profiles SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state IN ('approved', 'rejected') THEN 'needs-update' ELSE review_state END,
          current_basis_hash = NULL,
          next_profile_check_at = NULL,
          updated_at = CURRENT_TIMESTAMP
         WHERE last_directory_seen_at != ?`,
      )
      .bind(observedAt),
    input.db
      .prepare(
        `UPDATE candidate_links SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state = 'approved' THEN 'needs-update' ELSE review_state END,
          verification_state = 'broken', updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id IN (
           SELECT candidacy_id FROM candidate_profiles WHERE last_directory_seen_at != ?
         )`,
      )
      .bind(observedAt),
    input.db
      .prepare(
        `UPDATE candidate_documents SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state = 'approved' THEN 'needs-update' ELSE review_state END,
          updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id IN (
           SELECT candidacy_id FROM candidate_profiles WHERE last_directory_seen_at != ?
         )`,
      )
      .bind(observedAt),
    input.db
      .prepare(
        `UPDATE candidate_media_assets SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state = 'approved' THEN 'needs-update' ELSE review_state END,
          updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id IN (
           SELECT candidacy_id FROM candidate_profiles WHERE last_directory_seen_at != ?
         )`,
      )
      .bind(observedAt),
    input.db
      .prepare(
        `UPDATE transcripts SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state = 'approved' THEN 'needs-update' ELSE review_state END,
          updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id IN (
           SELECT candidacy_id FROM candidate_profiles WHERE last_directory_seen_at != ?
         )`,
      )
      .bind(observedAt),
    input.db
      .prepare(
        `UPDATE transcript_jobs SET
          access_state = 'withdrawn', processing_state = 'removed',
          lease_token = NULL, lease_expires_at = NULL, next_attempt_at = NULL,
          updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id IN (
           SELECT candidacy_id FROM candidate_profiles WHERE last_directory_seen_at != ?
         )`,
      )
      .bind(observedAt),
    input.db
      .prepare(
        `UPDATE candidate_media_assets SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state = 'approved' THEN 'needs-update' ELSE review_state END,
          updated_at = CURRENT_TIMESTAMP
         WHERE variant = 'directory-thumbnail' AND last_seen_at != ?`,
      )
      .bind(observedAt),
  );
  return { assessments, counts, legacyAssessments, observedAt, statements };
}

async function dueCandidateProfile(db: D1Database, sourceId: string, now: string) {
  return db
    .prepare(
      `SELECT profiles.candidacy_id, profiles.slug, profiles.profile_url, people.full_name,
              items.id AS source_item_id,
              items.latest_version_id AS current_source_item_version_id,
              observations.payload_hash AS current_profile_payload_hash
       FROM candidate_profiles profiles
       JOIN candidacies ON candidacies.id = profiles.candidacy_id
       JOIN people ON people.id = candidacies.person_id
       JOIN source_items items
         ON items.source_id = ? AND items.canonical_url = profiles.profile_url
       LEFT JOIN candidate_profile_observations observations
         ON observations.id = profiles.current_profile_observation_id
       WHERE candidacies.declaration_status != 'source-removed'
         AND (profiles.next_profile_check_at IS NULL OR profiles.next_profile_check_at <= ?)
       ORDER BY COALESCE(profiles.last_profile_checked_at, ''), profiles.slug
       LIMIT 1`,
    )
    .bind(sourceId, now)
    .first<CandidateProfileDue>();
}

async function processCandidateProfile(input: {
  bindings: EvidenceBindings;
  due: CandidateProfileDue;
  response: BoundedResponse;
  runId: string;
  source: MonitoredSource;
}) {
  const db = input.bindings.DB;
  const observedAt = new Date().toISOString();
  const snapshot = await storeSnapshot({
    bindings: input.bindings,
    captureUrl: input.due.profile_url,
    itemId: input.due.source_item_id,
    promoteHead: false,
    response: input.response,
    runId: input.runId,
    source: input.source,
  });
  const html = new TextDecoder("utf-8", { fatal: false }).decode(input.response.bytes);
  const parsed = parseCandidateProfile(html, input.due.profile_url);
  if (
    !candidateProfileMatchesExpectedIdentity({
      expectedName: input.due.full_name,
      expectedSlug: input.due.slug,
      expectedUrl: input.due.profile_url,
      observedName: parsed.name,
      resolvedUrl: input.response.resolvedUrl,
    })
  ) {
    throw new Error(
      `Candidate profile identity mismatch for ${input.due.slug}; the capture was quarantined.`,
    );
  }
  const payload = stableJson({
    biographyParagraphs: parsed.biographyParagraphs,
    candidateName: parsed.name,
    contactText: parsed.contactText,
    documents: parsed.documents,
    links: parsed.links,
    nameMatchesDirectory: true,
    portraits: parsed.portraits.map((portrait) => ({
      ...portrait,
      retentionOutcome: "metadata-only",
      rightsState: "unknown",
    })),
    profileUrl: input.due.profile_url,
    schema: "real-isle.candidate-profile-observation.v1",
    sourceId: input.source.id,
  });
  const payloadHash = await sha256Hex(payload);
  const observationId = await deterministicId(
    "candidate-observation",
    input.due.candidacy_id,
    snapshot.id,
    "profile",
  );
  const profileChanged =
    input.due.current_profile_payload_hash !== payloadHash ||
    !input.due.current_source_item_version_id;
  const versionId =
    !profileChanged && input.due.current_source_item_version_id
      ? input.due.current_source_item_version_id
      : await deterministicId(
          "itemversion",
          input.due.source_item_id,
          payloadHash,
          snapshot.id,
        );
  const collectionReason = projectCollectionReason({
    candidates: [{
      confidence: 1,
      id: input.due.candidacy_id,
      label: input.due.full_name,
      matchMethod: "candidate-profile-v1",
      mentionText: parsed.name,
    }],
    constituencies: [],
    itemType: input.source.itemType,
    sourceFeedType: input.source.feedType,
    sourceId: input.source.id,
    sourceName: input.source.name,
    summary: parsed.biographyParagraphs[0] ?? "Candidate profile observed.",
    title: parsed.name,
    topics: [],
  });
  const collectionAssessment = await prepareCollectionAssessment(versionId, collectionReason);
  const collectionAssessmentAlreadyFrozen = !profileChanged
    && await hasCollectionAssessment(db, versionId);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO source_item_versions (
          id, source_item_id, ingestion_run_id, snapshot_id, observed_at,
          payload, payload_hash, parser_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate-profile-v1')
        ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        versionId,
        input.due.source_item_id,
        input.runId,
        snapshot.id,
        observedAt,
        payload,
        payloadHash,
      ),
    db
      .prepare(
        `INSERT INTO source_item_heads (source_item_id, latest_snapshot_id, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(source_item_id) DO UPDATE SET
           latest_snapshot_id = excluded.latest_snapshot_id,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(input.due.source_item_id, snapshot.id),
    db
      .prepare(
        `UPDATE source_items SET
          title = ?, summary = ?, last_seen_at = ?, latest_snapshot_id = ?,
          latest_version_id = ?, content_hash = ?,
          publication_state = CASE
            WHEN ? = 1 AND publication_state = 'published' THEN 'withheld'
            ELSE publication_state
          END,
          review_state = CASE
            WHEN ? = 1 AND review_state IN ('approved', 'rejected') THEN 'needs-update'
            ELSE review_state
          END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        parsed.name,
        parsed.biographyParagraphs[0] ?? "Candidate profile observed; editorial review pending.",
        observedAt,
        snapshot.id,
        versionId,
        payloadHash,
        profileChanged ? 1 : 0,
        profileChanged ? 1 : 0,
        input.due.source_item_id,
      ),
    db
      .prepare(
        `INSERT INTO candidate_profile_observations (
          id, candidacy_id, source_id, source_item_id, snapshot_id,
          observation_type, observed_at, payload, payload_hash, parser_version
        ) VALUES (?, ?, ?, ?, ?, 'profile', ?, ?, ?, 'candidate-profile-v1')
        ON CONFLICT(candidacy_id, snapshot_id, observation_type) DO NOTHING`,
      )
      .bind(
        observationId,
        input.due.candidacy_id,
        input.source.id,
        input.due.source_item_id,
        snapshot.id,
        observedAt,
        payload,
        payloadHash,
      ),
    db
      .prepare(
        `UPDATE candidate_profiles SET
          current_profile_observation_id = ?, completeness_state = 'profile-parsed',
          last_profile_checked_at = ?, next_profile_check_at = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id = ?`,
      )
      .bind(
        observationId,
        observedAt,
        plusMinutes(new Date(observedAt), 1_440),
        input.due.candidacy_id,
      ),
  ];

  for (const link of parsed.links) {
    statements.push(
      await candidateLinkStatement({
        candidacyId: input.due.candidacy_id,
        db,
        link,
        observedAt,
        observationId,
      }),
    );
    const transcriptJob = await transcriptJobFromLinkStatement({
      candidacyId: input.due.candidacy_id,
      db,
      link,
      observedAt,
      observationId,
      snapshotId: snapshot.id,
    });
    if (transcriptJob) statements.push(transcriptJob);
  }
  for (const portrait of parsed.portraits) {
    statements.push(
      await candidateMediaStatement({
        candidacyId: input.due.candidacy_id,
        contentType: portrait.contentType,
        db,
        height: portrait.height,
        observedAt,
        observationId,
        snapshotId: snapshot.id,
        sourcePageUrl: input.due.profile_url,
        url: portrait.url,
        variant: portrait.variant,
        width: portrait.width,
      }),
    );
  }
  for (const document of parsed.documents) {
    statements.push(
      await candidateDocumentStatement({
        candidacyId: input.due.candidacy_id,
        db,
        document,
        observedAt,
        observationId,
        snapshotId: snapshot.id,
      }),
    );
    const transcriptJob = await transcriptJobFromDocumentStatement({
      candidacyId: input.due.candidacy_id,
      db,
      document,
      observedAt,
      observationId,
      snapshotId: snapshot.id,
    });
    if (transcriptJob) statements.push(transcriptJob);
  }

  statements.push(
    db
      .prepare(
        `UPDATE candidate_links SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state = 'approved' THEN 'needs-update' ELSE review_state END,
          verification_state = 'broken', updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id = ? AND last_seen_at != ?`,
      )
      .bind(input.due.candidacy_id, observedAt),
    db
      .prepare(
        `UPDATE candidate_documents SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state = 'approved' THEN 'needs-update' ELSE review_state END,
          updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id = ? AND last_seen_at != ?`,
      )
      .bind(input.due.candidacy_id, observedAt),
    db
      .prepare(
        `UPDATE candidate_media_assets SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state = 'approved' THEN 'needs-update' ELSE review_state END,
          updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id = ? AND variant != 'directory-thumbnail' AND last_seen_at != ?`,
      )
      .bind(input.due.candidacy_id, observedAt),
    db
      .prepare(
        `UPDATE transcripts SET
          publication_state = CASE
            WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
          review_state = CASE
            WHEN review_state = 'approved' THEN 'needs-update' ELSE review_state END,
          updated_at = CURRENT_TIMESTAMP
         WHERE job_id IN (
           SELECT jobs.id FROM transcript_jobs jobs
           LEFT JOIN candidate_links links ON links.id = jobs.candidate_link_id
           LEFT JOIN candidate_documents documents ON documents.id = jobs.candidate_document_id
           WHERE jobs.candidacy_id = ?
             AND jobs.input_kind != 'manual-upload'
             AND jobs.last_seen_at != ?
         )`,
      )
      .bind(input.due.candidacy_id, observedAt),
    db
      .prepare(
        `UPDATE transcript_jobs SET
          access_state = 'withdrawn', processing_state = 'removed',
          lease_token = NULL, lease_expires_at = NULL, next_attempt_at = NULL,
          updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id = ?
           AND input_kind != 'manual-upload'
           AND last_seen_at != ?`,
      )
      .bind(input.due.candidacy_id, observedAt),
  );

  await appendAuditEventWithStatements(
    db,
    {
      action: "candidate-profile.observed",
      actorId: "evidence-monitor",
      actorType: "system",
      entityId: input.due.candidacy_id,
      entityType: "candidacy",
      payload: {
        ...(profileChanged ? {
          collectionReasonHash: collectionAssessment.canonicalReasonHash,
          collectionRoute: collectionAssessment.route,
          collectionRuleset: collectionAssessment.rulesetId,
        } : {}),
        documentCount: parsed.documents.length,
        linkCount: parsed.links.length,
        payloadHash,
        portraitCount: parsed.portraits.length,
        profileUrlHash: await sha256Hex(input.due.profile_url),
        snapshotId: snapshot.id,
        sourceId: input.source.id,
      },
    },
    () => statements,
  );
  if (
    profileChanged
    || shouldAppendLegacyCollectionAssessment(
      profileChanged,
      collectionAssessmentAlreadyFrozen,
    )
  ) {
    await appendLegacyCollectionAssessment({
      actor: { id: "evidence-monitor", type: "system" },
      assessment: collectionAssessment,
      db,
      sourceItemId: input.due.source_item_id,
    });
  }
  return { changed: profileChanged, snapshot };
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

async function runCandidateDirectorySource(
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
      ) VALUES (?, ?, ?, ?, ?, ?, 'candidate-directory-v1', 'running', ?)`,
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
  let capturedDirectorySnapshot: StoredSnapshot | null = null;

  try {
    const directoryResponse = await fetchBoundedWithHostLimit(db, source.feedUrl, source, {
      acceptedContentTypes: HTML_CONTENT_TYPES,
      etag: sourceState.etag,
      lastModified: sourceState.last_modified,
      maximumBytes: MAX_CANDIDATE_HTML_BYTES,
    });
    let directoryHttpStatus = 304;
    let directoryEtag = sourceState.etag;
    let directoryLastModified = sourceState.last_modified;
    let discovered = 0;
    let removedCandidateCount = 0;
    const counts = { changed: 0, errors: 0, inserted: 0, unchanged: 0 };

    if (isBoundedResponse(directoryResponse)) {
      directoryHttpStatus = directoryResponse.status;
      directoryEtag = directoryResponse.etag;
      directoryLastModified = directoryResponse.lastModified;
      capturedDirectorySnapshot = await storeSnapshot({
        bindings,
        captureUrl: source.feedUrl,
        itemId: null,
        response: directoryResponse,
        runId,
        source,
      });
      const html = new TextDecoder("utf-8", { fatal: false }).decode(directoryResponse.bytes);
      const entries = parseCandidateDirectory(html, source.feedUrl);
      const observedConstituencies = new Set(entries.map((entry) => constituencyIdForName(entry.constituencyName)));
      if (entries.length < 12 || observedConstituencies.size !== constituencyCatalogue.length) {
        throw new Error(
          `Candidate directory validation failed: ${entries.length} profiles across ${observedConstituencies.size} constituencies.`,
        );
      }
      discovered = entries.length;
      const directory = await buildCandidateDirectoryStatements({
        db,
        entries,
        runId,
        snapshotId: capturedDirectorySnapshot.id,
        source,
      });
      counts.changed = directory.counts.changed;
      counts.inserted = directory.counts.inserted;
      removedCandidateCount = directory.counts.removed;
      counts.unchanged = directory.counts.unchanged;
      const directoryDigest = await sha256Hex(
        stableJson(
          entries.map((entry) => ({
            constituency: entry.constituencyName,
            name: entry.name,
            portraitUrlHash: entry.portraitUrl,
            profileUrl: entry.profileUrl,
          })),
        ),
      );
      const collectionAssessmentDigest = await sha256Hex(stableJson(
        directory.assessments
          .map((assessment) => ({
            canonicalReasonHash: assessment.canonicalReasonHash,
            route: assessment.route,
            rulesetId: assessment.rulesetId,
            sourceItemVersionId: assessment.sourceItemVersionId,
          }))
          .sort((left, right) => left.sourceItemVersionId.localeCompare(right.sourceItemVersionId)),
      ));
      await appendAuditEventWithStatements(
        db,
        {
          action: "candidate-directory.observed",
          actorId: command.actor.id,
          actorType: command.actor.type,
          entityId: source.id,
          entityType: "source",
          payload: {
            candidateCount: entries.length,
            collectionAssessmentCount: directory.assessments.length,
            collectionAssessmentDigest,
            constituencyCount: observedConstituencies.size,
            directoryDigest,
            removedCandidateCount: directory.counts.removed,
            snapshotId: capturedDirectorySnapshot.id,
            sourceContentHash: capturedDirectorySnapshot.contentHash,
          },
        },
        () => directory.statements,
      );
      for (const assessment of directory.assessments) {
        const sourceItem = await db.prepare(
          "SELECT source_item_id FROM source_item_versions WHERE id = ?",
        ).bind(assessment.sourceItemVersionId).first<{ source_item_id: string }>();
        if (!sourceItem) {
          throw new Error(
            `The candidate-directory assessment target ${assessment.sourceItemVersionId} was not stored.`,
          );
        }
        await appendLegacyCollectionAssessment({
          actor: command.actor,
          assessment,
          db,
          sourceItemId: sourceItem.source_item_id,
        });
      }
      for (const legacy of directory.legacyAssessments) {
        await appendLegacyCollectionAssessment({
          actor: command.actor,
          assessment: legacy.assessment,
          db,
          sourceItemId: legacy.sourceItemId,
        });
      }
    }

    const due = await dueCandidateProfile(db, source.id, new Date().toISOString());
    let profileOutcome: "not-due" | "parsed" | "unchanged" | "failed" = "not-due";
    let errorSummary: string | null = null;
    const finalStatements: D1PreparedStatement[] = [];
    if (due) {
      try {
        const profileResponse = await fetchBoundedWithHostLimit(db, due.profile_url, source, {
          acceptedContentTypes: HTML_CONTENT_TYPES,
          maximumBytes: MAX_CANDIDATE_HTML_BYTES,
        });
        if (!isBoundedResponse(profileResponse)) {
          throw new Error("A candidate profile unexpectedly returned HTTP 304 without validators.");
        }
        const profile = await processCandidateProfile({
          bindings,
          due,
          response: profileResponse,
          runId,
          source,
        });
        profileOutcome = profile.changed ? "parsed" : "unchanged";
      } catch (error) {
        counts.errors += 1;
        profileOutcome = "failed";
        errorSummary = stableJson([
          {
            candidacyId: due.candidacy_id,
            message: errorMessage(error),
            stage: "candidate-profile",
            urlHash: await sha256Hex(due.profile_url),
          },
        ]);
        const retryAt = plusMinutes(new Date(), 60);
        finalStatements.push(
          db
            .prepare(
              `UPDATE candidate_profiles SET
                last_profile_checked_at = CURRENT_TIMESTAMP,
                next_profile_check_at = ?, updated_at = CURRENT_TIMESTAMP
               WHERE candidacy_id = ?`,
            )
            .bind(retryAt, due.candidacy_id),
          db
            .prepare(
              `INSERT INTO ingestion_run_items (
                id, ingestion_run_id, source_item_id, outcome, observed_url_hash,
                error_code, error_message
              ) VALUES (?, ?, ?, 'error', ?, 'candidate-profile', ?)
              ON CONFLICT(ingestion_run_id, source_item_id) DO UPDATE SET
                outcome = 'error', error_code = excluded.error_code,
                error_message = excluded.error_message`,
            )
            .bind(
              await deterministicId("observation", runId, due.source_item_id),
              runId,
              due.source_item_id,
              await sha256Hex(due.profile_url),
              errorMessage(error),
            ),
        );
      }
    }

    const finishedAt = new Date();
    const status = counts.errors > 0
      ? "partial"
      : counts.inserted + counts.changed > 0 || profileOutcome === "parsed"
        ? "succeeded"
        : "no_change";
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
          discovered,
          errors: counts.errors,
          errorSummaryHash,
          inserted: counts.inserted,
          profileOutcome,
          removedCandidateCount,
          sourceId: source.id,
          status,
          unchanged: counts.unchanged,
        },
      },
      (audit) => [
        ...finalStatements,
        db
          .prepare(
            `UPDATE ingestion_runs SET
              status = ?, finished_at = ?, discovered_count = ?, processed_item_count = ?,
              new_item_count = ?, changed_item_count = ?, unchanged_item_count = ?,
              error_count = ?, error_summary = ?, feed_snapshot_id = ?,
              audit_head_hash = ?, http_status = ?
             WHERE id = ?`,
          )
          .bind(
            status,
            finishedAt.toISOString(),
            discovered,
            discovered + removedCandidateCount + (due ? 1 : 0),
            counts.inserted,
            counts.changed,
            counts.unchanged,
            counts.errors,
            errorSummary,
            capturedDirectorySnapshot?.id ?? null,
            audit.eventHash,
            directoryHttpStatus,
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
            directoryEtag,
            directoryLastModified,
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
      discovered,
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
      capturedDirectorySnapshot,
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
    const feedResponse = await fetchBoundedWithHostLimit(db, source.feedUrl, source, {
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

export async function backfillLegacyCollectionAssessments(
  db: D1Database,
  actor: IngestionActor,
  limit = 8,
) {
  const items = await db
    .prepare(legacyCollectionAssessmentBacklogSql)
    .bind(Math.max(1, Math.min(limit, 20)))
    .all<LegacyCollectionItem>();
  const candidateMatchers = await db
    .prepare(candidateMatchersSql)
    .bind(election.id)
    .all<CandidateMatcher>();

  let assessed = 0;
  for (const item of items.results) {
    const projection = entityMatchProjection(
      db,
      item.source_item_id,
      item.source_item_version_id,
      `${item.title}\n${item.summary}`,
      candidateMatchers.results,
    );
    const reason = projectCollectionReason({
      candidates: projection.candidates,
      constituencies: projection.constituencies,
      itemType: item.item_type,
      sourceFeedType: item.source_feed_type,
      sourceId: item.source_id,
      sourceName: item.source_name,
      summary: item.summary,
      title: item.title,
      topics: projection.topics,
    });
    const assessment = await prepareCollectionAssessment(item.source_item_version_id, reason);
    if (await appendLegacyCollectionAssessment({
      actor,
      assessment,
      buildStatements: () => projection.statements,
      db,
      sourceItemId: item.source_item_id,
    })) assessed += 1;
  }
  return assessed;
}

export async function runEvidenceIngestion(
  bindings: EvidenceBindings,
  command: IngestionCommand,
): Promise<IngestionResult> {
  await ensureEvidenceTriggers(bindings.DB);
  await seedEvidenceReferenceData(bindings.DB);
  await backfillCandidateProfileBasisHashes(bindings.DB);
  // Existing evidence is progressively frozen into the same versioned relevance
  // ledger as new captures.  Keep traffic-triggered work small; the scheduler
  // clears the library steadily without letting one invocation monopolise D1.
  await backfillLegacyCollectionAssessments(
    bindings.DB,
    command.actor,
    command.trigger === "scheduler" ? 20 : command.trigger === "manual" ? 12 : 8,
  );
  const allowedSourceIds = new Set(command.sourceIds ?? monitoredSources.map((source) => source.id));
  const sourceOrder = new Map(command.sourceIds?.map((sourceId, index) => [sourceId, index]) ?? []);
  const limit = Math.max(1, Math.min(command.limit ?? 2, 6));
  const sources = monitoredSources
    .filter((source) => source.active && allowedSourceIds.has(source.id))
    .toSorted((left, right) => {
      if (!command.sourceIds) return 0;
      return (sourceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (sourceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    });
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
    runs.push(
      source.feedType === "candidate-directory"
        ? await runCandidateDirectorySource(bindings, source, command, leaseToken)
        : await runSource(bindings, source, command, leaseToken),
    );
  }
  // An explicit empty source list is the documented safe “assess only” mode.
  // It must not make any publisher request.  Ordinary scheduled/manual runs
  // scrape a small, fair rotation of already-assessed eligible pages and feed
  // the transient readable text straight into the guarded analyser.
  const documents = command.sourceIds?.length === 0
    ? null
    : await runDueDocumentAcquisition(bindings, {
      actor: command.actor,
      analyze: analyzeReadableDocument,
      limit: command.trigger === "traffic" ? 1 : 4,
    });
  return { documents, invocationId: command.idempotencyKey, runs };
}

export function trafficSourceIdsForWindow(tenMinuteWindow: number) {
  const activeSourceIds = monitoredSources
    .filter((source) => source.active)
    .map((source) => source.id);
  return rotateSourceIdsForWindow(activeSourceIds, tenMinuteWindow);
}

export async function runDueIngestion(bindings: EvidenceBindings) {
  const tenMinuteWindow = Math.floor(Date.now() / 600_000);
  return runEvidenceIngestion(bindings, {
    actor: { id: "evidence-monitor", type: "system" },
    idempotencyKey: `traffic:${tenMinuteWindow}`,
    limit: 2,
    sourceIds: trafficSourceIdsForWindow(tenMinuteWindow),
    trigger: "traffic",
  });
}
