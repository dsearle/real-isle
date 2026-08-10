DROP INDEX IF EXISTS `idx_source_item_versions_item_payload`;--> statement-breakpoint
CREATE INDEX `idx_source_item_versions_item_payload`
ON `source_item_versions` (`source_item_id`, `payload_hash`);
