export const robotsPolicyInsertGuardSql = `CREATE TRIGGER IF NOT EXISTS robots_policies_insert_guard
BEFORE INSERT ON robots_policies
BEGIN
  SELECT RAISE(ABORT, 'robots policy audit binding is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM audit_events audit
      WHERE audit.id = NEW.created_by_audit_event_id
        AND audit.action = 'robots-policy.observed'
        AND audit.entity_type = 'source-host'
        AND audit.entity_id = NEW.exact_host
        AND json_extract(audit.payload, '$.policyId') = NEW.id
        AND json_extract(audit.payload, '$.rulesHash') = NEW.rules_hash
        AND json_extract(audit.payload, '$.policyState') = NEW.policy_state
   );
END`;

export const robotsPoliciesNoUpdateSql = `CREATE TRIGGER IF NOT EXISTS robots_policies_no_update
BEFORE UPDATE ON robots_policies
BEGIN
  SELECT RAISE(ABORT, 'robots policies are immutable');
END`;

export const robotsPoliciesNoDeleteSql = `CREATE TRIGGER IF NOT EXISTS robots_policies_no_delete
BEFORE DELETE ON robots_policies
BEGIN
  SELECT RAISE(ABORT, 'robots policies are immutable');
END`;

export const robotsPolicyHeadTargetGuardSql = `CREATE TRIGGER IF NOT EXISTS robots_policy_heads_target_guard
BEFORE INSERT ON robots_policy_heads
BEGIN
  SELECT RAISE(ABORT, 'robots policy head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM robots_policies policy
      WHERE policy.id = NEW.current_policy_id
        AND policy.exact_host = NEW.exact_host
        AND policy.user_agent_token = NEW.user_agent_token
   );
END`;

export const robotsPolicyHeadUpdateGuardSql = `CREATE TRIGGER IF NOT EXISTS robots_policy_heads_update_guard
BEFORE UPDATE OF current_policy_id ON robots_policy_heads
BEGIN
  SELECT RAISE(ABORT, 'robots policy head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM robots_policies policy
      WHERE policy.id = NEW.current_policy_id
        AND policy.exact_host = NEW.exact_host
        AND policy.user_agent_token = NEW.user_agent_token
   );
END`;

export const sourceDocumentCaptureInsertGuardSql = `CREATE TRIGGER IF NOT EXISTS source_document_captures_insert_guard
BEFORE INSERT ON source_document_captures
BEGIN
  SELECT RAISE(ABORT, 'document capture provenance is invalid')
   WHERE NOT EXISTS (
     SELECT 1
       FROM source_item_versions version
       JOIN source_items item ON item.id = version.source_item_id
       JOIN sources source ON source.id = item.source_id
       JOIN source_snapshots snapshot ON snapshot.id = NEW.snapshot_id
      WHERE version.id = NEW.source_item_version_id
        AND version.source_item_id = NEW.source_item_id
        AND snapshot.item_id = NEW.source_item_id
        AND snapshot.source_id = item.source_id
        AND snapshot.ingestion_run_id = NEW.ingestion_run_id
        AND snapshot.retention_outcome = NEW.retention_outcome
        AND source.active = 1
        AND source.rights_state = NEW.rights_state
        AND (
          (NEW.retention_outcome = 'metadata-only' AND snapshot.storage_key IS NULL)
          OR (
            NEW.retention_outcome = 'stored-private'
            AND source.store_full_content = 1
            AND source.rights_state = 'public-record'
            AND snapshot.storage_key IS NOT NULL
          )
        )
   );
  SELECT RAISE(ABORT, 'document capture audit binding is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM audit_events audit
      WHERE audit.id = NEW.created_by_audit_event_id
        AND audit.action = 'source-document.captured'
        AND audit.entity_type = 'source-item'
        AND audit.entity_id = NEW.source_item_id
        AND json_extract(audit.payload, '$.documentCaptureId') = NEW.id
        AND json_extract(audit.payload, '$.snapshotId') = NEW.snapshot_id
        AND json_extract(audit.payload, '$.sourceItemVersionId') = NEW.source_item_version_id
        AND json_extract(audit.payload, '$.manifestHash') = NEW.extraction_manifest_hash
        AND json_extract(audit.payload, '$.textHash') = NEW.readable_text_hash
   );
END`;

export const sourceDocumentCapturesNoUpdateSql = `CREATE TRIGGER IF NOT EXISTS source_document_captures_no_update
BEFORE UPDATE ON source_document_captures
BEGIN
  SELECT RAISE(ABORT, 'source document captures are immutable');
END`;

export const sourceDocumentCapturesNoDeleteSql = `CREATE TRIGGER IF NOT EXISTS source_document_captures_no_delete
BEFORE DELETE ON source_document_captures
BEGIN
  SELECT RAISE(ABORT, 'source document captures are immutable');
END`;

export const sourceDocumentHeadTargetGuardSql = `CREATE TRIGGER IF NOT EXISTS source_document_heads_target_guard
BEFORE INSERT ON source_document_heads
WHEN NEW.current_capture_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'document head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM source_document_captures capture
      WHERE capture.id = NEW.current_capture_id
        AND capture.source_item_id = NEW.source_item_id
   );
END`;

export const sourceDocumentHeadUpdateGuardSql = `CREATE TRIGGER IF NOT EXISTS source_document_heads_update_guard
BEFORE UPDATE OF current_capture_id ON source_document_heads
WHEN NEW.current_capture_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'document head target is invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM source_document_captures capture
      WHERE capture.id = NEW.current_capture_id
        AND capture.source_item_id = NEW.source_item_id
   );
END`;

export const documentCaptureTriggerSql = [
  robotsPolicyInsertGuardSql,
  robotsPoliciesNoUpdateSql,
  robotsPoliciesNoDeleteSql,
  robotsPolicyHeadTargetGuardSql,
  robotsPolicyHeadUpdateGuardSql,
  sourceDocumentCaptureInsertGuardSql,
  sourceDocumentCapturesNoUpdateSql,
  sourceDocumentCapturesNoDeleteSql,
  sourceDocumentHeadTargetGuardSql,
  sourceDocumentHeadUpdateGuardSql,
] as const;

const triggerInitializations = new WeakMap<object, Promise<void>>();

export function ensureDocumentCaptureTriggers(db: D1Database) {
  const existing = triggerInitializations.get(db);
  if (existing) return existing;
  const initialization = db
    .batch(documentCaptureTriggerSql.map((statement) => db.prepare(statement)))
    .then(() => undefined)
    .catch((error) => {
      triggerInitializations.delete(db);
      throw error;
    });
  triggerInitializations.set(db, initialization);
  return initialization;
}
