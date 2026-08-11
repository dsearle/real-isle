import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  buildPublicEvidenceSnapshot,
  neutralCoverageSummary,
  queryPrivateCandidateDossierEvidenceSnapshot,
  queryPublicCandidateDirectory,
  queryPublicEvidenceSnapshot,
} from "../app/lib/evidence/public-evidence.ts";

const approvedItem = {
  canonical_url: "https://publisher.example/election/interview#player",
  content_hash: "a".repeat(64),
  first_seen_at: "2026-08-11T09:05:00.000Z",
  item_id: "item-approved",
  item_type: "interview",
  publication_state: "published",
  published_at: "2026-08-11T09:00:00.000Z",
  review_decision: "approved",
  review_id: "review-current",
  review_state: "approved",
  reviewed_at: "2026-08-11T11:00:00.000Z",
  source_name: "Island newsroom",
  title: "Candidate interview",
  version_id: "version-current",
};

test("public evidence exposes only approved, published HTTPS metadata", () => {
  const snapshot = buildPublicEvidenceSnapshot({
    associationRows: [],
    generatedAt: "2026-08-11T12:00:00.000Z",
    itemRows: [
      approvedItem,
      { ...approvedItem, item_id: "rejected", review_decision: "rejected" },
      { ...approvedItem, item_id: "withheld", publication_state: "withheld" },
      { ...approvedItem, item_id: "private", publication_state: "private" },
      { ...approvedItem, item_id: "stale-state", review_state: "needs-update" },
      { ...approvedItem, canonical_url: "http://publisher.example/unsafe", item_id: "http" },
      { ...approvedItem, canonical_url: "https://user:password@publisher.example/unsafe", item_id: "credentials" },
    ],
  });

  assert.equal(snapshot.state, "available");
  assert.deepEqual(snapshot.records.map((record) => record.itemId), ["item-approved"]);
  assert.equal(snapshot.records[0]?.canonicalUrl, "https://publisher.example/election/interview");
  assert.equal(snapshot.records[0]?.auditFingerprint, "aaaaaaaaaaaa");
  assert.equal(
    snapshot.records[0]?.coverageSummary,
    "Editorial review approved this for the public election source library. No public candidate, constituency or topic association is displayed, and no candidate position is inferred.",
  );
});

test("candidate links imply their public constituency without inferring a stance", () => {
  const snapshot = buildPublicEvidenceSnapshot({
    associationRows: [{
      candidate_constituency_id: "constituency-douglas-south",
      candidate_constituency_name: "Douglas South",
      candidate_slug: "mary-example",
      entity_id: "candidacy-mary-example",
      entity_label: "Mary Example",
      entity_type: "candidacy",
      source_item_version_id: "version-current",
    }, {
      candidate_constituency_id: null,
      candidate_constituency_name: null,
      candidate_slug: null,
      entity_id: "topic-health",
      entity_label: "Health and Manx Care",
      entity_type: "topic",
      source_item_version_id: "version-current",
    }],
    generatedAt: "2026-08-11T12:00:00.000Z",
    itemRows: [approvedItem],
  });

  assert.deepEqual(snapshot.records[0]?.associations, [{
    id: "candidacy-mary-example",
    label: "Mary Example",
    slug: "mary-example",
    type: "candidate",
  }, {
    id: "constituency-douglas-south",
    label: "Douglas South",
    slug: null,
    type: "constituency",
  }, {
    id: "topic-health",
    label: "Health and Manx Care",
    slug: null,
    type: "topic",
  }]);
  assert.equal(
    snapshot.records[0]?.coverageSummary,
    "Editorial review linked this source to Mary Example as a candidate, Health and Manx Care and Douglas South. This association does not establish a candidate position.",
  );
});

test("topic-only and constituency-only approved bindings remain public associations", () => {
  const snapshot = buildPublicEvidenceSnapshot({
    associationRows: [{
      candidate_constituency_id: null,
      candidate_constituency_name: null,
      candidate_slug: null,
      entity_id: "topic-wind",
      entity_label: "Offshore wind",
      entity_type: "topic",
      source_item_version_id: "version-current",
    }, {
      candidate_constituency_id: null,
      candidate_constituency_name: null,
      candidate_slug: null,
      entity_id: "constituency-rushen",
      entity_label: "Rushen",
      entity_type: "constituency",
      source_item_version_id: "version-current",
    }],
    generatedAt: "2026-08-11T12:00:00.000Z",
    itemRows: [approvedItem],
  });

  assert.deepEqual(snapshot.records[0]?.associations.map(({ id, type }) => ({ id, type })), [
    { id: "constituency-rushen", type: "constituency" },
    { id: "topic-wind", type: "topic" },
  ]);
  assert.match(snapshot.records[0]?.coverageSummary ?? "", /Offshore wind/);
  assert.match(snapshot.records[0]?.coverageSummary ?? "", /Rushen/);
  assert.match(snapshot.records[0]?.coverageSummary ?? "", /does not establish a candidate position/i);
});

test("neutral summaries never convert association into candidate policy claims", () => {
  const text = neutralCoverageSummary([{
    id: "candidate-a",
    label: "Candidate A",
    slug: "candidate-a",
    type: "candidate",
  }]);
  assert.match(text, /linked this source/i);
  assert.match(text, /does not establish a candidate position/i);
  assert.doesNotMatch(text, /supports|opposes|promises|believes/i);
});

test("public query resolves current review heads and exact content before returning metadata", async () => {
  const sql = [];
  const db = {
    prepare(statement) {
      sql.push(statement);
      return {
        bind(...values) {
          assert.deepEqual(values, [20]);
          return this;
        },
        async all() {
          return { results: [] };
        },
      };
    },
  };

  const snapshot = await queryPublicEvidenceSnapshot(db, {
    limit: 20,
    now: new Date("2026-08-11T12:00:00.000Z"),
  });
  assert.equal(snapshot.state, "empty");
  assert.equal(sql.length, 1);

  const queryText = sql.join("\n").toLowerCase();
  assert.match(queryText, /items\.latest_version_id/);
  assert.match(queryText, /versions\.payload_hash = items\.content_hash/);
  assert.match(queryText, /items\.review_state = 'approved'/);
  assert.match(queryText, /items\.publication_state = 'published'/);
  assert.match(queryText, /sources\.rights_state in \('restricted-copy', 'metadata-only', 'public-record'\)/);
  assert.match(queryText, /successor\.supersedes_review_id = review\.id/);
  assert.match(queryText, /current_review\.decision = 'approved'/);
  assert.match(queryText, /json_extract\(audit\.payload, '\$\.reviewid'\) = current_review\.id/);
  assert.match(queryText, /binding\.confirmation_state = 'confirmed'/);
  assert.match(queryText, /parser_version not in \('candidate-directory-v1', 'candidate-profile-v1'\)/);
  assert.match(
    queryText,
    /count\(distinct identity_binding\.entity_id\)\s*= count\(distinct identity_profile\.candidacy_id\)/,
  );
  assert.match(queryText, /count\(distinct identity_binding\.entity_id\) = 1/);
  assert.doesNotMatch(queryText, /reviews\.rationale|reviewer_id|source_snapshots\.storage_key/);
});

test("public evidence is unbounded by default and limits only explicit previews", async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      return {
        bind() {
          throw new Error("The unbounded public query should not bind a hidden row cap.");
        },
        async all() {
          return { results: [] };
        },
      };
    },
  };

  await queryPublicEvidenceSnapshot(db, {
    now: new Date("2026-08-11T12:00:00.000Z"),
  });
  assert.equal(statements.length, 1);
  assert.doesNotMatch(statements[0], /\blimit\s+\?/i);
});

test("public metadata comes from the immutable reviewed version, not mutable source item columns", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rights_state TEXT NOT NULL
      );
      CREATE TABLE source_items (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        item_type TEXT NOT NULL,
        published_at TEXT,
        first_seen_at TEXT NOT NULL,
        latest_version_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        review_state TEXT NOT NULL,
        publication_state TEXT NOT NULL
      );
      CREATE TABLE source_item_versions (
        id TEXT PRIMARY KEY,
        source_item_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        parser_version TEXT NOT NULL
      );
      CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL,
        supersedes_review_id TEXT
      );
      CREATE TABLE audit_events (
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE source_item_version_entities (
        source_item_version_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        review_id TEXT NOT NULL,
        confirmation_state TEXT NOT NULL
      );
      CREATE TABLE candidate_profiles (
        candidacy_id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        current_basis_hash TEXT,
        review_state TEXT NOT NULL,
        publication_state TEXT NOT NULL
      );
      CREATE TABLE candidacies (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        constituency_id TEXT NOT NULL,
        declaration_status TEXT NOT NULL
      );
      CREATE TABLE people (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, sort_name TEXT NOT NULL);
      CREATE TABLE constituencies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE policy_topics (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL);

      INSERT INTO sources VALUES ('source-a', 'Island newsroom', 'metadata-only');
      INSERT INTO source_item_versions VALUES (
        'version-a', 'item-a', '2026-08-11T09:05:00.000Z',
        '{"canonicalUrl":"https://publisher.example/election/interview","title":"Immutable candidate interview","publishedAt":"2026-08-11T09:00:00.000Z","itemType":"interview"}',
        '${"a".repeat(64)}', 'feed-v1'
      );
      INSERT INTO source_items VALUES (
        'item-a', 'source-a', 'Mutable original title',
        'https://mutable.example/original', 'news', '2025-01-01T00:00:00.000Z',
        '2025-01-01T00:00:00.000Z', 'version-a', '${"a".repeat(64)}',
        'approved', 'published'
      );
      INSERT INTO reviews VALUES (
        'review-a', 'source-item-version', 'version-a', 'approved',
        '2026-08-11T11:00:00.000Z', NULL
      );
      INSERT INTO audit_events VALUES (
        'source-item.reviewed', 'source-item-version', 'version-a',
        '{"reviewId":"review-a","decision":"approved"}'
      );
    `);
    const db = d1Adapter(database);
    const before = await queryPublicEvidenceSnapshot(db, {
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    database.exec(`
      UPDATE source_items SET
        title = 'Injected mutable title',
        canonical_url = 'https://attacker.example/injected',
        item_type = 'advert',
        published_at = '2030-01-01T00:00:00.000Z',
        first_seen_at = '2030-01-01T00:00:00.000Z'
      WHERE id = 'item-a';
    `);
    const after = await queryPublicEvidenceSnapshot(db, {
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    assert.deepEqual(after, before);
    assert.equal(after.records[0]?.title, "Immutable candidate interview");
    assert.equal(after.records[0]?.canonicalUrl, "https://publisher.example/election/interview");
    assert.equal(after.records[0]?.publishedAt, "2026-08-11T09:00:00.000Z");
    assert.equal(after.records[0]?.firstSeenAt, "2026-08-11T09:05:00.000Z");
    assert.equal(after.records[0]?.itemType, "interview");
  } finally {
    database.close();
  }
});

test("candidate projection requires a public profile and a confirmed current binding", async () => {
  const sql = [];
  const binds = [];
  const db = {
    prepare(statement) {
      sql.push(statement);
      return {
        bind(...values) {
          binds.push(values);
          return this;
        },
        async all() {
          return { results: [] };
        },
      };
    },
  };

  await queryPublicEvidenceSnapshot(db, {
    candidateId: "candidate-a",
    limit: 12,
    now: new Date("2026-08-11T12:00:00.000Z"),
  });

  assert.deepEqual(binds, [["candidate-a", 12]]);
  const queryText = sql.join("\n").toLowerCase();
  assert.match(queryText, /dossier_profile\.review_state = 'approved'/);
  assert.match(queryText, /dossier_profile\.publication_state = 'published'/);
  assert.match(queryText, /candidate_binding\.confirmation_state = 'confirmed'/);
  assert.match(queryText, /source-item-version-assignment/);
  assert.match(queryText, /source_review_supersedes_review_id is null/);
  assert.match(queryText, /assignment_successor\.supersedes_review_id/);
});

test("item and association eligibility are read in one snapshot so rejection cannot interleave", async () => {
  let prepares = 0;
  let reads = 0;
  const db = {
    prepare(sql) {
      prepares += 1;
      assert.match(sql, /selected_public_items[\s\S]+public_associations[\s\S]+left join public_associations/i);
      return {
        bind() { return this; },
        async all() {
          reads += 1;
          return { results: [] };
        },
      };
    },
  };

  await queryPublicEvidenceSnapshot(db, { limit: 10 });
  assert.equal(prepares, 1);
  assert.equal(reads, 1);
});

test("candidate-specific projection discards an item when its requested binding is absent", async () => {
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async all() {
          return { results: [{
            ...approvedItem,
            candidate_constituency_id: null,
            candidate_constituency_name: null,
            candidate_slug: null,
            entity_id: null,
            entity_label: null,
            entity_type: null,
            source_item_version_id: approvedItem.version_id,
          }] };
        },
      };
    },
  };

  const snapshot = await queryPublicEvidenceSnapshot(db, {
    candidateId: "candidate-a",
    now: new Date("2026-08-11T12:00:00.000Z"),
  });
  assert.equal(snapshot.state, "empty");
  assert.deepEqual(snapshot.records, []);
});

function d1Adapter(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      let values = [];
      return {
        bind(...nextValues) {
          values = nextValues;
          return this;
        },
        async all() {
          return { results: statement.all(...values) };
        },
      };
    },
  };
}

test("candidate parser records cannot leak before their exact public identity basis is approved", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rights_state TEXT NOT NULL
      );
      CREATE TABLE source_items (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        item_type TEXT NOT NULL,
        published_at TEXT,
        first_seen_at TEXT NOT NULL,
        latest_version_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        review_state TEXT NOT NULL,
        publication_state TEXT NOT NULL
      );
      CREATE TABLE source_item_versions (
        id TEXT PRIMARY KEY,
        source_item_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        parser_version TEXT NOT NULL
      );
      CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL,
        supersedes_review_id TEXT
      );
      CREATE TABLE audit_events (
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE source_item_version_entities (
        source_item_version_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        review_id TEXT NOT NULL,
        confirmation_state TEXT NOT NULL
      );
      CREATE TABLE candidate_profiles (
        candidacy_id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        current_basis_hash TEXT,
        review_state TEXT NOT NULL,
        publication_state TEXT NOT NULL
      );
      CREATE TABLE candidacies (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        constituency_id TEXT NOT NULL,
        declaration_status TEXT NOT NULL
      );
      CREATE TABLE people (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, sort_name TEXT NOT NULL);
      CREATE TABLE constituencies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE policy_topics (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL);

      INSERT INTO sources VALUES ('candidate-source', 'Candidate directory', 'metadata-only');
      INSERT INTO constituencies VALUES ('douglas-east', 'Douglas East');
      INSERT INTO people VALUES
        ('person-directory', 'Hidden Directory Candidate', 'Candidate, Hidden Directory'),
        ('person-profile', 'Hidden Profile Candidate', 'Candidate, Hidden Profile');
      INSERT INTO candidacies VALUES
        ('candidate-directory', 'person-directory', 'douglas-east', 'prospective'),
        ('candidate-profile', 'person-profile', 'douglas-east', 'prospective');
      INSERT INTO candidate_profiles VALUES
        ('candidate-directory', 'hidden-directory-candidate', '${"c".repeat(64)}', 'unreviewed', 'private'),
        ('candidate-profile', 'hidden-profile-candidate', '${"d".repeat(64)}', 'rejected', 'withheld');

      INSERT INTO source_item_versions VALUES
        (
          'version-directory', 'item-directory', '2026-08-11T09:00:00.000Z',
          '{"candidate":{"fullName":"Hidden Directory Candidate","profileUrl":"https://publisher.example/candidates/hidden-directory"}}',
          '${"a".repeat(64)}', 'candidate-directory-v1'
        ),
        (
          'version-profile', 'item-profile', '2026-08-11T09:05:00.000Z',
          '{"candidateName":"Hidden Profile Candidate","profileUrl":"https://publisher.example/candidates/hidden-profile"}',
          '${"b".repeat(64)}', 'candidate-profile-v1'
        );
      INSERT INTO source_items VALUES
        (
          'item-directory', 'candidate-source', 'Hidden Directory Candidate',
          'https://publisher.example/candidates/hidden-directory', 'candidate-profile', NULL,
          '2026-08-11T09:00:00.000Z', 'version-directory', '${"a".repeat(64)}',
          'approved', 'published'
        ),
        (
          'item-profile', 'candidate-source', 'Hidden Profile Candidate',
          'https://publisher.example/candidates/hidden-profile', 'candidate-profile', NULL,
          '2026-08-11T09:05:00.000Z', 'version-profile', '${"b".repeat(64)}',
          'approved', 'published'
        );
      INSERT INTO reviews VALUES
        ('source-review-directory', 'source-item-version', 'version-directory', 'approved', '2026-08-11T10:00:00.000Z', NULL),
        ('source-review-profile', 'source-item-version', 'version-profile', 'approved', '2026-08-11T10:05:00.000Z', NULL),
        ('profile-review-rejected', 'candidate-profile-version', '${"d".repeat(64)}', 'rejected', '2026-08-11T10:10:00.000Z', NULL);
      INSERT INTO audit_events VALUES
        ('source-item.reviewed', 'source-item-version', 'version-directory', '{"reviewId":"source-review-directory","decision":"approved"}'),
        ('source-item.reviewed', 'source-item-version', 'version-profile', '{"reviewId":"source-review-profile","decision":"approved"}'),
        ('candidate-profile.reviewed', 'candidate-profile', 'candidate-profile', '{"reviewId":"profile-review-rejected","basisHash":"${"d".repeat(64)}","decision":"rejected"}');
      INSERT INTO source_item_version_entities VALUES
        ('version-directory', 'candidacy', 'candidate-directory', 'source-review-directory', 'confirmed'),
        ('version-profile', 'candidacy', 'candidate-profile', 'source-review-profile', 'confirmed');
    `);

    const db = d1Adapter(database);
    const hidden = await queryPublicEvidenceSnapshot(db, {
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    assert.equal(hidden.state, "empty");
    assert.deepEqual(hidden.records, []);

    database.exec(`
      UPDATE candidate_profiles
         SET review_state = 'approved', publication_state = 'published';
      INSERT INTO reviews VALUES
        ('profile-review-directory', 'candidate-profile-version', '${"c".repeat(64)}', 'approved', '2026-08-11T11:00:00.000Z', NULL),
        ('profile-review-profile', 'candidate-profile-version', '${"d".repeat(64)}', 'approved', '2026-08-11T11:05:00.000Z', 'profile-review-rejected');
      INSERT INTO audit_events VALUES
        ('candidate-profile.reviewed', 'candidate-profile', 'candidate-profile', '{"reviewId":"profile-review-profile","basisHash":"${"d".repeat(64)}","decision":"approved"}');
    `);

    const missingAudit = await queryPublicEvidenceSnapshot(db, {
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    assert.deepEqual(missingAudit.records.map((record) => record.itemId), ["item-profile"]);
    assert.deepEqual(
      missingAudit.records[0]?.associations.map(({ id, type }) => ({ id, type })),
      [
        { id: "candidate-profile", type: "candidate" },
        { id: "douglas-east", type: "constituency" },
      ],
    );

    database.exec(`
      INSERT INTO audit_events VALUES (
        'candidate-profile.reviewed', 'candidate-profile', 'candidate-directory',
        '{"reviewId":"profile-review-directory","basisHash":"${"c".repeat(64)}","decision":"approved"}'
      );
    `);
    const published = await queryPublicEvidenceSnapshot(db, {
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    assert.deepEqual(
      published.records.map((record) => record.itemId).toSorted(),
      ["item-directory", "item-profile"],
    );
    assert.ok(published.records.every((record) => (
      record.associations.some((association) => association.type === "candidate")
    )));

    database.exec(`
      INSERT INTO people VALUES ('person-ambiguous', 'Ambiguous Candidate', 'Candidate, Ambiguous');
      INSERT INTO candidacies VALUES (
        'candidate-ambiguous', 'person-ambiguous', 'douglas-east', 'prospective'
      );
      INSERT INTO candidate_profiles VALUES (
        'candidate-ambiguous', 'ambiguous-candidate', '${"e".repeat(64)}', 'unreviewed', 'private'
      );
      INSERT INTO source_item_version_entities VALUES (
        'version-directory', 'candidacy', 'candidate-ambiguous',
        'source-review-directory', 'confirmed'
      );
    `);
    const ambiguous = await queryPublicEvidenceSnapshot(db, {
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    assert.deepEqual(ambiguous.records.map((record) => record.itemId), ["item-profile"]);
  } finally {
    database.close();
  }
});

test("generic feeds fail closed when any confirmed candidate identity is not public", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rights_state TEXT NOT NULL
      );
      CREATE TABLE source_items (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        item_type TEXT NOT NULL,
        published_at TEXT,
        first_seen_at TEXT NOT NULL,
        latest_version_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        review_state TEXT NOT NULL,
        publication_state TEXT NOT NULL
      );
      CREATE TABLE source_item_versions (
        id TEXT PRIMARY KEY,
        source_item_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        parser_version TEXT NOT NULL
      );
      CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL,
        supersedes_review_id TEXT
      );
      CREATE TABLE audit_events (
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE source_item_version_entities (
        source_item_version_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        review_id TEXT NOT NULL,
        confirmation_state TEXT NOT NULL
      );
      CREATE TABLE candidate_profiles (
        candidacy_id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        current_basis_hash TEXT,
        review_state TEXT NOT NULL,
        publication_state TEXT NOT NULL
      );
      CREATE TABLE candidacies (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        constituency_id TEXT NOT NULL,
        declaration_status TEXT NOT NULL
      );
      CREATE TABLE people (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, sort_name TEXT NOT NULL);
      CREATE TABLE constituencies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE policy_topics (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL);

      INSERT INTO sources VALUES ('news-source', 'Island newsroom', 'metadata-only');
      INSERT INTO constituencies VALUES ('ramsey', 'Ramsey');
      INSERT INTO policy_topics VALUES ('topic-economy', 'Economy', 1);
      INSERT INTO people VALUES
        ('person-approved', 'Approved Candidate', 'Candidate, Approved'),
        ('person-rejected', 'Rejected Candidate', 'Candidate, Rejected'),
        ('person-unreviewed', 'Unreviewed Candidate', 'Candidate, Unreviewed');
      INSERT INTO candidacies VALUES
        ('candidate-approved', 'person-approved', 'ramsey', 'prospective'),
        ('candidate-rejected', 'person-rejected', 'ramsey', 'prospective'),
        ('candidate-unreviewed', 'person-unreviewed', 'ramsey', 'prospective');
      INSERT INTO candidate_profiles VALUES
        ('candidate-approved', 'approved-candidate', '${"f".repeat(64)}', 'approved', 'published'),
        ('candidate-rejected', 'rejected-candidate', '${"g".repeat(64)}', 'rejected', 'withheld'),
        ('candidate-unreviewed', 'unreviewed-candidate', '${"h".repeat(64)}', 'unreviewed', 'private');
      INSERT INTO reviews VALUES
        ('profile-approved', 'candidate-profile-version', '${"f".repeat(64)}', 'approved', '2026-08-11T08:00:00.000Z', NULL),
        ('profile-rejected', 'candidate-profile-version', '${"g".repeat(64)}', 'rejected', '2026-08-11T08:05:00.000Z', NULL);
      INSERT INTO audit_events VALUES
        ('candidate-profile.reviewed', 'candidate-profile', 'candidate-approved', '{"reviewId":"profile-approved","basisHash":"${"f".repeat(64)}","decision":"approved"}'),
        ('candidate-profile.reviewed', 'candidate-profile', 'candidate-rejected', '{"reviewId":"profile-rejected","basisHash":"${"g".repeat(64)}","decision":"rejected"}');

      INSERT INTO source_item_versions VALUES
        ('version-ordinary', 'item-ordinary', '2026-08-11T09:00:00.000Z', '{"canonicalUrl":"https://publisher.example/news/ordinary","title":"Ordinary election news","publishedAt":"2026-08-11T09:00:00.000Z","itemType":"news"}', '${"a".repeat(64)}', 'feed-v1'),
        ('version-approved', 'item-approved', '2026-08-11T09:01:00.000Z', '{"canonicalUrl":"https://publisher.example/news/approved","title":"Approved candidate report","publishedAt":"2026-08-11T09:01:00.000Z","itemType":"news"}', '${"b".repeat(64)}', 'feed-v1'),
        ('version-rejected', 'item-rejected', '2026-08-11T09:02:00.000Z', '{"canonicalUrl":"https://publisher.example/news/rejected","title":"Rejected candidate report","publishedAt":"2026-08-11T09:02:00.000Z","itemType":"news"}', '${"c".repeat(64)}', 'feed-v1'),
        ('version-unreviewed', 'item-unreviewed', '2026-08-11T09:03:00.000Z', '{"canonicalUrl":"https://publisher.example/news/unreviewed","title":"Unreviewed candidate report","publishedAt":"2026-08-11T09:03:00.000Z","itemType":"news"}', '${"d".repeat(64)}', 'feed-v1'),
        ('version-mixed', 'item-mixed', '2026-08-11T09:04:00.000Z', '{"canonicalUrl":"https://publisher.example/news/mixed","title":"Mixed candidate report","publishedAt":"2026-08-11T09:04:00.000Z","itemType":"news"}', '${"e".repeat(64)}', 'feed-v1');
      INSERT INTO source_items VALUES
        ('item-ordinary', 'news-source', 'Ordinary election news', 'https://publisher.example/news/ordinary', 'news', '2026-08-11T09:00:00.000Z', '2026-08-11T09:00:00.000Z', 'version-ordinary', '${"a".repeat(64)}', 'approved', 'published'),
        ('item-approved', 'news-source', 'Approved candidate report', 'https://publisher.example/news/approved', 'news', '2026-08-11T09:01:00.000Z', '2026-08-11T09:01:00.000Z', 'version-approved', '${"b".repeat(64)}', 'approved', 'published'),
        ('item-rejected', 'news-source', 'Rejected candidate report', 'https://publisher.example/news/rejected', 'news', '2026-08-11T09:02:00.000Z', '2026-08-11T09:02:00.000Z', 'version-rejected', '${"c".repeat(64)}', 'approved', 'published'),
        ('item-unreviewed', 'news-source', 'Unreviewed candidate report', 'https://publisher.example/news/unreviewed', 'news', '2026-08-11T09:03:00.000Z', '2026-08-11T09:03:00.000Z', 'version-unreviewed', '${"d".repeat(64)}', 'approved', 'published'),
        ('item-mixed', 'news-source', 'Mixed candidate report', 'https://publisher.example/news/mixed', 'news', '2026-08-11T09:04:00.000Z', '2026-08-11T09:04:00.000Z', 'version-mixed', '${"e".repeat(64)}', 'approved', 'published');
      INSERT INTO reviews VALUES
        ('review-ordinary', 'source-item-version', 'version-ordinary', 'approved', '2026-08-11T10:00:00.000Z', NULL),
        ('review-approved', 'source-item-version', 'version-approved', 'approved', '2026-08-11T10:01:00.000Z', NULL),
        ('review-rejected', 'source-item-version', 'version-rejected', 'approved', '2026-08-11T10:02:00.000Z', NULL),
        ('review-unreviewed', 'source-item-version', 'version-unreviewed', 'approved', '2026-08-11T10:03:00.000Z', NULL),
        ('review-mixed', 'source-item-version', 'version-mixed', 'approved', '2026-08-11T10:04:00.000Z', NULL);
      INSERT INTO audit_events VALUES
        ('source-item.reviewed', 'source-item-version', 'version-ordinary', '{"reviewId":"review-ordinary","decision":"approved"}'),
        ('source-item.reviewed', 'source-item-version', 'version-approved', '{"reviewId":"review-approved","decision":"approved"}'),
        ('source-item.reviewed', 'source-item-version', 'version-rejected', '{"reviewId":"review-rejected","decision":"approved"}'),
        ('source-item.reviewed', 'source-item-version', 'version-unreviewed', '{"reviewId":"review-unreviewed","decision":"approved"}'),
        ('source-item.reviewed', 'source-item-version', 'version-mixed', '{"reviewId":"review-mixed","decision":"approved"}');
      INSERT INTO source_item_version_entities VALUES
        ('version-ordinary', 'topic', 'topic-economy', 'review-ordinary', 'confirmed'),
        ('version-approved', 'candidacy', 'candidate-approved', 'review-approved', 'confirmed'),
        ('version-rejected', 'candidacy', 'candidate-rejected', 'review-rejected', 'confirmed'),
        ('version-unreviewed', 'candidacy', 'candidate-unreviewed', 'review-unreviewed', 'confirmed'),
        ('version-mixed', 'candidacy', 'candidate-approved', 'review-mixed', 'confirmed'),
        ('version-mixed', 'candidacy', 'candidate-rejected', 'review-mixed', 'confirmed');
    `);

    const snapshot = await queryPublicEvidenceSnapshot(d1Adapter(database), {
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    assert.deepEqual(
      snapshot.records.map((record) => record.itemId).toSorted(),
      ["item-approved", "item-ordinary"],
    );
    assert.deepEqual(
      snapshot.records.find((record) => record.itemId === "item-ordinary")?.associations,
      [{ id: "topic-economy", label: "Economy", slug: null, type: "topic" }],
    );
    assert.deepEqual(
      snapshot.records.find((record) => record.itemId === "item-approved")?.associations
        .map(({ id, type }) => ({ id, type })),
      [
        { id: "candidate-approved", type: "candidate" },
        { id: "ramsey", type: "constituency" },
      ],
    );
    assert.ok(!snapshot.records.some((record) => (
      ["item-rejected", "item-unreviewed", "item-mixed"].includes(record.itemId)
    )));
  } finally {
    database.close();
  }
});

test("private dossier sees approved evidence before candidate profile publication while public stays closed", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rights_state TEXT NOT NULL
      );
      CREATE TABLE source_items (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        item_type TEXT NOT NULL,
        published_at TEXT,
        first_seen_at TEXT NOT NULL,
        latest_version_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        review_state TEXT NOT NULL,
        publication_state TEXT NOT NULL
      );
      CREATE TABLE source_item_versions (
        id TEXT PRIMARY KEY,
        source_item_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        parser_version TEXT NOT NULL
      );
      CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL,
        supersedes_review_id TEXT
      );
      CREATE TABLE audit_events (
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE source_item_version_entities (
        source_item_version_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        review_id TEXT NOT NULL,
        confirmation_state TEXT NOT NULL
      );
      CREATE TABLE candidate_profiles (
        candidacy_id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        current_basis_hash TEXT,
        review_state TEXT NOT NULL,
        publication_state TEXT NOT NULL
      );
      CREATE TABLE candidacies (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        constituency_id TEXT NOT NULL,
        declaration_status TEXT NOT NULL
      );
      CREATE TABLE people (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        sort_name TEXT NOT NULL
      );
      CREATE TABLE constituencies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE policy_topics (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL);

      INSERT INTO sources VALUES ('source-a', 'Island newsroom', 'metadata-only');
      INSERT INTO source_item_versions VALUES (
        'version-a', 'item-a', '2026-08-11T09:05:00.000Z',
        '{"canonicalUrl":"https://publisher.example/election/interview","title":"Candidate interview","publishedAt":"2026-08-11T09:00:00.000Z"}',
        '${"a".repeat(64)}', 'feed-v1'
      );
      INSERT INTO source_items VALUES (
        'item-a', 'source-a', 'Candidate interview',
        'https://publisher.example/election/interview', 'interview',
        '2026-08-11T09:00:00.000Z', '2026-08-11T09:05:00.000Z',
        'version-a', '${"a".repeat(64)}', 'approved', 'published'
      );
      INSERT INTO reviews VALUES (
        'review-a', 'source-item-version', 'version-a', 'approved',
        '2026-08-11T11:00:00.000Z', NULL
      );
      INSERT INTO audit_events VALUES (
        'source-item.reviewed', 'source-item-version', 'version-a',
        '{"reviewId":"review-a","decision":"approved"}'
      );
      INSERT INTO people VALUES ('person-a', 'Private Profile Candidate', 'Profile Candidate, Private');
      INSERT INTO constituencies VALUES ('douglas-south', 'Douglas South');
      INSERT INTO candidacies VALUES (
        'candidate-a', 'person-a', 'douglas-south', 'prospective'
      );
      INSERT INTO candidate_profiles VALUES (
        'candidate-a', 'private-profile-candidate', '${"b".repeat(64)}', 'unreviewed', 'private'
      );
      INSERT INTO source_item_version_entities VALUES (
        'version-a', 'candidacy', 'candidate-a', 'review-a', 'confirmed'
      );
    `);
    const db = d1Adapter(database);
    const publicSnapshot = await queryPublicEvidenceSnapshot(db, {
      candidateId: "candidate-a",
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    const privateSnapshot = await queryPrivateCandidateDossierEvidenceSnapshot(db, {
      candidateId: "candidate-a",
      now: new Date("2026-08-11T12:00:00.000Z"),
    });

    assert.equal(publicSnapshot.state, "empty");
    assert.equal(publicSnapshot.records.length, 0);
    assert.equal(privateSnapshot.state, "available");
    assert.equal(privateSnapshot.records.length, 1);
    assert.deepEqual(
      privateSnapshot.records[0]?.associations.map(({ label, type }) => ({ label, type })),
      [
        { label: "Private Profile Candidate", type: "candidate" },
        { label: "Douglas South", type: "constituency" },
      ],
    );

    assert.deepEqual(await queryPublicCandidateDirectory(db), []);
    database.exec(`
      UPDATE candidate_profiles
         SET review_state = 'approved', publication_state = 'published'
       WHERE candidacy_id = 'candidate-a';
      INSERT INTO reviews VALUES (
        'profile-review-a', 'candidate-profile-version', '${"b".repeat(64)}', 'approved',
        '2026-08-11T11:30:00.000Z', NULL
      );
      INSERT INTO audit_events VALUES (
        'candidate-profile.reviewed', 'candidate-profile', 'candidate-a',
        '{"reviewId":"profile-review-a","basisHash":"${"b".repeat(64)}","decision":"approved"}'
      );
    `);
    assert.deepEqual(await queryPublicCandidateDirectory(db), [{
      candidacyId: "candidate-a",
      constituencyId: "douglas-south",
      constituencyName: "Douglas South",
      evidenceCount: 1,
      initials: "PP",
      name: "Private Profile Candidate",
      slug: "private-profile-candidate",
      status: "Prospective candidate",
    }]);
  } finally {
    database.close();
  }
});
