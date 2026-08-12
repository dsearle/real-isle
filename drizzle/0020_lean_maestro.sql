CREATE TABLE `member_activity_scans` (
	`source_item_version_id` text PRIMARY KEY NOT NULL,
	`source_item_id` text NOT NULL,
	`outcome` text NOT NULL,
	`created_by_audit_event_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_item_version_id`) REFERENCES `source_item_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_activity_scans_outcome_check" CHECK("member_activity_scans"."outcome" IN ('linked', 'no-match'))
);
--> statement-breakpoint
CREATE INDEX `idx_member_activity_scans_item` ON `member_activity_scans` (`source_item_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `member_activity_scans_no_update`
BEFORE UPDATE ON `member_activity_scans`
BEGIN
  SELECT RAISE(ABORT, 'member activity scans are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `member_activity_scans_no_delete`
BEFORE DELETE ON `member_activity_scans`
BEGIN
  SELECT RAISE(ABORT, 'member activity scans are immutable');
END;
