PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_candidate_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`candidacy_id` text NOT NULL,
	`media_kind` text NOT NULL,
	`variant` text NOT NULL,
	`remote_url` text NOT NULL,
	`remote_url_hash` text NOT NULL,
	`source_page_url` text NOT NULL,
	`source_observation_id` text NOT NULL,
	`source_snapshot_id` text NOT NULL,
	`content_snapshot_id` text,
	`rights_state` text DEFAULT 'unknown' NOT NULL,
	`reuse_basis` text,
	`attribution` text,
	`content_type` text,
	`width` integer,
	`height` integer,
	`content_hash` text,
	`storage_key` text,
	`retention_outcome` text DEFAULT 'metadata-only' NOT NULL,
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
	CONSTRAINT "candidate_media_rights_check" CHECK("rights_state" IN ('unknown', 'link-only', 'candidate-permission', 'redistributable', 'takedown')),
	CONSTRAINT "candidate_media_retention_check" CHECK("retention_outcome" IN ('metadata-only', 'stored-private', 'stored-publishable', 'removed')),
	CONSTRAINT "candidate_media_publish_rights_check" CHECK("publication_state" != 'published' OR (
        "review_state" = 'approved'
        AND "content_snapshot_id" IS NOT NULL
        AND "content_hash" IS NOT NULL
        AND "storage_key" IS NOT NULL
        AND "retention_outcome" = 'stored-publishable'
        AND "rights_state" IN ('candidate-permission', 'redistributable')
      ))
);
--> statement-breakpoint
INSERT INTO `__new_candidate_media_assets`("id", "candidacy_id", "media_kind", "variant", "remote_url", "remote_url_hash", "source_page_url", "source_observation_id", "source_snapshot_id", "content_snapshot_id", "rights_state", "reuse_basis", "attribution", "content_type", "width", "height", "content_hash", "storage_key", "retention_outcome", "review_state", "publication_state", "first_seen_at", "last_seen_at", "created_at", "updated_at") SELECT "id", "candidacy_id", "media_kind", "variant", "remote_url", "remote_url_hash", "source_page_url", "source_observation_id", "source_snapshot_id", NULL, "rights_state", "reuse_basis", "attribution", "content_type", "width", "height", "content_hash", "storage_key", "retention_outcome", "review_state", CASE WHEN "publication_state" = 'published' THEN 'withheld' ELSE "publication_state" END, "first_seen_at", "last_seen_at", "created_at", "updated_at" FROM `candidate_media_assets`;--> statement-breakpoint
DROP TABLE `candidate_media_assets`;--> statement-breakpoint
ALTER TABLE `__new_candidate_media_assets` RENAME TO `candidate_media_assets`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidate_media_candidate_url` ON `candidate_media_assets` (`candidacy_id`,`remote_url_hash`);--> statement-breakpoint
CREATE INDEX `idx_candidate_media_rights_review` ON `candidate_media_assets` (`rights_state`,`review_state`);--> statement-breakpoint
CREATE TABLE `__new_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`revision_number` integer DEFAULT 1 NOT NULL,
	`parent_transcript_id` text,
	`candidacy_id` text NOT NULL,
	`source_snapshot_id` text NOT NULL,
	`title` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`source_kind` text NOT NULL,
	`producer` text NOT NULL,
	`producer_version` text DEFAULT 'unspecified' NOT NULL,
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
	FOREIGN KEY (`parent_transcript_id`) REFERENCES `transcripts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transcripts_revision_check" CHECK("revision_number" >= 1),
	CONSTRAINT "transcripts_word_count_check" CHECK("word_count" >= 0),
	CONSTRAINT "transcripts_segment_count_check" CHECK("segment_count" >= 0),
	CONSTRAINT "transcripts_source_kind_check" CHECK("source_kind" IN ('publisher-transcript', 'youtube-caption', 'media-transcription', 'manual-upload')),
	CONSTRAINT "transcripts_rights_check" CHECK("rights_state" IN ('unknown', 'link-only', 'candidate-permission', 'publisher-permission', 'redistributable')),
	CONSTRAINT "transcripts_quality_check" CHECK("quality_state" IN ('unassessed', 'publisher-provided', 'youtube-manual-caption', 'youtube-auto-caption', 'platform-asr', 'human-corrected', 'verified')),
	CONSTRAINT "transcripts_retention_check" CHECK("retention_outcome" IN ('stored-private', 'stored-publishable', 'removed')),
	CONSTRAINT "transcripts_review_check" CHECK("review_state" IN ('unreviewed', 'approved', 'rejected', 'needs-update')),
	CONSTRAINT "transcripts_publication_check" CHECK("publication_state" IN ('private', 'published', 'withheld')),
	CONSTRAINT "transcripts_youtube_caption_private_check" CHECK("source_kind" != 'youtube-caption' OR (
        "retention_outcome" != 'stored-publishable'
        AND "publication_state" != 'published'
      )),
	CONSTRAINT "transcripts_publish_requires_rights_check" CHECK("publication_state" != 'published' OR (
        "review_state" = 'approved'
        AND "retention_outcome" = 'stored-publishable'
        AND "rights_state" IN ('candidate-permission', 'publisher-permission', 'redistributable')
      ))
);
--> statement-breakpoint
INSERT INTO `__new_transcripts`("id", "job_id", "revision_number", "parent_transcript_id", "candidacy_id", "source_snapshot_id", "title", "language", "source_kind", "producer", "producer_version", "config_hash", "content_hash", "storage_key", "word_count", "duration_seconds", "segment_count", "quality_state", "rights_state", "retention_outcome", "review_state", "publication_state", "generated_at", "created_at", "updated_at") SELECT "id", "job_id", 1, "parent_transcript_id", "candidacy_id", "source_snapshot_id", "title", "language", "source_kind", "producer", COALESCE("producer_version", 'unspecified'), "config_hash", "content_hash", "storage_key", "word_count", "duration_seconds", "segment_count", "quality_state", "rights_state", CASE WHEN "source_kind" = 'youtube-caption' AND "retention_outcome" = 'stored-publishable' THEN 'stored-private' ELSE "retention_outcome" END, "review_state", CASE WHEN "source_kind" = 'youtube-caption' AND "publication_state" = 'published' THEN 'withheld' ELSE "publication_state" END, "generated_at", "created_at", "updated_at" FROM `transcripts`;--> statement-breakpoint
DROP TABLE `transcripts`;--> statement-breakpoint
ALTER TABLE `__new_transcripts` RENAME TO `transcripts`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transcripts_job_revision` ON `transcripts` (`job_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transcripts_generation_identity` ON `transcripts` (`job_id`,`content_hash`,`producer`,`producer_version`,`config_hash`);--> statement-breakpoint
CREATE INDEX `idx_transcripts_job` ON `transcripts` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_transcripts_candidate_generated` ON `transcripts` (`candidacy_id`,`generated_at`);--> statement-breakpoint
CREATE INDEX `idx_transcripts_review` ON `transcripts` (`review_state`,`generated_at`);--> statement-breakpoint
CREATE INDEX `idx_transcripts_parent` ON `transcripts` (`parent_transcript_id`);--> statement-breakpoint
CREATE TABLE `__new_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`item_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`transcript_id` text,
	`transcript_segment_id` text,
	`relationship` text DEFAULT 'supports' NOT NULL,
	`excerpt` text NOT NULL,
	`locator` text NOT NULL,
	`start_offset` integer,
	`end_offset` integer,
	`start_seconds` real,
	`end_seconds` real,
	`excerpt_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transcript_id`) REFERENCES `transcripts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transcript_segment_id`) REFERENCES `transcript_segments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "evidence_segment_requires_transcript_check" CHECK("transcript_segment_id" IS NULL OR "transcript_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_evidence`("id", "claim_id", "item_id", "snapshot_id", "transcript_id", "transcript_segment_id", "relationship", "excerpt", "locator", "start_offset", "end_offset", "start_seconds", "end_seconds", "excerpt_hash", "created_at") SELECT "id", "claim_id", "item_id", "snapshot_id", NULL, NULL, "relationship", "excerpt", "locator", "start_offset", "end_offset", "start_seconds", "end_seconds", "excerpt_hash", "created_at" FROM `evidence`;--> statement-breakpoint
DROP TABLE `evidence`;--> statement-breakpoint
ALTER TABLE `__new_evidence` RENAME TO `evidence`;--> statement-breakpoint
CREATE INDEX `idx_evidence_claim` ON `evidence` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_evidence_snapshot` ON `evidence` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_evidence_transcript` ON `evidence` (`transcript_id`,`transcript_segment_id`);--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
