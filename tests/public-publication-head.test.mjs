import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  publicPublicationHeadSql,
  queryPublicPublicationHead,
} from "../app/lib/evidence/publication-head.ts";
import {
  isPublicProjectionPath,
  reconcilePublicPublicationHead,
} from "../app/lib/evidence/publication-refresh.ts";

const HEAD_A = "a".repeat(32);
const HEAD_B = "b".repeat(32);

function createLifecycleDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rights_state TEXT NOT NULL
    );
    CREATE TABLE source_items (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      latest_version_id TEXT,
      content_hash TEXT,
      review_state TEXT NOT NULL,
      publication_state TEXT NOT NULL,
      last_seen_at TEXT
    );
    CREATE TABLE source_item_versions (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL
    );
    CREATE TABLE reviews (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      decision TEXT NOT NULL
    );
    CREATE TABLE source_item_version_entities (
      source_item_version_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      confirmation_state TEXT NOT NULL,
      review_id TEXT NOT NULL
    );
    CREATE TABLE policy_topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER NOT NULL
    );
    CREATE TABLE constituencies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE candidacies (
      id TEXT PRIMARY KEY,
      constituency_id TEXT NOT NULL,
      declaration_status TEXT NOT NULL
    );
    CREATE TABLE candidate_profiles (
      candidacy_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      profile_url_hash TEXT NOT NULL,
      observed_constituency_id TEXT NOT NULL,
      current_directory_observation_id TEXT NOT NULL,
      current_basis_hash TEXT,
      review_state TEXT NOT NULL,
      publication_state TEXT NOT NULL
    );
    CREATE TABLE candidate_intelligence_heads (
      candidacy_id TEXT PRIMARY KEY,
      analysis_state TEXT NOT NULL,
      publication_state TEXT NOT NULL,
      published_revision_id TEXT
    );
  `);
  const migration = readFileSync(
    new URL("../drizzle/0015_wet_roulette.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  return database;
}

function currentHead(database) {
  return database
    .prepare("SELECT head FROM public_publication_head WHERE singleton = 1")
    .get().head;
}

function assertRotates(database, action, message) {
  const before = currentHead(database);
  action();
  assert.notEqual(currentHead(database), before, message);
}

function assertStable(database, action, message) {
  const before = currentHead(database);
  action();
  assert.equal(currentHead(database), before, message);
}

test("public publication head query is a single-row, read-only, metadata-free projection", async () => {
  const preparedSql = [];
  const database = {
    prepare(sql) {
      preparedSql.push(sql);
      return {
        async first() {
          return { head: HEAD_A };
        },
      };
    },
  };

  assert.deepEqual(await queryPublicPublicationHead(database), { head: HEAD_A });
  assert.equal(preparedSql.length, 1);
  assert.equal(preparedSql[0], publicPublicationHeadSql);

  const query = preparedSql.join("\n").toLowerCase();
  assert.match(query, /select head\s+from public_publication_head/);
  assert.doesNotMatch(query, /\b(insert|update|delete|replace|pragma)\b/);
  assert.doesNotMatch(
    query,
    /review|candidate|source_item|audit|actor|rationale|count|timestamp|updated_at/,
  );
});

test("publication refresh model closes the SSR-to-first-poll race without a loop", () => {
  assert.equal(isPublicProjectionPath("/"), true);
  assert.equal(isPublicProjectionPath("/latest"), true);
  assert.equal(isPublicProjectionPath("/candidates/mary-phillips"), true);
  assert.equal(isPublicProjectionPath("/admin/review"), false);
  assert.equal(isPublicProjectionPath("/compass"), false);

  const firstVisiblePollAfterHiddenLoad = reconcilePublicPublicationHead(
    { head: null, synchronized: false },
    HEAD_B,
  );
  assert.equal(firstVisiblePollAfterHiddenLoad.shouldRefresh, true);

  const rejectionBetweenRenderAndPoll = reconcilePublicPublicationHead(
    { head: HEAD_A, synchronized: true },
    HEAD_B,
  );
  assert.equal(rejectionBetweenRenderAndPoll.shouldRefresh, true);

  const sameHeadAfterRefresh = reconcilePublicPublicationHead(
    rejectionBetweenRenderAndPoll,
    HEAD_B,
  );
  assert.equal(sameHeadAfterRefresh.shouldRefresh, false);
});

test("publication head advances only when the public projection can change", () => {
  const database = createLifecycleDatabase();
  assert.match(currentHead(database), /^[0-9a-f]{32}$/);

  database.exec(`
    INSERT INTO sources VALUES ('source-1', 'Newsroom', 'metadata-only');
    INSERT INTO source_items VALUES (
      'item-1', 'source-1', 'version-1', 'hash-1',
      'unreviewed', 'private', '2026-08-11T10:00:00Z'
    );
    INSERT INTO source_item_versions VALUES ('version-1', 'item-1');
    INSERT INTO policy_topics VALUES ('topic-health', 'Manx Care', 1);
    INSERT INTO constituencies VALUES ('constituency-onchan', 'Onchan');
    INSERT INTO candidacies VALUES (
      'candidate-1', 'constituency-onchan', 'prospective'
    );
  `);

  assertStable(
    database,
    () => database.exec("UPDATE source_items SET last_seen_at = '2026-08-11T11:00:00Z' WHERE id = 'item-1'"),
    "an ingestion-only timestamp must not rotate the public head",
  );
  assertStable(
    database,
    () => database.exec("UPDATE source_items SET content_hash = 'hash-private' WHERE id = 'item-1'"),
    "private source content must not rotate the public head",
  );

  assertRotates(
    database,
    () => database.exec("UPDATE source_items SET review_state = 'approved', publication_state = 'published' WHERE id = 'item-1'"),
    "source approval must rotate the public head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE source_items SET review_state = 'rejected', publication_state = 'withheld' WHERE id = 'item-1'"),
    "source rejection must rotate the public head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE source_items SET review_state = 'approved', publication_state = 'published' WHERE id = 'item-1'"),
    "source reapproval must rotate the public head",
  );

  assertStable(
    database,
    () => database.exec("UPDATE sources SET rights_state = 'restricted-copy' WHERE id = 'source-1'"),
    "switching between public-safe source-rights states does not change the projection",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE sources SET rights_state = 'unknown' WHERE id = 'source-1'"),
    "withdrawing a public-safe source-rights state must rotate the head",
  );
  assertStable(
    database,
    () => database.exec("UPDATE source_items SET content_hash = 'hash-hidden' WHERE id = 'item-1'"),
    "content hidden by source rights must not rotate the public head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE sources SET rights_state = 'public-record' WHERE id = 'source-1'"),
    "restoring a public-safe source-rights state must rotate the head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE sources SET name = 'Island Newsroom' WHERE id = 'source-1'"),
    "a visible source label change must rotate the head",
  );

  assertRotates(
    database,
    () => database.exec("INSERT INTO reviews VALUES ('review-assignment', 'source-item-version-assignment', 'version-1', 'approved')"),
    "a current published candidate-assignment review must rotate the head even with no bindings",
  );

  database.exec(`
    INSERT INTO source_item_version_entities VALUES (
      'version-1', 'topic', 'topic-health', 'confirmed', 'review-assignment'
    );
    INSERT INTO source_item_version_entities VALUES (
      'version-1', 'constituency', 'constituency-onchan', 'confirmed', 'review-assignment'
    );
  `);
  assertRotates(
    database,
    () => database.exec("UPDATE policy_topics SET name = 'Health and care' WHERE id = 'topic-health'"),
    "a visible topic label change must rotate the head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE policy_topics SET active = 0 WHERE id = 'topic-health'"),
    "withholding a visible topic must rotate the head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE constituencies SET name = 'Onchan district' WHERE id = 'constituency-onchan'"),
    "a visible constituency label change must rotate the head",
  );

  assertStable(
    database,
    () => database.exec(`INSERT INTO candidate_profiles VALUES (
      'candidate-1', 'candidate-one', 'profile-hash', 'constituency-onchan',
      'observation-1', 'basis-1', 'unreviewed', 'private'
    )`),
    "a private candidate profile must not rotate the public head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE candidate_profiles SET review_state = 'approved', publication_state = 'published' WHERE candidacy_id = 'candidate-1'"),
    "candidate profile approval must rotate the public head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE candidate_profiles SET review_state = 'rejected', publication_state = 'withheld' WHERE candidacy_id = 'candidate-1'"),
    "candidate profile rejection must rotate the public head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE candidate_profiles SET review_state = 'approved', publication_state = 'published' WHERE candidacy_id = 'candidate-1'"),
    "candidate profile reapproval must rotate the public head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE candidate_profiles SET slug = 'candidate-one-updated' WHERE candidacy_id = 'candidate-1'"),
    "a visible candidate identity change must rotate the public head",
  );

  assertStable(
    database,
    () => database.exec("INSERT INTO candidate_intelligence_heads VALUES ('candidate-1', 'queued', 'private', NULL)"),
    "private analysis work must not rotate the public head",
  );
  assertRotates(
    database,
    () => database.exec("UPDATE candidate_intelligence_heads SET analysis_state = 'approved', publication_state = 'published', published_revision_id = 'revision-1' WHERE candidacy_id = 'candidate-1'"),
    "publishing an approved candidate analysis must rotate the public head",
  );
});

test("public endpoint and refresh client expose no editorial metadata", () => {
  const route = readFileSync(
    new URL("../app/api/public/publication-head/route.ts", import.meta.url),
    "utf8",
  );
  const client = readFileSync(
    new URL("../app/components/PublicPublicationRefresh.tsx", import.meta.url),
    "utf8",
  );

  assert.match(route, /getPublicPublicationHead/);
  assert.match(route, /cache-control["']:\s*["']no-store/);
  assert.doesNotMatch(route, /getEvidenceDashboard|reviewer|rationale|audit|candidate|source_item/i);
  assert.match(client, /visibilitychange/);
  assert.match(client, /window\.addEventListener\("focus"/);
  assert.match(client, /router\.refresh\(\)/);
  assert.match(client, /reconcilePublicPublicationHead/);
});
