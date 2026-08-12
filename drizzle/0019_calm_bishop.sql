CREATE TABLE `member_activity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`member_term_id` text NOT NULL,
	`source_item_version_id` text NOT NULL,
	`source_item_id` text NOT NULL,
	`link_kind` text NOT NULL,
	`mention_text` text NOT NULL,
	`mention_hash` text NOT NULL,
	`created_by_audit_event_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_term_id`) REFERENCES `member_terms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_item_version_id`) REFERENCES `source_item_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_activity_link_kind_check" CHECK("member_activity_links"."link_kind" IN ('official-record-reference')),
	CONSTRAINT "member_activity_mention_hash_check" CHECK(length("member_activity_links"."mention_hash") = 64 AND "member_activity_links"."mention_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_member_activity_version_term` ON `member_activity_links` (`source_item_version_id`,`member_term_id`);--> statement-breakpoint
CREATE INDEX `idx_member_activity_term` ON `member_activity_links` (`member_term_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_member_activity_item` ON `member_activity_links` (`source_item_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `member_activity_links_no_update`
BEFORE UPDATE ON `member_activity_links`
BEGIN
  SELECT RAISE(ABORT, 'member activity links are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `member_activity_links_no_delete`
BEFORE DELETE ON `member_activity_links`
BEGIN
  SELECT RAISE(ABORT, 'member activity links are immutable');
END;
