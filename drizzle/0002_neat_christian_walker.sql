ALTER TABLE `ingestion_runs` ADD `processed_item_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `deferred_item_count` integer DEFAULT 0 NOT NULL;