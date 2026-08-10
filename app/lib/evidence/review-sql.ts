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
            AND items.review_state IN ('unreviewed', 'needs-update')
       )
       THEN RAISE(ABORT, 'review target is stale or already decided')
     END;
   END`;

export const insertSourceItemReviewSql = `INSERT INTO reviews (
  id, target_type, target_id, decision, rationale, reviewer_id, created_at
) VALUES (?, 'source-item-version', ?, ?, ?, ?, ?)`;

export const updateSourceItemReviewStateSql = `UPDATE source_items SET
  review_state = ?,
  publication_state = CASE WHEN ? = 'rejected' THEN 'withheld' ELSE publication_state END,
  updated_at = CURRENT_TIMESTAMP
WHERE id = ?
  AND latest_version_id = ?
  AND content_hash = ?
  AND review_state IN ('unreviewed', 'needs-update')`;
