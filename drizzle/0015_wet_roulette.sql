CREATE TABLE `public_publication_head` (
	`singleton` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`head` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	CONSTRAINT "public_publication_head_singleton_check" CHECK("public_publication_head"."singleton" = 1),
	CONSTRAINT "public_publication_head_format_check" CHECK(length("public_publication_head"."head") = 32 AND "public_publication_head"."head" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
INSERT INTO `public_publication_head` (`singleton`) VALUES (1);
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_source_insert`
AFTER INSERT ON `source_items`
WHEN NEW.review_state = 'approved'
 AND NEW.publication_state = 'published'
 AND EXISTS (
   SELECT 1 FROM sources
    WHERE sources.id = NEW.source_id
      AND sources.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
 )
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_source_update`
AFTER UPDATE OF source_id, latest_version_id, content_hash, review_state, publication_state ON `source_items`
WHEN (
    (
      OLD.review_state = 'approved'
      AND OLD.publication_state = 'published'
      AND EXISTS (
        SELECT 1 FROM sources
         WHERE sources.id = OLD.source_id
           AND sources.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
      )
    )
    OR (
      NEW.review_state = 'approved'
      AND NEW.publication_state = 'published'
      AND EXISTS (
        SELECT 1 FROM sources
         WHERE sources.id = NEW.source_id
           AND sources.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
      )
    )
  )
  AND (
    OLD.source_id IS NOT NEW.source_id
    OR OLD.latest_version_id IS NOT NEW.latest_version_id
    OR OLD.content_hash IS NOT NEW.content_hash
    OR OLD.review_state IS NOT NEW.review_state
    OR OLD.publication_state IS NOT NEW.publication_state
  )
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_source_delete`
AFTER DELETE ON `source_items`
WHEN OLD.review_state = 'approved'
 AND OLD.publication_state = 'published'
 AND EXISTS (
   SELECT 1 FROM sources
    WHERE sources.id = OLD.source_id
      AND sources.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
 )
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_source_rights_update`
AFTER UPDATE OF name, rights_state ON `sources`
WHEN EXISTS (
    SELECT 1
      FROM source_items items
     WHERE items.source_id = NEW.id
       AND items.review_state = 'approved'
       AND items.publication_state = 'published'
  )
  AND (
    (
      OLD.name IS NOT NEW.name
      AND NEW.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
    )
    OR (
      (
        OLD.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
        AND NEW.rights_state NOT IN ('restricted-copy', 'metadata-only', 'public-record')
      )
      OR (
        OLD.rights_state NOT IN ('restricted-copy', 'metadata-only', 'public-record')
        AND NEW.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
      )
    )
  )
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_assignment_review`
AFTER INSERT ON `reviews`
WHEN NEW.target_type = 'source-item-version-assignment'
 AND EXISTS (
   SELECT 1
     FROM source_item_versions versions
     JOIN source_items items ON items.id = versions.source_item_id
     JOIN sources ON sources.id = items.source_id
    WHERE versions.id = NEW.target_id
      AND items.latest_version_id = versions.id
      AND items.review_state = 'approved'
      AND items.publication_state = 'published'
      AND sources.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
 )
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_topic_update`
AFTER UPDATE OF name, active ON `policy_topics`
WHEN (OLD.name IS NOT NEW.name OR OLD.active IS NOT NEW.active)
 AND (OLD.active = 1 OR NEW.active = 1)
 AND EXISTS (
   SELECT 1
     FROM source_item_version_entities binding
     JOIN source_item_versions versions
       ON versions.id = binding.source_item_version_id
     JOIN source_items items
       ON items.id = versions.source_item_id
      AND items.latest_version_id = versions.id
      AND items.review_state = 'approved'
      AND items.publication_state = 'published'
     JOIN sources ON sources.id = items.source_id
    WHERE binding.entity_type = 'topic'
      AND binding.entity_id = NEW.id
      AND binding.confirmation_state = 'confirmed'
      AND sources.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
 )
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_constituency_update`
AFTER UPDATE OF name ON `constituencies`
WHEN OLD.name IS NOT NEW.name
 AND (
   EXISTS (
     SELECT 1
       FROM candidate_profiles profiles
       JOIN candidacies ON candidacies.id = profiles.candidacy_id
      WHERE candidacies.constituency_id = NEW.id
        AND candidacies.declaration_status = 'prospective'
        AND profiles.current_basis_hash IS NOT NULL
        AND profiles.review_state = 'approved'
        AND profiles.publication_state = 'published'
   )
   OR EXISTS (
     SELECT 1
       FROM source_item_version_entities binding
       JOIN source_item_versions versions
         ON versions.id = binding.source_item_version_id
       JOIN source_items items
         ON items.id = versions.source_item_id
        AND items.latest_version_id = versions.id
        AND items.review_state = 'approved'
        AND items.publication_state = 'published'
       JOIN sources ON sources.id = items.source_id
      WHERE binding.entity_type = 'constituency'
        AND binding.entity_id = NEW.id
        AND binding.confirmation_state = 'confirmed'
        AND sources.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
   )
 )
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_candidate_profile_insert`
AFTER INSERT ON `candidate_profiles`
WHEN NEW.review_state = 'approved' AND NEW.publication_state = 'published'
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_candidate_profile_update`
AFTER UPDATE OF slug, profile_url_hash, observed_constituency_id,
  current_directory_observation_id, current_basis_hash, review_state,
  publication_state ON `candidate_profiles`
WHEN (
    (OLD.review_state = 'approved' AND OLD.publication_state = 'published')
    OR (NEW.review_state = 'approved' AND NEW.publication_state = 'published')
  )
  AND (
    OLD.slug IS NOT NEW.slug
    OR OLD.profile_url_hash IS NOT NEW.profile_url_hash
    OR OLD.observed_constituency_id IS NOT NEW.observed_constituency_id
    OR OLD.current_directory_observation_id IS NOT NEW.current_directory_observation_id
    OR OLD.current_basis_hash IS NOT NEW.current_basis_hash
    OR OLD.review_state IS NOT NEW.review_state
    OR OLD.publication_state IS NOT NEW.publication_state
  )
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_candidate_profile_delete`
AFTER DELETE ON `candidate_profiles`
WHEN OLD.review_state = 'approved' AND OLD.publication_state = 'published'
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_candidate_analysis_insert`
AFTER INSERT ON `candidate_intelligence_heads`
WHEN NEW.analysis_state = 'approved'
 AND NEW.publication_state = 'published'
 AND NEW.published_revision_id IS NOT NULL
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_candidate_analysis_update`
AFTER UPDATE OF analysis_state, publication_state, published_revision_id
ON `candidate_intelligence_heads`
WHEN (
    (
      OLD.analysis_state = 'approved'
      AND OLD.publication_state = 'published'
      AND OLD.published_revision_id IS NOT NULL
    )
    OR (
      NEW.analysis_state = 'approved'
      AND NEW.publication_state = 'published'
      AND NEW.published_revision_id IS NOT NULL
    )
  )
  AND (
    OLD.analysis_state IS NOT NEW.analysis_state
    OR OLD.publication_state IS NOT NEW.publication_state
    OR OLD.published_revision_id IS NOT NEW.published_revision_id
  )
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `public_publication_head_candidate_analysis_delete`
AFTER DELETE ON `candidate_intelligence_heads`
WHEN OLD.analysis_state = 'approved'
 AND OLD.publication_state = 'published'
 AND OLD.published_revision_id IS NOT NULL
BEGIN
  UPDATE public_publication_head
     SET head = lower(hex(randomblob(16)))
   WHERE singleton = 1;
END;
