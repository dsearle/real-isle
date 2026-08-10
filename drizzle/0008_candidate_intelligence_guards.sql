DROP INDEX IF EXISTS `idx_source_item_versions_item_payload`;--> statement-breakpoint
CREATE INDEX `idx_source_item_versions_item_payload`
ON `source_item_versions` (`source_item_id`, `payload_hash`);--> statement-breakpoint
DROP TRIGGER IF EXISTS `reviews_source_item_version_guard`;--> statement-breakpoint
CREATE TRIGGER `reviews_source_item_version_guard`
BEFORE INSERT ON `reviews`
WHEN NEW.target_type = 'source-item-version'
BEGIN
	SELECT CASE
		WHEN NEW.decision NOT IN ('approved', 'rejected')
		THEN RAISE(ABORT, 'invalid source item review decision')
	END;
	SELECT CASE
		WHEN NOT EXISTS (
			SELECT 1
			FROM `source_item_versions` versions
			JOIN `source_items` items ON items.id = versions.source_item_id
			WHERE versions.id = NEW.target_id
				AND items.latest_version_id = versions.id
				AND items.content_hash = versions.payload_hash
				AND items.review_state IN ('unreviewed', 'needs-update')
		)
		THEN RAISE(ABORT, 'review target is stale or already decided')
	END;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `reviews_source_item_candidate_assignment_guard`;--> statement-breakpoint
CREATE TRIGGER `reviews_source_item_candidate_assignment_guard`
BEFORE INSERT ON `reviews`
WHEN NEW.target_type = 'source-item-version-assignment'
BEGIN
	SELECT CASE
		WHEN NEW.decision NOT IN ('approved', 'rejected')
		THEN RAISE(ABORT, 'invalid candidate assignment decision')
	END;
	SELECT CASE
		WHEN NOT EXISTS (
			SELECT 1
			FROM `source_item_versions` versions
			JOIN `source_items` items ON items.id = versions.source_item_id
			WHERE versions.id = NEW.target_id
				AND items.latest_version_id = versions.id
				AND items.content_hash = versions.payload_hash
				AND items.review_state = 'approved'
				AND EXISTS (
					SELECT 1 FROM `reviews` source_review
					WHERE source_review.target_type = 'source-item-version'
						AND source_review.target_id = versions.id
						AND source_review.decision = 'approved'
				)
				AND NOT EXISTS (
					SELECT 1 FROM `reviews` assignment_review
					WHERE assignment_review.target_type = 'source-item-version-assignment'
						AND assignment_review.target_id = versions.id
				)
				AND NOT EXISTS (
					SELECT 1 FROM `source_item_version_entities` frozen
					WHERE frozen.source_item_version_id = versions.id
						AND frozen.entity_type = 'candidacy'
				)
		)
		THEN RAISE(ABORT, 'candidate assignment target is stale or already decided')
	END;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_item_version_entities_insert_guard`;--> statement-breakpoint
CREATE TRIGGER `source_item_version_entities_insert_guard`
BEFORE INSERT ON `source_item_version_entities`
BEGIN
	SELECT CASE
		WHEN NOT EXISTS (
			SELECT 1
			FROM `source_item_versions` versions
			JOIN `source_items` items ON items.id = versions.source_item_id
			JOIN `reviews` review ON review.id = NEW.review_id
			WHERE versions.id = NEW.source_item_version_id
				AND review.target_type IN ('source-item-version', 'source-item-version-assignment')
				AND review.target_id = versions.id
				AND items.latest_version_id = versions.id
				AND items.content_hash = versions.payload_hash
				AND items.review_state = 'approved'
				AND NOT EXISTS (
					SELECT 1
					FROM `audit_events` completed_audit
					WHERE completed_audit.entity_type = 'source-item-version'
						AND completed_audit.entity_id = versions.id
						AND (
							(review.target_type = 'source-item-version'
								AND completed_audit.action = 'source-item.reviewed')
							OR
							(review.target_type = 'source-item-version-assignment'
								AND completed_audit.action = 'source-item.candidate-assignment-reviewed')
						)
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
		)
		THEN RAISE(ABORT, 'entity projection requires a current approved source version')
	END;
	SELECT CASE
		WHEN NEW.entity_type = 'candidacy'
			AND NOT EXISTS (
				SELECT 1 FROM `candidacies`
				WHERE id = NEW.entity_id
					AND declaration_status != 'source-removed'
			)
		THEN RAISE(ABORT, 'entity projection candidacy is not current')
	END;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_item_version_entities_no_update`;--> statement-breakpoint
CREATE TRIGGER `source_item_version_entities_no_update`
BEFORE UPDATE ON `source_item_version_entities`
BEGIN SELECT RAISE(ABORT, 'source version entity projections are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_item_version_entities_no_delete`;--> statement-breakpoint
CREATE TRIGGER `source_item_version_entities_no_delete`
BEFORE DELETE ON `source_item_version_entities`
BEGIN SELECT RAISE(ABORT, 'source version entity projections are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_intelligence_invalidate_source_version_change`;--> statement-breakpoint
CREATE TRIGGER `candidate_intelligence_invalidate_source_version_change`
AFTER UPDATE OF `latest_version_id` ON `source_items`
WHEN OLD.latest_version_id IS NOT NEW.latest_version_id
BEGIN
	UPDATE `candidate_intelligence_heads`
	SET analysis_state = 'needs-update',
		publication_state = 'withheld',
		desired_corpus_hash = NULL,
		stale_at = COALESCE(stale_at, CURRENT_TIMESTAMP),
		updated_at = CURRENT_TIMESTAMP
	WHERE candidacy_id IN (
		SELECT entities.entity_id
		FROM `source_item_version_entities` entities
		JOIN `reviews` review ON review.id = entities.review_id
		WHERE entities.source_item_version_id = OLD.latest_version_id
			AND entities.entity_type = 'candidacy'
			AND entities.confirmation_state = 'confirmed'
			AND review.target_type IN ('source-item-version', 'source-item-version-assignment')
			AND review.target_id = entities.source_item_version_id
			AND review.decision = 'approved'
	);
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_intelligence_revision_insert_guard`;--> statement-breakpoint
CREATE TRIGGER `candidate_intelligence_revision_insert_guard`
BEFORE INSERT ON `candidate_intelligence_heads`
BEGIN
	SELECT CASE
		WHEN NEW.latest_revision_id IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 FROM `revisions`
				WHERE id = NEW.latest_revision_id
					AND entity_type = 'candidate-analysis'
					AND entity_id = NEW.candidacy_id
			)
		THEN RAISE(ABORT, 'latest candidate intelligence revision does not match candidacy')
	END;
	SELECT CASE
		WHEN NEW.published_revision_id IS NOT NULL
			AND NOT EXISTS (
				SELECT 1
				FROM `revisions`
				JOIN `reviews` review
					ON review.target_type = 'candidate-analysis-revision'
					AND review.target_id = revisions.id
					AND review.decision = 'approved'
				JOIN `audit_events` audit
					ON audit.action = 'candidate-analysis.reviewed'
					AND audit.entity_type = 'candidate-analysis-revision'
					AND audit.entity_id = revisions.id
					AND json_extract(audit.payload, '$.reviewId') = review.id
				WHERE revisions.id = NEW.published_revision_id
					AND revisions.entity_type = 'candidate-analysis'
					AND revisions.entity_id = NEW.candidacy_id
			)
		THEN RAISE(ABORT, 'published candidate intelligence revision requires an audited approval')
	END;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_intelligence_revision_update_guard`;--> statement-breakpoint
CREATE TRIGGER `candidate_intelligence_revision_update_guard`
BEFORE UPDATE OF `candidacy_id`, `latest_revision_id`, `published_revision_id`
ON `candidate_intelligence_heads`
BEGIN
	SELECT CASE
		WHEN NEW.latest_revision_id IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 FROM `revisions`
				WHERE id = NEW.latest_revision_id
					AND entity_type = 'candidate-analysis'
					AND entity_id = NEW.candidacy_id
			)
		THEN RAISE(ABORT, 'latest candidate intelligence revision does not match candidacy')
	END;
	SELECT CASE
		WHEN NEW.published_revision_id IS NOT NULL
			AND NOT EXISTS (
				SELECT 1
				FROM `revisions`
				JOIN `reviews` review
					ON review.target_type = 'candidate-analysis-revision'
					AND review.target_id = revisions.id
					AND review.decision = 'approved'
				JOIN `audit_events` audit
					ON audit.action = 'candidate-analysis.reviewed'
					AND audit.entity_type = 'candidate-analysis-revision'
					AND audit.entity_id = revisions.id
					AND json_extract(audit.payload, '$.reviewId') = review.id
				WHERE revisions.id = NEW.published_revision_id
					AND revisions.entity_type = 'candidate-analysis'
					AND revisions.entity_id = NEW.candidacy_id
			)
		THEN RAISE(ABORT, 'published candidate intelligence revision requires an audited approval')
	END;
END;
