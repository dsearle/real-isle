DROP INDEX `idx_source_snapshots_capture_hash`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_snapshots_run_capture_hash` ON `source_snapshots` (`ingestion_run_id`,`capture_url`,`content_hash`);--> statement-breakpoint
DROP INDEX `idx_source_items_canonical_hash`;--> statement-breakpoint
CREATE INDEX `idx_source_items_canonical_hash` ON `source_items` (`canonical_url_hash`);--> statement-breakpoint
ALTER TABLE `ingestion_run_items` ADD `source_item_version_id` text REFERENCES source_item_versions(id);