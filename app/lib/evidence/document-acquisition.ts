import type { EvidenceBindings } from "../../../db";
import { appendAuditEventWithStatements } from "./audit.ts";
import {
  monitoredSources,
  type MonitoredSource,
} from "./catalogue.ts";
import { ensureDocumentCaptureTriggers } from "./document-capture-sql.ts";
import {
  CIVIC_CRAWLER_PRODUCT_TOKEN,
  fetchControlled,
  validateExactSourceUrl,
  type ControlledResponse,
} from "./controlled-fetch.ts";
import { deterministicId, randomId, sha256Hex, stableJson } from "./integrity.ts";
import {
  extractReadableHtml,
  READABLE_HTML_EXTRACTOR_VERSION,
  type ReadableBlock,
} from "./readable-html.ts";
import { parseRobotsTxt, robotsAllowsUrl, type RobotsRule } from "./robots.ts";
import { seedEvidenceReferenceData } from "./seed.ts";

const ARTICLE_CONTENT_TYPES = ["text/html", "application/xhtml+xml"] as const;
const ROBOTS_CONTENT_TYPES = ["text/plain"] as const;
const MAX_ARTICLE_BYTES = 2 * 1024 * 1024;
const MAX_ROBOTS_BYTES = 512 * 1024;
const MAX_SHORT_EXTRACT_LENGTH = 400;
const MAX_DOCUMENTS_PER_INVOCATION = 4;
const MIN_READABLE_TEXT_LENGTH = 120;
const ROBOTS_CACHE_MS = 24 * 60 * 60 * 1_000;
const ROBOTS_FAILURE_CACHE_MS = 15 * 60 * 1_000;
const DOCUMENT_LEASE_MS = 3 * 60 * 1_000;
const HOST_LEASE_MS = 30_000;

type AcquisitionActor = {
  id: string;
  type: "admin" | "system";
};

type SourceRightsState = "restricted-copy" | "metadata-only" | "public-record";

export type DocumentSourcePolicy = {
  active: boolean;
  rightsState: SourceRightsState;
  storeFullContent: boolean;
};

export type ReadableDocumentV1 = {
  blocks: ReadableBlock[];
  documentCaptureId: string;
  extractor: {
    configHash: string;
    id: typeof READABLE_HTML_EXTRACTOR_VERSION;
  };
  metadata: {
    byline: string | null;
    language: string | null;
    publishedAt: string | null;
    title: string | null;
  };
  observedAt: string;
  offsetUnits: {
    raw: "utf8-byte";
    text: "utf16-code-unit";
  };
  rawContentHash: string;
  requestedUrl: string;
  resolvedUrl: string;
  schema: "peoples-isle.readable-document.v1";
  snapshotId: string;
  sourceId: string;
  sourceItemId: string;
  sourceItemVersionId: string;
  text: string;
  textHash: string;
};

export type DocumentAnalysisCallback = (
  db: D1Database,
  document: ReadableDocumentV1,
  context: { actor: AcquisitionActor },
) => Promise<unknown>;

export type DocumentAcquisitionItemResult = {
  analysis: "completed" | "failed" | "not-requested" | "skipped-stale";
  captureId: string | null;
  error: string | null;
  outcome:
    | "access-blocked"
    | "captured"
    | "deferred"
    | "failed"
    | "robots-blocked"
    | "unchanged"
    | "unsupported";
  sourceId: string;
  sourceItemId: string;
};

export type DocumentAcquisitionSummary = {
  attempted: number;
  invocationId: string;
  results: DocumentAcquisitionItemResult[];
};

type DueDocument = {
  canonical_url: string;
  current_capture_id: string | null;
  current_capture_version_id: string | null;
  current_snapshot_etag: string | null;
  current_snapshot_id: string | null;
  current_snapshot_last_modified: string | null;
  first_seen_at: string;
  last_attempt_at: string | null;
  latest_version_id: string;
  source_id: string;
  source_item_id: string;
};

type RobotsPolicyRow = {
  body_hash: string | null;
  crawl_delay_ms: number;
  etag: string | null;
  exact_host: string;
  expires_at: string;
  fetched_at: string;
  http_status: number | null;
  id: string;
  last_modified: string | null;
  policy_state: "rules" | "allow-default" | "unreachable";
  rules_hash: string;
  rules_json: string;
  user_agent_token: string;
};

type HostRateLimitRow = {
  lease_expires_at_ms: number | null;
  lease_token: string | null;
  next_request_at_ms: number;
};

type HostLease = {
  host: string;
  token: string;
};

type SourcePolicyRow = {
  active: number;
  rights_state: string;
  store_full_content: number;
};

function plusMilliseconds(value: Date, milliseconds: number) {
  return new Date(value.getTime() + milliseconds).toISOString();
}

function plusMinutes(value: Date, minutes: number) {
  return plusMilliseconds(value, minutes * 60_000);
}

function boundedError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 900);
}

function sourceForId(sourceId: string) {
  return monitoredSources.find((source) => source.id === sourceId) ?? null;
}

function isSourceRightsState(value: string): value is SourceRightsState {
  return value === "restricted-copy" || value === "metadata-only" || value === "public-record";
}

async function readDocumentSourcePolicy(db: D1Database, sourceId: string) {
  const row = await db
    .prepare(
      `SELECT active, rights_state, store_full_content
         FROM sources WHERE id = ?`,
    )
    .bind(sourceId)
    .first<SourcePolicyRow>();
  if (
    !row ||
    row.active !== 1 ||
    !isSourceRightsState(row.rights_state) ||
    ![0, 1].includes(row.store_full_content)
  ) {
    return null;
  }
  return {
    active: true,
    rightsState: row.rights_state,
    storeFullContent: row.store_full_content === 1,
  } satisfies DocumentSourcePolicy;
}

function sameDocumentSourcePolicy(
  left: DocumentSourcePolicy,
  right: DocumentSourcePolicy | null,
) {
  return Boolean(
    right &&
    right.active === left.active &&
    right.rightsState === left.rightsState &&
    right.storeFullContent === left.storeFullContent,
  );
}

function isEligibleDocumentUrl(source: MonitoredSource, rawUrl: string) {
  if (source.documentHosts.length === 0) return false;
  try {
    validateExactSourceUrl(rawUrl, source.documentHosts);
    return true;
  } catch {
    return false;
  }
}

export function canonicalRateLimitHost(exactHost: string) {
  const host = exactHost.toLowerCase().replace(/\.$/, "");
  return host === "manxradio.com" || host.endsWith(".manxradio.com")
    ? "manxradio.com"
    : host;
}

export function fairDueDocuments(rows: readonly DueDocument[], limit: number) {
  const queues = new Map<string, DueDocument[]>();
  for (const row of rows) {
    const queue = queues.get(row.source_id) ?? [];
    queue.push(row);
    queues.set(row.source_id, queue);
  }
  const selected: DueDocument[] = [];
  while (selected.length < limit && [...queues.values()].some((queue) => queue.length > 0)) {
    for (const queue of queues.values()) {
      const row = queue.shift();
      if (row) selected.push(row);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

async function seedDocumentHeads(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT source_items.id, source_items.source_id, source_items.canonical_url
         FROM source_items
         JOIN sources ON sources.id = source_items.source_id
        WHERE source_items.latest_version_id IS NOT NULL AND sources.active = 1
        ORDER BY source_items.first_seen_at
        LIMIT 1000`,
    )
    .all<{ canonical_url: string; id: string; source_id: string }>();
  const eligible = rows.results.filter((row) => {
    const source = sourceForId(row.source_id);
    return source ? isEligibleDocumentUrl(source, row.canonical_url) : false;
  });
  if (eligible.length > 0) {
    await db.batch(
      eligible.map((row) =>
        db
          .prepare(
            `INSERT INTO source_document_heads (source_item_id, crawl_state, next_check_at)
             VALUES (?, 'pending', CURRENT_TIMESTAMP)
             ON CONFLICT(source_item_id) DO NOTHING`,
          )
          .bind(row.id),
      ),
    );
  }
  await db.prepare(
    `UPDATE source_document_heads
        SET crawl_state = 'pending', next_check_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE current_capture_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM source_items item
            JOIN source_document_captures capture
              ON capture.id = source_document_heads.current_capture_id
           WHERE item.id = source_document_heads.source_item_id
             AND item.latest_version_id IS NOT capture.source_item_version_id
        )`,
  ).run();
}

async function dueDocuments(db: D1Database, now: string) {
  return db
    .prepare(
      `SELECT item.id AS source_item_id, item.source_id, item.canonical_url,
              item.latest_version_id, item.first_seen_at,
              head.current_capture_id, head.last_attempt_at,
              capture.source_item_version_id AS current_capture_version_id,
              snapshot.id AS current_snapshot_id, snapshot.etag AS current_snapshot_etag,
              snapshot.last_modified AS current_snapshot_last_modified
         FROM source_document_heads head
         JOIN source_items item ON item.id = head.source_item_id
         JOIN sources source ON source.id = item.source_id AND source.active = 1
         LEFT JOIN source_document_captures capture ON capture.id = head.current_capture_id
         LEFT JOIN source_snapshots snapshot ON snapshot.id = capture.snapshot_id
        WHERE item.latest_version_id IS NOT NULL
          AND (head.next_check_at IS NULL OR head.next_check_at <= ?)
          AND (head.lease_expires_at IS NULL OR head.lease_expires_at <= ?)
          AND EXISTS (
            SELECT 1
              FROM source_item_version_collection_assessments assessment
              JOIN audit_events relevance_audit
                ON relevance_audit.id = assessment.created_by_audit_event_id
               AND relevance_audit.action = 'source-item.relevance-assessed'
               AND relevance_audit.entity_type = 'source-item-version'
               AND relevance_audit.entity_id = item.latest_version_id
               AND json_extract(relevance_audit.payload, '$.sourceItemId') = item.id
               AND json_extract(relevance_audit.payload, '$.collectionReasonHash') = assessment.canonical_reason_hash
               AND json_extract(relevance_audit.payload, '$.collectionRoute') = assessment.route
               AND json_extract(relevance_audit.payload, '$.collectionRuleset') = assessment.ruleset_id
             WHERE assessment.source_item_version_id = item.latest_version_id
               AND assessment.route IN ('evidence-review', 'context-monitoring')
          )
        ORDER BY COALESCE(head.last_attempt_at, ''), item.first_seen_at, item.id
        LIMIT 200`,
    )
    .bind(now, now)
    .all<DueDocument>();
}

async function claimDocument(db: D1Database, itemId: string, now: Date) {
  const token = randomId("document-lease");
  const result = await db
    .prepare(
      `UPDATE source_document_heads
          SET lease_token = ?, lease_expires_at = ?, last_attempt_at = ?,
              attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE source_item_id = ?
          AND (next_check_at IS NULL OR next_check_at <= ?)
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
    )
    .bind(
      token,
      plusMilliseconds(now, DOCUMENT_LEASE_MS),
      now.toISOString(),
      itemId,
      now.toISOString(),
      now.toISOString(),
    )
    .run();
  return result.meta.changes > 0 ? token : null;
}

export function persistedDocumentCrawlState(
  state: DocumentAcquisitionItemResult["outcome"] | "ready",
) {
  return state === "captured" || state === "ready"
    ? "ready"
    : state === "deferred"
      ? "pending"
      : state;
}

async function updateDocumentHead(
  db: D1Database,
  input: {
    error?: string | null;
    itemId: string;
    leaseToken: string;
    nextCheckAt: string;
    state: DocumentAcquisitionItemResult["outcome"] | "ready";
    success?: boolean;
  },
) {
  const crawlState = persistedDocumentCrawlState(input.state);
  const isFailure = crawlState === "failed";
  await db
    .prepare(
      `UPDATE source_document_heads SET
          crawl_state = ?, next_check_at = ?, lease_token = NULL, lease_expires_at = NULL,
          consecutive_failures = CASE WHEN ? = 1 THEN consecutive_failures + 1 ELSE 0 END,
          last_success_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_success_at END,
          last_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE source_item_id = ? AND lease_token = ?`,
    )
    .bind(
      crawlState,
      input.nextCheckAt,
      isFailure ? 1 : 0,
      input.success ? 1 : 0,
      input.error ?? null,
      input.itemId,
      input.leaseToken,
    )
    .run();
}

async function tryAcquireHostLease(
  db: D1Database,
  host: string,
  minimumIntervalMs: number,
  now: Date,
) {
  await db
    .prepare(
      `INSERT INTO ingestion_host_rate_limits (
         host, minimum_interval_ms, next_request_at_ms
       ) VALUES (?, ?, 0)
       ON CONFLICT(host) DO UPDATE SET
         minimum_interval_ms = MAX(minimum_interval_ms, excluded.minimum_interval_ms),
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(host, minimumIntervalMs)
    .run();
  const token = randomId("host-request-lease");
  const nowMs = now.getTime();
  const result = await db
    .prepare(
      `UPDATE ingestion_host_rate_limits SET
          last_request_started_at_ms = ?, next_request_at_ms = ?, lease_token = ?,
          lease_expires_at_ms = ?, updated_at = CURRENT_TIMESTAMP
        WHERE host = ? AND next_request_at_ms <= ?
          AND (lease_token IS NULL OR lease_expires_at_ms <= ?)`,
    )
    .bind(
      nowMs,
      nowMs + minimumIntervalMs,
      token,
      nowMs + HOST_LEASE_MS,
      host,
      nowMs,
      nowMs,
    )
    .run();
  if (result.meta.changes > 0) {
    return { lease: { host, token } satisfies HostLease, nextRequestAtMs: null };
  }
  const state = await db
    .prepare(
      `SELECT next_request_at_ms, lease_token, lease_expires_at_ms
         FROM ingestion_host_rate_limits WHERE host = ?`,
    )
    .bind(host)
    .first<HostRateLimitRow>();
  const blockedUntil = Math.max(
    state?.next_request_at_ms ?? nowMs + minimumIntervalMs,
    state?.lease_expires_at_ms ?? 0,
  );
  return { lease: null, nextRequestAtMs: blockedUntil };
}

async function extendAndReleaseHostLease(
  db: D1Database,
  lease: HostLease,
  nextRequestAtMs: number,
) {
  await db
    .prepare(
      `UPDATE ingestion_host_rate_limits SET
          next_request_at_ms = MAX(next_request_at_ms, ?),
          lease_token = NULL, lease_expires_at_ms = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE host = ? AND lease_token = ?`,
    )
    .bind(nextRequestAtMs, lease.host, lease.token)
    .run();
}

async function currentRobotsPolicy(db: D1Database, host: string) {
  return db
    .prepare(
      `SELECT policy.*
         FROM robots_policy_heads head
         JOIN robots_policies policy ON policy.id = head.current_policy_id
        WHERE head.exact_host = ? AND head.user_agent_token = ?`,
    )
    .bind(host, CIVIC_CRAWLER_PRODUCT_TOKEN)
    .first<RobotsPolicyRow>();
}

async function storeRobotsPolicy(
  db: D1Database,
  input: {
    actor: AcquisitionActor;
    bodyHash: string | null;
    crawlDelayMs: number;
    etag: string | null;
    exactHost: string;
    expiresAt: string;
    fetchedAt: string;
    httpStatus: number | null;
    lastModified: string | null;
    policyState: RobotsPolicyRow["policy_state"];
    rules: RobotsRule[];
  },
) {
  const rulesJson = stableJson(input.rules);
  const rulesHash = await sha256Hex(rulesJson);
  const id = await deterministicId(
    "robots-policy",
    input.exactHost,
    CIVIC_CRAWLER_PRODUCT_TOKEN,
    input.fetchedAt,
    rulesHash,
    String(input.httpStatus),
  );
  await appendAuditEventWithStatements(
    db,
    {
      action: "robots-policy.observed",
      actorId: input.actor.id,
      actorType: input.actor.type,
      entityId: input.exactHost,
      entityType: "source-host",
      payload: {
        bodyHash: input.bodyHash,
        crawlDelayMs: input.crawlDelayMs,
        httpStatus: input.httpStatus,
        policyId: id,
        policyState: input.policyState,
        rulesHash,
        userAgentToken: CIVIC_CRAWLER_PRODUCT_TOKEN,
      },
    },
    () => [],
    (audit) => [
      db
        .prepare(
          `INSERT INTO robots_policies (
             id, exact_host, user_agent_token, fetched_at, expires_at, policy_state,
             http_status, etag, last_modified, body_hash, rules_json, rules_hash,
             crawl_delay_ms, created_by_audit_event_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.exactHost,
          CIVIC_CRAWLER_PRODUCT_TOKEN,
          input.fetchedAt,
          input.expiresAt,
          input.policyState,
          input.httpStatus,
          input.etag,
          input.lastModified,
          input.bodyHash,
          rulesJson,
          rulesHash,
          input.crawlDelayMs,
          audit.id,
        ),
      db
        .prepare(
          `INSERT INTO robots_policy_heads (
             exact_host, user_agent_token, current_policy_id, updated_at
           ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(exact_host, user_agent_token) DO UPDATE SET
             current_policy_id = excluded.current_policy_id,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(input.exactHost, CIVIC_CRAWLER_PRODUCT_TOKEN, id),
    ],
  );
  return (await currentRobotsPolicy(db, input.exactHost))!;
}

async function getRobotsPolicy(input: {
  actor: AcquisitionActor;
  db: D1Database;
  fetchImpl?: typeof fetch;
  host: string;
  now: Date;
  source: MonitoredSource;
}): Promise<
  | { kind: "deferred"; nextRequestAt: string }
  | { kind: "policy"; policy: RobotsPolicyRow }
> {
  const existing = await currentRobotsPolicy(input.db, input.host);
  if (existing && existing.expires_at > input.now.toISOString()) {
    return { kind: "policy", policy: existing };
  }

  const slot = await tryAcquireHostLease(
    input.db,
    canonicalRateLimitHost(input.host),
    input.source.minimumRequestIntervalMs,
    input.now,
  );
  if (!slot.lease) {
    return {
      kind: "deferred",
      nextRequestAt: new Date(slot.nextRequestAtMs ?? input.now.getTime() + 60_000).toISOString(),
    };
  }

  let response: ControlledResponse | null = null;
  let policyState: RobotsPolicyRow["policy_state"] = "unreachable";
  let rules: RobotsRule[] = [{ directive: "disallow", pattern: "/" }];
  let crawlDelayMs = 0;
  let bodyHash: string | null = null;
  let cacheMs = ROBOTS_FAILURE_CACHE_MS;
  try {
    response = await fetchControlled(`https://${input.host}/robots.txt`, {
      acceptedContentTypes: ROBOTS_CONTENT_TYPES,
      allowedHosts: input.source.documentHosts,
      etag: existing?.etag,
      fetchImpl: input.fetchImpl,
      lastModified: existing?.last_modified,
      maximumBytes: MAX_ROBOTS_BYTES,
    });
    if (response.status === 200) {
      const body = new TextDecoder("utf-8", { fatal: true }).decode(response.bytes);
      bodyHash = await sha256Hex(response.bytes);
      const parsed = parseRobotsTxt(body, CIVIC_CRAWLER_PRODUCT_TOKEN);
      rules = parsed.rules;
      crawlDelayMs = parsed.crawlDelayMs;
      policyState = "rules";
      cacheMs = ROBOTS_CACHE_MS;
    } else if (response.status === 304 && existing) {
      rules = JSON.parse(existing.rules_json) as RobotsRule[];
      crawlDelayMs = existing.crawl_delay_ms;
      bodyHash = existing.body_hash;
      policyState = existing.policy_state;
      cacheMs = ROBOTS_CACHE_MS;
    } else if (
      response.status >= 400 &&
      response.status < 500 &&
      ![401, 403, 429].includes(response.status)
    ) {
      rules = [];
      policyState = "allow-default";
      cacheMs = ROBOTS_CACHE_MS;
    }
  } catch {
    policyState = "unreachable";
  } finally {
    await extendAndReleaseHostLease(
      input.db,
      slot.lease,
      input.now.getTime() + Math.max(input.source.minimumRequestIntervalMs, crawlDelayMs),
    );
  }

  const policy = await storeRobotsPolicy(input.db, {
    actor: input.actor,
    bodyHash,
    crawlDelayMs,
    etag: response?.etag ?? existing?.etag ?? null,
    exactHost: input.host,
    expiresAt: plusMilliseconds(input.now, cacheMs),
    fetchedAt: input.now.toISOString(),
    httpStatus: response?.status ?? null,
    lastModified: response?.lastModified ?? existing?.last_modified ?? null,
    policyState,
    rules,
  });
  return { kind: "policy", policy };
}

function nextDocumentCheck(now: Date, source: MonitoredSource) {
  return plusMinutes(now, Math.max(60, source.pollIntervalMinutes));
}

async function beginAcquisitionRun(
  db: D1Database,
  actor: AcquisitionActor,
  invocationId: string,
  sourceId: string,
  itemId: string,
  now: string,
) {
  const runId = randomId("document-run");
  await db
    .prepare(
      `INSERT INTO ingestion_runs (
         id, source_id, trigger, idempotency_key, actor_type, actor_id,
         parser_version, status, started_at
       ) VALUES (?, ?, 'scheduler', ?, ?, ?, ?, 'running', ?)`,
    )
    .bind(
      runId,
      sourceId,
      `${invocationId}:${itemId}`,
      actor.type,
      actor.id,
      READABLE_HTML_EXTRACTOR_VERSION,
      now,
    )
    .run();
  return runId;
}

async function finishAcquisitionRun(
  db: D1Database,
  input: {
    auditHeadHash?: string | null;
    error?: string | null;
    httpStatus?: number | null;
    runId: string;
    status: "failed" | "no_change" | "succeeded";
  },
) {
  await db
    .prepare(
      `UPDATE ingestion_runs SET
          status = ?, finished_at = CURRENT_TIMESTAMP, processed_item_count = 1,
          changed_item_count = CASE WHEN ? = 'succeeded' THEN 1 ELSE 0 END,
          unchanged_item_count = CASE WHEN ? = 'no_change' THEN 1 ELSE 0 END,
          error_count = CASE WHEN ? = 'failed' THEN 1 ELSE 0 END,
          error_summary = ?, http_status = ?, audit_head_hash = ?
        WHERE id = ?`,
    )
    .bind(
      input.status,
      input.status,
      input.status,
      input.status,
      input.error ?? null,
      input.httpStatus ?? null,
      input.auditHeadHash ?? null,
      input.runId,
    )
    .run();
}

async function storePrivateObject(
  bucket: R2Bucket,
  key: string,
  bytes: Uint8Array | string,
  contentType: string,
  metadata: Record<string, string>,
) {
  if (!(await bucket.head(key))) {
    await bucket.put(key, bytes, {
      customMetadata: metadata,
      httpMetadata: { contentType },
    });
  }
}

export function documentRetentionOutcome(
  _policy: Pick<DocumentSourcePolicy, "rightsState" | "storeFullContent">,
): "metadata-only" | "stored-private" {
  void _policy;
  // Article bodies remain transient for the automatic-analysis launch.  A D1
  // policy check can stop a stale capture from being recorded, but it cannot
  // retract a body already written to R2 if rights change mid-request.  Enable
  // durable body retention only with a two-phase blob/takedown lifecycle.
  return "metadata-only" as const;
}

async function captureDocument(input: {
  actor: AcquisitionActor;
  bindings: EvidenceBindings;
  document: DueDocument;
  leaseToken: string;
  policy: RobotsPolicyRow;
  response: ControlledResponse;
  runId: string;
  source: MonitoredSource;
  sourcePolicy: DocumentSourcePolicy;
}) {
  const db = input.bindings.DB;
  const observedAt = new Date().toISOString();
  const rawContentHash = await sha256Hex(input.response.bytes);
  const snapshotId = await deterministicId(
    "snapshot",
    input.runId,
    input.document.canonical_url,
    rawContentHash,
  );
  const html = new TextDecoder("utf-8", { fatal: true }).decode(input.response.bytes);
  const extracted = await extractReadableHtml(html);
  const unsupportedReason = extracted.text.length < MIN_READABLE_TEXT_LENGTH
    ? "The page did not contain enough readable text."
    : null;
  const documentCaptureId = await deterministicId(
    "document-capture",
    input.document.latest_version_id,
    snapshotId,
    READABLE_HTML_EXTRACTOR_VERSION,
    extracted.extractorConfigHash,
  );
  const blocks = extracted.blocks.map((block) => ({
    ...block,
    id: `${documentCaptureId}:${block.index}`,
  }));
  const readableDocument: ReadableDocumentV1 = {
    blocks,
    documentCaptureId,
    extractor: {
      configHash: extracted.extractorConfigHash,
      id: READABLE_HTML_EXTRACTOR_VERSION,
    },
    metadata: {
      byline: extracted.metadata.byline,
      language: extracted.language,
      publishedAt: extracted.metadata.publishedAt,
      title: extracted.metadata.title,
    },
    observedAt,
    offsetUnits: { raw: "utf8-byte", text: "utf16-code-unit" },
    rawContentHash,
    requestedUrl: input.document.canonical_url,
    resolvedUrl: input.response.resolvedUrl,
    schema: "peoples-isle.readable-document.v1",
    snapshotId,
    sourceId: input.source.id,
    sourceItemId: input.document.source_item_id,
    sourceItemVersionId: input.document.latest_version_id,
    text: extracted.text,
    textHash: extracted.textHash,
  };
  const shortExtract = extracted.text.slice(0, MAX_SHORT_EXTRACT_LENGTH).trimEnd();
  const lastExtractBlock = blocks.findLast((block) => block.textStart < shortExtract.length);
  const manifest = stableJson({
    accessBarrier: extracted.accessBarrier,
    blockCount: blocks.length,
    blocks: blocks.map(({ hash, id, index, kind, rawByteEnd, rawByteStart, textEnd, textStart }) => ({
      hash,
      id,
      index,
      kind,
      rawByteEnd,
      rawByteStart,
      textEnd,
      textStart,
    })),
    extractor: readableDocument.extractor,
    metadata: readableDocument.metadata,
    offsetUnits: readableDocument.offsetUnits,
    readableTextHash: readableDocument.textHash,
    readableTextLength: readableDocument.text.length,
    schema: "peoples-isle.readable-document-manifest.v1",
    shortExtract: {
      end: shortExtract.length,
      hash: await sha256Hex(shortExtract),
      rawByteEnd: lastExtractBlock?.rawByteEnd ?? 0,
      rawByteStart: blocks[0]?.rawByteStart ?? 0,
      start: 0,
      text: shortExtract,
    },
  });
  const manifestHash = await sha256Hex(manifest);
  const retention = documentRetentionOutcome(input.sourcePolicy);
  const rawStorageKey = retention === "stored-private"
    ? `snapshots/v1/sha256/${rawContentHash.slice(0, 2)}/${rawContentHash}`
    : null;
  const documentJson = stableJson(readableDocument);
  const documentHash = await sha256Hex(documentJson);
  const readableTextStorageKey = retention === "stored-private"
    ? `documents/v1/sha256/${documentHash.slice(0, 2)}/${documentHash}.json`
    : null;
  if (retention === "stored-private" && rawStorageKey && readableTextStorageKey) {
    await storePrivateObject(
      input.bindings.SNAPSHOTS,
      rawStorageKey,
      input.response.bytes,
      input.response.contentType ?? "text/html",
      { contentSha256: rawContentHash, sourceId: input.source.id },
    );
    await storePrivateObject(
      input.bindings.SNAPSHOTS,
      readableTextStorageKey,
      documentJson,
      "application/json",
      { contentSha256: documentHash, sourceId: input.source.id },
    );
  }

  const previousSnapshot = input.document.current_snapshot_id
    ? await db
        .prepare("SELECT id, chain_hash FROM source_snapshots WHERE id = ?")
        .bind(input.document.current_snapshot_id)
        .first<{ chain_hash: string; id: string }>()
    : null;
  const chainHash = await sha256Hex(stableJson({
    capturedAt: observedAt,
    captureUrl: input.document.canonical_url,
    contentHash: rawContentHash,
    itemId: input.document.source_item_id,
    previousChainHash: previousSnapshot?.chain_hash ?? null,
    sourceId: input.source.id,
  }));
  const responseMetadata = stableJson({
    etag: input.response.etag,
    lastModified: input.response.lastModified,
    resolvedUrl: input.response.resolvedUrl,
    retention,
    robotsPolicyId: input.policy.id,
    status: input.response.status,
  });
  const crawlState = extracted.accessBarrier
    ? "access-blocked"
    : unsupportedReason
      ? "unsupported"
      : "ready";
  const audit = await appendAuditEventWithStatements(
    db,
    {
      action: "source-document.captured",
      actorId: input.actor.id,
      actorType: input.actor.type,
      entityId: input.document.source_item_id,
      entityType: "source-item",
      payload: {
        accessBarrier: extracted.accessBarrier,
        documentCaptureId,
        manifestHash,
        rawContentHash,
        retentionOutcome: retention,
        robotsPolicyId: input.policy.id,
        snapshotId,
        sourceId: input.source.id,
        sourceItemVersionId: input.document.latest_version_id,
        textHash: extracted.textHash,
      },
    },
    () => [
      db
        .prepare(
          `INSERT INTO source_snapshots (
             id, source_id, item_id, ingestion_run_id, capture_url, resolved_url,
             captured_at, http_status, content_type, byte_length, content_hash,
             storage_key, retention_outcome, etag, last_modified, response_metadata,
             previous_snapshot_id, chain_hash, capture_method
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'article-html-v1')`,
        )
        .bind(
          snapshotId,
          input.source.id,
          input.document.source_item_id,
          input.runId,
          input.document.canonical_url,
          input.response.resolvedUrl,
          observedAt,
          input.response.status,
          input.response.contentType,
          input.response.bytes.byteLength,
          rawContentHash,
          rawStorageKey,
          retention,
          input.response.etag,
          input.response.lastModified,
          responseMetadata,
          previousSnapshot?.id ?? null,
          chainHash,
        ),
    ],
    (event) => [
      db
        .prepare(
          `INSERT INTO source_document_captures (
             id, source_item_id, source_item_version_id, ingestion_run_id, snapshot_id,
             robots_policy_id, observed_at, rights_state, retention_outcome,
             extractor_version, extractor_config_hash, extraction_manifest_json,
             extraction_manifest_hash, readable_text_hash, readable_text_length,
             readable_text_storage_key, short_extract, short_extract_start_offset,
             short_extract_end_offset, created_by_audit_event_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(
          documentCaptureId,
          input.document.source_item_id,
          input.document.latest_version_id,
          input.runId,
          snapshotId,
          input.policy.id,
          observedAt,
          input.sourcePolicy.rightsState,
          retention,
          READABLE_HTML_EXTRACTOR_VERSION,
          extracted.extractorConfigHash,
          manifest,
          manifestHash,
          extracted.textHash,
          extracted.text.length,
          readableTextStorageKey,
          shortExtract,
          shortExtract.length,
          event.id,
        ),
      db
        .prepare(
          `UPDATE source_document_heads SET
             current_capture_id = ?, crawl_state = ?, next_check_at = ?,
             lease_token = NULL, lease_expires_at = NULL, consecutive_failures = 0,
             last_success_at = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE source_item_id = ? AND lease_token = ?`,
        )
        .bind(
          documentCaptureId,
          crawlState,
          nextDocumentCheck(new Date(observedAt), input.source),
          observedAt,
          input.document.source_item_id,
          input.leaseToken,
        ),
      db
        .prepare(
          `UPDATE ingestion_runs SET
             status = 'succeeded', finished_at = ?, processed_item_count = 1,
             changed_item_count = 1, http_status = ?, audit_head_hash = ?
           WHERE id = ?`,
        )
        .bind(observedAt, input.response.status, event.eventHash, input.runId),
    ],
  );
  return {
    accessBarrier: extracted.accessBarrier,
    auditHeadHash: audit.eventHash,
    captureId: documentCaptureId,
    kind: "captured" as const,
    readableDocument,
    unsupportedReason,
  };
}

async function acquireOneDocument(input: {
  actor: AcquisitionActor;
  analyze?: DocumentAnalysisCallback;
  bindings: EvidenceBindings;
  document: DueDocument;
  fetchImpl?: typeof fetch;
  invocationId: string;
  now: Date;
}) {
  const db = input.bindings.DB;
  const source = sourceForId(input.document.source_id);
  if (!source || !isEligibleDocumentUrl(source, input.document.canonical_url)) {
    return null;
  }
  const claimedSourcePolicy = await readDocumentSourcePolicy(db, source.id);
  if (!claimedSourcePolicy) return null;
  const leaseToken = await claimDocument(db, input.document.source_item_id, input.now);
  if (!leaseToken) return null;
  let runId: string | null = null;
  try {
    runId = await beginAcquisitionRun(
      db,
      input.actor,
      input.invocationId,
      source.id,
      input.document.source_item_id,
      input.now.toISOString(),
    );
    const url = validateExactSourceUrl(input.document.canonical_url, source.documentHosts);
    const robots = await getRobotsPolicy({
      actor: input.actor,
      db,
      fetchImpl: input.fetchImpl,
      host: url.hostname.toLowerCase().replace(/\.$/, ""),
      now: input.now,
      source,
    });
    if (robots.kind === "deferred") {
      await updateDocumentHead(db, {
        itemId: input.document.source_item_id,
        leaseToken,
        nextCheckAt: robots.nextRequestAt,
        state: "deferred",
      });
      await finishAcquisitionRun(db, { runId, status: "no_change" });
      return {
        analysis: "not-requested",
        captureId: null,
        error: null,
        outcome: "deferred",
        sourceId: source.id,
        sourceItemId: input.document.source_item_id,
      } satisfies DocumentAcquisitionItemResult;
    }
    const rules = JSON.parse(robots.policy.rules_json) as RobotsRule[];
    if (robots.policy.policy_state === "unreachable" || !robotsAllowsUrl(rules, url.toString())) {
      await updateDocumentHead(db, {
        itemId: input.document.source_item_id,
        leaseToken,
        nextCheckAt: robots.policy.expires_at,
        state: "robots-blocked",
      });
      await finishAcquisitionRun(db, { runId, status: "no_change" });
      return {
        analysis: "not-requested",
        captureId: null,
        error: null,
        outcome: "robots-blocked",
        sourceId: source.id,
        sourceItemId: input.document.source_item_id,
      } satisfies DocumentAcquisitionItemResult;
    }

    const preFetchSourcePolicy = await readDocumentSourcePolicy(db, source.id);
    if (!sameDocumentSourcePolicy(claimedSourcePolicy, preFetchSourcePolicy)) {
      await updateDocumentHead(db, {
        itemId: input.document.source_item_id,
        leaseToken,
        nextCheckAt: plusMinutes(new Date(), 15),
        state: "deferred",
      });
      await finishAcquisitionRun(db, { runId, status: "no_change" });
      return {
        analysis: "skipped-stale",
        captureId: null,
        error: "The persisted source policy changed before capture.",
        outcome: "deferred",
        sourceId: source.id,
        sourceItemId: input.document.source_item_id,
      } satisfies DocumentAcquisitionItemResult;
    }

    const hostSlot = await tryAcquireHostLease(
      db,
      canonicalRateLimitHost(url.hostname),
      Math.max(source.minimumRequestIntervalMs, robots.policy.crawl_delay_ms),
      new Date(),
    );
    if (!hostSlot.lease) {
      const nextCheckAt = new Date(hostSlot.nextRequestAtMs ?? Date.now() + 60_000).toISOString();
      await updateDocumentHead(db, {
        itemId: input.document.source_item_id,
        leaseToken,
        nextCheckAt,
        state: "deferred",
      });
      await finishAcquisitionRun(db, { runId, status: "no_change" });
      return {
        analysis: "not-requested",
        captureId: null,
        error: null,
        outcome: "deferred",
        sourceId: source.id,
        sourceItemId: input.document.source_item_id,
      } satisfies DocumentAcquisitionItemResult;
    }

    let response: ControlledResponse;
    const canRevalidateCurrentCapture = Boolean(
      input.document.current_capture_id &&
      input.document.current_capture_version_id === input.document.latest_version_id,
    );
    try {
      response = await fetchControlled(url.toString(), {
        acceptedContentTypes: ARTICLE_CONTENT_TYPES,
        allowedHosts: source.documentHosts,
        etag: canRevalidateCurrentCapture ? input.document.current_snapshot_etag : null,
        fetchImpl: input.fetchImpl,
        lastModified: canRevalidateCurrentCapture
          ? input.document.current_snapshot_last_modified
          : null,
        maximumBytes: MAX_ARTICLE_BYTES,
      });
    } finally {
      await extendAndReleaseHostLease(
        db,
        hostSlot.lease,
        Date.now() + Math.max(source.minimumRequestIntervalMs, robots.policy.crawl_delay_ms),
      );
    }

    if (response.status === 304) {
      if (!canRevalidateCurrentCapture) {
        throw new Error("The article returned HTTP 304 without a current-version validator.");
      }
      await updateDocumentHead(db, {
        itemId: input.document.source_item_id,
        leaseToken,
        nextCheckAt: nextDocumentCheck(new Date(), source),
        state: "unchanged",
        success: true,
      });
      await finishAcquisitionRun(db, { httpStatus: 304, runId, status: "no_change" });
      return {
        analysis: "not-requested",
        captureId: input.document.current_capture_id,
        error: null,
        outcome: "unchanged",
        sourceId: source.id,
        sourceItemId: input.document.source_item_id,
      } satisfies DocumentAcquisitionItemResult;
    }
    if ([401, 403].includes(response.status)) {
      await updateDocumentHead(db, {
        itemId: input.document.source_item_id,
        leaseToken,
        nextCheckAt: plusMilliseconds(new Date(), ROBOTS_CACHE_MS),
        state: "access-blocked",
      });
      await finishAcquisitionRun(db, { httpStatus: response.status, runId, status: "no_change" });
      return {
        analysis: "not-requested",
        captureId: null,
        error: null,
        outcome: "access-blocked",
        sourceId: source.id,
        sourceItemId: input.document.source_item_id,
      } satisfies DocumentAcquisitionItemResult;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`The article returned HTTP ${response.status}.`);
    }

    const latest = await db
      .prepare("SELECT latest_version_id FROM source_items WHERE id = ?")
      .bind(input.document.source_item_id)
      .first<{ latest_version_id: string | null }>();
    if (latest?.latest_version_id !== input.document.latest_version_id) {
      await updateDocumentHead(db, {
        itemId: input.document.source_item_id,
        leaseToken,
        nextCheckAt: new Date().toISOString(),
        state: "deferred",
      });
      await finishAcquisitionRun(db, { runId, status: "no_change" });
      return {
        analysis: "skipped-stale",
        captureId: null,
        error: null,
        outcome: "deferred",
        sourceId: source.id,
        sourceItemId: input.document.source_item_id,
      } satisfies DocumentAcquisitionItemResult;
    }
    const captureSourcePolicy = await readDocumentSourcePolicy(db, source.id);
    if (!sameDocumentSourcePolicy(claimedSourcePolicy, captureSourcePolicy)) {
      await updateDocumentHead(db, {
        itemId: input.document.source_item_id,
        leaseToken,
        nextCheckAt: plusMinutes(new Date(), 15),
        state: "deferred",
      });
      await finishAcquisitionRun(db, { runId, status: "no_change" });
      return {
        analysis: "skipped-stale",
        captureId: null,
        error: "The persisted source policy changed during capture.",
        outcome: "deferred",
        sourceId: source.id,
        sourceItemId: input.document.source_item_id,
      } satisfies DocumentAcquisitionItemResult;
    }

    const capture = await captureDocument({
      actor: input.actor,
      bindings: input.bindings,
      document: input.document,
      leaseToken,
      policy: robots.policy,
      response,
      runId,
      source,
      sourcePolicy: captureSourcePolicy!,
    });
    let analysis: DocumentAcquisitionItemResult["analysis"] = "not-requested";
    let analysisError: string | null = null;
    if (!capture.accessBarrier && !capture.unsupportedReason && input.analyze) {
      const current = await db
        .prepare(
          `SELECT 1 AS current
             FROM source_document_heads head
             JOIN source_items item ON item.id = head.source_item_id
            WHERE head.source_item_id = ? AND head.current_capture_id = ?
              AND item.latest_version_id = ?`,
        )
        .bind(
          input.document.source_item_id,
          capture.captureId,
          input.document.latest_version_id,
        )
        .first<{ current: number }>();
      if (!current) {
        analysis = "skipped-stale";
      } else {
        try {
          await input.analyze(db, capture.readableDocument, { actor: input.actor });
          analysis = "completed";
        } catch (error) {
          analysis = "failed";
          analysisError = boundedError(error);
        }
      }
    }
    return {
      analysis,
      captureId: capture.captureId,
      error: analysisError ?? capture.unsupportedReason,
      outcome: capture.accessBarrier
        ? "access-blocked"
        : capture.unsupportedReason
          ? "unsupported"
          : "captured",
      sourceId: source.id,
      sourceItemId: input.document.source_item_id,
    } satisfies DocumentAcquisitionItemResult;
  } catch (error) {
    const message = boundedError(error);
    await updateDocumentHead(db, {
      error: message,
      itemId: input.document.source_item_id,
      leaseToken,
      nextCheckAt: plusMinutes(new Date(), 60),
      state: "failed",
    }).catch(() => undefined);
    if (runId) {
      await finishAcquisitionRun(db, { error: message, runId, status: "failed" }).catch(
        () => undefined,
      );
    }
    return {
      analysis: "not-requested",
      captureId: null,
      error: message,
      outcome: "failed",
      sourceId: source.id,
      sourceItemId: input.document.source_item_id,
    } satisfies DocumentAcquisitionItemResult;
  }
}

export async function runDueDocumentAcquisition(
  bindings: EvidenceBindings,
  options: {
    actor: AcquisitionActor;
    analyze?: DocumentAnalysisCallback;
    fetchImpl?: typeof fetch;
    limit?: number;
  },
): Promise<DocumentAcquisitionSummary> {
  const invocationId = randomId("document-acquisition");
  const limit = Math.max(1, Math.min(MAX_DOCUMENTS_PER_INVOCATION, options.limit ?? 2));
  await seedEvidenceReferenceData(bindings.DB);
  await ensureDocumentCaptureTriggers(bindings.DB);
  await seedDocumentHeads(bindings.DB);
  const now = new Date();
  const due = await dueDocuments(bindings.DB, now.toISOString());
  const eligible = due.results.filter((row) => {
    const source = sourceForId(row.source_id);
    return source ? isEligibleDocumentUrl(source, row.canonical_url) : false;
  });
  const selected = fairDueDocuments(eligible, limit);
  const results: DocumentAcquisitionItemResult[] = [];
  for (const document of selected) {
    const result = await acquireOneDocument({
      actor: options.actor,
      analyze: options.analyze,
      bindings,
      document,
      fetchImpl: options.fetchImpl,
      invocationId,
      now: new Date(),
    });
    if (result) results.push(result);
  }
  return { attempted: results.length, invocationId, results };
}
