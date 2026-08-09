import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const organisations = sqliteTable(
  "organisations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    canonicalUrl: text("canonical_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("idx_organisations_name").on(table.name)],
);

export const people = sqliteTable(
  "people",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    sortName: text("sort_name").notNull(),
    profileState: text("profile_state").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_people_sort_name").on(table.sortName),
    check("people_profile_state_check", sql`${table.profileState} IN ('draft', 'reviewed', 'published', 'archived')`),
  ],
);

export const elections = sqliteTable("elections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  electionDate: text("election_date"),
  jurisdiction: text("jurisdiction").notNull().default("Isle of Man"),
  status: text("status").notNull().default("upcoming"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const constituencies = sqliteTable(
  "constituencies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    seats: integer("seats").notNull().default(2),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("idx_constituencies_name").on(table.name)],
);

export const candidacies = sqliteTable(
  "candidacies",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    constituencyId: text("constituency_id")
      .notNull()
      .references(() => constituencies.id),
    affiliation: text("affiliation").notNull().default("Independent"),
    declarationStatus: text("declaration_status").notNull().default("prospective"),
    verificationState: text("verification_state").notNull().default("unverified"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_candidacies_election_person").on(table.electionId, table.personId),
    index("idx_candidacies_constituency").on(table.electionId, table.constituencyId),
  ],
);

export const policyTopics = sqliteTable(
  "policy_topics",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("idx_policy_topics_name").on(table.name)],
);

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    publisher: text("publisher").notNull(),
    organisationId: text("organisation_id").references(() => organisations.id),
    homepageUrl: text("homepage_url").notNull(),
    feedUrl: text("feed_url").notNull(),
    feedType: text("feed_type").notNull(),
    sourceTier: integer("source_tier").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    snapshotPolicy: text("snapshot_policy").notNull().default("private-audit"),
    rightsState: text("rights_state").notNull().default("unknown"),
    storeFullContent: integer("store_full_content", { mode: "boolean" }).notNull().default(false),
    pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(60),
    parserVersion: text("parser_version").notNull().default("feed-v1"),
    nextCheckAt: text("next_check_at"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: text("lease_expires_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastNewItemAt: text("last_new_item_at"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastAttemptAt: text("last_attempt_at"),
    lastSuccessAt: text("last_success_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_sources_feed_url").on(table.feedUrl),
    index("idx_sources_active_next_poll").on(table.active, table.nextCheckAt),
    check("sources_tier_check", sql`${table.sourceTier} BETWEEN 1 AND 5`),
  ],
);

export const ingestionRuns = sqliteTable(
  "ingestion_runs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    trigger: text("trigger").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    parserVersion: text("parser_version").notNull(),
    status: text("status").notNull().default("running"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    discoveredCount: integer("discovered_count").notNull().default(0),
    processedItemCount: integer("processed_item_count").notNull().default(0),
    deferredItemCount: integer("deferred_item_count").notNull().default(0),
    newItemCount: integer("new_item_count").notNull().default(0),
    changedItemCount: integer("changed_item_count").notNull().default(0),
    unchangedItemCount: integer("unchanged_item_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errorSummary: text("error_summary"),
    httpStatus: integer("http_status"),
    feedSnapshotId: text("feed_snapshot_id"),
    auditHeadHash: text("audit_head_hash"),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_ingestion_runs_source_started").on(table.sourceId, table.startedAt),
    index("idx_ingestion_runs_status").on(table.status),
    uniqueIndex("idx_ingestion_runs_idempotency").on(table.idempotencyKey),
  ],
);

export const sourceItems = sqliteTable(
  "source_items",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    externalId: text("external_id"),
    canonicalUrl: text("canonical_url").notNull(),
    canonicalUrlHash: text("canonical_url_hash").notNull(),
    itemType: text("item_type").notNull().default("news"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    author: text("author"),
    publishedAt: text("published_at"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    latestSnapshotId: text("latest_snapshot_id"),
    latestVersionId: text("latest_version_id"),
    contentHash: text("content_hash"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    publicationState: text("publication_state").notNull().default("private"),
    sourceTier: integer("source_tier").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_source_items_source_url").on(table.sourceId, table.canonicalUrl),
    index("idx_source_items_canonical_hash").on(table.canonicalUrlHash),
    uniqueIndex("idx_source_items_source_external").on(table.sourceId, table.externalId),
    index("idx_source_items_published").on(table.publishedAt),
    index("idx_source_items_review_queue").on(table.reviewState, table.firstSeenAt),
    index("idx_source_items_publication").on(table.publicationState, table.publishedAt),
  ],
);

export const sourceSnapshots = sqliteTable(
  "source_snapshots",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    itemId: text("item_id").references(() => sourceItems.id),
    ingestionRunId: text("ingestion_run_id")
      .notNull()
      .references(() => ingestionRuns.id),
    captureUrl: text("capture_url").notNull(),
    resolvedUrl: text("resolved_url").notNull(),
    capturedAt: text("captured_at").notNull(),
    httpStatus: integer("http_status").notNull(),
    contentType: text("content_type").notNull(),
    byteLength: integer("byte_length").notNull(),
    contentHash: text("content_hash").notNull(),
    storageKey: text("storage_key"),
    retentionOutcome: text("retention_outcome").notNull().default("stored-private"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    responseMetadata: text("response_metadata").notNull().default("{}"),
    previousSnapshotId: text("previous_snapshot_id"),
    chainHash: text("chain_hash").notNull(),
    captureMethod: text("capture_method").notNull().default("http-fetch-v1"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("idx_source_snapshots_run_capture_hash").on(
      table.ingestionRunId,
      table.captureUrl,
      table.contentHash,
    ),
    index("idx_source_snapshots_item_captured").on(table.itemId, table.capturedAt),
    index("idx_source_snapshots_content_hash").on(table.contentHash),
  ],
);

export const sourceItemVersions = sqliteTable(
  "source_item_versions",
  {
    id: text("id").primaryKey(),
    sourceItemId: text("source_item_id")
      .notNull()
      .references(() => sourceItems.id),
    ingestionRunId: text("ingestion_run_id")
      .notNull()
      .references(() => ingestionRuns.id),
    snapshotId: text("snapshot_id").references(() => sourceSnapshots.id),
    observedAt: text("observed_at").notNull(),
    payload: text("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    parserVersion: text("parser_version").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("idx_source_item_versions_item_payload").on(table.sourceItemId, table.payloadHash),
    index("idx_source_item_versions_item_observed").on(table.sourceItemId, table.observedAt),
  ],
);

export const sourceItemHeads = sqliteTable("source_item_heads", {
  sourceItemId: text("source_item_id")
    .primaryKey()
    .references(() => sourceItems.id, { onDelete: "cascade" }),
  latestSnapshotId: text("latest_snapshot_id")
    .notNull()
    .references(() => sourceSnapshots.id),
  updatedAt: updatedAt(),
});

export const ingestionRunItems = sqliteTable(
  "ingestion_run_items",
  {
    id: text("id").primaryKey(),
    ingestionRunId: text("ingestion_run_id")
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: "cascade" }),
    sourceItemId: text("source_item_id")
      .notNull()
      .references(() => sourceItems.id),
    snapshotId: text("snapshot_id").references(() => sourceSnapshots.id),
    sourceItemVersionId: text("source_item_version_id").references(() => sourceItemVersions.id),
    outcome: text("outcome").notNull(),
    observedUrlHash: text("observed_url_hash").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("idx_ingestion_run_items_run_item").on(table.ingestionRunId, table.sourceItemId),
    index("idx_ingestion_run_items_outcome").on(table.ingestionRunId, table.outcome),
    index("idx_ingestion_run_items_item").on(table.sourceItemId, table.ingestionRunId),
  ],
);

export const itemEntities = sqliteTable(
  "item_entities",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    mentionText: text("mention_text").notNull(),
    matchMethod: text("match_method").notNull(),
    confidence: real("confidence").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.entityType, table.entityId] }),
    index("idx_item_entities_entity").on(table.entityType, table.entityId),
  ],
);

export const claims = sqliteTable(
  "claims",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    topicId: text("topic_id").references(() => policyTopics.id),
    claimScope: text("claim_scope").notNull(),
    claimType: text("claim_type").notNull(),
    claimText: text("claim_text").notNull(),
    extractionMethod: text("extraction_method").notNull(),
    extractionModel: text("extraction_model"),
    confidence: real("confidence").notNull(),
    reviewState: text("review_state").notNull().default("unreviewed"),
    publicationState: text("publication_state").notNull().default("private"),
    disputedState: text("disputed_state").notNull().default("undisputed"),
    version: integer("version").notNull().default(1),
    supersedesClaimId: text("supersedes_claim_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_claims_subject_topic").on(table.subjectType, table.subjectId, table.topicId),
    index("idx_claims_review_queue").on(table.reviewState, table.createdAt),
    index("idx_claims_publication").on(table.publicationState, table.subjectId),
  ],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => sourceItems.id),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id),
    relationship: text("relationship").notNull().default("supports"),
    excerpt: text("excerpt").notNull(),
    locator: text("locator").notNull(),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    startSeconds: real("start_seconds"),
    endSeconds: real("end_seconds"),
    excerptHash: text("excerpt_hash").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_evidence_claim").on(table.claimId),
    index("idx_evidence_snapshot").on(table.snapshotId),
  ],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    decision: text("decision").notNull(),
    rationale: text("rationale").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("idx_reviews_target_created").on(table.targetType, table.targetId, table.createdAt)],
);

export const disputes = sqliteTable(
  "disputes",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    submittedBy: text("submitted_by").notNull(),
    reason: text("reason").notNull(),
    evidenceUrl: text("evidence_url"),
    status: text("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by"),
    resolvedAt: text("resolved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("idx_disputes_status_created").on(table.status, table.createdAt)],
);

export const revisions = sqliteTable(
  "revisions",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    payload: text("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("idx_revisions_entity_number").on(
      table.entityType,
      table.entityId,
      table.revisionNumber,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    sequence: integer("sequence").primaryKey(),
    id: text("id").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    payload: text("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    previousEventHash: text("previous_event_hash").notNull(),
    eventHash: text("event_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_audit_events_id").on(table.id),
    uniqueIndex("idx_audit_events_hash").on(table.eventHash),
    uniqueIndex("idx_audit_events_previous_hash").on(table.previousEventHash),
    index("idx_audit_events_entity").on(table.entityType, table.entityId, table.sequence),
  ],
);

export const auditChainHead = sqliteTable("audit_chain_head", {
  chainId: integer("chain_id").primaryKey(),
  nextSequence: integer("next_sequence").notNull(),
  lastEventHash: text("last_event_hash").notNull(),
  updatedAt: updatedAt(),
});

export const integrityAnchors = sqliteTable(
  "integrity_anchors",
  {
    id: text("id").primaryKey(),
    chainHeadHash: text("chain_head_hash").notNull(),
    chainLength: integer("chain_length").notNull(),
    network: text("network").notNull().default("sui:testnet"),
    transactionDigest: text("transaction_digest"),
    objectId: text("object_id"),
    status: text("status").notNull().default("pending"),
    anchoredAt: text("anchored_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("idx_integrity_anchors_chain_head").on(table.chainHeadHash)],
);
