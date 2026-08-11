export const sourceItemVersionReviewGuardSql = `CREATE TRIGGER IF NOT EXISTS reviews_source_item_version_guard
   BEFORE INSERT ON reviews
   WHEN NEW.target_type = 'source-item-version'
   BEGIN
     SELECT CASE
       WHEN NEW.decision NOT IN ('approved', 'rejected')
       THEN RAISE(ABORT, 'invalid source item review decision')
     END;
     SELECT CASE
       WHEN NOT EXISTS (
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
       )
       THEN RAISE(ABORT, 'review target is stale or decision head changed')
     END;
   END`;

export const sourceItemCandidateAssignmentReviewGuardSql = `CREATE TRIGGER IF NOT EXISTS reviews_source_item_candidate_assignment_guard
   BEFORE INSERT ON reviews
   WHEN NEW.target_type = 'source-item-version-assignment'
   BEGIN
     SELECT CASE
       WHEN NEW.decision NOT IN ('approved', 'rejected')
       THEN RAISE(ABORT, 'invalid candidate assignment decision')
     END;
     SELECT CASE
       WHEN NOT EXISTS (
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
       )
       THEN RAISE(ABORT, 'candidate assignment target is stale or decision head changed')
     END;
   END`;

export const insertSourceItemReviewSql = `INSERT INTO reviews (
  id, target_type, target_id, decision, rationale, reviewer_id,
  supersedes_review_id, created_at
) VALUES (?, 'source-item-version', ?, ?, ?, ?, ?, ?)`;

export const insertSourceItemCandidateAssignmentReviewSql = `INSERT INTO reviews (
  id, target_type, target_id, decision, rationale, reviewer_id,
  supersedes_review_id, created_at
) VALUES (?, 'source-item-version-assignment', ?, ?, ?, ?, ?, ?)`;

export const updateSourceItemReviewStateSql = `UPDATE source_items SET
  review_state = ?,
  publication_state = CASE WHEN ? = 'approved' THEN 'published' ELSE 'withheld' END,
  updated_at = CURRENT_TIMESTAMP
WHERE id = ?
  AND latest_version_id = ?
  AND content_hash = ?
  AND review_state = ?`;
