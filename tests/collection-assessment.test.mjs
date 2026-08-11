import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { appendAuditEventWithStatements } from "../app/lib/evidence/audit.ts";
import { fingerprintCandidateSuggestions } from "../app/lib/evidence/candidate-association.ts";
import { fingerprintScopeSuggestions } from "../app/lib/evidence/scope-association.ts";
import {
  appendLegacyCollectionAssessment,
  collectionAssessmentNoDeleteSql,
  collectionAssessmentNoUpdateSql,
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
import { getEvidenceDashboardForDatabase } from "../app/lib/evidence/status.ts";

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
      "collection_assessment_current_version_guard",
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

    await appendAuditEventWithStatements(
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
    );
    assert.equal(await appendLegacyCollectionAssessment({
      actor: { id: "test-monitor", type: "system" },
      assessment,
      db,
      sourceItemId: "item_test",
    }), true);

    const stored = database.prepare(
      `SELECT assessments.*, audit.action
         FROM source_item_version_collection_assessments assessments
         JOIN audit_events audit ON audit.id = assessments.created_by_audit_event_id
        WHERE assessments.source_item_version_id = ?`,
    ).get("itemversion_test");
    assert.equal(stored.action, "source-item.relevance-assessed");
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
      constituencyIds: [],
      decision: "rejected",
      expectedCollectionReasonHash: assessment.canonicalReasonHash,
      expectedCollectionRuleset: assessment.rulesetId,
      expectedContentHash: "b".repeat(64),
      expectedPreviousReviewId: null,
      expectedVersionId: "itemversion_test",
      itemId: "item_test",
      rationale: "This captured item is not relevant to the election evidence set.",
      reviewKind: "source-version",
      reviewerId: "reviewer-a",
      scopeSuggestionFingerprint: await fingerprintScopeSuggestions([]),
      topicIds: [],
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
    database.prepare(
      "INSERT INTO policy_topics (id, name) VALUES (?, ?), (?, ?), (?, ?)",
    ).run(
      "wind", "Offshore wind",
      "health", "Health and social care",
      "housing", "Housing and affordability",
    );
    database.prepare(
      "INSERT INTO constituencies (id, name, seats) VALUES (?, ?, ?), (?, ?, ?)",
    ).run("douglas-north", "Douglas North", 2, "ramsey", "Ramsey", 2);
    database.prepare(
      `INSERT INTO item_entities (
         item_id, entity_type, entity_id, mention_text, match_method, confidence
       ) VALUES
         (?, 'topic', ?, ?, ?, ?),
         (?, 'topic', ?, ?, ?, ?),
         (?, 'constituency', ?, ?, ?, ?)`,
    ).run(
      "item_test", "wind", "mooir vannin", "deterministic-keyword-v1", 0.7,
      "item_test", "health", "Manx Care", "deterministic-keyword-v1", 0.62,
      "item_test", "douglas-north", "Douglas North", "deterministic-keyword-v1", 0.8,
    );
    const scopeSuggestions = [{
      confidence: 0.8,
      entityType: "constituency",
      id: "douglas-north",
      matchMethod: "deterministic-keyword-v1",
      mentionText: "Douglas North",
    }, {
      confidence: 0.62,
      entityType: "topic",
      id: "health",
      matchMethod: "deterministic-keyword-v1",
      mentionText: "Manx Care",
    }, {
      confidence: 0.7,
      entityType: "topic",
      id: "wind",
      matchMethod: "deterministic-keyword-v1",
      mentionText: "mooir vannin",
    }];
    const scopeSuggestionFingerprint = await fingerprintScopeSuggestions(scopeSuggestions);
    await assert.rejects(
      reviewSourceItemVersion(db, {
        ...reviewInput,
        candidateSuggestionFingerprint: await fingerprintCandidateSuggestions([]),
        decision: "approved",
        expectedPreviousReviewId: reviewReceipt.reviewId,
        rationale: "Re-approved after checking the source scope and frozen topic match.",
        scopeSuggestionFingerprint: await fingerprintScopeSuggestions(scopeSuggestions.slice(0, 2)),
        constituencyIds: ["ramsey"],
        topicIds: ["housing", "wind"],
      }),
      /topic or constituency suggestions changed/,
    );
    await assert.rejects(
      reviewSourceItemVersion(db, {
        ...reviewInput,
        candidateSuggestionFingerprint: await fingerprintCandidateSuggestions([]),
        decision: "approved",
        expectedPreviousReviewId: reviewReceipt.reviewId,
        rationale: "This attempt includes a topic that is not in the active canonical registry.",
        scopeSuggestionFingerprint,
        topicIds: ["missing-topic", "wind"],
      }),
      /reviewer-added topics are no longer active/,
    );
    const approvalReceipt = await reviewSourceItemVersion(db, {
      ...reviewInput,
      candidateSuggestionFingerprint: await fingerprintCandidateSuggestions([]),
      decision: "approved",
      expectedPreviousReviewId: reviewReceipt.reviewId,
      rationale: "Re-approved after checking the source scope and frozen topic match.",
      scopeSuggestionFingerprint,
      constituencyIds: ["ramsey"],
      topicIds: ["housing", "wind"],
    });
    assert.equal(approvalReceipt.decision, "approved");
    assert.equal(approvalReceipt.publicationState, "published");
    assert.equal(approvalReceipt.supersedesReviewId, reviewReceipt.reviewId);
    assert.deepEqual(
      { ...database.prepare(
        `SELECT review_state, publication_state
           FROM source_items WHERE id = 'item_test'`,
      ).get() },
      { publication_state: "published", review_state: "approved" },
    );
    assert.deepEqual(
      database.prepare(
        `SELECT entity_type, entity_id, confirmation_state, review_id
           FROM source_item_version_entities
          WHERE source_item_version_id = 'itemversion_test'
          ORDER BY entity_type, entity_id`,
      ).all().map((row) => ({ ...row })),
      [
        { confirmation_state: "rejected", entity_id: "douglas-north", entity_type: "constituency", review_id: approvalReceipt.reviewId },
        { confirmation_state: "confirmed", entity_id: "ramsey", entity_type: "constituency", review_id: approvalReceipt.reviewId },
        { confirmation_state: "rejected", entity_id: "health", entity_type: "topic", review_id: approvalReceipt.reviewId },
        { confirmation_state: "confirmed", entity_id: "housing", entity_type: "topic", review_id: approvalReceipt.reviewId },
        { confirmation_state: "confirmed", entity_id: "wind", entity_type: "topic", review_id: approvalReceipt.reviewId },
      ],
    );
    assert.deepEqual(
      database.prepare(
        `SELECT entity_type, entity_id, mention_text, match_method, confidence
           FROM source_item_version_entities
          WHERE review_id = ? AND match_method = 'reviewer-added-v1'
          ORDER BY entity_type, entity_id`,
      ).all(approvalReceipt.reviewId).map((row) => ({ ...row })),
      [
        { confidence: 1, entity_id: "ramsey", entity_type: "constituency", match_method: "reviewer-added-v1", mention_text: "Ramsey" },
        { confidence: 1, entity_id: "housing", entity_type: "topic", match_method: "reviewer-added-v1", mention_text: "Housing and affordability" },
      ],
    );
    const approvalReplay = await reviewSourceItemVersion(db, {
      ...reviewInput,
      candidateSuggestionFingerprint: await fingerprintCandidateSuggestions([]),
      decision: "approved",
      expectedPreviousReviewId: reviewReceipt.reviewId,
      rationale: "Re-approved after checking the source scope and frozen topic match.",
      scopeSuggestionFingerprint,
      constituencyIds: ["ramsey"],
      topicIds: ["housing", "wind"],
    });
    assert.equal(approvalReplay.idempotent, true);
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
        stored.created_by_audit_event_id,
        "2026-08-11T12:01:00.000Z",
      ),
      /collection assessment target is stale|UNIQUE constraint failed/,
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

test("candidate filing decisions remain reachable and CAS-safe through approve, reject and restore", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    applyMigrations(database);
    seedVersionParents(database);
    const db = d1Adapter(database);
    await ensureEvidenceTriggers(db);
    const reason = projectCollectionReason({
      candidates: [],
      constituencies: [],
      itemType: "news",
      sourceFeedType: "rss",
      sourceId: "test-source",
      sourceName: "Test source",
      summary: "A source that predates candidate association filing.",
      title: "Election source",
      topics: [],
    });
    const assessment = await prepareCollectionAssessment("itemversion_assignment", reason);
    await appendAuditEventWithStatements(
      db,
      {
        action: "source-item.discovered",
        actorId: "test-monitor",
        actorType: "system",
        entityId: "item_test",
        entityType: "source-item",
        payload: { collectionReasonHash: assessment.canonicalReasonHash },
      },
      () => [
        db.prepare(
          `INSERT INTO source_item_versions (
             id, source_item_id, ingestion_run_id, observed_at, payload,
             payload_hash, parser_version
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          "itemversion_assignment",
          "item_test",
          "run-1",
          "2026-08-11T13:00:00.000Z",
          "{}",
          "c".repeat(64),
          "feed-v1",
        ),
        db.prepare(
          "UPDATE source_items SET latest_version_id = ?, content_hash = ? WHERE id = ?",
        ).bind("itemversion_assignment", "c".repeat(64), "item_test"),
      ],
    );
    await appendLegacyCollectionAssessment({
      actor: { id: "test-monitor", type: "system" },
      assessment,
      db,
      sourceItemId: "item_test",
    });
    const emptyCandidateFingerprint = await fingerprintCandidateSuggestions([]);
    const emptyScopeFingerprint = await fingerprintScopeSuggestions([]);
    const sourceApproved = await reviewSourceItemVersion(db, {
      candidateIds: [],
      candidateSuggestionFingerprint: emptyCandidateFingerprint,
      constituencyIds: [],
      decision: "approved",
      expectedCollectionReasonHash: assessment.canonicalReasonHash,
      expectedCollectionRuleset: assessment.rulesetId,
      expectedContentHash: "c".repeat(64),
      expectedPreviousReviewId: null,
      expectedVersionId: "itemversion_assignment",
      itemId: "item_test",
      rationale: "Approved before the later candidate association was detected.",
      reviewKind: "source-version",
      reviewerId: "reviewer-a",
      scopeSuggestionFingerprint: emptyScopeFingerprint,
      topicIds: [],
    });

    database.prepare(
      "INSERT INTO people (id, full_name, sort_name) VALUES (?, ?, ?)",
    ).run("person-a", "Candidate A", "Candidate A");
    database.prepare(
      "INSERT INTO elections (id, name, jurisdiction) VALUES (?, ?, ?)",
    ).run("election-a", "General Election 2026", "Isle of Man");
    database.prepare(
      "INSERT INTO constituencies (id, name, seats) VALUES (?, ?, ?)",
    ).run("constituency-a", "Douglas North", 2);
    database.prepare(
      `INSERT INTO candidacies (
         id, election_id, person_id, constituency_id, declaration_status
       ) VALUES (?, ?, ?, ?, ?)`,
    ).run("candidate-a", "election-a", "person-a", "constituency-a", "declared");
    database.prepare(
      `INSERT INTO item_entities (
         item_id, entity_type, entity_id, mention_text, match_method, confidence
       ) VALUES (?, 'candidacy', ?, ?, ?, ?)`,
    ).run("item_test", "candidate-a", "Candidate A", "deterministic-name-v1", 0.92);
    const candidateFingerprint = await fingerprintCandidateSuggestions([{
      candidacyId: "candidate-a",
      confidence: 0.92,
      matchMethod: "deterministic-name-v1",
      mentionText: "Candidate A",
    }]);
    const baseAssignment = {
      candidateSuggestionFingerprint: candidateFingerprint,
      constituencyIds: [],
      expectedCollectionReasonHash: assessment.canonicalReasonHash,
      expectedCollectionRuleset: assessment.rulesetId,
      expectedContentHash: "c".repeat(64),
      expectedVersionId: "itemversion_assignment",
      itemId: "item_test",
      reviewKind: "candidate-assignment",
      reviewerId: "reviewer-a",
      scopeSuggestionFingerprint: emptyScopeFingerprint,
      topicIds: [],
    };
    const approved = await reviewSourceItemVersion(db, {
      ...baseAssignment,
      candidateIds: ["candidate-a"],
      decision: "approved",
      expectedPreviousReviewId: null,
      rationale: "Confirmed the candidate filing against the captured source.",
    });
    const rejected = await reviewSourceItemVersion(db, {
      ...baseAssignment,
      candidateIds: [],
      decision: "rejected",
      expectedPreviousReviewId: approved.reviewId,
      rationale: "Dismissed after finding that the name appeared only in an unrelated quotation.",
    });
    await assert.rejects(
      reviewSourceItemVersion(db, {
        ...baseAssignment,
        candidateIds: [],
        decision: "rejected",
        expectedPreviousReviewId: approved.reviewId,
        rationale: "A stale competing dismissal must not branch the append-only decision chain.",
      }),
      SourceItemReviewConflictError,
    );
    const rejectedDashboard = await getEvidenceDashboardForDatabase(db);
    const rejectedItem = rejectedDashboard.reviewItems.find((entry) => entry.id === "item_test");
    assert.deepEqual(rejectedItem?.lastApprovedAssignmentCandidateIds, ["candidate-a"]);
    const restored = await reviewSourceItemVersion(db, {
      ...baseAssignment,
      candidateIds: ["candidate-a"],
      decision: "approved",
      expectedPreviousReviewId: rejected.reviewId,
      rationale: "Restored after a second check confirmed the candidate association.",
    });
    const dashboard = await getEvidenceDashboardForDatabase(db);
    const item = dashboard.reviewItems.find((entry) => entry.id === "item_test");
    assert.equal(item?.assignmentDecisionCount, 3);
    assert.equal(item?.assignmentReviewAvailable, true);
    assert.equal(item?.assignmentState, "approved");
    assert.deepEqual(item?.lastApprovedAssignmentCandidateIds, ["candidate-a"]);
    assert.deepEqual(item?.lastApprovedCandidateIds, ["candidate-a"]);
    assert.equal(item?.currentAssignmentDecision?.id, restored.reviewId);
    assert.equal(item?.currentAssignmentDecision?.supersedesReviewId, rejected.reviewId);
    assert.deepEqual(
      Object.fromEntries(database.prepare(
        `SELECT review_id, confirmation_state
           FROM source_item_version_entities
          WHERE source_item_version_id = ? AND entity_type = 'candidacy'
          ORDER BY review_id`,
      ).all("itemversion_assignment").map((row) => [row.review_id, row.confirmation_state])),
      {
        [approved.reviewId]: "confirmed",
        [rejected.reviewId]: "rejected",
        [restored.reviewId]: "confirmed",
      },
    );

    const sourceRejected = await reviewSourceItemVersion(db, {
      candidateIds: [],
      candidateSuggestionFingerprint: candidateFingerprint,
      constituencyIds: [],
      decision: "rejected",
      expectedCollectionReasonHash: assessment.canonicalReasonHash,
      expectedCollectionRuleset: assessment.rulesetId,
      expectedContentHash: "c".repeat(64),
      expectedPreviousReviewId: sourceApproved.reviewId,
      expectedVersionId: "itemversion_assignment",
      itemId: "item_test",
      rationale: "Withheld the complete source while reconsidering its editorial relevance.",
      reviewKind: "source-version",
      reviewerId: "reviewer-a",
      scopeSuggestionFingerprint: emptyScopeFingerprint,
      topicIds: [],
    });
    await reviewSourceItemVersion(db, {
      candidateIds: [],
      candidateSuggestionFingerprint: candidateFingerprint,
      constituencyIds: [],
      decision: "approved",
      expectedCollectionReasonHash: assessment.canonicalReasonHash,
      expectedCollectionRuleset: assessment.rulesetId,
      expectedContentHash: "c".repeat(64),
      expectedPreviousReviewId: sourceRejected.reviewId,
      expectedVersionId: "itemversion_assignment",
      itemId: "item_test",
      rationale: "Restored the source without the old legacy candidate filing.",
      reviewKind: "source-version",
      reviewerId: "reviewer-a",
      scopeSuggestionFingerprint: emptyScopeFingerprint,
      topicIds: [],
    });
    const refiledDashboard = await getEvidenceDashboardForDatabase(db);
    const refiledItem = refiledDashboard.reviewItems.find((entry) => entry.id === "item_test");
    assert.equal(refiledItem?.assignmentReviewAvailable, false);
    assert.deepEqual(refiledItem?.lastApprovedCandidateIds, []);
  } finally {
    database.close();
  }
});
