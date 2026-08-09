CREATE TABLE `audit_chain_head` (
	`chain_id` integer PRIMARY KEY NOT NULL,
	`next_sequence` integer NOT NULL,
	`last_event_hash` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`sequence` integer PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`previous_event_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_audit_events_id` ON `audit_events` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_audit_events_hash` ON `audit_events` (`event_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_audit_events_previous_hash` ON `audit_events` (`previous_event_hash`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_entity` ON `audit_events` (`entity_type`,`entity_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `candidacies` (
	`id` text PRIMARY KEY NOT NULL,
	`election_id` text NOT NULL,
	`person_id` text NOT NULL,
	`constituency_id` text NOT NULL,
	`affiliation` text DEFAULT 'Independent' NOT NULL,
	`declaration_status` text DEFAULT 'prospective' NOT NULL,
	`verification_state` text DEFAULT 'unverified' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`election_id`) REFERENCES `elections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`constituency_id`) REFERENCES `constituencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidacies_election_person` ON `candidacies` (`election_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `idx_candidacies_constituency` ON `candidacies` (`election_id`,`constituency_id`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`topic_id` text,
	`claim_scope` text NOT NULL,
	`claim_type` text NOT NULL,
	`claim_text` text NOT NULL,
	`extraction_method` text NOT NULL,
	`extraction_model` text,
	`confidence` real NOT NULL,
	`review_state` text DEFAULT 'unreviewed' NOT NULL,
	`publication_state` text DEFAULT 'private' NOT NULL,
	`disputed_state` text DEFAULT 'undisputed' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`supersedes_claim_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `policy_topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_claims_subject_topic` ON `claims` (`subject_type`,`subject_id`,`topic_id`);--> statement-breakpoint
CREATE INDEX `idx_claims_review_queue` ON `claims` (`review_state`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_claims_publication` ON `claims` (`publication_state`,`subject_id`);--> statement-breakpoint
CREATE TABLE `constituencies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`seats` integer DEFAULT 2 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_constituencies_name` ON `constituencies` (`name`);--> statement-breakpoint
CREATE TABLE `disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`submitted_by` text NOT NULL,
	`reason` text NOT NULL,
	`evidence_url` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`resolved_by` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_disputes_status_created` ON `disputes` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `elections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`election_date` text,
	`jurisdiction` text DEFAULT 'Isle of Man' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`item_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
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
	FOREIGN KEY (`snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_claim` ON `evidence` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_evidence_snapshot` ON `evidence` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `ingestion_run_items` (
	`id` text PRIMARY KEY NOT NULL,
	`ingestion_run_id` text NOT NULL,
	`source_item_id` text NOT NULL,
	`snapshot_id` text,
	`outcome` text NOT NULL,
	`observed_url_hash` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ingestion_run_items_run_item` ON `ingestion_run_items` (`ingestion_run_id`,`source_item_id`);--> statement-breakpoint
CREATE INDEX `idx_ingestion_run_items_outcome` ON `ingestion_run_items` (`ingestion_run_id`,`outcome`);--> statement-breakpoint
CREATE INDEX `idx_ingestion_run_items_item` ON `ingestion_run_items` (`source_item_id`,`ingestion_run_id`);--> statement-breakpoint
CREATE TABLE `ingestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`trigger` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`parser_version` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`new_item_count` integer DEFAULT 0 NOT NULL,
	`changed_item_count` integer DEFAULT 0 NOT NULL,
	`unchanged_item_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`error_summary` text,
	`http_status` integer,
	`feed_snapshot_id` text,
	`audit_head_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ingestion_runs_source_started` ON `ingestion_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_ingestion_runs_status` ON `ingestion_runs` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ingestion_runs_idempotency` ON `ingestion_runs` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `integrity_anchors` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_head_hash` text NOT NULL,
	`chain_length` integer NOT NULL,
	`network` text DEFAULT 'sui:testnet' NOT NULL,
	`transaction_digest` text,
	`object_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`anchored_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integrity_anchors_chain_head` ON `integrity_anchors` (`chain_head_hash`);--> statement-breakpoint
CREATE TABLE `item_entities` (
	`item_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`mention_text` text NOT NULL,
	`match_method` text NOT NULL,
	`confidence` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`item_id`, `entity_type`, `entity_id`),
	FOREIGN KEY (`item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_item_entities_entity` ON `item_entities` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`canonical_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_organisations_name` ON `organisations` (`name`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`sort_name` text NOT NULL,
	`profile_state` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "people_profile_state_check" CHECK("people"."profile_state" IN ('draft', 'reviewed', 'published', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_people_sort_name` ON `people` (`sort_name`);--> statement-breakpoint
CREATE TABLE `policy_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_policy_topics_name` ON `policy_topics` (`name`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`decision` text NOT NULL,
	`rationale` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reviews_target_created` ON `reviews` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_revisions_entity_number` ON `revisions` (`entity_type`,`entity_id`,`revision_number`);--> statement-breakpoint
CREATE TABLE `source_item_heads` (
	`source_item_id` text PRIMARY KEY NOT NULL,
	`latest_snapshot_id` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`latest_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_item_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_item_id` text NOT NULL,
	`ingestion_run_id` text NOT NULL,
	`snapshot_id` text,
	`observed_at` text NOT NULL,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`parser_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_item_versions_item_payload` ON `source_item_versions` (`source_item_id`,`payload_hash`);--> statement-breakpoint
CREATE INDEX `idx_source_item_versions_item_observed` ON `source_item_versions` (`source_item_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `source_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text,
	`canonical_url` text NOT NULL,
	`canonical_url_hash` text NOT NULL,
	`item_type` text DEFAULT 'news' NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`author` text,
	`published_at` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`latest_snapshot_id` text,
	`latest_version_id` text,
	`content_hash` text,
	`review_state` text DEFAULT 'unreviewed' NOT NULL,
	`publication_state` text DEFAULT 'private' NOT NULL,
	`source_tier` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_items_source_url` ON `source_items` (`source_id`,`canonical_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_items_canonical_hash` ON `source_items` (`canonical_url_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_items_source_external` ON `source_items` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_source_items_published` ON `source_items` (`published_at`);--> statement-breakpoint
CREATE INDEX `idx_source_items_review_queue` ON `source_items` (`review_state`,`first_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_source_items_publication` ON `source_items` (`publication_state`,`published_at`);--> statement-breakpoint
CREATE TABLE `source_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`item_id` text,
	`ingestion_run_id` text NOT NULL,
	`capture_url` text NOT NULL,
	`resolved_url` text NOT NULL,
	`captured_at` text NOT NULL,
	`http_status` integer NOT NULL,
	`content_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`content_hash` text NOT NULL,
	`storage_key` text,
	`retention_outcome` text DEFAULT 'stored-private' NOT NULL,
	`etag` text,
	`last_modified` text,
	`response_metadata` text DEFAULT '{}' NOT NULL,
	`previous_snapshot_id` text,
	`chain_hash` text NOT NULL,
	`capture_method` text DEFAULT 'http-fetch-v1' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_snapshots_capture_hash` ON `source_snapshots` (`capture_url`,`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_source_snapshots_item_captured` ON `source_snapshots` (`item_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `idx_source_snapshots_content_hash` ON `source_snapshots` (`content_hash`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`publisher` text NOT NULL,
	`organisation_id` text,
	`homepage_url` text NOT NULL,
	`feed_url` text NOT NULL,
	`feed_type` text NOT NULL,
	`source_tier` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`snapshot_policy` text DEFAULT 'private-audit' NOT NULL,
	`rights_state` text DEFAULT 'unknown' NOT NULL,
	`store_full_content` integer DEFAULT false NOT NULL,
	`poll_interval_minutes` integer DEFAULT 60 NOT NULL,
	`parser_version` text DEFAULT 'feed-v1' NOT NULL,
	`next_check_at` text,
	`lease_token` text,
	`lease_expires_at` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_new_item_at` text,
	`etag` text,
	`last_modified` text,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sources_tier_check" CHECK("sources"."source_tier" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sources_feed_url` ON `sources` (`feed_url`);--> statement-breakpoint
CREATE INDEX `idx_sources_active_next_poll` ON `sources` (`active`,`next_check_at`);--> statement-breakpoint
INSERT INTO `audit_chain_head` (`chain_id`, `next_sequence`, `last_event_hash`)
VALUES (1, 1, '0000000000000000000000000000000000000000000000000000000000000000');
