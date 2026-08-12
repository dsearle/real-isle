CREATE TABLE `election_results` (
	`id` text PRIMARY KEY NOT NULL,
	`election_id` text NOT NULL,
	`candidacy_id` text NOT NULL,
	`source_item_version_id` text NOT NULL,
	`source_snapshot_id` text NOT NULL,
	`votes` integer NOT NULL,
	`elected` integer NOT NULL,
	`source_classification` text NOT NULL,
	`observed_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`election_id`) REFERENCES `elections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_item_version_id`) REFERENCES `source_item_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "election_results_votes_check" CHECK("election_results"."votes" >= 0),
	CONSTRAINT "election_results_source_classification_check" CHECK("election_results"."source_classification" IN ('official-result', 'secondary-reference'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_election_results_version_candidate` ON `election_results` (`source_item_version_id`,`candidacy_id`);--> statement-breakpoint
CREATE INDEX `idx_election_results_election_elected` ON `election_results` (`election_id`,`elected`);--> statement-breakpoint
CREATE INDEX `idx_election_results_candidacy` ON `election_results` (`candidacy_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `member_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`election_id` text NOT NULL,
	`candidacy_id` text NOT NULL,
	`result_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`term_state` text DEFAULT 'historical' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`election_id`) REFERENCES `elections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`result_id`) REFERENCES `election_results`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_terms_state_check" CHECK("member_terms"."term_state" IN ('historical', 'current', 'ended', 'vacant'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_member_terms_result` ON `member_terms` (`result_id`);--> statement-breakpoint
CREATE INDEX `idx_member_terms_person` ON `member_terms` (`person_id`,`started_at`);
--> statement-breakpoint
CREATE TRIGGER `election_results_no_update`
BEFORE UPDATE ON `election_results`
BEGIN
  SELECT RAISE(ABORT, 'election results are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `election_results_no_delete`
BEFORE DELETE ON `election_results`
BEGIN
  SELECT RAISE(ABORT, 'election results are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `member_terms_no_update`
BEFORE UPDATE ON `member_terms`
BEGIN
  SELECT RAISE(ABORT, 'member terms are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `member_terms_no_delete`
BEFORE DELETE ON `member_terms`
BEGIN
  SELECT RAISE(ABORT, 'member terms are immutable');
END;
