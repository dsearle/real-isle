import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
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

export const ingestionHostRateLimits = sqliteTable(
  "ingestion_host_rate_limits",
  {
    host: text("host").primaryKey(),
    minimumIntervalMs: integer("minimum_interval_ms").notNull().default(0),
    nextRequestAtMs: integer("next_request_at_ms").notNull().default(0),
    lastRequestStartedAtMs: integer("last_request_started_at_ms"),
    leaseToken: text("lease_token"),
    leaseExpiresAtMs: integer("lease_expires_at_ms"),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "ingestion_host_rate_limits_interval_check",
      sql`${table.minimumIntervalMs} >= 0`,
    ),
    check(
      "ingestion_host_rate_limits_next_request_check",
      sql`${table.nextRequestAtMs} >= 0`,
    ),
    check(
      "ingestion_host_rate_limits_lease_pair_check",
      sql`(${table.leaseToken} IS NULL AND ${table.leaseExpiresAtMs} IS NULL) OR (${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAtMs} IS NOT NULL)`,
    ),
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
    index("idx_source_item_versions_item_payload").on(table.sourceItemId, table.payloadHash),
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

/**
 * Opaque, public-safe change token for the currently published projection.
 * Database triggers rotate the token in the same transaction as any source,
 * candidate-profile or candidate-analysis visibility change. The public API
 * deliberately exposes only `head`, never decision counts or timestamps.
 */
export const publicPublicationHead = sqliteTable(
  "public_publication_head",
  {
    singleton: integer("singleton").primaryKey().default(1),
    head: text("head")
      .notNull()
      .default(sql`(lower(hex(randomblob(16))))`),
  },
  (table) => [
    check("public_publication_head_singleton_check", sql`${table.singleton} = 1`),
    check(
      "public_publication_head_format_check",
      sql`length(${table.head}) = 32 AND ${table.head} NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
);

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

export const candidateProfileObservations = sqliteTable(
  "candidate_profile_observations",
  {
    id: text("id").primaryKey(),
    candidacyId: text("candidacy_id")
      .notNull()
      .references(() => candidacies.id),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    sourceItemId: text("source_item_id")
      .notNull()
      .references(() => sourceItems.id),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id),
    observationType: text("observation_type").notNull(),
    observedAt: text("observed_at").notNull(),
    payload: text("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    parserVersion: text("parser_version").notNull(),
    reviewState: text("review_state").notNull().default("unreviewed"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("idx_candidate_observations_snapshot_type").on(
      table.candidacyId,
      table.snapshotId,
      table.observationType,
    ),
    index("idx_candidate_observations_review").on(table.reviewState, table.observedAt),
    index("idx_candidate_observations_candidate").on(table.candidacyId, table.observedAt),
    check(
      "candidate_observations_type_check",
      sql`${table.observationType} IN ('directory', 'profile')`,
    ),
    check(
      "candidate_observations_review_check",
      sql`${table.reviewState} IN ('unreviewed', 'approved', 'rejected', 'superseded')`,
    ),
  ],
);

export const candidateProfiles = sqliteTable(
  "candidate_profiles",
  {
    candidacyId: text("candidacy_id")
      .primaryKey()
      .references(() => candidacies.id),
    slug: text("slug").notNull(),
    profileUrl: text("profile_url").notNull(),
    profileUrlHash: text("profile_url_hash").notNull(),
    observedConstituencyId: text("observed_constituency_id")
      .notNull()
      .references(() => constituencies.id),
    currentDirectoryObservationId: text("current_directory_observation_id")
      .notNull()
      .references(() => candidateProfileObservations.id),
    currentProfileObservationId: text("current_profile_observation_id").references(
      () => candidateProfileObservations.id,
    ),
    currentBasisHash: text("current_basis_hash"),
    completenessState: text("completeness_state").notNull().default("directory-only"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    publicationState: text("publication_state").notNull().default("private"),
    lastDirectorySeenAt: text("last_directory_seen_at").notNull(),
    lastProfileCheckedAt: text("last_profile_checked_at"),
    nextProfileCheckAt: text("next_profile_check_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_candidate_profiles_slug").on(table.slug),
    index("idx_candidate_profiles_due").on(table.nextProfileCheckAt, table.lastProfileCheckedAt),
    index("idx_candidate_profiles_review").on(table.reviewState, table.lastDirectorySeenAt),
    check(
      "candidate_profiles_completeness_check",
      sql`${table.completenessState} IN ('directory-only', 'profile-parsed', 'candidate-verified')`,
    ),
    check(
      "candidate_profiles_review_check",
      sql`${table.reviewState} IN ('unreviewed', 'approved', 'rejected', 'needs-update')`,
    ),
    check(
      "candidate_profiles_publication_check",
      sql`${table.publicationState} IN ('private', 'published', 'withheld')`,
    ),
    check(
      "candidate_profiles_publish_requires_review_check",
      sql`${table.publicationState} != 'published' OR ${table.reviewState} = 'approved'`,
    ),
  ],
);

export const candidateLinks = sqliteTable(
  "candidate_links",
  {
    id: text("id").primaryKey(),
    candidacyId: text("candidacy_id")
      .notNull()
      .references(() => candidacies.id),
    linkType: text("link_type").notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull(),
    sourceObservationId: text("source_observation_id")
      .notNull()
      .references(() => candidateProfileObservations.id),
    verificationState: text("verification_state").notNull().default("discovered"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    publicationState: text("publication_state").notNull().default("private"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_candidate_links_candidate_url").on(table.candidacyId, table.urlHash),
    index("idx_candidate_links_review").on(table.reviewState, table.linkType),
    check(
      "candidate_links_verification_check",
      sql`${table.verificationState} IN ('discovered', 'source-verified', 'candidate-verified', 'broken')`,
    ),
    check(
      "candidate_links_publish_requires_review_check",
      sql`${table.publicationState} != 'published' OR ${table.reviewState} = 'approved'`,
    ),
  ],
);

export const candidateMediaAssets = sqliteTable(
  "candidate_media_assets",
  {
    id: text("id").primaryKey(),
    candidacyId: text("candidacy_id")
      .notNull()
      .references(() => candidacies.id),
    mediaKind: text("media_kind").notNull(),
    variant: text("variant").notNull(),
    remoteUrl: text("remote_url").notNull(),
    remoteUrlHash: text("remote_url_hash").notNull(),
    sourcePageUrl: text("source_page_url").notNull(),
    sourceObservationId: text("source_observation_id")
      .notNull()
      .references(() => candidateProfileObservations.id),
    sourceSnapshotId: text("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id),
    contentSnapshotId: text("content_snapshot_id").references(() => sourceSnapshots.id),
    rightsState: text("rights_state").notNull().default("unknown"),
    reuseBasis: text("reuse_basis"),
    attribution: text("attribution"),
    contentType: text("content_type"),
    width: integer("width"),
    height: integer("height"),
    contentHash: text("content_hash"),
    storageKey: text("storage_key"),
    retentionOutcome: text("retention_outcome").notNull().default("metadata-only"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    publicationState: text("publication_state").notNull().default("private"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_candidate_media_candidate_url").on(table.candidacyId, table.remoteUrlHash),
    index("idx_candidate_media_rights_review").on(table.rightsState, table.reviewState),
    check(
      "candidate_media_rights_check",
      sql`${table.rightsState} IN ('unknown', 'link-only', 'candidate-permission', 'redistributable', 'takedown')`,
    ),
    check(
      "candidate_media_retention_check",
      sql`${table.retentionOutcome} IN ('metadata-only', 'stored-private', 'stored-publishable', 'removed')`,
    ),
    check(
      "candidate_media_publish_rights_check",
      sql`${table.publicationState} != 'published' OR (
        ${table.reviewState} = 'approved'
        AND ${table.contentSnapshotId} IS NOT NULL
        AND ${table.contentHash} IS NOT NULL
        AND ${table.storageKey} IS NOT NULL
        AND ${table.retentionOutcome} = 'stored-publishable'
        AND ${table.rightsState} IN ('candidate-permission', 'redistributable')
      )`,
    ),
  ],
);

export const candidateDocuments = sqliteTable(
  "candidate_documents",
  {
    id: text("id").primaryKey(),
    candidacyId: text("candidacy_id")
      .notNull()
      .references(() => candidacies.id),
    documentKind: text("document_kind").notNull(),
    title: text("title").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    canonicalUrlHash: text("canonical_url_hash").notNull(),
    sourceObservationId: text("source_observation_id")
      .notNull()
      .references(() => candidateProfileObservations.id),
    sourceSnapshotId: text("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id),
    contentSnapshotId: text("content_snapshot_id").references(() => sourceSnapshots.id),
    rightsState: text("rights_state").notNull().default("unknown"),
    reuseBasis: text("reuse_basis"),
    attribution: text("attribution"),
    contentHash: text("content_hash"),
    storageKey: text("storage_key"),
    retentionOutcome: text("retention_outcome").notNull().default("metadata-only"),
    processingState: text("processing_state").notNull().default("discovered"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    publicationState: text("publication_state").notNull().default("private"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_candidate_documents_candidate_url").on(
      table.candidacyId,
      table.canonicalUrlHash,
    ),
    index("idx_candidate_documents_processing").on(table.processingState, table.documentKind),
    check(
      "candidate_documents_kind_check",
      sql`${table.documentKind} IN ('manifesto', 'transcript', 'statement', 'other')`,
    ),
    check(
      "candidate_documents_rights_check",
      sql`${table.rightsState} IN ('unknown', 'link-only', 'candidate-permission', 'publisher-permission', 'redistributable', 'takedown')`,
    ),
    check(
      "candidate_documents_retention_check",
      sql`${table.retentionOutcome} IN ('metadata-only', 'stored-private', 'stored-publishable', 'removed')`,
    ),
    check(
      "candidate_documents_publish_requires_rights_check",
      sql`${table.publicationState} != 'published' OR (
        ${table.reviewState} = 'approved'
        AND ${table.contentSnapshotId} IS NOT NULL
        AND ${table.contentHash} IS NOT NULL
        AND ${table.storageKey} IS NOT NULL
        AND ${table.retentionOutcome} = 'stored-publishable'
        AND ${table.rightsState} IN ('candidate-permission', 'publisher-permission', 'redistributable')
      )`,
    ),
  ],
);

export const transcriptJobs = sqliteTable(
  "transcript_jobs",
  {
    id: text("id").primaryKey(),
    candidacyId: text("candidacy_id")
      .notNull()
      .references(() => candidacies.id),
    candidateDocumentId: text("candidate_document_id").references(() => candidateDocuments.id),
    candidateLinkId: text("candidate_link_id").references(() => candidateLinks.id),
    sourceObservationId: text("source_observation_id")
      .notNull()
      .references(() => candidateProfileObservations.id),
    sourceSnapshotId: text("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id),
    inputKind: text("input_kind").notNull(),
    platform: text("platform").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceUrlHash: text("source_url_hash").notNull(),
    externalMediaId: text("external_media_id"),
    language: text("language").notNull().default("en"),
    accessState: text("access_state").notNull().default("not-checked"),
    rightsState: text("rights_state").notNull().default("unknown"),
    retentionOutcome: text("retention_outcome").notNull().default("metadata-only"),
    processingState: text("processing_state").notNull().default("discovered"),
    priority: integer("priority").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: text("next_attempt_at"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: text("lease_expires_at"),
    lastError: text("last_error"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_transcript_jobs_candidate_source_kind").on(
      table.candidacyId,
      table.sourceUrlHash,
      table.inputKind,
    ),
    index("idx_transcript_jobs_due").on(table.processingState, table.nextAttemptAt, table.priority),
    index("idx_transcript_jobs_candidate").on(table.candidacyId, table.lastSeenAt),
    check(
      "transcript_jobs_single_input_check",
      sql`(${table.candidateDocumentId} IS NOT NULL AND ${table.candidateLinkId} IS NULL) OR (${table.candidateDocumentId} IS NULL AND ${table.candidateLinkId} IS NOT NULL)`,
    ),
    check(
      "transcript_jobs_input_kind_check",
      sql`${table.inputKind} IN ('publisher-transcript', 'youtube-caption', 'media-transcription', 'manual-upload')`,
    ),
    check(
      "transcript_jobs_rights_check",
      sql`${table.rightsState} IN ('unknown', 'link-only', 'candidate-permission', 'publisher-permission', 'redistributable')`,
    ),
    check(
      "transcript_jobs_access_check",
      sql`${table.accessState} IN ('not-checked', 'metadata-only', 'public-transcript-linked', 'owner-authorized', 'permission-required', 'unavailable', 'withdrawn', 'error')`,
    ),
    check(
      "transcript_jobs_retention_check",
      sql`${table.retentionOutcome} IN ('metadata-only', 'stored-private', 'stored-publishable', 'removed')`,
    ),
    check(
      "transcript_jobs_processing_check",
      sql`${table.processingState} IN ('discovered', 'queued', 'fetching', 'extracting', 'transcribing', 'normalizing', 'ready-for-review', 'failed', 'superseded', 'removed')`,
    ),
    check("transcript_jobs_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "transcript_jobs_lease_pair_check",
      sql`(${table.leaseToken} IS NULL AND ${table.leaseExpiresAt} IS NULL) OR (${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
  ],
);

export const transcripts = sqliteTable(
  "transcripts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => transcriptJobs.id),
    revisionNumber: integer("revision_number").notNull().default(1),
    parentTranscriptId: text("parent_transcript_id").references(
      (): AnySQLiteColumn => transcripts.id,
    ),
    candidacyId: text("candidacy_id")
      .notNull()
      .references(() => candidacies.id),
    sourceSnapshotId: text("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id),
    title: text("title").notNull(),
    language: text("language").notNull().default("en"),
    sourceKind: text("source_kind").notNull(),
    producer: text("producer").notNull(),
    producerVersion: text("producer_version").notNull().default("unspecified"),
    configHash: text("config_hash").notNull(),
    contentHash: text("content_hash").notNull(),
    storageKey: text("storage_key").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    durationSeconds: real("duration_seconds"),
    segmentCount: integer("segment_count").notNull().default(0),
    qualityState: text("quality_state").notNull().default("unassessed"),
    rightsState: text("rights_state").notNull().default("unknown"),
    retentionOutcome: text("retention_outcome").notNull().default("stored-private"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    publicationState: text("publication_state").notNull().default("private"),
    generatedAt: text("generated_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idx_transcripts_job_revision").on(table.jobId, table.revisionNumber),
    uniqueIndex("idx_transcripts_generation_identity").on(
      table.jobId,
      table.contentHash,
      table.producer,
      table.producerVersion,
      table.configHash,
    ),
    index("idx_transcripts_job").on(table.jobId),
    index("idx_transcripts_candidate_generated").on(table.candidacyId, table.generatedAt),
    index("idx_transcripts_review").on(table.reviewState, table.generatedAt),
    index("idx_transcripts_parent").on(table.parentTranscriptId),
    check("transcripts_revision_check", sql`${table.revisionNumber} >= 1`),
    check("transcripts_word_count_check", sql`${table.wordCount} >= 0`),
    check("transcripts_segment_count_check", sql`${table.segmentCount} >= 0`),
    check(
      "transcripts_source_kind_check",
      sql`${table.sourceKind} IN ('publisher-transcript', 'youtube-caption', 'media-transcription', 'manual-upload')`,
    ),
    check(
      "transcripts_rights_check",
      sql`${table.rightsState} IN ('unknown', 'link-only', 'candidate-permission', 'publisher-permission', 'redistributable')`,
    ),
    check(
      "transcripts_quality_check",
      sql`${table.qualityState} IN ('unassessed', 'publisher-provided', 'youtube-manual-caption', 'youtube-auto-caption', 'platform-asr', 'human-corrected', 'verified')`,
    ),
    check(
      "transcripts_retention_check",
      sql`${table.retentionOutcome} IN ('stored-private', 'stored-publishable', 'removed')`,
    ),
    check(
      "transcripts_review_check",
      sql`${table.reviewState} IN ('unreviewed', 'approved', 'rejected', 'needs-update')`,
    ),
    check(
      "transcripts_publication_check",
      sql`${table.publicationState} IN ('private', 'published', 'withheld')`,
    ),
    check(
      "transcripts_youtube_caption_private_check",
      sql`${table.sourceKind} != 'youtube-caption' OR (
        ${table.retentionOutcome} != 'stored-publishable'
        AND ${table.publicationState} != 'published'
      )`,
    ),
    check(
      "transcripts_publish_requires_rights_check",
      sql`${table.publicationState} != 'published' OR (
        ${table.reviewState} = 'approved'
        AND ${table.retentionOutcome} = 'stored-publishable'
        AND ${table.rightsState} IN ('candidate-permission', 'publisher-permission', 'redistributable')
      )`,
    ),
  ],
);

export const transcriptSegments = sqliteTable(
  "transcript_segments",
  {
    id: text("id").primaryKey(),
    transcriptId: text("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    segmentIndex: integer("segment_index").notNull(),
    startMilliseconds: integer("start_milliseconds"),
    endMilliseconds: integer("end_milliseconds"),
    speakerLabel: text("speaker_label"),
    text: text("text").notNull(),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    contentHash: text("content_hash").notNull(),
    confidence: real("confidence"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("idx_transcript_segments_transcript_index").on(
      table.transcriptId,
      table.segmentIndex,
    ),
    index("idx_transcript_segments_time").on(table.transcriptId, table.startMilliseconds),
    check("transcript_segments_index_check", sql`${table.segmentIndex} >= 0`),
    check(
      "transcript_segments_time_check",
      sql`(${table.startMilliseconds} IS NULL AND ${table.endMilliseconds} IS NULL) OR (${table.startMilliseconds} IS NOT NULL AND ${table.endMilliseconds} IS NOT NULL AND ${table.startMilliseconds} >= 0 AND ${table.endMilliseconds} >= ${table.startMilliseconds})`,
    ),
    check(
      "transcript_segments_offset_check",
      sql`(${table.startOffset} IS NULL AND ${table.endOffset} IS NULL) OR (${table.startOffset} IS NOT NULL AND ${table.endOffset} IS NOT NULL AND ${table.startOffset} >= 0 AND ${table.endOffset} >= ${table.startOffset})`,
    ),
    check(
      "transcript_segments_confidence_check",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`,
    ),
    check(
      "transcript_segments_review_check",
      sql`${table.reviewState} IN ('unreviewed', 'approved', 'rejected', 'needs-update')`,
    ),
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
    transcriptId: text("transcript_id").references(() => transcripts.id),
    transcriptSegmentId: text("transcript_segment_id").references(() => transcriptSegments.id),
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
    index("idx_evidence_transcript").on(table.transcriptId, table.transcriptSegmentId),
    check(
      "evidence_segment_requires_transcript_check",
      sql`${table.transcriptSegmentId} IS NULL OR ${table.transcriptId} IS NOT NULL`,
    ),
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
    supersedesReviewId: text("supersedes_review_id").references(
      (): AnySQLiteColumn => reviews.id,
    ),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_reviews_target_created").on(table.targetType, table.targetId, table.createdAt),
    uniqueIndex("idx_reviews_root_target")
      .on(table.targetType, table.targetId)
      .where(sql`${table.supersedesReviewId} IS NULL`),
    uniqueIndex("idx_reviews_superseded_once")
      .on(table.supersedesReviewId)
      .where(sql`${table.supersedesReviewId} IS NOT NULL`),
    check("reviews_decision_check", sql`${table.decision} IN ('approved', 'rejected')`),
    check(
      "reviews_no_self_supersession_check",
      sql`${table.supersedesReviewId} IS NULL OR ${table.supersedesReviewId} != ${table.id}`,
    ),
  ],
);

export const sourceItemVersionEntities = sqliteTable(
  "source_item_version_entities",
  {
    sourceItemVersionId: text("source_item_version_id")
      .notNull()
      .references(() => sourceItemVersions.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    mentionText: text("mention_text").notNull(),
    matchMethod: text("match_method").notNull(),
    confidence: real("confidence").notNull(),
    reviewId: text("review_id")
      .notNull()
      .references(() => reviews.id),
    confirmationState: text("confirmation_state").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.sourceItemVersionId, table.entityType, table.entityId, table.reviewId],
    }),
    index("idx_source_item_version_entities_entity").on(table.entityType, table.entityId),
    index("idx_source_item_version_entities_review").on(table.reviewId),
    check(
      "source_item_version_entities_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check(
      "source_item_version_entities_confirmation_check",
      sql`${table.confirmationState} IN ('confirmed', 'rejected')`,
    ),
  ],
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

export const candidateIntelligenceHeads = sqliteTable(
  "candidate_intelligence_heads",
  {
    candidacyId: text("candidacy_id")
      .primaryKey()
      .references(() => candidacies.id),
    analysisState: text("analysis_state").notNull().default("missing"),
    publicationState: text("publication_state").notNull().default("private"),
    desiredCorpusHash: text("desired_corpus_hash"),
    latestRevisionId: text("latest_revision_id").references(() => revisions.id),
    publishedRevisionId: text("published_revision_id").references(() => revisions.id),
    staleAt: text("stale_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_candidate_intelligence_analysis").on(table.analysisState, table.updatedAt),
    index("idx_candidate_intelligence_publication").on(
      table.publicationState,
      table.updatedAt,
    ),
    check(
      "candidate_intelligence_analysis_check",
      sql`${table.analysisState} IN ('missing', 'queued', 'draft', 'awaiting-review', 'approved', 'needs-update', 'failed')`,
    ),
    check(
      "candidate_intelligence_publication_check",
      sql`${table.publicationState} IN ('private', 'published', 'withheld')`,
    ),
    check(
      "candidate_intelligence_publish_requires_approved_check",
      sql`${table.publicationState} != 'published' OR (${table.analysisState} = 'approved' AND ${table.publishedRevisionId} IS NOT NULL)`,
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

export const sourceItemVersionCollectionAssessments = sqliteTable(
  "source_item_version_collection_assessments",
  {
    sourceItemVersionId: text("source_item_version_id")
      .primaryKey()
      .references(() => sourceItemVersions.id),
    rulesetId: text("ruleset_id").notNull(),
    route: text("route").notNull(),
    canonicalReasonJson: text("canonical_reason_json").notNull(),
    canonicalReasonHash: text("canonical_reason_hash").notNull(),
    createdByAuditEventId: text("created_by_audit_event_id")
      .notNull()
      .references(() => auditEvents.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_collection_assessments_route").on(table.rulesetId, table.route),
    index("idx_collection_assessments_audit_event").on(table.createdByAuditEventId),
    check(
      "collection_assessments_route_check",
      sql`${table.route} IN ('evidence-review', 'context-monitoring', 'broad-monitoring')`,
    ),
    check(
      "collection_assessments_reason_json_check",
      sql`json_valid(${table.canonicalReasonJson})`,
    ),
    check(
      "collection_assessments_reason_hash_check",
      sql`length(${table.canonicalReasonHash}) = 64 AND ${table.canonicalReasonHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
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
