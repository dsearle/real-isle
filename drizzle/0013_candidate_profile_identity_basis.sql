ALTER TABLE `candidate_profiles` ADD `current_basis_hash` text;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_profiles_basis_hash_insert_guard`;--> statement-breakpoint
CREATE TRIGGER `candidate_profiles_basis_hash_insert_guard`
BEFORE INSERT ON `candidate_profiles`
WHEN NEW.current_basis_hash IS NOT NULL
 AND (length(NEW.current_basis_hash) != 64 OR NEW.current_basis_hash GLOB '*[^0-9a-f]*')
BEGIN SELECT RAISE(ABORT, 'invalid candidate profile basis hash'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_profiles_basis_hash_update_guard`;--> statement-breakpoint
CREATE TRIGGER `candidate_profiles_basis_hash_update_guard`
BEFORE UPDATE OF current_basis_hash ON `candidate_profiles`
WHEN NEW.current_basis_hash IS NOT OLD.current_basis_hash
 AND (
   (NEW.current_basis_hash IS NOT NULL
    AND (length(NEW.current_basis_hash) != 64 OR NEW.current_basis_hash GLOB '*[^0-9a-f]*'))
   OR NEW.review_state NOT IN ('unreviewed', 'needs-update')
   OR NEW.publication_state = 'published'
 )
BEGIN SELECT RAISE(ABORT, 'candidate profile basis may only change while withheld for review'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_profiles_identity_invalidate`;--> statement-breakpoint
CREATE TRIGGER `candidate_profiles_identity_invalidate`
AFTER UPDATE OF slug, profile_url_hash, observed_constituency_id,
  current_directory_observation_id ON `candidate_profiles`
WHEN (
  NEW.slug IS NOT OLD.slug
  OR NEW.profile_url_hash IS NOT OLD.profile_url_hash
  OR NEW.observed_constituency_id IS NOT OLD.observed_constituency_id
  OR (
    NEW.current_directory_observation_id IS NOT OLD.current_directory_observation_id
    AND (SELECT payload_hash FROM candidate_profile_observations WHERE id = NEW.current_directory_observation_id)
      IS NOT (SELECT payload_hash FROM candidate_profile_observations WHERE id = OLD.current_directory_observation_id)
  )
 )
 AND NEW.current_basis_hash IS OLD.current_basis_hash
BEGIN
  UPDATE candidate_profiles
     SET current_basis_hash = NULL,
         publication_state = CASE WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
         review_state = CASE WHEN review_state IN ('approved', 'rejected') THEN 'needs-update' ELSE review_state END,
         updated_at = CURRENT_TIMESTAMP
   WHERE candidacy_id = NEW.candidacy_id;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_people_identity_invalidate`;--> statement-breakpoint
CREATE TRIGGER `candidate_people_identity_invalidate`
AFTER UPDATE OF full_name ON `people`
WHEN NEW.full_name IS NOT OLD.full_name
BEGIN
  UPDATE candidate_profiles
     SET current_basis_hash = NULL,
         publication_state = CASE WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
         review_state = CASE WHEN review_state IN ('approved', 'rejected') THEN 'needs-update' ELSE review_state END,
         updated_at = CURRENT_TIMESTAMP
   WHERE candidacy_id IN (SELECT id FROM candidacies WHERE person_id = NEW.id);
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidacies_identity_invalidate`;--> statement-breakpoint
CREATE TRIGGER `candidacies_identity_invalidate`
AFTER UPDATE OF person_id, constituency_id, affiliation, declaration_status ON `candidacies`
WHEN NEW.person_id IS NOT OLD.person_id
  OR NEW.constituency_id IS NOT OLD.constituency_id
  OR NEW.affiliation IS NOT OLD.affiliation
  OR NEW.declaration_status IS NOT OLD.declaration_status
BEGIN
  UPDATE candidate_profiles
     SET current_basis_hash = NULL,
         publication_state = CASE WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
         review_state = CASE WHEN review_state IN ('approved', 'rejected') THEN 'needs-update' ELSE review_state END,
         updated_at = CURRENT_TIMESTAMP
   WHERE candidacy_id = NEW.id;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `constituencies_candidate_identity_invalidate`;--> statement-breakpoint
CREATE TRIGGER `constituencies_candidate_identity_invalidate`
AFTER UPDATE OF name ON `constituencies`
WHEN NEW.name IS NOT OLD.name
BEGIN
  UPDATE candidate_profiles
     SET current_basis_hash = NULL,
         publication_state = CASE WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
         review_state = CASE WHEN review_state IN ('approved', 'rejected') THEN 'needs-update' ELSE review_state END,
         updated_at = CURRENT_TIMESTAMP
   WHERE candidacy_id IN (
     SELECT id FROM candidacies WHERE constituency_id = NEW.id
   );
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `reviews_candidate_profile_version_guard`;--> statement-breakpoint
CREATE TRIGGER `reviews_candidate_profile_version_guard`
BEFORE INSERT ON `reviews`
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
END;--> statement-breakpoint
PRAGMA foreign_key_check;
