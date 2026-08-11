CREATE TABLE `robots_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`exact_host` text NOT NULL,
	`user_agent_token` text NOT NULL,
	`fetched_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`policy_state` text NOT NULL,
	`http_status` integer,
	`etag` text,
	`last_modified` text,
	`body_hash` text,
	`rules_json` text DEFAULT '[]' NOT NULL,
	`rules_hash` text NOT NULL,
	`crawl_delay_ms` integer DEFAULT 0 NOT NULL,
	`created_by_audit_event_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "robots_policies_state_check" CHECK("robots_policies"."policy_state" IN ('rules', 'allow-default', 'unreachable')),
	CONSTRAINT "robots_policies_delay_check" CHECK("robots_policies"."crawl_delay_ms" >= 0),
	CONSTRAINT "robots_policies_rules_json_check" CHECK(json_valid("robots_policies"."rules_json")),
	CONSTRAINT "robots_policies_rules_hash_check" CHECK(length("robots_policies"."rules_hash") = 64 AND "robots_policies"."rules_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "robots_policies_body_hash_check" CHECK("robots_policies"."body_hash" IS NULL OR (length("robots_policies"."body_hash") = 64 AND "robots_policies"."body_hash" NOT GLOB '*[^0-9a-f]*'))
);
--> statement-breakpoint
CREATE INDEX `idx_robots_policies_host_fetched` ON `robots_policies` (`exact_host`,`user_agent_token`,`fetched_at`);--> statement-breakpoint
CREATE INDEX `idx_robots_policies_audit_event` ON `robots_policies` (`created_by_audit_event_id`);--> statement-breakpoint
CREATE TABLE `robots_policy_heads` (
	`exact_host` text NOT NULL,
	`user_agent_token` text NOT NULL,
	`current_policy_id` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`exact_host`, `user_agent_token`),
	FOREIGN KEY (`current_policy_id`) REFERENCES `robots_policies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_robots_policy_heads_policy` ON `robots_policy_heads` (`current_policy_id`);--> statement-breakpoint
CREATE TABLE `source_document_captures` (
	`id` text PRIMARY KEY NOT NULL,
	`source_item_id` text NOT NULL,
	`source_item_version_id` text NOT NULL,
	`ingestion_run_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`robots_policy_id` text NOT NULL,
	`observed_at` text NOT NULL,
	`rights_state` text NOT NULL,
	`retention_outcome` text NOT NULL,
	`extractor_version` text NOT NULL,
	`extractor_config_hash` text NOT NULL,
	`extraction_manifest_json` text NOT NULL,
	`extraction_manifest_hash` text NOT NULL,
	`readable_text_hash` text NOT NULL,
	`readable_text_length` integer NOT NULL,
	`readable_text_storage_key` text,
	`short_extract` text DEFAULT '' NOT NULL,
	`short_extract_start_offset` integer DEFAULT 0 NOT NULL,
	`short_extract_end_offset` integer DEFAULT 0 NOT NULL,
	`created_by_audit_event_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_item_version_id`) REFERENCES `source_item_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`robots_policy_id`) REFERENCES `robots_policies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "source_document_captures_rights_check" CHECK("source_document_captures"."rights_state" IN ('restricted-copy', 'metadata-only', 'public-record')),
	CONSTRAINT "source_document_captures_retention_check" CHECK("source_document_captures"."retention_outcome" IN ('metadata-only', 'stored-private', 'stored-publishable')),
	CONSTRAINT "source_document_captures_storage_check" CHECK(("source_document_captures"."retention_outcome" = 'metadata-only' AND "source_document_captures"."readable_text_storage_key" IS NULL) OR ("source_document_captures"."retention_outcome" != 'metadata-only' AND "source_document_captures"."readable_text_storage_key" IS NOT NULL)),
	CONSTRAINT "source_document_captures_manifest_json_check" CHECK(json_valid("source_document_captures"."extraction_manifest_json")),
	CONSTRAINT "source_document_captures_hashes_check" CHECK(length("source_document_captures"."extractor_config_hash") = 64 AND "source_document_captures"."extractor_config_hash" NOT GLOB '*[^0-9a-f]*' AND length("source_document_captures"."extraction_manifest_hash") = 64 AND "source_document_captures"."extraction_manifest_hash" NOT GLOB '*[^0-9a-f]*' AND length("source_document_captures"."readable_text_hash") = 64 AND "source_document_captures"."readable_text_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "source_document_captures_text_length_check" CHECK("source_document_captures"."readable_text_length" >= 0),
	CONSTRAINT "source_document_captures_extract_offsets_check" CHECK("source_document_captures"."short_extract_start_offset" >= 0 AND "source_document_captures"."short_extract_end_offset" >= "source_document_captures"."short_extract_start_offset" AND "source_document_captures"."short_extract_end_offset" <= "source_document_captures"."readable_text_length")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_document_capture_identity` ON `source_document_captures` (`source_item_version_id`,`snapshot_id`,`extractor_version`,`extractor_config_hash`);--> statement-breakpoint
CREATE INDEX `idx_source_document_captures_item_observed` ON `source_document_captures` (`source_item_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_source_document_captures_audit_event` ON `source_document_captures` (`created_by_audit_event_id`);--> statement-breakpoint
CREATE TABLE `source_document_heads` (
	`source_item_id` text PRIMARY KEY NOT NULL,
	`current_capture_id` text,
	`crawl_state` text DEFAULT 'pending' NOT NULL,
	`next_check_at` text,
	`lease_token` text,
	`lease_expires_at` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_capture_id`) REFERENCES `source_document_captures`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "source_document_heads_state_check" CHECK("source_document_heads"."crawl_state" IN ('pending', 'ready', 'unchanged', 'robots-blocked', 'access-blocked', 'unsupported', 'failed')),
	CONSTRAINT "source_document_heads_attempt_count_check" CHECK("source_document_heads"."attempt_count" >= 0),
	CONSTRAINT "source_document_heads_failure_count_check" CHECK("source_document_heads"."consecutive_failures" >= 0),
	CONSTRAINT "source_document_heads_lease_pair_check" CHECK(("source_document_heads"."lease_token" IS NULL AND "source_document_heads"."lease_expires_at" IS NULL) OR ("source_document_heads"."lease_token" IS NOT NULL AND "source_document_heads"."lease_expires_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_source_document_heads_due` ON `source_document_heads` (`crawl_state`,`next_check_at`);
--> statement-breakpoint
CREATE TRIGGER `robots_policies_insert_guard`
BEFORE INSERT ON `robots_policies`
BEGIN
  SELECT RAISE(ABORT, 'robots policy audit binding is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM audit_events audit
      WHERE audit.id = NEW.created_by_audit_event_id
        AND audit.action = 'robots-policy.observed'
        AND audit.entity_type = 'source-host'
        AND audit.entity_id = NEW.exact_host
        AND json_extract(audit.payload, '$.policyId') = NEW.id
        AND json_extract(audit.payload, '$.rulesHash') = NEW.rules_hash
        AND json_extract(audit.payload, '$.policyState') = NEW.policy_state
   );
END;
--> statement-breakpoint
CREATE TRIGGER `robots_policies_no_update`
BEFORE UPDATE ON `robots_policies`
BEGIN
  SELECT RAISE(ABORT, 'robots policies are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `robots_policies_no_delete`
BEFORE DELETE ON `robots_policies`
BEGIN
  SELECT RAISE(ABORT, 'robots policies are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `robots_policy_heads_target_guard`
BEFORE INSERT ON `robots_policy_heads`
BEGIN
  SELECT RAISE(ABORT, 'robots policy head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM robots_policies policy
      WHERE policy.id = NEW.current_policy_id
        AND policy.exact_host = NEW.exact_host
        AND policy.user_agent_token = NEW.user_agent_token
   );
END;
--> statement-breakpoint
CREATE TRIGGER `robots_policy_heads_update_guard`
BEFORE UPDATE OF current_policy_id ON `robots_policy_heads`
BEGIN
  SELECT RAISE(ABORT, 'robots policy head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM robots_policies policy
      WHERE policy.id = NEW.current_policy_id
        AND policy.exact_host = NEW.exact_host
        AND policy.user_agent_token = NEW.user_agent_token
   );
END;
--> statement-breakpoint
CREATE TRIGGER `source_document_captures_insert_guard`
BEFORE INSERT ON `source_document_captures`
BEGIN
  SELECT RAISE(ABORT, 'document capture provenance is invalid')
   WHERE NOT EXISTS (
     SELECT 1
       FROM source_item_versions version
       JOIN source_items item ON item.id = version.source_item_id
       JOIN sources source ON source.id = item.source_id
       JOIN source_snapshots snapshot ON snapshot.id = NEW.snapshot_id
      WHERE version.id = NEW.source_item_version_id
        AND version.source_item_id = NEW.source_item_id
        AND snapshot.item_id = NEW.source_item_id
        AND snapshot.source_id = item.source_id
        AND snapshot.ingestion_run_id = NEW.ingestion_run_id
        AND snapshot.retention_outcome = NEW.retention_outcome
        AND source.active = 1
        AND source.rights_state = NEW.rights_state
        AND (
          (NEW.retention_outcome = 'metadata-only' AND snapshot.storage_key IS NULL)
          OR (
            NEW.retention_outcome = 'stored-private'
            AND source.store_full_content = 1
            AND source.rights_state = 'public-record'
            AND snapshot.storage_key IS NOT NULL
          )
        )
   );
  SELECT RAISE(ABORT, 'document capture audit binding is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM audit_events audit
      WHERE audit.id = NEW.created_by_audit_event_id
        AND audit.action = 'source-document.captured'
        AND audit.entity_type = 'source-item'
        AND audit.entity_id = NEW.source_item_id
        AND json_extract(audit.payload, '$.documentCaptureId') = NEW.id
        AND json_extract(audit.payload, '$.snapshotId') = NEW.snapshot_id
        AND json_extract(audit.payload, '$.sourceItemVersionId') = NEW.source_item_version_id
        AND json_extract(audit.payload, '$.manifestHash') = NEW.extraction_manifest_hash
        AND json_extract(audit.payload, '$.textHash') = NEW.readable_text_hash
   );
END;
--> statement-breakpoint
CREATE TRIGGER `source_document_captures_no_update`
BEFORE UPDATE ON `source_document_captures`
BEGIN
  SELECT RAISE(ABORT, 'source document captures are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `source_document_captures_no_delete`
BEFORE DELETE ON `source_document_captures`
BEGIN
  SELECT RAISE(ABORT, 'source document captures are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `source_document_heads_target_guard`
BEFORE INSERT ON `source_document_heads`
WHEN NEW.current_capture_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'document head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM source_document_captures capture
      WHERE capture.id = NEW.current_capture_id
        AND capture.source_item_id = NEW.source_item_id
   );
END;
--> statement-breakpoint
CREATE TRIGGER `source_document_heads_update_guard`
BEFORE UPDATE OF current_capture_id ON `source_document_heads`
WHEN NEW.current_capture_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'document head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM source_document_captures capture
      WHERE capture.id = NEW.current_capture_id
        AND capture.source_item_id = NEW.source_item_id
   );
END;
