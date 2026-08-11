CREATE TABLE `machine_analysis_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`result_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`association_kind` text NOT NULL,
	`mention_text` text NOT NULL,
	`mention_hash` text NOT NULL,
	`block_id` text NOT NULL,
	`block_hash` text NOT NULL,
	`text_start_offset` integer NOT NULL,
	`text_end_offset` integer NOT NULL,
	`raw_start_offset` integer NOT NULL,
	`raw_end_offset` integer NOT NULL,
	`confidence` real NOT NULL,
	`signal_source` text NOT NULL,
	`signal_basis_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `machine_analysis_results`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "machine_analysis_entities_type_check" CHECK("machine_analysis_entities"."entity_type" IN ('candidacy', 'topic', 'constituency')),
	CONSTRAINT "machine_analysis_entities_kind_check" CHECK("machine_analysis_entities"."association_kind" IN ('mentioned', 'subject', 'context')),
	CONSTRAINT "machine_analysis_entities_signal_check" CHECK("machine_analysis_entities"."signal_source" IN ('collection-assessment', 'deterministic-text-match', 'item-entity-revalidated')),
	CONSTRAINT "machine_analysis_entities_offsets_check" CHECK("machine_analysis_entities"."text_start_offset" >= 0 AND "machine_analysis_entities"."text_end_offset" > "machine_analysis_entities"."text_start_offset"
        AND "machine_analysis_entities"."raw_start_offset" >= 0 AND "machine_analysis_entities"."raw_end_offset" > "machine_analysis_entities"."raw_start_offset"),
	CONSTRAINT "machine_analysis_entities_confidence_check" CHECK("machine_analysis_entities"."confidence" >= 0 AND "machine_analysis_entities"."confidence" <= 1),
	CONSTRAINT "machine_analysis_entities_hashes_check" CHECK(length("machine_analysis_entities"."mention_hash") = 64 AND "machine_analysis_entities"."mention_hash" NOT GLOB '*[^0-9a-f]*'
        AND length("machine_analysis_entities"."block_hash") = 64 AND "machine_analysis_entities"."block_hash" NOT GLOB '*[^0-9a-f]*'
        AND length("machine_analysis_entities"."signal_basis_hash") = 64 AND "machine_analysis_entities"."signal_basis_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_machine_analysis_entity_span` ON `machine_analysis_entities` (`result_id`,`entity_type`,`entity_id`,`block_id`,`text_start_offset`,`text_end_offset`);--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_entities_entity` ON `machine_analysis_entities` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `machine_analysis_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`result_id` text NOT NULL,
	`proposition_key` text NOT NULL,
	`finding_kind` text NOT NULL,
	`candidacy_id` text,
	`topic_id` text NOT NULL,
	`constituency_id` text,
	`proposition_text` text NOT NULL,
	`stance` text,
	`stance_basis` text DEFAULT 'none' NOT NULL,
	`quote` text NOT NULL,
	`quote_hash` text NOT NULL,
	`block_id` text NOT NULL,
	`block_hash` text NOT NULL,
	`text_start_offset` integer NOT NULL,
	`text_end_offset` integer NOT NULL,
	`raw_start_offset` integer NOT NULL,
	`raw_end_offset` integer NOT NULL,
	`confidence` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `machine_analysis_results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `policy_topics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`constituency_id`) REFERENCES `constituencies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "machine_analysis_findings_kind_check" CHECK("machine_analysis_findings"."finding_kind" IN ('reported-passage', 'explicit-statement', 'policy-proposal', 'record-fact')),
	CONSTRAINT "machine_analysis_findings_stance_check" CHECK(("machine_analysis_findings"."stance" IS NULL AND "machine_analysis_findings"."stance_basis" = 'none') OR ("machine_analysis_findings"."stance" IN ('supports', 'opposes', 'mixed', 'conditional', 'unclear') AND "machine_analysis_findings"."stance_basis" IN ('explicit-language', 'human-reviewed'))),
	CONSTRAINT "machine_analysis_findings_offsets_check" CHECK("machine_analysis_findings"."text_start_offset" >= 0 AND "machine_analysis_findings"."text_end_offset" > "machine_analysis_findings"."text_start_offset"
        AND "machine_analysis_findings"."raw_start_offset" >= 0 AND "machine_analysis_findings"."raw_end_offset" > "machine_analysis_findings"."raw_start_offset"),
	CONSTRAINT "machine_analysis_findings_confidence_check" CHECK("machine_analysis_findings"."confidence" >= 0 AND "machine_analysis_findings"."confidence" <= 1),
	CONSTRAINT "machine_analysis_findings_quote_check" CHECK(length("machine_analysis_findings"."quote") BETWEEN 1 AND 500 AND length("machine_analysis_findings"."proposition_text") BETWEEN 1 AND 600),
	CONSTRAINT "machine_analysis_findings_hashes_check" CHECK(length("machine_analysis_findings"."quote_hash") = 64 AND "machine_analysis_findings"."quote_hash" NOT GLOB '*[^0-9a-f]*'
        AND length("machine_analysis_findings"."block_hash") = 64 AND "machine_analysis_findings"."block_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_machine_analysis_finding_proposition` ON `machine_analysis_findings` (`result_id`,`proposition_key`);--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_findings_candidate_topic` ON `machine_analysis_findings` (`candidacy_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `machine_analysis_heads` (
	`source_item_id` text PRIMARY KEY NOT NULL,
	`current_input_id` text NOT NULL,
	`latest_result_id` text NOT NULL,
	`published_result_id` text,
	`analysis_state` text NOT NULL,
	`publication_state` text NOT NULL,
	`updated_by_audit_event_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_input_id`) REFERENCES `machine_analysis_inputs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`latest_result_id`) REFERENCES `machine_analysis_results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_result_id`) REFERENCES `machine_analysis_results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "machine_analysis_heads_analysis_check" CHECK("machine_analysis_heads"."analysis_state" IN ('queued', 'ready', 'held', 'failed', 'stale')),
	CONSTRAINT "machine_analysis_heads_publication_check" CHECK("machine_analysis_heads"."publication_state" IN ('private', 'published', 'withheld')),
	CONSTRAINT "machine_analysis_heads_publish_check" CHECK("machine_analysis_heads"."publication_state" != 'published' OR ("machine_analysis_heads"."analysis_state" = 'ready' AND "machine_analysis_heads"."published_result_id" IS NOT NULL AND "machine_analysis_heads"."published_result_id" = "machine_analysis_heads"."latest_result_id"))
);
--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_heads_state` ON `machine_analysis_heads` (`analysis_state`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_heads_publication` ON `machine_analysis_heads` (`publication_state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `machine_analysis_inputs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_item_id` text NOT NULL,
	`source_item_version_id` text NOT NULL,
	`document_capture_id` text NOT NULL,
	`source_snapshot_id` text NOT NULL,
	`raw_content_hash` text NOT NULL,
	`text_hash` text NOT NULL,
	`extractor_config_hash` text NOT NULL,
	`input_schema_version` text NOT NULL,
	`block_manifest_json` text NOT NULL,
	`block_manifest_hash` text NOT NULL,
	`association_basis_json` text NOT NULL,
	`association_basis_hash` text NOT NULL,
	`collection_reason_hash` text NOT NULL,
	`collection_ruleset_id` text NOT NULL,
	`collection_route` text NOT NULL,
	`created_by_audit_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_item_version_id`) REFERENCES `source_item_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_capture_id`) REFERENCES `source_document_captures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "machine_analysis_inputs_route_check" CHECK("machine_analysis_inputs"."collection_route" IN ('evidence-review', 'context-monitoring')),
	CONSTRAINT "machine_analysis_inputs_json_check" CHECK(json_valid("machine_analysis_inputs"."block_manifest_json") AND json_valid("machine_analysis_inputs"."association_basis_json")),
	CONSTRAINT "machine_analysis_inputs_hashes_check" CHECK(length("machine_analysis_inputs"."raw_content_hash") = 64 AND "machine_analysis_inputs"."raw_content_hash" NOT GLOB '*[^0-9a-f]*'
        AND length("machine_analysis_inputs"."text_hash") = 64 AND "machine_analysis_inputs"."text_hash" NOT GLOB '*[^0-9a-f]*'
        AND length("machine_analysis_inputs"."extractor_config_hash") = 64 AND "machine_analysis_inputs"."extractor_config_hash" NOT GLOB '*[^0-9a-f]*'
        AND length("machine_analysis_inputs"."block_manifest_hash") = 64 AND "machine_analysis_inputs"."block_manifest_hash" NOT GLOB '*[^0-9a-f]*'
        AND length("machine_analysis_inputs"."association_basis_hash") = 64 AND "machine_analysis_inputs"."association_basis_hash" NOT GLOB '*[^0-9a-f]*'
        AND length("machine_analysis_inputs"."collection_reason_hash") = 64 AND "machine_analysis_inputs"."collection_reason_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_machine_analysis_input_identity` ON `machine_analysis_inputs` (`document_capture_id`,`block_manifest_hash`,`association_basis_hash`,`input_schema_version`);--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_inputs_source_version` ON `machine_analysis_inputs` (`source_item_id`,`source_item_version_id`);--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_inputs_audit` ON `machine_analysis_inputs` (`created_by_audit_event_id`);--> statement-breakpoint
CREATE TABLE `machine_analysis_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_item_id` text NOT NULL,
	`source_item_version_id` text NOT NULL,
	`document_capture_id` text NOT NULL,
	`analyzer_config_hash` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`lease_token` text,
	`lease_expires_at` text,
	`result_id` text,
	`last_error_code` text,
	`last_error_summary` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_item_version_id`) REFERENCES `source_item_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_capture_id`) REFERENCES `source_document_captures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`result_id`) REFERENCES `machine_analysis_results`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "machine_analysis_jobs_status_check" CHECK("machine_analysis_jobs"."status" IN ('queued', 'running', 'retrying', 'succeeded', 'failed', 'quarantined')),
	CONSTRAINT "machine_analysis_jobs_attempt_check" CHECK("machine_analysis_jobs"."attempt_count" >= 0),
	CONSTRAINT "machine_analysis_jobs_lease_check" CHECK(("machine_analysis_jobs"."lease_token" IS NULL AND "machine_analysis_jobs"."lease_expires_at" IS NULL) OR ("machine_analysis_jobs"."lease_token" IS NOT NULL AND "machine_analysis_jobs"."lease_expires_at" IS NOT NULL)),
	CONSTRAINT "machine_analysis_jobs_result_check" CHECK("machine_analysis_jobs"."status" != 'succeeded' OR "machine_analysis_jobs"."result_id" IS NOT NULL),
	CONSTRAINT "machine_analysis_jobs_config_hash_check" CHECK(length("machine_analysis_jobs"."analyzer_config_hash") = 64 AND "machine_analysis_jobs"."analyzer_config_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_machine_analysis_job_identity` ON `machine_analysis_jobs` (`document_capture_id`,`analyzer_config_hash`);--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_jobs_due` ON `machine_analysis_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `machine_analysis_results` (
	`id` text PRIMARY KEY NOT NULL,
	`input_id` text NOT NULL,
	`result_version` integer NOT NULL,
	`supersedes_result_id` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`model_version` text NOT NULL,
	`method` text NOT NULL,
	`prompt_id` text NOT NULL,
	`prompt_version` text NOT NULL,
	`prompt_hash` text NOT NULL,
	`schema_version` text NOT NULL,
	`result_json` text NOT NULL,
	`result_hash` text NOT NULL,
	`overall_confidence` real NOT NULL,
	`gate_status` text NOT NULL,
	`gate_code` text NOT NULL,
	`machine_label` text NOT NULL,
	`created_by_audit_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`input_id`) REFERENCES `machine_analysis_inputs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supersedes_result_id`) REFERENCES `machine_analysis_results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "machine_analysis_results_version_check" CHECK("machine_analysis_results"."result_version" >= 1),
	CONSTRAINT "machine_analysis_results_confidence_check" CHECK("machine_analysis_results"."overall_confidence" >= 0 AND "machine_analysis_results"."overall_confidence" <= 1),
	CONSTRAINT "machine_analysis_results_gate_check" CHECK("machine_analysis_results"."gate_status" IN ('eligible', 'held')),
	CONSTRAINT "machine_analysis_results_label_check" CHECK("machine_analysis_results"."machine_label" IN ('automatic-extractive', 'ai-assisted-draft')),
	CONSTRAINT "machine_analysis_results_auto_gate_check" CHECK("machine_analysis_results"."gate_status" != 'eligible' OR ("machine_analysis_results"."machine_label" = 'automatic-extractive' AND "machine_analysis_results"."method" = 'deterministic-extractive-v1')),
	CONSTRAINT "machine_analysis_results_json_check" CHECK(json_valid("machine_analysis_results"."result_json")),
	CONSTRAINT "machine_analysis_results_hashes_check" CHECK(length("machine_analysis_results"."prompt_hash") = 64 AND "machine_analysis_results"."prompt_hash" NOT GLOB '*[^0-9a-f]*'
        AND length("machine_analysis_results"."result_hash") = 64 AND "machine_analysis_results"."result_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_machine_analysis_result_version` ON `machine_analysis_results` (`input_id`,`result_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_machine_analysis_result_superseded_once` ON `machine_analysis_results` (`supersedes_result_id`) WHERE "machine_analysis_results"."supersedes_result_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_results_gate` ON `machine_analysis_results` (`gate_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_results_audit` ON `machine_analysis_results` (`created_by_audit_event_id`);--> statement-breakpoint
CREATE TABLE `machine_analysis_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`result_id` text NOT NULL,
	`review_id` text NOT NULL,
	`verifier_id` text NOT NULL,
	`rationale` text NOT NULL,
	`rationale_hash` text NOT NULL,
	`created_by_audit_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `machine_analysis_results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "machine_analysis_verifications_rationale_check" CHECK(length(trim("machine_analysis_verifications"."rationale")) BETWEEN 8 AND 2000),
	CONSTRAINT "machine_analysis_verifications_hash_check" CHECK(length("machine_analysis_verifications"."rationale_hash") = 64 AND "machine_analysis_verifications"."rationale_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_machine_analysis_verification_review` ON `machine_analysis_verifications` (`review_id`);--> statement-breakpoint
CREATE INDEX `idx_machine_analysis_verifications_result` ON `machine_analysis_verifications` (`result_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `machine_analysis_inputs_insert_guard`
BEFORE INSERT ON `machine_analysis_inputs`
BEGIN
  SELECT RAISE(ABORT, 'machine analysis input provenance is stale or invalid')
   WHERE NOT EXISTS (
     SELECT 1
       FROM source_document_captures capture
       JOIN source_document_heads document_head
         ON document_head.source_item_id = capture.source_item_id
        AND document_head.current_capture_id = capture.id
       JOIN source_item_versions version ON version.id = capture.source_item_version_id
       JOIN source_items item
         ON item.id = version.source_item_id
        AND item.latest_version_id = version.id
        AND item.content_hash = version.payload_hash
       JOIN source_snapshots snapshot ON snapshot.id = capture.snapshot_id
       JOIN sources source ON source.id = item.source_id
       JOIN source_item_version_collection_assessments assessment
         ON assessment.source_item_version_id = version.id
       JOIN audit_events relevance_audit
         ON relevance_audit.id = assessment.created_by_audit_event_id
        AND relevance_audit.action = 'source-item.relevance-assessed'
        AND relevance_audit.entity_type = 'source-item-version'
        AND relevance_audit.entity_id = version.id
      WHERE capture.id = NEW.document_capture_id
        AND capture.source_item_id = NEW.source_item_id
        AND capture.source_item_version_id = NEW.source_item_version_id
        AND capture.snapshot_id = NEW.source_snapshot_id
        AND snapshot.item_id = item.id
        AND snapshot.content_hash = NEW.raw_content_hash
        AND capture.readable_text_hash = NEW.text_hash
        AND capture.extractor_config_hash = NEW.extractor_config_hash
        AND source.active = 1
        AND source.source_tier BETWEEN 1 AND 3
        AND source.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
        AND capture.rights_state = source.rights_state
        AND snapshot.capture_url GLOB 'https://*'
        AND snapshot.capture_url NOT GLOB '*@*'
        AND snapshot.resolved_url GLOB 'https://*'
        AND snapshot.resolved_url NOT GLOB '*@*'
        AND assessment.route IN ('evidence-review', 'context-monitoring')
        AND assessment.route = NEW.collection_route
        AND assessment.ruleset_id = NEW.collection_ruleset_id
        AND assessment.canonical_reason_hash = NEW.collection_reason_hash
        AND json_extract(relevance_audit.payload, '$.sourceItemId') = item.id
        AND json_extract(relevance_audit.payload, '$.collectionReasonHash') = assessment.canonical_reason_hash
        AND json_extract(relevance_audit.payload, '$.collectionRoute') = assessment.route
        AND json_extract(relevance_audit.payload, '$.collectionRuleset') = assessment.ruleset_id
        AND json_array_length(NEW.block_manifest_json) = json_array_length(
          json_extract(capture.extraction_manifest_json, '$.blocks')
        )
        AND NOT EXISTS (
          SELECT 1
            FROM json_each(NEW.block_manifest_json) input_block
           WHERE NOT EXISTS (
             SELECT 1
               FROM json_each(capture.extraction_manifest_json, '$.blocks') capture_block
              WHERE json_extract(capture_block.value, '$.id') = json_extract(input_block.value, '$.id')
                AND json_extract(capture_block.value, '$.hash') = json_extract(input_block.value, '$.hash')
                AND json_extract(capture_block.value, '$.index') = json_extract(input_block.value, '$.index')
                AND json_extract(capture_block.value, '$.kind') = json_extract(input_block.value, '$.kind')
                AND json_extract(capture_block.value, '$.textStart') = json_extract(input_block.value, '$.textStart')
                AND json_extract(capture_block.value, '$.textEnd') = json_extract(input_block.value, '$.textEnd')
                AND json_extract(capture_block.value, '$.rawByteStart') = json_extract(input_block.value, '$.rawStart')
                AND json_extract(capture_block.value, '$.rawByteEnd') = json_extract(input_block.value, '$.rawEnd')
           )
        )
   );
  SELECT RAISE(ABORT, 'machine analysis input audit binding is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM audit_events audit
      WHERE audit.id = NEW.created_by_audit_event_id
        AND audit.action = 'machine-analysis.completed'
        AND audit.entity_type = 'machine-analysis-result'
        AND json_extract(audit.payload, '$.inputId') = NEW.id
        AND json_extract(audit.payload, '$.sourceItemId') = NEW.source_item_id
        AND json_extract(audit.payload, '$.sourceItemVersionId') = NEW.source_item_version_id
        AND json_extract(audit.payload, '$.documentCaptureId') = NEW.document_capture_id
        AND json_extract(audit.payload, '$.blockManifestHash') = NEW.block_manifest_hash
        AND json_extract(audit.payload, '$.associationBasisHash') = NEW.association_basis_hash
   );
END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_inputs_no_update`
BEFORE UPDATE ON `machine_analysis_inputs`
BEGIN SELECT RAISE(ABORT, 'machine analysis inputs are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_inputs_no_delete`
BEFORE DELETE ON `machine_analysis_inputs`
BEGIN SELECT RAISE(ABORT, 'machine analysis inputs are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_results_insert_guard`
BEFORE INSERT ON `machine_analysis_results`
BEGIN
  SELECT RAISE(ABORT, 'machine analysis result audit binding is invalid')
   WHERE NOT EXISTS (
     SELECT 1
       FROM machine_analysis_inputs input
       JOIN audit_events audit ON audit.id = NEW.created_by_audit_event_id
      WHERE input.id = NEW.input_id
        AND audit.action = 'machine-analysis.completed'
        AND audit.entity_type = 'machine-analysis-result'
        AND audit.entity_id = NEW.id
        AND json_extract(audit.payload, '$.inputId') = input.id
        AND json_extract(audit.payload, '$.resultId') = NEW.id
        AND json_extract(audit.payload, '$.resultHash') = NEW.result_hash
        AND json_extract(audit.payload, '$.gateStatus') = NEW.gate_status
   );
  SELECT RAISE(ABORT, 'machine analysis result version chain is invalid')
   WHERE (
     NEW.supersedes_result_id IS NULL
     AND (
       NEW.result_version != 1
       OR EXISTS (SELECT 1 FROM machine_analysis_results prior WHERE prior.input_id = NEW.input_id)
     )
   ) OR (
     NEW.supersedes_result_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM machine_analysis_results prior
        WHERE prior.id = NEW.supersedes_result_id
          AND prior.input_id = NEW.input_id
          AND NEW.result_version = prior.result_version + 1
          AND NOT EXISTS (
            SELECT 1 FROM machine_analysis_results successor
             WHERE successor.supersedes_result_id = prior.id
          )
     )
   );
END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_results_no_update`
BEFORE UPDATE ON `machine_analysis_results`
BEGIN SELECT RAISE(ABORT, 'machine analysis results are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_results_no_delete`
BEFORE DELETE ON `machine_analysis_results`
BEGIN SELECT RAISE(ABORT, 'machine analysis results are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_entities_insert_guard`
BEFORE INSERT ON `machine_analysis_entities`
BEGIN
  SELECT RAISE(ABORT, 'machine analysis entity is not present in the frozen input basis')
   WHERE NOT EXISTS (
     SELECT 1
       FROM machine_analysis_results result
       JOIN machine_analysis_inputs input ON input.id = result.input_id
       JOIN json_each(input.block_manifest_json) block
      WHERE result.id = NEW.result_id
        AND json_extract(block.value, '$.id') = NEW.block_id
        AND json_extract(block.value, '$.hash') = NEW.block_hash
        AND NEW.text_start_offset >= json_extract(block.value, '$.textStart')
        AND NEW.text_end_offset <= json_extract(block.value, '$.textEnd')
        AND NEW.raw_start_offset >= json_extract(block.value, '$.rawStart')
        AND NEW.raw_end_offset <= json_extract(block.value, '$.rawEnd')
        AND EXISTS (
          SELECT 1 FROM json_tree(input.association_basis_json) basis
           WHERE basis.key = 'signalBasisHash'
             AND basis.value = NEW.signal_basis_hash
        )
        AND EXISTS (
          SELECT 1 FROM json_each(result.result_json, '$.entities') result_entity
           WHERE json_extract(result_entity.value, '$.id') = NEW.id
             AND json_extract(result_entity.value, '$.entityType') = NEW.entity_type
             AND json_extract(result_entity.value, '$.entityId') = NEW.entity_id
             AND json_extract(result_entity.value, '$.associationKind') = NEW.association_kind
             AND json_extract(result_entity.value, '$.mentionText') = NEW.mention_text
             AND json_extract(result_entity.value, '$.mentionHash') = NEW.mention_hash
             AND json_extract(result_entity.value, '$.blockId') = NEW.block_id
             AND json_extract(result_entity.value, '$.blockHash') = NEW.block_hash
             AND json_extract(result_entity.value, '$.textStart') = NEW.text_start_offset
             AND json_extract(result_entity.value, '$.textEnd') = NEW.text_end_offset
             AND json_extract(result_entity.value, '$.rawBlockStart') = NEW.raw_start_offset
             AND json_extract(result_entity.value, '$.rawBlockEnd') = NEW.raw_end_offset
             AND json_extract(result_entity.value, '$.confidence') = NEW.confidence
             AND json_extract(result_entity.value, '$.signalSource') = NEW.signal_source
             AND json_extract(result_entity.value, '$.signalBasisHash') = NEW.signal_basis_hash
        )
   );
  SELECT RAISE(ABORT, 'machine analysis entity target is invalid')
   WHERE (NEW.entity_type = 'candidacy' AND NOT EXISTS (
     SELECT 1 FROM candidacies WHERE id = NEW.entity_id AND declaration_status != 'source-removed'
   )) OR (NEW.entity_type = 'topic' AND NOT EXISTS (
     SELECT 1 FROM policy_topics WHERE id = NEW.entity_id AND active = 1
   )) OR (NEW.entity_type = 'constituency' AND NOT EXISTS (
     SELECT 1 FROM constituencies WHERE id = NEW.entity_id
   ));
END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_entities_no_update`
BEFORE UPDATE ON `machine_analysis_entities`
BEGIN SELECT RAISE(ABORT, 'machine analysis entities are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_entities_no_delete`
BEFORE DELETE ON `machine_analysis_entities`
BEGIN SELECT RAISE(ABORT, 'machine analysis entities are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_findings_insert_guard`
BEFORE INSERT ON `machine_analysis_findings`
BEGIN
  SELECT RAISE(ABORT, 'machine analysis finding locator does not match its frozen block')
   WHERE NOT EXISTS (
     SELECT 1
       FROM machine_analysis_results result
       JOIN machine_analysis_inputs input ON input.id = result.input_id
       JOIN json_each(input.block_manifest_json) block
      WHERE result.id = NEW.result_id
        AND json_extract(block.value, '$.id') = NEW.block_id
        AND json_extract(block.value, '$.hash') = NEW.block_hash
        AND NEW.quote_hash = json_extract(block.value, '$.textHash')
        AND NEW.text_start_offset = json_extract(block.value, '$.textStart')
        AND NEW.text_end_offset = json_extract(block.value, '$.textEnd')
        AND NEW.raw_start_offset = json_extract(block.value, '$.rawStart')
        AND NEW.raw_end_offset = json_extract(block.value, '$.rawEnd')
        AND EXISTS (
          SELECT 1 FROM json_each(result.result_json, '$.findings') result_finding
           WHERE json_extract(result_finding.value, '$.id') = NEW.id
             AND json_extract(result_finding.value, '$.propositionKey') = NEW.proposition_key
             AND json_extract(result_finding.value, '$.findingKind') = NEW.finding_kind
             AND json_extract(result_finding.value, '$.candidacyId') IS NEW.candidacy_id
             AND json_extract(result_finding.value, '$.topicId') = NEW.topic_id
             AND json_extract(result_finding.value, '$.constituencyId') IS NEW.constituency_id
             AND json_extract(result_finding.value, '$.propositionText') = NEW.proposition_text
             AND json_extract(result_finding.value, '$.stance') IS NEW.stance
             AND json_extract(result_finding.value, '$.stanceBasis') = NEW.stance_basis
             AND json_extract(result_finding.value, '$.quote') = NEW.quote
             AND json_extract(result_finding.value, '$.quoteHash') = NEW.quote_hash
             AND json_extract(result_finding.value, '$.blockId') = NEW.block_id
             AND json_extract(result_finding.value, '$.blockHash') = NEW.block_hash
             AND json_extract(result_finding.value, '$.textStart') = NEW.text_start_offset
             AND json_extract(result_finding.value, '$.textEnd') = NEW.text_end_offset
             AND json_extract(result_finding.value, '$.rawBlockStart') = NEW.raw_start_offset
             AND json_extract(result_finding.value, '$.rawBlockEnd') = NEW.raw_end_offset
             AND json_extract(result_finding.value, '$.confidence') = NEW.confidence
        )
   );
  SELECT RAISE(ABORT, 'machine analysis finding must have matching structured associations')
   WHERE NOT EXISTS (
     SELECT 1 FROM machine_analysis_entities topic
      WHERE topic.result_id = NEW.result_id
        AND topic.entity_type = 'topic'
        AND topic.entity_id = NEW.topic_id
        AND topic.block_id = NEW.block_id
   ) OR (
     NEW.candidacy_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM machine_analysis_entities candidate
        WHERE candidate.result_id = NEW.result_id
          AND candidate.entity_type = 'candidacy'
          AND candidate.entity_id = NEW.candidacy_id
          AND (
            candidate.association_kind = 'subject'
            OR candidate.block_id = NEW.block_id
          )
     )
   );
  SELECT RAISE(ABORT, 'automatically publishable findings cannot infer stance')
   WHERE EXISTS (
     SELECT 1 FROM machine_analysis_results result
      WHERE result.id = NEW.result_id
        AND result.gate_status = 'eligible'
        AND (NEW.stance IS NOT NULL OR NEW.stance_basis != 'none')
   );
END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_findings_no_update`
BEFORE UPDATE ON `machine_analysis_findings`
BEGIN SELECT RAISE(ABORT, 'machine analysis findings are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_findings_no_delete`
BEFORE DELETE ON `machine_analysis_findings`
BEGIN SELECT RAISE(ABORT, 'machine analysis findings are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `reviews_machine_analysis_result_guard`
BEFORE INSERT ON `reviews`
WHEN NEW.target_type = 'machine-analysis-result'
BEGIN
  SELECT RAISE(ABORT, 'machine analysis review target is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM machine_analysis_results result
      WHERE result.id = NEW.target_id
   );
  SELECT RAISE(ABORT, 'automatic machine analysis approval is invalid')
   WHERE NEW.supersedes_review_id IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM machine_analysis_results result
         JOIN audit_events audit ON audit.id = result.created_by_audit_event_id
        WHERE result.id = NEW.target_id
          AND result.gate_status = 'eligible'
          AND result.machine_label = 'automatic-extractive'
          AND NEW.decision = 'approved'
          AND NEW.reviewer_id = 'machine-analysis:auto:v1'
          AND audit.action = 'machine-analysis.completed'
          AND json_extract(audit.payload, '$.reviewId') = NEW.id
     );
  SELECT RAISE(ABORT, 'machine analysis human decision audit binding is invalid')
   WHERE NEW.supersedes_review_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM audit_events audit
         JOIN machine_analysis_heads head ON head.latest_result_id = NEW.target_id
        WHERE audit.action = 'machine-analysis.reviewed'
          AND audit.entity_type = 'machine-analysis-result'
          AND audit.entity_id = NEW.target_id
          AND json_extract(audit.payload, '$.reviewId') = NEW.id
          AND json_extract(audit.payload, '$.decision') = NEW.decision
          AND json_extract(audit.payload, '$.supersedesReviewId') = NEW.supersedes_review_id
          AND NEW.reviewer_id != 'machine-analysis:auto:v1'
          AND (
            (NEW.decision = 'rejected' AND head.published_result_id = NEW.target_id)
            OR (NEW.decision = 'approved' AND head.published_result_id IS NULL)
          )
     );
END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_heads_insert_guard`
BEFORE INSERT ON `machine_analysis_heads`
BEGIN
  SELECT RAISE(ABORT, 'machine analysis head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1
       FROM machine_analysis_results result
       JOIN machine_analysis_inputs input ON input.id = result.input_id
       JOIN audit_events audit ON audit.id = NEW.updated_by_audit_event_id
      WHERE result.id = NEW.latest_result_id
        AND input.id = NEW.current_input_id
        AND input.source_item_id = NEW.source_item_id
        AND result.created_by_audit_event_id = audit.id
        AND audit.action = 'machine-analysis.completed'
        AND audit.entity_type = 'machine-analysis-result'
        AND audit.entity_id = result.id
        AND json_extract(audit.payload, '$.inputId') = input.id
        AND json_extract(audit.payload, '$.resultId') = result.id
        AND json_extract(audit.payload, '$.latestResultId') = result.id
        AND json_extract(audit.payload, '$.publishedResultId') IS NEW.published_result_id
        AND json_extract(audit.payload, '$.headPublicationState') = NEW.publication_state
   );
  SELECT RAISE(ABORT, 'machine analysis publication is not eligible')
   WHERE NEW.publication_state = 'published'
     AND NOT EXISTS (
       SELECT 1
         FROM machine_analysis_results result
         JOIN machine_analysis_inputs input ON input.id = result.input_id
         JOIN source_document_heads document_head
           ON document_head.source_item_id = input.source_item_id
          AND document_head.current_capture_id = input.document_capture_id
         JOIN source_items item
           ON item.id = input.source_item_id
          AND item.latest_version_id = input.source_item_version_id
         JOIN source_item_versions version
           ON version.id = input.source_item_version_id
          AND version.source_item_id = item.id
          AND item.content_hash = version.payload_hash
         JOIN sources source ON source.id = item.source_id
         JOIN reviews review
           ON review.target_type = 'machine-analysis-result'
          AND review.target_id = result.id
          AND review.decision = 'approved'
        WHERE result.id = NEW.published_result_id
          AND result.id = NEW.latest_result_id
          AND result.gate_status = 'eligible'
          AND result.machine_label = 'automatic-extractive'
          AND source.active = 1
          AND source.source_tier BETWEEN 1 AND 3
          AND source.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
          AND source.rights_state = (
            SELECT capture.rights_state FROM source_document_captures capture
             WHERE capture.id = input.document_capture_id
          )
          AND NOT EXISTS (SELECT 1 FROM reviews successor WHERE successor.supersedes_review_id = review.id)
          AND EXISTS (SELECT 1 FROM machine_analysis_findings finding WHERE finding.result_id = result.id)
          AND NOT EXISTS (
            SELECT 1 FROM machine_analysis_findings unsafe
             WHERE unsafe.result_id = result.id
               AND (unsafe.stance IS NOT NULL OR unsafe.stance_basis != 'none')
          )
          AND NOT EXISTS (
            SELECT 1 FROM machine_analysis_findings long_extract
             WHERE long_extract.result_id = result.id
               AND source.rights_state IN ('restricted-copy', 'metadata-only')
               AND (
                 length(long_extract.quote) > 280
                 OR (
                   length(trim(replace(long_extract.quote, char(10), ' ')))
                   - length(replace(trim(replace(long_extract.quote, char(10), ' ')), ' ', ''))
                   + 1
                 ) > 25
               )
          )
          AND NOT EXISTS (
            SELECT 1
              FROM machine_analysis_findings candidate_finding
             WHERE candidate_finding.result_id = result.id
               AND candidate_finding.candidacy_id IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM candidate_profiles profile
                  WHERE profile.candidacy_id = candidate_finding.candidacy_id
                    AND profile.current_basis_hash IS NOT NULL
                    AND profile.review_state = 'approved'
                    AND profile.publication_state = 'published'
                    AND EXISTS (
                      SELECT 1 FROM candidacies publishable_candidacy
                       WHERE publishable_candidacy.id = profile.candidacy_id
                         AND publishable_candidacy.declaration_status = 'prospective'
                    )
                    AND EXISTS (
                      SELECT 1 FROM reviews profile_review
                       WHERE profile_review.target_type = 'candidate-profile-version'
                         AND profile_review.target_id = profile.current_basis_hash
                         AND profile_review.decision = 'approved'
                         AND NOT EXISTS (
                           SELECT 1 FROM reviews profile_successor
                            WHERE profile_successor.supersedes_review_id = profile_review.id
                         )
                         AND EXISTS (
                           SELECT 1 FROM audit_events profile_audit
                            WHERE profile_audit.action = 'candidate-profile.reviewed'
                              AND profile_audit.entity_type = 'candidate-profile'
                              AND profile_audit.entity_id = profile.candidacy_id
                              AND json_extract(profile_audit.payload, '$.reviewId') = profile_review.id
                              AND json_extract(profile_audit.payload, '$.basisHash') = profile.current_basis_hash
                              AND json_extract(profile_audit.payload, '$.decision') = 'approved'
                         )
                    )
               )
          )
     );
END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_heads_update_guard`
BEFORE UPDATE OF current_input_id, latest_result_id, published_result_id,
  analysis_state, publication_state, updated_by_audit_event_id, updated_at
ON `machine_analysis_heads`
BEGIN
  SELECT RAISE(ABORT, 'machine analysis head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1
       FROM machine_analysis_results result
       JOIN machine_analysis_inputs input ON input.id = result.input_id
       JOIN audit_events audit ON audit.id = NEW.updated_by_audit_event_id
      WHERE result.id = NEW.latest_result_id
        AND input.id = NEW.current_input_id
        AND input.source_item_id = NEW.source_item_id
        AND audit.entity_type = 'machine-analysis-result'
        AND audit.entity_id = result.id
        AND json_extract(audit.payload, '$.inputId') = input.id
        AND json_extract(audit.payload, '$.resultId') = result.id
        AND json_extract(audit.payload, '$.latestResultId') = result.id
        AND json_extract(audit.payload, '$.publishedResultId') IS NEW.published_result_id
        AND json_extract(audit.payload, '$.headPublicationState') = NEW.publication_state
        AND (
          (
            audit.action = 'machine-analysis.completed'
            AND result.created_by_audit_event_id = audit.id
          )
          OR (
            audit.action = 'machine-analysis.reviewed'
            AND json_extract(audit.payload, '$.previousPublishedResultId') IS OLD.published_result_id
            AND json_extract(audit.payload, '$.sourceItemId') = NEW.source_item_id
            AND EXISTS (
              SELECT 1 FROM reviews transition_review
               WHERE transition_review.id = json_extract(audit.payload, '$.reviewId')
                 AND transition_review.target_type = 'machine-analysis-result'
                 AND transition_review.target_id = result.id
                 AND transition_review.decision = json_extract(audit.payload, '$.decision')
                 AND transition_review.supersedes_review_id = json_extract(audit.payload, '$.supersedesReviewId')
                 AND NOT EXISTS (
                   SELECT 1 FROM reviews transition_successor
                    WHERE transition_successor.supersedes_review_id = transition_review.id
                 )
            )
          )
        )
   );
  SELECT RAISE(ABORT, 'machine analysis publication is not eligible')
   WHERE NEW.publication_state = 'published'
     AND NOT EXISTS (
       SELECT 1
         FROM machine_analysis_results result
         JOIN machine_analysis_inputs input ON input.id = result.input_id
         JOIN source_document_heads document_head
           ON document_head.source_item_id = input.source_item_id
          AND document_head.current_capture_id = input.document_capture_id
         JOIN source_items item
           ON item.id = input.source_item_id
          AND item.latest_version_id = input.source_item_version_id
         JOIN source_item_versions version
           ON version.id = input.source_item_version_id
          AND version.source_item_id = item.id
          AND item.content_hash = version.payload_hash
         JOIN sources source ON source.id = item.source_id
         JOIN reviews review
           ON review.target_type = 'machine-analysis-result'
          AND review.target_id = result.id
          AND review.decision = 'approved'
        WHERE result.id = NEW.published_result_id
          AND result.id = NEW.latest_result_id
          AND result.gate_status = 'eligible'
          AND result.machine_label = 'automatic-extractive'
          AND source.active = 1
          AND source.source_tier BETWEEN 1 AND 3
          AND source.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
          AND source.rights_state = (
            SELECT capture.rights_state FROM source_document_captures capture
             WHERE capture.id = input.document_capture_id
          )
          AND NOT EXISTS (SELECT 1 FROM reviews successor WHERE successor.supersedes_review_id = review.id)
          AND EXISTS (SELECT 1 FROM machine_analysis_findings finding WHERE finding.result_id = result.id)
          AND NOT EXISTS (
            SELECT 1 FROM machine_analysis_findings unsafe
             WHERE unsafe.result_id = result.id
               AND (unsafe.stance IS NOT NULL OR unsafe.stance_basis != 'none')
          )
          AND NOT EXISTS (
            SELECT 1 FROM machine_analysis_findings long_extract
             WHERE long_extract.result_id = result.id
               AND source.rights_state IN ('restricted-copy', 'metadata-only')
               AND (
                 length(long_extract.quote) > 280
                 OR (
                   length(trim(replace(long_extract.quote, char(10), ' ')))
                   - length(replace(trim(replace(long_extract.quote, char(10), ' ')), ' ', ''))
                   + 1
                 ) > 25
               )
          )
          AND NOT EXISTS (
            SELECT 1
              FROM machine_analysis_findings candidate_finding
             WHERE candidate_finding.result_id = result.id
               AND candidate_finding.candidacy_id IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM candidate_profiles profile
                  WHERE profile.candidacy_id = candidate_finding.candidacy_id
                    AND profile.current_basis_hash IS NOT NULL
                    AND profile.review_state = 'approved'
                    AND profile.publication_state = 'published'
                    AND EXISTS (
                      SELECT 1 FROM candidacies publishable_candidacy
                       WHERE publishable_candidacy.id = profile.candidacy_id
                         AND publishable_candidacy.declaration_status = 'prospective'
                    )
                    AND EXISTS (
                      SELECT 1 FROM reviews profile_review
                       WHERE profile_review.target_type = 'candidate-profile-version'
                         AND profile_review.target_id = profile.current_basis_hash
                         AND profile_review.decision = 'approved'
                         AND NOT EXISTS (
                           SELECT 1 FROM reviews profile_successor
                            WHERE profile_successor.supersedes_review_id = profile_review.id
                         )
                         AND EXISTS (
                           SELECT 1 FROM audit_events profile_audit
                            WHERE profile_audit.action = 'candidate-profile.reviewed'
                              AND profile_audit.entity_type = 'candidate-profile'
                              AND profile_audit.entity_id = profile.candidacy_id
                              AND json_extract(profile_audit.payload, '$.reviewId') = profile_review.id
                              AND json_extract(profile_audit.payload, '$.basisHash') = profile.current_basis_hash
                              AND json_extract(profile_audit.payload, '$.decision') = 'approved'
                         )
                    )
               )
          )
     );
END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_verifications_insert_guard`
BEFORE INSERT ON `machine_analysis_verifications`
BEGIN
  SELECT RAISE(ABORT, 'machine analysis verification target is not currently published')
   WHERE NOT EXISTS (
     SELECT 1
       FROM machine_analysis_heads head
       JOIN reviews review ON review.id = NEW.review_id
      WHERE head.published_result_id = NEW.result_id
        AND head.publication_state = 'published'
        AND review.target_type = 'machine-analysis-result'
        AND review.target_id = NEW.result_id
        AND review.decision = 'approved'
        AND NOT EXISTS (SELECT 1 FROM reviews successor WHERE successor.supersedes_review_id = review.id)
   );
  SELECT RAISE(ABORT, 'machine analysis verification audit binding is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM audit_events audit
      WHERE audit.id = NEW.created_by_audit_event_id
        AND audit.action = 'machine-analysis.verified'
        AND audit.entity_type = 'machine-analysis-result'
        AND audit.entity_id = NEW.result_id
        AND json_extract(audit.payload, '$.verificationId') = NEW.id
        AND json_extract(audit.payload, '$.reviewId') = NEW.review_id
        AND json_extract(audit.payload, '$.rationaleHash') = NEW.rationale_hash
   );
END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_verifications_no_update`
BEFORE UPDATE ON `machine_analysis_verifications`
BEGIN SELECT RAISE(ABORT, 'machine analysis verifications are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `machine_analysis_verifications_no_delete`
BEFORE DELETE ON `machine_analysis_verifications`
BEGIN SELECT RAISE(ABORT, 'machine analysis verifications are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_analysis_insert`
AFTER INSERT ON `machine_analysis_heads`
WHEN NEW.publication_state = 'published'
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_analysis_update`
AFTER UPDATE OF current_input_id, latest_result_id, published_result_id,
  analysis_state, publication_state ON `machine_analysis_heads`
WHEN (OLD.publication_state = 'published' OR NEW.publication_state = 'published')
 AND (
   OLD.current_input_id IS NOT NEW.current_input_id
   OR OLD.latest_result_id IS NOT NEW.latest_result_id
   OR OLD.published_result_id IS NOT NEW.published_result_id
   OR OLD.analysis_state IS NOT NEW.analysis_state
   OR OLD.publication_state IS NOT NEW.publication_state
 )
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_analysis_delete`
AFTER DELETE ON `machine_analysis_heads`
WHEN OLD.publication_state = 'published'
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_analysis_review`
AFTER INSERT ON `reviews`
WHEN NEW.target_type = 'machine-analysis-result'
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_analysis_verification`
AFTER INSERT ON `machine_analysis_verifications`
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_analysis_dispute_insert`
AFTER INSERT ON `disputes`
WHEN NEW.target_type = 'machine-analysis-result'
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_analysis_dispute_update`
AFTER UPDATE OF status, resolution, resolved_at ON `disputes`
WHEN NEW.target_type = 'machine-analysis-result'
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_analysis_dispute_delete`
AFTER DELETE ON `disputes`
WHEN OLD.target_type = 'machine-analysis-result'
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_capture_update`
AFTER UPDATE OF current_capture_id ON `source_document_heads`
WHEN OLD.current_capture_id IS NOT NEW.current_capture_id
 AND EXISTS (
   SELECT 1 FROM machine_analysis_heads analysis
    WHERE analysis.source_item_id = NEW.source_item_id
      AND analysis.publication_state = 'published'
 )
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_source_update`
AFTER UPDATE OF active, name, rights_state, source_tier ON `sources`
WHEN EXISTS (
  SELECT 1
    FROM source_items item
    JOIN machine_analysis_heads analysis ON analysis.source_item_id = item.id
   WHERE item.source_id = NEW.id
     AND analysis.publication_state = 'published'
)
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_item_update`
AFTER UPDATE OF canonical_url, title, source_id ON `source_items`
WHEN EXISTS (
  SELECT 1 FROM machine_analysis_heads analysis
   WHERE analysis.source_item_id = NEW.id
     AND analysis.publication_state = 'published'
)
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;--> statement-breakpoint
CREATE TRIGGER `public_publication_head_machine_topic_update`
AFTER UPDATE OF name, active ON `policy_topics`
WHEN EXISTS (
  SELECT 1
    FROM machine_analysis_findings finding
    JOIN machine_analysis_heads analysis ON analysis.published_result_id = finding.result_id
   WHERE finding.topic_id = NEW.id
     AND analysis.publication_state = 'published'
)
BEGIN UPDATE public_publication_head SET head = lower(hex(randomblob(16))) WHERE singleton = 1; END;
