CREATE TABLE `source_item_version_collection_assessments` (
	`source_item_version_id` text PRIMARY KEY NOT NULL,
	`ruleset_id` text NOT NULL,
	`route` text NOT NULL,
	`canonical_reason_json` text NOT NULL,
	`canonical_reason_hash` text NOT NULL,
	`created_by_audit_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_item_version_id`) REFERENCES `source_item_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "collection_assessments_route_check" CHECK("source_item_version_collection_assessments"."route" IN ('evidence-review', 'context-monitoring', 'broad-monitoring')),
	CONSTRAINT "collection_assessments_reason_json_check" CHECK(json_valid("source_item_version_collection_assessments"."canonical_reason_json")),
	CONSTRAINT "collection_assessments_reason_hash_check" CHECK(length("source_item_version_collection_assessments"."canonical_reason_hash") = 64 AND "source_item_version_collection_assessments"."canonical_reason_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `idx_collection_assessments_route` ON `source_item_version_collection_assessments` (`ruleset_id`,`route`);--> statement-breakpoint
CREATE INDEX `idx_collection_assessments_audit_event` ON `source_item_version_collection_assessments` (`created_by_audit_event_id`);--> statement-breakpoint
CREATE TRIGGER `collection_assessments_no_update`
BEFORE UPDATE ON `source_item_version_collection_assessments`
BEGIN SELECT RAISE(ABORT, 'collection assessments are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `collection_assessments_no_delete`
BEFORE DELETE ON `source_item_version_collection_assessments`
BEGIN SELECT RAISE(ABORT, 'collection assessments are immutable'); END;--> statement-breakpoint
PRAGMA optimize;
