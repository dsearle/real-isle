import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { appendAuditEventWithStatements } from "../app/lib/evidence/audit.ts";
import {
  appendLegacyCollectionAssessment,
  collectionAssessmentNoDeleteSql,
  collectionAssessmentNoUpdateSql,
  insertCollectionAssessmentStatement,
  legacyCollectionAssessmentBacklogSql,
  prepareCollectionAssessment,
  readVerifiedCollectionReason,
  shouldAppendLegacyCollectionAssessment,
} from "../app/lib/evidence/collection-assessment.ts";
import { projectCollectionReason } from "../app/lib/evidence/collection-reason.ts";
import {
  deleteCurrentKeywordSignalsSql,
  insertCurrentKeywordSignalSql,
  projectKeywordCollectionSignals,
} from "../app/lib/evidence/collection-signals.ts";
import {
  reviewSourceItemVersion,
  SourceItemReviewConflictError,
} from "../app/lib/evidence/review.ts";
import { ensureEvidenceTriggers } from "../app/lib/evidence/triggers.ts";

function applyMigrations(database) {
  const migrationFiles = readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  for (const file of migrationFiles) {
    const sql = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
}

function d1Adapter(database) {
  const prepare = (sql, bound = []) => ({
    bind(...values) {
      return prepare(sql, values);
    },
    async all() {
      return { results: database.prepare(sql).all(...bound) };
    },
    async first() {
      return database.prepare(sql).get(...bound);
    },
    async run() {
      const result = database.prepare(sql).run(...bound);
      return { meta: { changes: Number(result.changes) } };
    },
  });
  return {
    prepare,
    async batch(statements) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function seedVersionParents(database) {
  database.prepare(
    `INSERT INTO sources (
       id, name, publisher, homepage_url, feed_url, feed_type, source_tier
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "test-source",
    "Test source",
    "Test publisher",
    "https://example.im/",
    "https://example.im/feed.xml",
    "rss",
    3,
  );
  database.prepare(
    `INSERT INTO ingestion_runs (
       id, source_id, trigger, idempotency_key, actor_type, actor_id,
       parser_version, started_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "run-1",
    "test-source",
    "scheduler",
    "test-run-1",
    "system",
    "test-monitor",
    "feed-v1",
    "2026-08-11T12:00:00.000Z",
  );
  database.prepare(
    `INSERT INTO source_items (
       id, source_id, canonical_url, canonical_url_hash, title, summary,
       first_seen_at, last_seen_at, source_tier
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "item_test",
    "test-source",
    "https://example.im/story",
    "a".repeat(64),
    "Candidate publishes manifesto",
    "The candidate discusses Mooir Vannin.",
    "2026-08-11T12:00:00.000Z",
    "2026-08-11T12:00:00.000Z",
    3,
  );
}

test("legacy windfarm wording freezes as contextual evidence under current rules", () => {
  for (const searchableText of [
    "Windfarm consultation opens",
    "Latest position on Mooir Vannin",
  ]) {
    const signals = projectKeywordCollectionSignals(searchableText, []);
    const reason = projectCollectionReason({
      ...signals,
      itemType: "news",
      sourceFeedType: "rss",
      sourceId: "manx-radio-island-news",
      sourceName: "Manx Radio island news",
      summary: "",
      title: searchableText,
    });
    assert.equal(reason.route, "context-monitoring");
    assert.equal(reason.topics.some((topic) => topic.id === "wind"), true);
  }
});

test("an unchanged candidate version reuses a generic assessment frozen by backlog", () => {
  assert.equal(shouldAppendLegacyCollectionAssessment(false, true), false);
  assert.equal(shouldAppendLegacyCollectionAssessment(false, false), true);
  assert.equal(shouldAppendLegacyCollectionAssessment(true, false), false);
});

test("the forward migration creates one immutable assessment per source version", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    applyMigrations(database);

    const columns = database.prepare(
      "SELECT name, pk FROM pragma_table_info('source_item_version_collection_assessments')",
    ).all();
    assert.equal(columns.find((column) => column.name === "source_item_version_id")?.pk, 1);
    const triggers = database.prepare(
      `SELECT name FROM sqlite_schema
        WHERE type = 'trigger' AND tbl_name = 'source_item_version_collection_assessments'
        ORDER BY name`,
    ).all();
    assert.deepEqual(triggers.map((trigger) => trigger.name), [
      "collection_assessments_no_delete",
      "collection_assessments_no_update",
    ]);
    assert.equal(
      database.prepare(
        `SELECT COUNT(*) AS count FROM pragma_foreign_key_list(
          'source_item_version_collection_assessments'
        )`,
      ).get().count,
      2,
    );
  } finally {
    database.close();
  }
});

test("an audited batch inserts the version, audit row, then its FK-linked assessment", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    applyMigrations(database);
    seedVersionParents(database);
    const db = d1Adapter(database);
    await ensureEvidenceTriggers(db);
    const reason = projectCollectionReason({
      candidates: [{
        confidence: 0.98,
        id: "candidate-a",
        label: "Candidate A",
        matchMethod: "deterministic-keyword-v1",
        mentionText: "Candidate A",
      }],
      constituencies: [],
      itemType: "news",
      sourceFeedType: "rss",
      sourceId: "test-source",
      sourceName: "Test source",
      summary: "The candidate discusses Mooir Vannin.",
      title: "Candidate publishes manifesto",
      topics: [{
        confidence: 0.7,
        id: "wind",
        label: "Offshore wind",
        matchMethod: "deterministic-keyword-v1",
        mentionText: "mooir vannin",
      }],
    });
    const assessment = await prepareCollectionAssessment("itemversion_test", reason);

    const audit = await appendAuditEventWithStatements(
      db,
      {
        action: "source-item.discovered",
        actorId: "test-monitor",
        actorType: "system",
        entityId: "item_test",
        entityType: "source-item",
        payload: {
          collectionReasonHash: assessment.canonicalReasonHash,
          collectionRoute: assessment.route,
          collectionRuleset: assessment.rulesetId,
        },
      },
      () => [
        db.prepare(
          `INSERT INTO source_item_versions (
             id, source_item_id, ingestion_run_id, observed_at, payload,
             payload_hash, parser_version
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          "itemversion_test",
          "item_test",
          "run-1",
          "2026-08-11T12:00:00.000Z",
          "{}",
          "b".repeat(64),
          "feed-v1",
        ),
        db.prepare(
          `UPDATE source_items
              SET latest_version_id = ?, content_hash = ?
            WHERE id = ?`,
        ).bind("itemversion_test", "b".repeat(64), "item_test"),
      ],
      (event) => [insertCollectionAssessmentStatement(db, assessment, event)],
    );

    const stored = database.prepare(
      `SELECT assessments.*, audit.action
         FROM source_item_version_collection_assessments assessments
         JOIN audit_events audit ON audit.id = assessments.created_by_audit_event_id
        WHERE assessments.source_item_version_id = ?`,
    ).get("itemversion_test");
    assert.equal(stored.created_by_audit_event_id, audit.id);
    assert.equal(stored.action, "source-item.discovered");
    assert.equal(stored.canonical_reason_hash, assessment.canonicalReasonHash);
    assert.equal(stored.canonical_reason_json.includes("Candidate A"), true);
    assert.equal(stored.canonical_reason_json.includes("mooir vannin"), true);
    assert.deepEqual(
      await readVerifiedCollectionReason({
        canonical_reason_hash: stored.canonical_reason_hash,
        canonical_reason_json: stored.canonical_reason_json,
        collection_route: stored.route,
        collection_ruleset_id: stored.ruleset_id,
      }),
      reason,
    );
    const reviewInput = {
      candidateIds: [],
      candidateSuggestionFingerprint: "e".repeat(64),
      decision: "rejected",
      expectedCollectionReasonHash: assessment.canonicalReasonHash,
      expectedCollectionRuleset: assessment.rulesetId,
      expectedContentHash: "b".repeat(64),
      expectedVersionId: "itemversion_test",
      itemId: "item_test",
      rationale: "This captured item is not relevant to the election evidence set.",
      reviewKind: "source-version",
      reviewerId: "reviewer-a",
    };
    await assert.rejects(
      reviewSourceItemVersion(db, {
        ...reviewInput,
        expectedCollectionReasonHash: "f".repeat(64),
      }),
      SourceItemReviewConflictError,
    );
    const reviewReceipt = await reviewSourceItemVersion(db, reviewInput);
    assert.equal(reviewReceipt.collectionReasonHash, assessment.canonicalReasonHash);
    assert.equal(reviewReceipt.collectionRuleset, assessment.rulesetId);
    assert.equal(reviewReceipt.idempotent, false);
    const reviewAudit = database.prepare(
      `SELECT payload FROM audit_events
        WHERE action = 'source-item.reviewed' AND entity_id = ?`,
    ).get("itemversion_test");
    assert.deepEqual(
      {
        hash: JSON.parse(reviewAudit.payload).collectionReasonHash,
        ruleset: JSON.parse(reviewAudit.payload).collectionRuleset,
      },
      { hash: assessment.canonicalReasonHash, ruleset: assessment.rulesetId },
    );
    const replayReceipt = await reviewSourceItemVersion(db, reviewInput);
    assert.equal(replayReceipt.idempotent, true);
    assert.equal(replayReceipt.collectionReasonHash, assessment.canonicalReasonHash);
    const auditCountBeforeReplay = database.prepare(
      "SELECT COUNT(*) AS count FROM audit_events",
    ).get().count;
    assert.equal(await appendLegacyCollectionAssessment({
      actor: { id: "test-monitor", type: "system" },
      assessment,
      db,
      sourceItemId: "item_test",
    }), false);
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count,
      auditCountBeforeReplay,
    );
    const mismatchedAssessment = await prepareCollectionAssessment(
      "itemversion_test",
      projectCollectionReason({
        candidates: [],
        constituencies: [],
        itemType: "news",
        sourceFeedType: "rss",
        sourceId: "test-source",
        sourceName: "Test source",
        summary: "Unrelated community notice.",
        title: "Community notice",
        topics: [],
      }),
    );
    await assert.rejects(
      appendLegacyCollectionAssessment({
        actor: { id: "test-monitor", type: "system" },
        assessment: mismatchedAssessment,
        db,
        sourceItemId: "item_test",
      }),
      /does not match the deterministic assessment/,
    );

    assert.throws(
      () => database.prepare(
        `INSERT INTO source_item_version_collection_assessments (
           source_item_version_id, ruleset_id, route, canonical_reason_json,
           canonical_reason_hash, created_by_audit_event_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "itemversion_test",
        "collection-routing-v2",
        assessment.route,
        assessment.canonicalReasonJson,
        assessment.canonicalReasonHash,
        audit.id,
        "2026-08-11T12:01:00.000Z",
      ),
      /UNIQUE constraint failed/,
    );

    database.prepare(
      `INSERT INTO source_items (
         id, source_id, canonical_url, canonical_url_hash, title, summary,
         first_seen_at, last_seen_at, latest_version_id, content_hash, source_tier
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "item_legacy",
      "test-source",
      "https://example.im/older-story",
      "c".repeat(64),
      "Older pending story",
      "Captured before the relevance ledger existed.",
      "2026-08-10T12:00:00.000Z",
      "2026-08-10T12:00:00.000Z",
      "itemversion_legacy",
      "d".repeat(64),
      3,
    );
    database.prepare(
      `INSERT INTO source_item_versions (
         id, source_item_id, ingestion_run_id, observed_at, payload,
         payload_hash, parser_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "itemversion_legacy",
      "item_legacy",
      "run-1",
      "2026-08-10T12:00:00.000Z",
      "{}",
      "d".repeat(64),
      "feed-v1",
    );
    const backlog = database.prepare(legacyCollectionAssessmentBacklogSql).all(8);
    assert.deepEqual(
      backlog.map((item) => item.source_item_version_id),
      ["itemversion_legacy"],
    );
    database.prepare(
      `INSERT INTO source_item_versions (
         id, source_item_id, ingestion_run_id, observed_at, payload,
         payload_hash, parser_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "itemversion_newer",
      "item_legacy",
      "run-1",
      "2026-08-11T13:00:00.000Z",
      "{\"newer\":true}",
      "1".repeat(64),
      "feed-v1",
    );
    database.prepare(
      "UPDATE source_items SET latest_version_id = ?, content_hash = ? WHERE id = ?",
    ).run("itemversion_newer", "1".repeat(64), "item_legacy");
    database.prepare(
      `INSERT INTO item_entities (
         item_id, entity_type, entity_id, mention_text, match_method, confidence
       ) VALUES (?, 'topic', 'newer-topic', 'newer topic', 'deterministic-keyword-v1', 0.7)`,
    ).run("item_legacy");
    assert.equal(
      database.prepare(deleteCurrentKeywordSignalsSql)
        .run("item_legacy", "item_legacy", "itemversion_legacy").changes,
      0,
    );
    assert.equal(
      database.prepare(insertCurrentKeywordSignalSql).run(
        "item_legacy",
        "topic",
        "wind",
        "windfarm",
        0.7,
        "item_legacy",
        "itemversion_legacy",
      ).changes,
      0,
    );
    assert.deepEqual(
      database.prepare(
        "SELECT entity_id FROM item_entities WHERE item_id = ? ORDER BY entity_id",
      ).all("item_legacy").map((entity) => entity.entity_id),
      ["newer-topic"],
    );

    assert.throws(
      () => database.prepare(
        "UPDATE source_item_version_collection_assessments SET route = ? WHERE source_item_version_id = ?",
      ).run("broad-monitoring", "itemversion_test"),
      /collection assessments are immutable/,
    );
    assert.throws(
      () => database.prepare(
        "DELETE FROM source_item_version_collection_assessments WHERE source_item_version_id = ?",
      ).run("itemversion_test"),
      /collection assessments are immutable/,
    );

    database.exec(collectionAssessmentNoUpdateSql.replace("IF NOT EXISTS ", "IF NOT EXISTS "));
    database.exec(collectionAssessmentNoDeleteSql.replace("IF NOT EXISTS ", "IF NOT EXISTS "));
  } finally {
    database.close();
  }
});
