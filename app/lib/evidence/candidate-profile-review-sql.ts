export const candidateProfileVersionReviewGuardSql = `CREATE TRIGGER IF NOT EXISTS reviews_candidate_profile_version_guard
  BEFORE INSERT ON reviews
  WHEN NEW.target_type = 'candidate-profile-version'
  BEGIN
    SELECT CASE
      WHEN NOT EXISTS (
        SELECT 1
          FROM candidate_profiles profiles
          JOIN candidacies ON candidacies.id = profiles.candidacy_id
         WHERE profiles.current_basis_hash = NEW.target_id
           AND candidacies.declaration_status = 'prospective'
           AND (
             (
               NEW.supersedes_review_id IS NULL
               AND profiles.review_state IN ('unreviewed', 'needs-update')
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
                    AND prior_review.decision = profiles.review_state
                    AND prior_review.decision != NEW.decision
                    AND NOT EXISTS (
                      SELECT 1 FROM reviews successor
                       WHERE successor.supersedes_review_id = prior_review.id
                    )
               )
             )
           )
      )
      THEN RAISE(ABORT, 'candidate profile review target is stale or decision head changed')
    END;
  END`;

export const insertCandidateProfileReviewSql = `INSERT INTO reviews (
  id, target_type, target_id, decision, rationale, reviewer_id,
  supersedes_review_id, created_at
) VALUES (?, 'candidate-profile-version', ?, ?, ?, ?, ?, ?)`;

export const updateCandidateProfileReviewStateSql = `UPDATE candidate_profiles SET
  review_state = ?,
  publication_state = CASE WHEN ? = 'approved' THEN 'published' ELSE 'withheld' END,
  updated_at = CURRENT_TIMESTAMP
WHERE candidacy_id = ?
  AND current_basis_hash = ?
  AND review_state = ?`;
