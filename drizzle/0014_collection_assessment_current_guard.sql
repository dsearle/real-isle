DROP TRIGGER IF EXISTS `collection_assessment_current_version_guard`;--> statement-breakpoint
CREATE TRIGGER `collection_assessment_current_version_guard`
BEFORE INSERT ON `source_item_version_collection_assessments`
WHEN NOT EXISTS (
  SELECT 1
    FROM `source_item_versions` versions
    JOIN `source_items` items ON items.id = versions.source_item_id
    JOIN `audit_events` audit ON audit.id = NEW.created_by_audit_event_id
   WHERE versions.id = NEW.source_item_version_id
     AND items.latest_version_id = versions.id
     AND items.content_hash = versions.payload_hash
     AND audit.action = 'source-item.relevance-assessed'
     AND audit.entity_type = 'source-item-version'
     AND audit.entity_id = versions.id
     AND json_extract(audit.payload, '$.sourceItemId') = items.id
     AND json_extract(audit.payload, '$.collectionReasonHash') = NEW.canonical_reason_hash
     AND json_extract(audit.payload, '$.collectionRoute') = NEW.route
     AND json_extract(audit.payload, '$.collectionRuleset') = NEW.ruleset_id
)
BEGIN SELECT RAISE(ABORT, 'collection assessment target is stale'); END;--> statement-breakpoint
PRAGMA foreign_key_check;
