export const sourceItemVersionEntityInsertGuardSql = `CREATE TRIGGER IF NOT EXISTS source_item_version_entities_insert_guard
   BEFORE INSERT ON source_item_version_entities
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
          SELECT 1 FROM policy_topics
           WHERE id = NEW.entity_id
        );
     SELECT RAISE(ABORT, 'entity projection constituency is not current')
      WHERE NEW.entity_type = 'constituency'
        AND NOT EXISTS (
          SELECT 1 FROM constituencies
           WHERE id = NEW.entity_id
        );
   END`;

export const sourceItemVersionEntityNoUpdateSql = `CREATE TRIGGER IF NOT EXISTS source_item_version_entities_no_update
   BEFORE UPDATE ON source_item_version_entities
   BEGIN SELECT RAISE(ABORT, 'source version entity projections are immutable'); END`;

export const sourceItemVersionEntityNoDeleteSql = `CREATE TRIGGER IF NOT EXISTS source_item_version_entities_no_delete
   BEFORE DELETE ON source_item_version_entities
   BEGIN SELECT RAISE(ABORT, 'source version entity projections are immutable'); END`;

export const candidateIntelligenceInvalidationSql = `CREATE TRIGGER IF NOT EXISTS candidate_intelligence_invalidate_source_version_change
   AFTER UPDATE OF latest_version_id ON source_items
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
   END`;

export const candidateIntelligenceRevisionInsertGuardSql = `CREATE TRIGGER IF NOT EXISTS candidate_intelligence_revision_insert_guard
   BEFORE INSERT ON candidate_intelligence_heads
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
   END`;

export const candidateIntelligenceRevisionUpdateGuardSql = `CREATE TRIGGER IF NOT EXISTS candidate_intelligence_revision_update_guard
   BEFORE UPDATE OF candidacy_id, latest_revision_id, published_revision_id,
     analysis_state, publication_state, stale_at
   ON candidate_intelligence_heads
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
   END`;
