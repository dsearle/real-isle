import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { getEvidenceDashboardForDatabase } from "../app/lib/evidence/status.ts";

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

function seedEditorialCorpus(database) {
  database.prepare(
    `INSERT INTO sources (
       id, name, publisher, homepage_url, feed_url, feed_type, source_tier
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "scale-source",
    "Scale source",
    "Scale publisher",
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
    "scale-run",
    "scale-source",
    "scheduler",
    "scale-run-1",
    "system",
    "scale-monitor",
    "feed-v1",
    "2026-08-11T12:00:00.000Z",
  );

  const insertItem = database.prepare(
    `INSERT INTO source_items (
       id, source_id, canonical_url, canonical_url_hash, title, summary,
       first_seen_at, last_seen_at, latest_version_id, content_hash,
       review_state, publication_state, source_tier
     ) VALUES (?, 'scale-source', ?, ?, ?, '', ?, ?, ?, ?, ?, ?, 3)`,
  );
  const insertVersion = database.prepare(
    `INSERT INTO source_item_versions (
       id, source_item_id, ingestion_run_id, observed_at, payload,
       payload_hash, parser_version
     ) VALUES (?, ?, 'scale-run', ?, '{}', ?, 'feed-v1')`,
  );

  database.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < 303; index += 1) {
      const suffix = index.toString().padStart(4, "0");
      const itemId = `item-scale-${suffix}`;
      const versionId = `version-scale-${suffix}`;
      const hash = index.toString(16).padStart(64, "0");
      const editorialState = index === 301
        ? "approved"
        : index === 302 ? "rejected" : "unreviewed";
      const seenAt = `2026-08-11T12:${Math.floor(index / 60).toString().padStart(2, "0")}:${(index % 60).toString().padStart(2, "0")}.000Z`;
      insertItem.run(
        itemId,
        `https://example.im/story/${suffix}`,
        hash,
        `Scale item ${suffix}`,
        seenAt,
        seenAt,
        versionId,
        hash,
        "unreviewed",
        "private",
      );
      insertVersion.run(versionId, itemId, seenAt, hash);
      if (editorialState === "approved" || editorialState === "rejected") {
        database.prepare(
          `INSERT INTO reviews (
             id, target_type, target_id, decision, rationale, reviewer_id, created_at
           ) VALUES (?, 'source-item-version', ?, ?, ?, 'reviewer-scale', ?)`,
        ).run(
          `review-scale-${suffix}`,
          versionId,
          editorialState,
          editorialState === "approved"
            ? "Approved after checking the source metadata."
            : "Rejected because this source item is outside the election evidence scope.",
          seenAt,
        );
        database.prepare(
          `UPDATE source_items
              SET review_state = ?, publication_state = ?
            WHERE id = ?`,
        ).run(
          editorialState,
          editorialState === "approved" ? "published" : "withheld",
          itemId,
        );
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

test("dashboard exposes approved and rejected lanes beyond 300 pending records", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    applyMigrations(database);
    seedEditorialCorpus(database);

    const lifecycleTriggers = database.prepare(
      `SELECT name FROM sqlite_schema
        WHERE type = 'trigger'
          AND name IN (
            'reviews_supersession_guard',
            'reviews_source_item_version_guard',
            'reviews_source_item_candidate_assignment_guard',
            'reviews_no_update',
            'reviews_no_delete',
            'source_item_version_entities_insert_guard',
            'source_item_version_entities_no_update',
            'source_item_version_entities_no_delete',
            'candidate_intelligence_invalidate_source_version_change',
            'candidate_intelligence_revision_insert_guard',
            'candidate_intelligence_revision_update_guard'
          )
        ORDER BY name`,
    ).all();
    assert.equal(lifecycleTriggers.length, 11);
    assert.throws(
      () => database.prepare(
        "UPDATE reviews SET rationale = ? WHERE id = ?",
      ).run("Rewritten decision", "review-scale-0301"),
      /immutable/,
    );
    assert.throws(
      () => database.prepare(
        `INSERT INTO reviews (
           id, target_type, target_id, decision, rationale, reviewer_id, created_at
         ) VALUES (?, 'candidate-analysis-revision', ?, 'maybe', ?, ?, ?)`,
      ).run(
        "invalid-review",
        "analysis-revision",
        "Invalid decision should not persist.",
        "reviewer-scale",
        "2026-08-11T13:00:00.000Z",
      ),
      /invalid editorial decision/,
    );
    database.prepare("INSERT INTO policy_topics (id, name) VALUES (?, ?)")
      .run("test-topic", "Test topic");
    database.prepare(
      `INSERT INTO source_item_version_entities (
         source_item_version_id, entity_type, entity_id, mention_text,
         match_method, confidence, review_id, confirmation_state, created_at
       ) VALUES (?, 'topic', ?, ?, ?, ?, ?, 'confirmed', ?)`,
    ).run(
      "version-scale-0301",
      "test-topic",
      "Test topic",
      "migration-guard-test",
      1,
      "review-scale-0301",
      "2026-08-11T13:00:00.000Z",
    );
    assert.throws(
      () => database.prepare(
        "DELETE FROM source_item_version_entities WHERE review_id = ?",
      ).run("review-scale-0301"),
      /immutable/,
    );

    const dashboard = await getEvidenceDashboardForDatabase(d1Adapter(database));
    assert.equal(dashboard.reviewItems.length, 303);
    assert.equal(
      dashboard.reviewItems.filter((item) => item.editorialState === "pending").length,
      301,
    );
    assert.equal(
      dashboard.reviewItems.filter((item) => item.editorialState === "approved").length,
      1,
    );
    assert.equal(
      dashboard.reviewItems.filter((item) => item.editorialState === "rejected").length,
      1,
    );
    assert.equal(dashboard.counts.pendingReview, 301);
    assert.equal(dashboard.counts.approvedEvidence, 1);
    assert.equal(dashboard.counts.rejectedEvidence, 1);
    assert.equal(
      dashboard.reviewItems.find((item) => item.editorialState === "approved")
        ?.currentDecision?.decision,
      "approved",
    );
    assert.equal(
      dashboard.reviewItems.find((item) => item.editorialState === "rejected")
        ?.currentDecision?.decision,
      "rejected",
    );
  } finally {
    database.close();
  }
});
