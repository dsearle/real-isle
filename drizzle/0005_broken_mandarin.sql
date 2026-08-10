CREATE TABLE `transcript_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`candidacy_id` text NOT NULL,
	`candidate_document_id` text,
	`candidate_link_id` text,
	`source_observation_id` text NOT NULL,
	`source_snapshot_id` text NOT NULL,
	`input_kind` text NOT NULL,
	`platform` text NOT NULL,
	`source_url` text NOT NULL,
	`source_url_hash` text NOT NULL,
	`external_media_id` text,
	`language` text DEFAULT 'en' NOT NULL,
	`access_state` text DEFAULT 'not-checked' NOT NULL,
	`rights_state` text DEFAULT 'unknown' NOT NULL,
	`retention_outcome` text DEFAULT 'metadata-only' NOT NULL,
	`processing_state` text DEFAULT 'discovered' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`lease_token` text,
	`lease_expires_at` text,
	`last_error` text,
	`started_at` text,
	`finished_at` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_document_id`) REFERENCES `candidate_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_link_id`) REFERENCES `candidate_links`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_observation_id`) REFERENCES `candidate_profile_observations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transcript_jobs_single_input_check" CHECK(("transcript_jobs"."candidate_document_id" IS NOT NULL AND "transcript_jobs"."candidate_link_id" IS NULL) OR ("transcript_jobs"."candidate_document_id" IS NULL AND "transcript_jobs"."candidate_link_id" IS NOT NULL)),
	CONSTRAINT "transcript_jobs_input_kind_check" CHECK("transcript_jobs"."input_kind" IN ('publisher-transcript', 'youtube-caption', 'media-transcription', 'manual-upload')),
	CONSTRAINT "transcript_jobs_rights_check" CHECK("transcript_jobs"."rights_state" IN ('unknown', 'link-only', 'candidate-permission', 'publisher-permission', 'redistributable')),
	CONSTRAINT "transcript_jobs_access_check" CHECK("transcript_jobs"."access_state" IN ('not-checked', 'metadata-only', 'public-transcript-linked', 'owner-authorized', 'permission-required', 'unavailable', 'withdrawn', 'error')),
	CONSTRAINT "transcript_jobs_retention_check" CHECK("transcript_jobs"."retention_outcome" IN ('metadata-only', 'stored-private', 'stored-publishable', 'removed')),
	CONSTRAINT "transcript_jobs_processing_check" CHECK("transcript_jobs"."processing_state" IN ('discovered', 'queued', 'fetching', 'extracting', 'transcribing', 'normalizing', 'ready-for-review', 'failed', 'superseded', 'removed')),
	CONSTRAINT "transcript_jobs_attempt_count_check" CHECK("transcript_jobs"."attempt_count" >= 0),
	CONSTRAINT "transcript_jobs_lease_pair_check" CHECK(("transcript_jobs"."lease_token" IS NULL AND "transcript_jobs"."lease_expires_at" IS NULL) OR ("transcript_jobs"."lease_token" IS NOT NULL AND "transcript_jobs"."lease_expires_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transcript_jobs_candidate_source_kind` ON `transcript_jobs` (`candidacy_id`,`source_url_hash`,`input_kind`);--> statement-breakpoint
CREATE INDEX `idx_transcript_jobs_due` ON `transcript_jobs` (`processing_state`,`next_attempt_at`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_transcript_jobs_candidate` ON `transcript_jobs` (`candidacy_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `transcript_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`transcript_id` text NOT NULL,
	`segment_index` integer NOT NULL,
	`start_milliseconds` integer,
	`end_milliseconds` integer,
	`speaker_label` text,
	`text` text NOT NULL,
	`start_offset` integer,
	`end_offset` integer,
	`content_hash` text NOT NULL,
	`confidence` real,
	`review_state` text DEFAULT 'unreviewed' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`transcript_id`) REFERENCES `transcripts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "transcript_segments_index_check" CHECK("transcript_segments"."segment_index" >= 0),
	CONSTRAINT "transcript_segments_time_check" CHECK(("transcript_segments"."start_milliseconds" IS NULL AND "transcript_segments"."end_milliseconds" IS NULL) OR ("transcript_segments"."start_milliseconds" IS NOT NULL AND "transcript_segments"."end_milliseconds" IS NOT NULL AND "transcript_segments"."start_milliseconds" >= 0 AND "transcript_segments"."end_milliseconds" >= "transcript_segments"."start_milliseconds")),
	CONSTRAINT "transcript_segments_offset_check" CHECK(("transcript_segments"."start_offset" IS NULL AND "transcript_segments"."end_offset" IS NULL) OR ("transcript_segments"."start_offset" IS NOT NULL AND "transcript_segments"."end_offset" IS NOT NULL AND "transcript_segments"."start_offset" >= 0 AND "transcript_segments"."end_offset" >= "transcript_segments"."start_offset")),
	CONSTRAINT "transcript_segments_confidence_check" CHECK("transcript_segments"."confidence" IS NULL OR ("transcript_segments"."confidence" >= 0 AND "transcript_segments"."confidence" <= 1)),
	CONSTRAINT "transcript_segments_review_check" CHECK("transcript_segments"."review_state" IN ('unreviewed', 'approved', 'rejected', 'needs-update'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transcript_segments_transcript_index` ON `transcript_segments` (`transcript_id`,`segment_index`);--> statement-breakpoint
CREATE INDEX `idx_transcript_segments_time` ON `transcript_segments` (`transcript_id`,`start_milliseconds`);--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`parent_transcript_id` text,
	`candidacy_id` text NOT NULL,
	`source_snapshot_id` text NOT NULL,
	`title` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`source_kind` text NOT NULL,
	`producer` text NOT NULL,
	`producer_version` text,
	`config_hash` text NOT NULL,
	`content_hash` text NOT NULL,
	`storage_key` text NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`duration_seconds` real,
	`segment_count` integer DEFAULT 0 NOT NULL,
	`quality_state` text DEFAULT 'unassessed' NOT NULL,
	`rights_state` text DEFAULT 'unknown' NOT NULL,
	`retention_outcome` text DEFAULT 'stored-private' NOT NULL,
	`review_state` text DEFAULT 'unreviewed' NOT NULL,
	`publication_state` text DEFAULT 'private' NOT NULL,
	`generated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `transcript_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transcripts_word_count_check" CHECK("transcripts"."word_count" >= 0),
	CONSTRAINT "transcripts_segment_count_check" CHECK("transcripts"."segment_count" >= 0),
	CONSTRAINT "transcripts_rights_check" CHECK("transcripts"."rights_state" IN ('unknown', 'link-only', 'candidate-permission', 'publisher-permission', 'redistributable')),
	CONSTRAINT "transcripts_quality_check" CHECK("transcripts"."quality_state" IN ('unassessed', 'publisher-provided', 'youtube-manual-caption', 'youtube-auto-caption', 'platform-asr', 'human-corrected', 'verified')),
	CONSTRAINT "transcripts_retention_check" CHECK("transcripts"."retention_outcome" IN ('stored-private', 'stored-publishable', 'removed')),
	CONSTRAINT "transcripts_review_check" CHECK("transcripts"."review_state" IN ('unreviewed', 'approved', 'rejected', 'needs-update')),
	CONSTRAINT "transcripts_publication_check" CHECK("transcripts"."publication_state" IN ('private', 'published', 'withheld')),
	CONSTRAINT "transcripts_publish_requires_rights_check" CHECK("transcripts"."publication_state" != 'published' OR (
        "transcripts"."review_state" = 'approved'
        AND "transcripts"."retention_outcome" = 'stored-publishable'
        AND "transcripts"."rights_state" IN ('candidate-permission', 'publisher-permission', 'redistributable')
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transcripts_job` ON `transcripts` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_transcripts_candidate_generated` ON `transcripts` (`candidacy_id`,`generated_at`);--> statement-breakpoint
CREATE INDEX `idx_transcripts_review` ON `transcripts` (`review_state`,`generated_at`);--> statement-breakpoint
CREATE INDEX `idx_transcripts_parent` ON `transcripts` (`parent_transcript_id`);--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_candidate_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`candidacy_id` text NOT NULL,
	`document_kind` text NOT NULL,
	`title` text NOT NULL,
	`canonical_url` text NOT NULL,
	`canonical_url_hash` text NOT NULL,
	`source_observation_id` text NOT NULL,
	`source_snapshot_id` text NOT NULL,
	`content_snapshot_id` text,
	`rights_state` text DEFAULT 'unknown' NOT NULL,
	`reuse_basis` text,
	`attribution` text,
	`content_hash` text,
	`storage_key` text,
	`retention_outcome` text DEFAULT 'metadata-only' NOT NULL,
	`processing_state` text DEFAULT 'discovered' NOT NULL,
	`review_state` text DEFAULT 'unreviewed' NOT NULL,
	`publication_state` text DEFAULT 'private' NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_observation_id`) REFERENCES `candidate_profile_observations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "candidate_documents_kind_check" CHECK("document_kind" IN ('manifesto', 'transcript', 'statement', 'other')),
	CONSTRAINT "candidate_documents_rights_check" CHECK("rights_state" IN ('unknown', 'link-only', 'candidate-permission', 'publisher-permission', 'redistributable', 'takedown')),
	CONSTRAINT "candidate_documents_retention_check" CHECK("retention_outcome" IN ('metadata-only', 'stored-private', 'stored-publishable', 'removed')),
	CONSTRAINT "candidate_documents_publish_requires_rights_check" CHECK("publication_state" != 'published' OR (
        "review_state" = 'approved'
        AND "content_snapshot_id" IS NOT NULL
        AND "content_hash" IS NOT NULL
        AND "storage_key" IS NOT NULL
        AND "retention_outcome" = 'stored-publishable'
        AND "rights_state" IN ('candidate-permission', 'publisher-permission', 'redistributable')
      ))
);
--> statement-breakpoint
INSERT INTO `__new_candidate_documents`("id", "candidacy_id", "document_kind", "title", "canonical_url", "canonical_url_hash", "source_observation_id", "source_snapshot_id", "content_snapshot_id", "rights_state", "reuse_basis", "attribution", "content_hash", "storage_key", "retention_outcome", "processing_state", "review_state", "publication_state", "first_seen_at", "last_seen_at", "created_at", "updated_at") SELECT "id", "candidacy_id", "document_kind", "title", "canonical_url", "canonical_url_hash", "source_observation_id", "source_snapshot_id", NULL, "rights_state", NULL, NULL, "content_hash", "storage_key", 'metadata-only', "processing_state", "review_state", CASE WHEN "publication_state" = 'published' THEN 'withheld' ELSE "publication_state" END, "first_seen_at", "last_seen_at", "created_at", "updated_at" FROM `candidate_documents`;--> statement-breakpoint
DROP TABLE `candidate_documents`;--> statement-breakpoint
ALTER TABLE `__new_candidate_documents` RENAME TO `candidate_documents`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidate_documents_candidate_url` ON `candidate_documents` (`candidacy_id`,`canonical_url_hash`);--> statement-breakpoint
CREATE INDEX `idx_candidate_documents_processing` ON `candidate_documents` (`processing_state`,`document_kind`);--> statement-breakpoint
INSERT OR IGNORE INTO `transcript_jobs` (
	`id`, `candidacy_id`, `candidate_document_id`, `source_observation_id`, `source_snapshot_id`,
	`input_kind`, `platform`, `source_url`, `source_url_hash`, `access_state`, `rights_state`,
	`retention_outcome`, `processing_state`, `first_seen_at`, `last_seen_at`
)
SELECT
	'transcript-job:document:' || documents.id,
	documents.candidacy_id,
	documents.id,
	documents.source_observation_id,
	documents.source_snapshot_id,
	'publisher-transcript',
	CASE
		WHEN lower(documents.canonical_url) LIKE '%aiircdn.com/%' THEN 'manx-radio-cdn'
		ELSE 'publisher-document'
	END,
	documents.canonical_url,
	documents.canonical_url_hash,
	'public-transcript-linked',
	documents.rights_state,
	'metadata-only',
	'discovered',
	documents.first_seen_at,
	documents.last_seen_at
FROM candidate_documents documents
WHERE documents.document_kind = 'transcript'
  AND documents.rights_state != 'takedown';--> statement-breakpoint
INSERT OR IGNORE INTO `transcript_jobs` (
	`id`, `candidacy_id`, `candidate_link_id`, `source_observation_id`, `source_snapshot_id`,
	`input_kind`, `platform`, `source_url`, `source_url_hash`, `access_state`, `rights_state`,
	`retention_outcome`, `processing_state`, `first_seen_at`, `last_seen_at`
)
SELECT
	'transcript-job:link:' || links.id,
	links.candidacy_id,
	links.id,
	links.source_observation_id,
	observations.snapshot_id,
	CASE
		WHEN lower(links.url) LIKE '%youtube.com/%' OR lower(links.url) LIKE '%youtu.be/%'
		THEN 'youtube-caption'
		ELSE 'media-transcription'
	END,
	CASE
		WHEN lower(links.url) LIKE '%youtube.com/%' OR lower(links.url) LIKE '%youtu.be/%'
		THEN 'youtube'
		WHEN lower(links.url) LIKE '%captivate.fm/%' THEN 'captivate'
		ELSE 'publisher-media'
	END,
	links.url,
	links.url_hash,
	'permission-required',
	'link-only',
	'metadata-only',
	'discovered',
	links.first_seen_at,
	links.last_seen_at
FROM candidate_links links
JOIN candidate_profile_observations observations ON observations.id = links.source_observation_id
WHERE links.link_type IN ('interview-audio', 'interview-video')
   OR (
	links.link_type = 'youtube'
	AND (
		lower(links.url) LIKE '%youtube.com/embed/%'
		OR lower(links.url) LIKE '%youtube.com/watch?%v=%'
		OR lower(links.url) LIKE '%youtu.be/%'
	)
   );--> statement-breakpoint
PRAGMA optimize;
