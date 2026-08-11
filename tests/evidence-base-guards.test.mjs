import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function applyMigrations(database) {
  const migrationFiles = readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const file of migrationFiles) {
      const sql = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) database.exec(statement);
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

test("fresh migrations enforce the audit chain and immutable evidence records before app startup", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    applyMigrations(database);

    const requiredTriggers = [
      "audit_event_chain_advance",
      "audit_event_chain_guard",
      "audit_events_no_delete",
      "audit_events_no_update",
      "candidate_profile_observations_no_delete",
      "candidate_profile_observations_no_update",
      "collection_assessments_no_delete",
      "collection_assessments_no_update",
      "evidence_transcript_segment_guard",
      "evidence_transcript_segment_update_guard",
      "revisions_no_delete",
      "revisions_no_update",
      "source_item_versions_no_delete",
      "source_item_versions_no_update",
      "source_snapshots_no_delete",
      "source_snapshots_no_update",
      "transcript_segments_content_no_update",
      "transcript_segments_no_delete",
      "transcripts_candidate_guard",
      "transcripts_content_no_update",
      "transcripts_no_delete",
    ];
    const installed = database.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'trigger' ORDER BY name",
    ).all().map((row) => row.name);
    for (const name of requiredTriggers) assert.ok(installed.includes(name), `${name} is installed`);

    const zeroHash = "0".repeat(64);
    const firstHash = "1".repeat(64);
    database.prepare(
      `INSERT INTO audit_events (
         sequence, id, actor_type, actor_id, action, entity_type, entity_id,
         payload, payload_hash, previous_event_hash, event_hash, created_at
       ) VALUES (1, 'audit-1', 'system', 'migration-test', 'test.appended',
         'test-record', 'record-1', '{}', ?, ?, ?, ?)`
    ).run("2".repeat(64), zeroHash, firstHash, "2026-08-11T12:00:00.000Z");
    assert.deepEqual(
      { ...database.prepare(
        "SELECT next_sequence, last_event_hash FROM audit_chain_head WHERE chain_id = 1",
      ).get() },
      { last_event_hash: firstHash, next_sequence: 2 },
    );
    assert.throws(
      () => database.prepare("UPDATE audit_events SET payload = '{}' WHERE id = 'audit-1'").run(),
      /immutable/,
    );
    assert.throws(
      () => database.prepare("DELETE FROM audit_events WHERE id = 'audit-1'").run(),
      /immutable/,
    );
    assert.throws(
      () => database.prepare(
        `INSERT INTO audit_events (
           sequence, id, actor_type, actor_id, action, entity_type, entity_id,
           payload, payload_hash, previous_event_hash, event_hash, created_at
         ) VALUES (4, 'audit-bad', 'system', 'migration-test', 'test.invalid',
           'test-record', 'record-1', '{}', ?, ?, ?, ?)`
      ).run(
        "3".repeat(64),
        firstHash,
        "4".repeat(64),
        "2026-08-11T12:01:00.000Z",
      ),
      /audit sequence mismatch/,
    );

    database.prepare(
      `INSERT INTO revisions (
         id, entity_type, entity_id, revision_number, payload,
         payload_hash, reason, actor_id
       ) VALUES ('revision-1', 'test-record', 'record-1', 1, '{}', ?, 'test', 'migration-test')`,
    ).run("5".repeat(64));
    assert.throws(
      () => database.prepare("UPDATE revisions SET reason = 'rewritten' WHERE id = 'revision-1'").run(),
      /immutable/,
    );
  } finally {
    database.close();
  }
});
