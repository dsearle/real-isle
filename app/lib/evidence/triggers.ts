const evidenceTriggerSql = [
  `CREATE TRIGGER IF NOT EXISTS audit_event_chain_guard
   BEFORE INSERT ON audit_events
   BEGIN
     SELECT CASE
       WHEN NEW.sequence != (SELECT next_sequence FROM audit_chain_head WHERE chain_id = 1)
       THEN RAISE(ABORT, 'audit sequence mismatch')
     END;
     SELECT CASE
       WHEN NEW.previous_event_hash IS NOT (SELECT last_event_hash FROM audit_chain_head WHERE chain_id = 1)
       THEN RAISE(ABORT, 'audit previous hash mismatch')
     END;
   END`,
  `CREATE TRIGGER IF NOT EXISTS audit_event_chain_advance
   AFTER INSERT ON audit_events
   BEGIN
     UPDATE audit_chain_head
        SET next_sequence = NEW.sequence + 1,
            last_event_hash = NEW.event_hash,
            updated_at = CURRENT_TIMESTAMP
      WHERE chain_id = 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS audit_events_no_update
   BEFORE UPDATE ON audit_events
   BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
   BEFORE DELETE ON audit_events
   BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS source_snapshots_no_update
   BEFORE UPDATE ON source_snapshots
   BEGIN SELECT RAISE(ABORT, 'source snapshots are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS source_snapshots_no_delete
   BEFORE DELETE ON source_snapshots
   BEGIN SELECT RAISE(ABORT, 'source snapshots are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS source_item_versions_no_update
   BEFORE UPDATE ON source_item_versions
   BEGIN SELECT RAISE(ABORT, 'source item versions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS source_item_versions_no_delete
   BEFORE DELETE ON source_item_versions
   BEGIN SELECT RAISE(ABORT, 'source item versions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS candidate_profile_observations_no_update
   BEFORE UPDATE ON candidate_profile_observations
   BEGIN SELECT RAISE(ABORT, 'candidate profile observations are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS candidate_profile_observations_no_delete
   BEFORE DELETE ON candidate_profile_observations
   BEGIN SELECT RAISE(ABORT, 'candidate profile observations are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS revisions_no_update
   BEFORE UPDATE ON revisions
   BEGIN SELECT RAISE(ABORT, 'revisions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS revisions_no_delete
   BEFORE DELETE ON revisions
   BEGIN SELECT RAISE(ABORT, 'revisions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS reviews_no_update
   BEFORE UPDATE ON reviews
   BEGIN SELECT RAISE(ABORT, 'review decisions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS reviews_no_delete
   BEFORE DELETE ON reviews
   BEGIN SELECT RAISE(ABORT, 'review decisions are immutable'); END`,
] as const;

let triggerInitialization: Promise<void> | null = null;

export function ensureEvidenceTriggers(db: D1Database) {
  if (!triggerInitialization) {
    triggerInitialization = db
      .batch(evidenceTriggerSql.map((statement) => db.prepare(statement)))
      .then(() => undefined)
      .catch((error) => {
        triggerInitialization = null;
        throw error;
      });
  }
  return triggerInitialization;
}
