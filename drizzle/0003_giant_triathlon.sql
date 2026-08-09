CREATE TABLE `candidate_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`candidacy_id` text NOT NULL,
	`document_kind` text NOT NULL,
	`title` text NOT NULL,
	`canonical_url` text NOT NULL,
	`canonical_url_hash` text NOT NULL,
	`source_observation_id` text NOT NULL,
	`source_snapshot_id` text NOT NULL,
	`rights_state` text DEFAULT 'unknown' NOT NULL,
	`content_hash` text,
	`storage_key` text,
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
	CONSTRAINT "candidate_documents_kind_check" CHECK("candidate_documents"."document_kind" IN ('manifesto', 'transcript', 'statement', 'other')),
	CONSTRAINT "candidate_documents_publish_requires_review_check" CHECK("candidate_documents"."publication_state" != 'published' OR "candidate_documents"."review_state" = 'approved')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidate_documents_candidate_url` ON `candidate_documents` (`candidacy_id`,`canonical_url_hash`);--> statement-breakpoint
CREATE INDEX `idx_candidate_documents_processing` ON `candidate_documents` (`processing_state`,`document_kind`);--> statement-breakpoint
CREATE TABLE `candidate_links` (
	`id` text PRIMARY KEY NOT NULL,
	`candidacy_id` text NOT NULL,
	`link_type` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`url_hash` text NOT NULL,
	`source_observation_id` text NOT NULL,
	`verification_state` text DEFAULT 'discovered' NOT NULL,
	`review_state` text DEFAULT 'unreviewed' NOT NULL,
	`publication_state` text DEFAULT 'private' NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_observation_id`) REFERENCES `candidate_profile_observations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "candidate_links_verification_check" CHECK("candidate_links"."verification_state" IN ('discovered', 'source-verified', 'candidate-verified', 'broken')),
	CONSTRAINT "candidate_links_publish_requires_review_check" CHECK("candidate_links"."publication_state" != 'published' OR "candidate_links"."review_state" = 'approved')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidate_links_candidate_url` ON `candidate_links` (`candidacy_id`,`url_hash`);--> statement-breakpoint
CREATE INDEX `idx_candidate_links_review` ON `candidate_links` (`review_state`,`link_type`);--> statement-breakpoint
CREATE TABLE `candidate_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`candidacy_id` text NOT NULL,
	`media_kind` text NOT NULL,
	`variant` text NOT NULL,
	`remote_url` text NOT NULL,
	`remote_url_hash` text NOT NULL,
	`source_page_url` text NOT NULL,
	`source_observation_id` text NOT NULL,
	`source_snapshot_id` text NOT NULL,
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
	CONSTRAINT "candidate_media_rights_check" CHECK("candidate_media_assets"."rights_state" IN ('unknown', 'link-only', 'candidate-permission', 'redistributable', 'takedown')),
	CONSTRAINT "candidate_media_retention_check" CHECK("candidate_media_assets"."retention_outcome" IN ('metadata-only', 'stored-private', 'stored-publishable', 'removed')),
	CONSTRAINT "candidate_media_publish_rights_check" CHECK("candidate_media_assets"."publication_state" != 'published' OR (
        "candidate_media_assets"."review_state" = 'approved'
        AND "candidate_media_assets"."storage_key" IS NOT NULL
        AND "candidate_media_assets"."retention_outcome" = 'stored-publishable'
        AND "candidate_media_assets"."rights_state" IN ('candidate-permission', 'redistributable')
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidate_media_candidate_url` ON `candidate_media_assets` (`candidacy_id`,`remote_url_hash`);--> statement-breakpoint
CREATE INDEX `idx_candidate_media_rights_review` ON `candidate_media_assets` (`rights_state`,`review_state`);--> statement-breakpoint
CREATE TABLE `candidate_profile_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`candidacy_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_item_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`observation_type` text NOT NULL,
	`observed_at` text NOT NULL,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`parser_version` text NOT NULL,
	`review_state` text DEFAULT 'unreviewed' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "candidate_observations_type_check" CHECK("candidate_profile_observations"."observation_type" IN ('directory', 'profile')),
	CONSTRAINT "candidate_observations_review_check" CHECK("candidate_profile_observations"."review_state" IN ('unreviewed', 'approved', 'rejected', 'superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidate_observations_snapshot_type` ON `candidate_profile_observations` (`candidacy_id`,`snapshot_id`,`observation_type`);--> statement-breakpoint
CREATE INDEX `idx_candidate_observations_review` ON `candidate_profile_observations` (`review_state`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_candidate_observations_candidate` ON `candidate_profile_observations` (`candidacy_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `candidate_profiles` (
	`candidacy_id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`profile_url` text NOT NULL,
	`profile_url_hash` text NOT NULL,
	`observed_constituency_id` text NOT NULL,
	`current_directory_observation_id` text NOT NULL,
	`current_profile_observation_id` text,
	`completeness_state` text DEFAULT 'directory-only' NOT NULL,
	`review_state` text DEFAULT 'unreviewed' NOT NULL,
	`publication_state` text DEFAULT 'private' NOT NULL,
	`last_directory_seen_at` text NOT NULL,
	`last_profile_checked_at` text,
	`next_profile_check_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`observed_constituency_id`) REFERENCES `constituencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_directory_observation_id`) REFERENCES `candidate_profile_observations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_profile_observation_id`) REFERENCES `candidate_profile_observations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "candidate_profiles_completeness_check" CHECK("candidate_profiles"."completeness_state" IN ('directory-only', 'profile-parsed', 'candidate-verified')),
	CONSTRAINT "candidate_profiles_review_check" CHECK("candidate_profiles"."review_state" IN ('unreviewed', 'approved', 'rejected', 'needs-update')),
	CONSTRAINT "candidate_profiles_publication_check" CHECK("candidate_profiles"."publication_state" IN ('private', 'published', 'withheld')),
	CONSTRAINT "candidate_profiles_publish_requires_review_check" CHECK("candidate_profiles"."publication_state" != 'published' OR "candidate_profiles"."review_state" = 'approved')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidate_profiles_slug` ON `candidate_profiles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_candidate_profiles_due` ON `candidate_profiles` (`next_profile_check_at`,`last_profile_checked_at`);--> statement-breakpoint
CREATE INDEX `idx_candidate_profiles_review` ON `candidate_profiles` (`review_state`,`last_directory_seen_at`);