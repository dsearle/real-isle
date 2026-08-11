PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
DROP TRIGGER IF EXISTS `reviews_source_item_version_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `reviews_source_item_candidate_assignment_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `reviews_supersession_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `reviews_no_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `reviews_no_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_item_version_entities_insert_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_item_version_entities_no_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_item_version_entities_no_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_intelligence_invalidate_source_version_change`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_intelligence_revision_insert_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_intelligence_revision_update_guard`;--> statement-breakpoint
CREATE TABLE `__new_source_item_version_entities` (
	`source_item_version_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`mention_text` text NOT NULL,
	`match_method` text NOT NULL,
	`confidence` real NOT NULL,
	`review_id` text NOT NULL,
	`confirmation_state` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`source_item_version_id`, `entity_type`, `entity_id`, `review_id`),
	FOREIGN KEY (`source_item_version_id`) REFERENCES `source_item_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "source_item_version_entities_confidence_check" CHECK("__new_source_item_version_entities"."confidence" >= 0 AND "__new_source_item_version_entities"."confidence" <= 1),
	CONSTRAINT "source_item_version_entities_confirmation_check" CHECK("__new_source_item_version_entities"."confirmation_state" IN ('confirmed', 'rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_source_item_version_entities`("source_item_version_id", "entity_type", "entity_id", "mention_text", "match_method", "confidence", "review_id", "confirmation_state", "created_at") SELECT "source_item_version_id", "entity_type", "entity_id", "mention_text", "match_method", "confidence", "review_id", "confirmation_state", "created_at" FROM `source_item_version_entities`;--> statement-breakpoint
DROP TABLE `source_item_version_entities`;--> statement-breakpoint
ALTER TABLE `__new_source_item_version_entities` RENAME TO `source_item_version_entities`;--> statement-breakpoint
CREATE INDEX `idx_source_item_version_entities_entity` ON `source_item_version_entities` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_source_item_version_entities_review` ON `source_item_version_entities` (`review_id`);--> statement-breakpoint
ALTER TABLE `reviews`
  ADD COLUMN `supersedes_review_id` text REFERENCES `reviews`(`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reviews_root_target` ON `reviews` (`target_type`,`target_id`) WHERE "reviews"."supersedes_review_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reviews_superseded_once` ON `reviews` (`supersedes_review_id`) WHERE "reviews"."supersedes_review_id" IS NOT NULL;--> statement-breakpoint
UPDATE `source_items`
   SET `publication_state` = 'published', `updated_at` = CURRENT_TIMESTAMP
 WHERE `review_state` = 'approved'
   AND EXISTS (
     SELECT 1 FROM `reviews` current_review
      WHERE current_review.target_type = 'source-item-version'
        AND current_review.target_id = source_items.latest_version_id
        AND current_review.decision = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM `reviews` successor
           WHERE successor.supersedes_review_id = current_review.id
        )
   );--> statement-breakpoint
UPDATE `source_items`
   SET `publication_state` = 'withheld', `updated_at` = CURRENT_TIMESTAMP
 WHERE `review_state` = 'rejected';--> statement-breakpoint
CREATE TRIGGER `reviews_no_update`
BEFORE UPDATE ON `reviews`
BEGIN SELECT RAISE(ABORT, 'review decisions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `reviews_no_delete`
BEFORE DELETE ON `reviews`
BEGIN SELECT RAISE(ABORT, 'review decisions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `reviews_supersession_guard`
BEFORE INSERT ON `reviews`
BEGIN
  SELECT RAISE(ABORT, 'invalid editorial decision')
   WHERE NEW.decision NOT IN ('approved', 'rejected');
  SELECT RAISE(ABORT, 'a review cannot supersede itself')
   WHERE NEW.supersedes_review_id = NEW.id;
  SELECT RAISE(ABORT, 'review supersession target is stale or invalid')
   WHERE NEW.supersedes_review_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM reviews prior_review
        WHERE prior_review.id = NEW.supersedes_review_id
          AND prior_review.target_type = NEW.target_type
          AND prior_review.target_id = NEW.target_id
          AND prior_review.decision != NEW.decision
          AND NOT EXISTS (
            SELECT 1 FROM reviews successor
             WHERE successor.supersedes_review_id = prior_review.id
          )
     );
END;--> statement-breakpoint
CREATE TRIGGER `reviews_source_item_version_guard`
BEFORE INSERT ON `reviews`
WHEN NEW.target_type = 'source-item-version'
BEGIN
  SELECT RAISE(ABORT, 'invalid source item review decision')
   WHERE NEW.decision NOT IN ('approved', 'rejected');
  SELECT RAISE(ABORT, 'review target is stale or decision head changed')
   WHERE NOT EXISTS (
      SELECT 1
        FROM source_item_versions versions
        JOIN source_items items ON items.id = versions.source_item_id
       WHERE versions.id = NEW.target_id
         AND items.latest_version_id = versions.id
         AND items.content_hash = versions.payload_hash
         AND (
           (
             NEW.supersedes_review_id IS NULL
             AND items.review_state IN ('unreviewed', 'needs-update')
             AND NOT EXISTS (
               SELECT 1 FROM reviews root_review
                WHERE root_review.target_type = NEW.target_type
                  AND root_review.target_id = NEW.target_id
             )
           )
           OR
           (
             NEW.supersedes_review_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM reviews prior_review
                WHERE prior_review.id = NEW.supersedes_review_id
                  AND prior_review.target_type = NEW.target_type
                  AND prior_review.target_id = NEW.target_id
                  AND prior_review.decision = items.review_state
                  AND prior_review.decision != NEW.decision
                  AND NOT EXISTS (
                    SELECT 1 FROM reviews successor
                     WHERE successor.supersedes_review_id = prior_review.id
                  )
             )
           )
         )
    );
END;--> statement-breakpoint
CREATE TRIGGER `reviews_source_item_candidate_assignment_guard`
BEFORE INSERT ON `reviews`
WHEN NEW.target_type = 'source-item-version-assignment'
BEGIN
  SELECT RAISE(ABORT, 'invalid candidate assignment decision')
   WHERE NEW.decision NOT IN ('approved', 'rejected');
  SELECT RAISE(ABORT, 'candidate assignment target is stale or decision head changed')
   WHERE NOT EXISTS (
      SELECT 1
        FROM source_item_versions versions
        JOIN source_items items ON items.id = versions.source_item_id
       WHERE versions.id = NEW.target_id
         AND items.latest_version_id = versions.id
         AND items.content_hash = versions.payload_hash
         AND items.review_state = 'approved'
         AND items.publication_state = 'published'
         AND EXISTS (
           SELECT 1 FROM reviews source_review
            WHERE source_review.target_type = 'source-item-version'
              AND source_review.target_id = versions.id
              AND source_review.decision = 'approved'
              AND source_review.supersedes_review_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM reviews source_successor
                 WHERE source_successor.supersedes_review_id = source_review.id
              )
         )
         AND (
           (
             NEW.supersedes_review_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM reviews assignment_review
                WHERE assignment_review.target_type = 'source-item-version-assignment'
                  AND assignment_review.target_id = versions.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM source_item_version_entities frozen
                WHERE frozen.source_item_version_id = versions.id
                  AND frozen.entity_type = 'candidacy'
             )
           )
           OR
           (
             NEW.supersedes_review_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM reviews prior_assignment
                WHERE prior_assignment.id = NEW.supersedes_review_id
                  AND prior_assignment.target_type = NEW.target_type
                  AND prior_assignment.target_id = NEW.target_id
                  AND prior_assignment.decision != NEW.decision
                  AND NOT EXISTS (
                    SELECT 1 FROM reviews assignment_successor
                     WHERE assignment_successor.supersedes_review_id = prior_assignment.id
                  )
             )
           )
         )
    );
END;--> statement-breakpoint
CREATE TRIGGER `source_item_version_entities_insert_guard`
BEFORE INSERT ON `source_item_version_entities`
BEGIN
  SELECT RAISE(ABORT, 'entity projection requires a current approved source version')
   WHERE NOT EXISTS (
      SELECT 1
        FROM source_item_versions versions
        JOIN source_items items ON items.id = versions.source_item_id
        JOIN reviews review ON review.id = NEW.review_id
       WHERE versions.id = NEW.source_item_version_id
         AND review.target_type IN ('source-item-version', 'source-item-version-assignment')
         AND review.target_id = versions.id
         AND items.latest_version_id = versions.id
         AND items.content_hash = versions.payload_hash
         AND items.review_state = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM reviews successor
            WHERE successor.supersedes_review_id = review.id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM audit_events completed_audit
            WHERE completed_audit.entity_type = 'source-item-version'
              AND completed_audit.entity_id = versions.id
              AND (
                (review.target_type = 'source-item-version'
                  AND completed_audit.action = 'source-item.reviewed')
                OR
                (review.target_type = 'source-item-version-assignment'
                  AND completed_audit.action = 'source-item.candidate-assignment-reviewed')
              )
              AND json_extract(completed_audit.payload, '$.reviewId') = review.id
         )
         AND (
           (NEW.confirmation_state = 'confirmed' AND review.decision = 'approved')
           OR (
             NEW.confirmation_state = 'rejected'
             AND (
               review.decision = 'approved'
               OR (
                 review.target_type = 'source-item-version-assignment'
                 AND review.decision = 'rejected'
               )
             )
           )
         )
    );
  SELECT RAISE(ABORT, 'entity projection type is not supported')
   WHERE NEW.entity_type NOT IN ('candidacy', 'topic', 'constituency');
  SELECT RAISE(ABORT, 'entity projection candidacy is not current')
   WHERE NEW.entity_type = 'candidacy'
     AND NOT EXISTS (
       SELECT 1 FROM candidacies
        WHERE id = NEW.entity_id
          AND declaration_status != 'source-removed'
     );
  SELECT RAISE(ABORT, 'entity projection topic is not current')
   WHERE NEW.entity_type = 'topic'
     AND NOT EXISTS (
       SELECT 1 FROM policy_topics WHERE id = NEW.entity_id
     );
  SELECT RAISE(ABORT, 'entity projection constituency is not current')
   WHERE NEW.entity_type = 'constituency'
     AND NOT EXISTS (
       SELECT 1 FROM constituencies WHERE id = NEW.entity_id
     );
END;--> statement-breakpoint
CREATE TRIGGER `source_item_version_entities_no_update`
BEFORE UPDATE ON `source_item_version_entities`
BEGIN SELECT RAISE(ABORT, 'source version entity projections are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `source_item_version_entities_no_delete`
BEFORE DELETE ON `source_item_version_entities`
BEGIN SELECT RAISE(ABORT, 'source version entity projections are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `candidate_intelligence_invalidate_source_version_change`
AFTER UPDATE OF latest_version_id ON `source_items`
WHEN OLD.latest_version_id IS NOT NEW.latest_version_id
BEGIN
  UPDATE candidate_intelligence_heads
     SET analysis_state = 'needs-update',
         publication_state = 'withheld',
         desired_corpus_hash = NULL,
         published_revision_id = NULL,
         stale_at = COALESCE(stale_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
   WHERE candidacy_id IN (
     SELECT entities.entity_id
       FROM source_item_version_entities entities
       JOIN reviews review ON review.id = entities.review_id
      WHERE entities.source_item_version_id = OLD.latest_version_id
        AND entities.entity_type = 'candidacy'
        AND entities.confirmation_state = 'confirmed'
        AND review.target_type IN ('source-item-version', 'source-item-version-assignment')
        AND review.target_id = entities.source_item_version_id
        AND review.decision = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM reviews successor
           WHERE successor.supersedes_review_id = review.id
        )
   );
END;--> statement-breakpoint
CREATE TRIGGER `candidate_intelligence_revision_insert_guard`
BEFORE INSERT ON `candidate_intelligence_heads`
BEGIN
  SELECT RAISE(ABORT, 'latest candidate intelligence revision does not match candidacy')
   WHERE NEW.latest_revision_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM revisions
        WHERE id = NEW.latest_revision_id
          AND entity_type = 'candidate-analysis'
          AND entity_id = NEW.candidacy_id
     );
  SELECT RAISE(ABORT, 'published candidate intelligence revision requires an audited approval')
   WHERE NEW.published_revision_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM revisions
         JOIN reviews review
           ON review.target_type = 'candidate-analysis-revision'
          AND review.target_id = revisions.id
          AND review.decision = 'approved'
          AND NOT EXISTS (
            SELECT 1 FROM reviews successor
             WHERE successor.supersedes_review_id = review.id
          )
         JOIN audit_events audit
           ON audit.action = 'candidate-analysis.reviewed'
          AND audit.entity_type = 'candidate-analysis-revision'
          AND audit.entity_id = revisions.id
          AND json_extract(audit.payload, '$.reviewId') = review.id
        WHERE revisions.id = NEW.published_revision_id
          AND revisions.entity_type = 'candidate-analysis'
          AND revisions.entity_id = NEW.candidacy_id
     );
  SELECT RAISE(ABORT, 'published candidate intelligence must be current and approved')
   WHERE NEW.publication_state = 'published'
     AND (
       NEW.analysis_state != 'approved'
       OR NEW.stale_at IS NOT NULL
       OR NEW.published_revision_id IS NULL
       OR NEW.latest_revision_id IS NOT NEW.published_revision_id
     );
END;--> statement-breakpoint
CREATE TRIGGER `candidate_intelligence_revision_update_guard`
BEFORE UPDATE OF candidacy_id, latest_revision_id, published_revision_id,
  analysis_state, publication_state, stale_at
ON `candidate_intelligence_heads`
BEGIN
  SELECT RAISE(ABORT, 'latest candidate intelligence revision does not match candidacy')
   WHERE NEW.latest_revision_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM revisions
        WHERE id = NEW.latest_revision_id
          AND entity_type = 'candidate-analysis'
          AND entity_id = NEW.candidacy_id
     );
  SELECT RAISE(ABORT, 'published candidate intelligence revision requires an audited approval')
   WHERE NEW.published_revision_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM revisions
         JOIN reviews review
           ON review.target_type = 'candidate-analysis-revision'
          AND review.target_id = revisions.id
          AND review.decision = 'approved'
          AND NOT EXISTS (
            SELECT 1 FROM reviews successor
             WHERE successor.supersedes_review_id = review.id
          )
         JOIN audit_events audit
           ON audit.action = 'candidate-analysis.reviewed'
          AND audit.entity_type = 'candidate-analysis-revision'
          AND audit.entity_id = revisions.id
          AND json_extract(audit.payload, '$.reviewId') = review.id
        WHERE revisions.id = NEW.published_revision_id
          AND revisions.entity_type = 'candidate-analysis'
          AND revisions.entity_id = NEW.candidacy_id
     );
  SELECT RAISE(ABORT, 'stale candidate intelligence requires a newly approved revision')
   WHERE OLD.stale_at IS NOT NULL
     AND NEW.stale_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM revisions
         JOIN reviews review
           ON review.target_type = 'candidate-analysis-revision'
          AND review.target_id = revisions.id
          AND review.decision = 'approved'
          AND NOT EXISTS (
            SELECT 1 FROM reviews successor
             WHERE successor.supersedes_review_id = review.id
          )
         JOIN audit_events audit
           ON audit.action = 'candidate-analysis.reviewed'
          AND audit.entity_type = 'candidate-analysis-revision'
          AND audit.entity_id = revisions.id
          AND json_extract(audit.payload, '$.reviewId') = review.id
        WHERE revisions.id = NEW.latest_revision_id
          AND revisions.id IS NOT OLD.latest_revision_id
          AND revisions.entity_type = 'candidate-analysis'
          AND revisions.entity_id = NEW.candidacy_id
     );
  SELECT RAISE(ABORT, 'published candidate intelligence must be current and approved')
   WHERE NEW.publication_state = 'published'
     AND (
       NEW.analysis_state != 'approved'
       OR NEW.stale_at IS NOT NULL
       OR NEW.published_revision_id IS NULL
       OR NEW.latest_revision_id IS NOT NEW.published_revision_id
     );
END;--> statement-breakpoint
PRAGMA foreign_key_check;
