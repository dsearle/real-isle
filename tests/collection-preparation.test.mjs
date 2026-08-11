import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { appendAuditEventWithStatements } from "../app/lib/evidence/audit.ts";
import {
  insertCollectionAssessmentStatement,
  prepareCollectionAssessment,
} from "../app/lib/evidence/collection-assessment.ts";
import {
  CollectionPreparationConflictError,
  prepareSourceItemVersionForReview,
} from "../app/lib/evidence/collection-preparation.ts";
import { projectCollectionReason } from "../app/lib/evidence/collection-reason.ts";
import { reviewSourceItemVersion } from "../app/lib/evidence/review.ts";
import { getEvidenceDashboardForDatabase } from "../app/lib/evidence/status.ts";

function applyMigrations(database) {
  const files = readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const file of files) {
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

function seedMaryLikeUnfrozenItem(database) {
  const contentHash = "a".repeat(64);
  const payload = JSON.stringify({
    author: "Island newsroom",
    canonicalUrl: "https://news.example.im/election/mary-phillips-interview",
    documentHash: null,
    externalId: "mary-phillips-interview",
    publishedAt: "2026-08-10T09:00:00.000Z",
    summary: "General election candidate Mary Phillips answers questions from voters.",
    title: "General Election 2026 Candidate Interviews - Mary Phillips",
  });
  database.exec(`
    INSERT INTO elections (id, name, election_date, status)
    VALUES ('hok-2026', '2026 House of Keys General Election', '2026-09-24', 'upcoming');
    INSERT INTO constituencies (id, name) VALUES ('douglas-south', 'Douglas South');
    INSERT INTO people (id, full_name, sort_name, profile_state)
    VALUES ('mary-phillips', 'Mary Phillips', 'Phillips, Mary', 'draft');
    INSERT INTO candidacies (
      id, election_id, person_id, constituency_id, affiliation,
      declaration_status, verification_state
    ) VALUES (
      'hok-2026:mary-phillips', 'hok-2026', 'mary-phillips', 'douglas-south',
      'Independent', 'prospective', 'unverified'
    );
    INSERT INTO sources (
      id, name, publisher, homepage_url, feed_url, feed_type,
      source_tier, rights_state
    ) VALUES (
      'manx-radio-election', 'Manx Radio Election 2026', 'Manx Radio',
      'https://news.example.im/', 'https://news.example.im/election/feed.xml',
      'rss', 1, 'metadata-only'
    );
    INSERT INTO ingestion_runs (
      id, source_id, trigger, idempotency_key, actor_type, actor_id,
      parser_version, status, started_at, finished_at
    ) VALUES (
      'mary-run', 'manx-radio-election', 'scheduler', 'mary-run', 'system',
      'collector', 'feed-v1', 'succeeded',
      '2026-08-10T10:00:00.000Z', '2026-08-10T10:01:00.000Z'
    );
    INSERT INTO source_items (
      id, source_id, external_id, canonical_url, canonical_url_hash,
      item_type, title, summary, published_at, first_seen_at, last_seen_at,
      latest_version_id, content_hash, review_state, publication_state, source_tier
    ) VALUES (
      'item_mary_interview', 'manx-radio-election', 'mary-phillips-interview',
      'https://news.example.im/election/mary-phillips-interview', '${"b".repeat(64)}',
      'interview', 'General Election 2026 Candidate Interviews - Mary Phillips',
      'General election candidate Mary Phillips answers questions from voters.',
      '2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z',
      '2026-08-10T10:00:00.000Z', 'version_mary_interview', '${contentHash}',
      'unreviewed', 'private', 1
    );
    INSERT INTO source_item_versions (
      id, source_item_id, ingestion_run_id, observed_at, payload,
      payload_hash, parser_version
    ) VALUES (
      'version_mary_interview', 'item_mary_interview', 'mary-run',
      '2026-08-10T10:00:00.000Z', '${payload.replaceAll("'", "''")}',
      '${contentHash}', 'feed-v1'
    );
  `);
  return contentHash;
}

test("an exact unfrozen version becomes actionable without approving or publishing it", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    applyMigrations(database);
    const contentHash = seedMaryLikeUnfrozenItem(database);
    const db = d1Adapter(database);
    const before = await getEvidenceDashboardForDatabase(db);
    const beforeItem = before.reviewItems.find((item) => item.id === "item_mary_interview");
    assert.ok(beforeItem);
    assert.equal(beforeItem.collectionReasonState, "not-yet-frozen");
    assert.equal(beforeItem.collectionReasonHash, null);

    const receipt = await prepareSourceItemVersionForReview(db, {
      actorId: "admin-david-searle",
      expectedContentHash: contentHash,
      expectedVersionId: "version_mary_interview",
      itemId: "item_mary_interview",
    });
    assert.equal(receipt.idempotent, false);
    assert.equal(receipt.collectionRoute, "evidence-review");
    assert.match(receipt.collectionReasonHash, /^[0-9a-f]{64}$/);
    assert.equal(
      database.prepare(
        "SELECT review_state FROM source_items WHERE id = 'item_mary_interview'",
      ).get().review_state,
      "unreviewed",
    );
    assert.equal(
      database.prepare(
        "SELECT publication_state FROM source_items WHERE id = 'item_mary_interview'",
      ).get().publication_state,
      "private",
    );

    const after = await getEvidenceDashboardForDatabase(db);
    const actionable = after.reviewItems.find((item) => item.id === "item_mary_interview");
    assert.ok(actionable);
    assert.equal(actionable.collectionReasonState, "frozen");
    assert.equal(actionable.collectionReasonHash, receipt.collectionReasonHash);
    assert.equal(actionable.collectionReasonRuleset, receipt.collectionRuleset);
    assert.deepEqual(
      actionable.candidateAssociations.map((candidate) => candidate.candidacyId),
      ["hok-2026:mary-phillips"],
    );

    const review = await reviewSourceItemVersion(db, {
      candidateIds: actionable.candidateAssociations.map((candidate) => candidate.candidacyId),
      candidateSuggestionFingerprint: actionable.candidateSuggestionFingerprint,
      constituencyIds: actionable.constituencyAssociations.map((entry) => entry.id),
      decision: "approved",
      expectedCollectionReasonHash: actionable.collectionReasonHash,
      expectedCollectionRuleset: actionable.collectionReasonRuleset,
      expectedContentHash: contentHash,
      expectedPreviousReviewId: null,
      expectedVersionId: "version_mary_interview",
      itemId: "item_mary_interview",
      rationale: "Approved after preparing and inspecting the exact immutable source version.",
      reviewKind: "source-version",
      reviewerId: "admin-david-searle",
      scopeSuggestionFingerprint: actionable.collectionScopeSuggestionFingerprint,
      topicIds: actionable.topicAssociations.map((entry) => entry.id),
    });
    assert.equal(review.reviewState, "approved");

    const replay = await prepareSourceItemVersionForReview(db, {
      actorId: "admin-david-searle",
      expectedContentHash: contentHash,
      expectedVersionId: "version_mary_interview",
      itemId: "item_mary_interview",
    });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.auditSequence, receipt.auditSequence);
    assert.equal(replay.collectionReasonHash, receipt.collectionReasonHash);
  } finally {
    database.close();
  }
});

test("preparation rejects a stale version or content head and leaves no stray assessment", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    applyMigrations(database);
    const oldHash = seedMaryLikeUnfrozenItem(database);
    const newHash = "d".repeat(64);
    database.prepare(
      `INSERT INTO source_item_versions (
         id, source_item_id, ingestion_run_id, observed_at, payload,
         payload_hash, parser_version
       ) VALUES (?, 'item_mary_interview', 'mary-run', ?, ?, ?, 'feed-v1')`,
    ).run(
      "version_mary_interview_updated",
      "2026-08-10T11:00:00.000Z",
      JSON.stringify({
        canonicalUrl: "https://news.example.im/election/mary-phillips-interview",
        summary: "Updated interview record.",
        title: "Updated Mary Phillips interview",
      }),
      newHash,
    );
    database.prepare(
      `UPDATE source_items
          SET latest_version_id = ?, content_hash = ?
        WHERE id = 'item_mary_interview'`,
    ).run("version_mary_interview_updated", newHash);

    await assert.rejects(
      prepareSourceItemVersionForReview(d1Adapter(database), {
        actorId: "admin-david-searle",
        expectedContentHash: oldHash,
        expectedVersionId: "version_mary_interview",
        itemId: "item_mary_interview",
      }),
      CollectionPreparationConflictError,
    );
    assert.equal(
      database.prepare(
        "SELECT COUNT(*) AS count FROM source_item_version_collection_assessments",
      ).get().count,
      0,
    );
  } finally {
    database.close();
  }
});

test("an unrelated or forged audit event cannot authorize an assessment row", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    applyMigrations(database);
    seedMaryLikeUnfrozenItem(database);
    const db = d1Adapter(database);
    const reason = projectCollectionReason({
      candidates: [],
      constituencies: [],
      itemType: "interview",
      sourceFeedType: "rss",
      sourceId: "manx-radio-election",
      sourceName: "Manx Radio Election 2026",
      summary: "General election candidate Mary Phillips answers questions from voters.",
      title: "General Election 2026 Candidate Interviews - Mary Phillips",
      topics: [],
    });
    const assessment = await prepareCollectionAssessment("version_mary_interview", reason);
    const unrelatedAudit = await appendAuditEventWithStatements(db, {
      action: "source-item.relevance-assessed",
      actorId: "forged-actor",
      actorType: "admin",
      entityId: "different-version",
      entityType: "source-item-version",
      payload: {
        collectionReasonHash: assessment.canonicalReasonHash,
        collectionRoute: assessment.route,
        collectionRuleset: assessment.rulesetId,
        sourceItemId: "item_mary_interview",
      },
    }, () => []);

    await assert.rejects(
      insertCollectionAssessmentStatement(db, assessment, unrelatedAudit).run(),
      /collection assessment target is stale/,
    );
    assert.equal(
      database.prepare(
        "SELECT COUNT(*) AS count FROM source_item_version_collection_assessments",
      ).get().count,
      0,
    );
  } finally {
    database.close();
  }
});
