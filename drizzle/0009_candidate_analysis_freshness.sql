DROP TRIGGER IF EXISTS `candidate_intelligence_invalidate_source_version_change`;--> statement-breakpoint
CREATE TRIGGER `candidate_intelligence_invalidate_source_version_change`
AFTER UPDATE OF `latest_version_id` ON `source_items`
WHEN OLD.latest_version_id IS NOT NEW.latest_version_id
BEGIN
	UPDATE `candidate_intelligence_heads`
	SET analysis_state = 'needs-update',
		publication_state = 'withheld',
		desired_corpus_hash = NULL,
		published_revision_id = NULL,
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
	SELECT CASE
		WHEN NEW.publication_state = 'published'
			AND (
				NEW.analysis_state != 'approved'
				OR NEW.stale_at IS NOT NULL
				OR NEW.published_revision_id IS NULL
				OR NEW.latest_revision_id IS NOT NEW.published_revision_id
			)
		THEN RAISE(ABORT, 'published candidate intelligence must be current and approved')
	END;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_intelligence_revision_update_guard`;--> statement-breakpoint
CREATE TRIGGER `candidate_intelligence_revision_update_guard`
BEFORE UPDATE OF `candidacy_id`, `latest_revision_id`, `published_revision_id`,
	`analysis_state`, `publication_state`, `stale_at`
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
	SELECT CASE
		WHEN OLD.stale_at IS NOT NULL
			AND NEW.stale_at IS NULL
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
				WHERE revisions.id = NEW.latest_revision_id
					AND revisions.id IS NOT OLD.latest_revision_id
					AND revisions.entity_type = 'candidate-analysis'
					AND revisions.entity_id = NEW.candidacy_id
			)
		THEN RAISE(ABORT, 'stale candidate intelligence requires a newly approved revision')
	END;
	SELECT CASE
		WHEN NEW.publication_state = 'published'
			AND (
				NEW.analysis_state != 'approved'
				OR NEW.stale_at IS NOT NULL
				OR NEW.published_revision_id IS NULL
				OR NEW.latest_revision_id IS NOT NEW.published_revision_id
			)
		THEN RAISE(ABORT, 'published candidate intelligence must be current and approved')
	END;
END;
