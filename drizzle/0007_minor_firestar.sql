CREATE TABLE `candidate_intelligence_heads` (
	`candidacy_id` text PRIMARY KEY NOT NULL,
	`analysis_state` text DEFAULT 'missing' NOT NULL,
	`publication_state` text DEFAULT 'private' NOT NULL,
	`desired_corpus_hash` text,
	`latest_revision_id` text,
	`published_revision_id` text,
	`stale_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`latest_revision_id`) REFERENCES `revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_revision_id`) REFERENCES `revisions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "candidate_intelligence_analysis_check" CHECK("candidate_intelligence_heads"."analysis_state" IN ('missing', 'queued', 'draft', 'awaiting-review', 'approved', 'needs-update', 'failed')),
	CONSTRAINT "candidate_intelligence_publication_check" CHECK("candidate_intelligence_heads"."publication_state" IN ('private', 'published', 'withheld')),
	CONSTRAINT "candidate_intelligence_publish_requires_approved_check" CHECK("candidate_intelligence_heads"."publication_state" != 'published' OR ("candidate_intelligence_heads"."analysis_state" = 'approved' AND "candidate_intelligence_heads"."published_revision_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_candidate_intelligence_analysis` ON `candidate_intelligence_heads` (`analysis_state`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_candidate_intelligence_publication` ON `candidate_intelligence_heads` (`publication_state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `source_item_version_entities` (
	`source_item_version_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`mention_text` text NOT NULL,
	`match_method` text NOT NULL,
	`confidence` real NOT NULL,
	`review_id` text NOT NULL,
	`confirmation_state` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`source_item_version_id`, `entity_type`, `entity_id`),
	FOREIGN KEY (`source_item_version_id`) REFERENCES `source_item_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "source_item_version_entities_confidence_check" CHECK("source_item_version_entities"."confidence" >= 0 AND "source_item_version_entities"."confidence" <= 1),
	CONSTRAINT "source_item_version_entities_confirmation_check" CHECK("source_item_version_entities"."confirmation_state" IN ('confirmed', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `idx_source_item_version_entities_entity` ON `source_item_version_entities` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_source_item_version_entities_review` ON `source_item_version_entities` (`review_id`);
