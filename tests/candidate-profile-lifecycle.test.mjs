import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  backfillCandidateProfileBasisHashes,
  candidateProfileBasisFromRow,
  candidateProfileBasisRowSql,
  fingerprintCandidateProfileBasis,
} from "../app/lib/evidence/candidate-profile-basis.ts";
import {
  CandidateProfileReviewConflictError,
  CandidateProfileReviewValidationError,
  reviewCandidateProfileVersion,
} from "../app/lib/evidence/candidate-profile-review.ts";
import { isCurrentPublicCandidateProfile } from "../app/lib/evidence/candidate-intelligence.ts";
import { getPublishableCandidatePortraitsSafe } from "../app/lib/evidence/public-media.ts";
import { queryPublicCandidateDirectory } from "../app/lib/evidence/public-evidence.ts";
import { GET as getCandidatePortrait } from "../app/api/media/candidate-portrait/[id]/route.ts";

const candidacyId = "candidacy-alpha";
const directoryPayloadHashA = "a".repeat(64);
const directoryPayloadHashB = "b".repeat(64);
const profileUrlHash = "c".repeat(64);

function migrationFiles(through = 13) {
  return readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= through)
    .sort();
}

function applyMigrations(database, from = 0, through = 13) {
  const files = migrationFiles(through).filter((file) => Number(file.slice(0, 4)) >= from);
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

function seedCandidateBeforeIdentityMigration(database) {
  const directoryPayload = JSON.stringify({
    candidate: {
      fullName: "Candidate Alpha",
      profileUrl: "https://news.example.im/election/candidate-alpha/",
    },
    constituencyName: "Douglas South",
  });
  database.exec(`
    INSERT INTO elections (id, name, election_date, status)
    VALUES ('election-2026', 'House of Keys General Election 2026', '2026-09-24', 'upcoming');
    INSERT INTO constituencies (id, name)
    VALUES ('douglas-south', 'Douglas South');
    INSERT INTO people (id, full_name, sort_name, profile_state)
    VALUES ('person-alpha', 'Candidate Alpha', 'Alpha, Candidate', 'draft');
    INSERT INTO candidacies (
      id, election_id, person_id, constituency_id, affiliation,
      declaration_status, verification_state
    ) VALUES (
      '${candidacyId}', 'election-2026', 'person-alpha', 'douglas-south',
      'Independent', 'prospective', 'unverified'
    );
    INSERT INTO sources (
      id, name, publisher, homepage_url, feed_url, feed_type,
      source_tier, rights_state
    ) VALUES (
      'candidate-directory-source', 'Island election directory', 'Island newsroom',
      'https://news.example.im/', 'https://news.example.im/election/candidates/',
      'candidate-directory', 1, 'metadata-only'
    );
    INSERT INTO ingestion_runs (
      id, source_id, trigger, idempotency_key, actor_type, actor_id,
      parser_version, status, started_at, finished_at
    ) VALUES (
      'directory-run-a', 'candidate-directory-source', 'manual', 'directory-run-a',
      'system', 'lifecycle-test', 'candidate-directory-v1', 'succeeded',
      '2026-08-11T09:00:00.000Z', '2026-08-11T09:01:00.000Z'
    );
    INSERT INTO source_items (
      id, source_id, external_id, canonical_url, canonical_url_hash,
      item_type, title, summary, first_seen_at, last_seen_at,
      latest_version_id, content_hash, source_tier
    ) VALUES (
      'candidate-item-alpha', 'candidate-directory-source', 'candidate-alpha',
      'https://news.example.im/election/candidate-alpha/', '${profileUrlHash}',
      'candidate-profile', 'Candidate Alpha', '',
      '2026-08-11T09:00:00.000Z', '2026-08-11T09:00:00.000Z',
      'directory-version-a', '${directoryPayloadHashA}', 1
    );
    INSERT INTO source_snapshots (
      id, source_id, item_id, ingestion_run_id, capture_url, resolved_url,
      captured_at, http_status, content_type, byte_length, content_hash,
      retention_outcome, chain_hash
    ) VALUES (
      'directory-snapshot-a', 'candidate-directory-source', 'candidate-item-alpha',
      'directory-run-a', 'https://news.example.im/election/candidates/?capture=a',
      'https://news.example.im/election/candidates/?capture=a',
      '2026-08-11T09:00:00.000Z', 200, 'text/html', 100,
      '${directoryPayloadHashA}', 'stored-private', '${"d".repeat(64)}'
    );
    UPDATE source_items
       SET latest_snapshot_id = 'directory-snapshot-a'
     WHERE id = 'candidate-item-alpha';
    INSERT INTO source_item_versions (
      id, source_item_id, ingestion_run_id, snapshot_id, observed_at,
      payload, payload_hash, parser_version
    ) VALUES (
      'directory-version-a', 'candidate-item-alpha', 'directory-run-a',
      'directory-snapshot-a', '2026-08-11T09:00:00.000Z',
      '${directoryPayload.replaceAll("'", "''")}', '${directoryPayloadHashA}',
      'candidate-directory-v1'
    );
    INSERT INTO candidate_profile_observations (
      id, candidacy_id, source_id, source_item_id, snapshot_id,
      observation_type, observed_at, payload, payload_hash, parser_version
    ) VALUES (
      'directory-observation-a', '${candidacyId}', 'candidate-directory-source',
      'candidate-item-alpha', 'directory-snapshot-a', 'directory',
      '2026-08-11T09:00:00.000Z', '${directoryPayload.replaceAll("'", "''")}',
      '${directoryPayloadHashA}', 'candidate-directory-v1'
    );
    INSERT INTO candidate_profiles (
      candidacy_id, slug, profile_url, profile_url_hash,
      observed_constituency_id, current_directory_observation_id,
      completeness_state, review_state, publication_state,
      last_directory_seen_at
    ) VALUES (
      '${candidacyId}', 'candidate-alpha',
      'https://news.example.im/election/candidate-alpha/', '${profileUrlHash}',
      'douglas-south', 'directory-observation-a', 'directory-only',
      'unreviewed', 'private', '2026-08-11T09:00:00.000Z'
    );
  `);
}

function createCandidateDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  applyMigrations(database, 0, 12);
  seedCandidateBeforeIdentityMigration(database);
  applyMigrations(database, 13, 13);
  return database;
}

function profileRow(database) {
  return database.prepare(
    `SELECT current_basis_hash, review_state, publication_state,
            current_directory_observation_id
       FROM candidate_profiles WHERE candidacy_id = ?`,
  ).get(candidacyId);
}

async function currentBasis(database) {
  const row = database.prepare(`${candidateProfileBasisRowSql} WHERE profiles.candidacy_id = ?`)
    .get(candidacyId);
  assert.ok(row);
  const basis = candidateProfileBasisFromRow(row);
  return { basis, hash: await fingerprintCandidateProfileBasis(basis) };
}

async function decide(db, basisHash, decision, expectedPreviousReviewId = null) {
  return reviewCandidateProfileVersion(db, {
    candidacyId,
    decision,
    expectedBasisHash: basisHash,
    expectedPreviousReviewId,
    rationale: decision === "approved"
      ? "Approved after checking the exact identity fields against the directory capture."
      : "Rejected because the identity fields do not match the captured directory source.",
    reviewerId: "reviewer-david-searle",
  });
}

function insertDirectoryOccurrence(database, input) {
  const payload = JSON.stringify({
    candidate: {
      fullName: "Candidate Alpha",
      profileUrl: "https://news.example.im/election/candidate-alpha/",
    },
    constituencyName: "Douglas South",
    semanticState: input.payloadHash === directoryPayloadHashA ? "A" : "B",
  });
  database.prepare(
    `INSERT INTO source_snapshots (
       id, source_id, item_id, ingestion_run_id, capture_url, resolved_url,
       captured_at, http_status, content_type, byte_length, content_hash,
       retention_outcome, chain_hash
     ) VALUES (?, 'candidate-directory-source', 'candidate-item-alpha',
       'directory-run-a', ?, ?, ?, 200, 'text/html', 100, ?,
       'stored-private', ?)`,
  ).run(
    input.snapshotId,
    `https://news.example.im/election/candidates/?capture=${input.snapshotId}`,
    `https://news.example.im/election/candidates/?capture=${input.snapshotId}`,
    input.observedAt,
    input.payloadHash,
    input.chainHash,
  );
  if (input.versionId) {
    database.prepare(
      `INSERT INTO source_item_versions (
         id, source_item_id, ingestion_run_id, snapshot_id, observed_at,
         payload, payload_hash, parser_version
       ) VALUES (?, 'candidate-item-alpha', 'directory-run-a', ?, ?, ?, ?,
         'candidate-directory-v1')`,
    ).run(
      input.versionId,
      input.snapshotId,
      input.observedAt,
      payload,
      input.payloadHash,
    );
  }
  database.prepare(
    `INSERT INTO candidate_profile_observations (
       id, candidacy_id, source_id, source_item_id, snapshot_id,
       observation_type, observed_at, payload, payload_hash, parser_version
     ) VALUES (?, ?, 'candidate-directory-source', 'candidate-item-alpha', ?,
       'directory', ?, ?, ?, 'candidate-directory-v1')`,
  ).run(
    input.observationId,
    candidacyId,
    input.snapshotId,
    input.observedAt,
    payload,
    input.payloadHash,
  );
}

test("0013 upgrades an existing profile and reconciles a reviewable exact basis", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    applyMigrations(database, 0, 12);
    seedCandidateBeforeIdentityMigration(database);
    database.exec(`
      CREATE TRIGGER reviews_candidate_profile_version_guard
      BEFORE INSERT ON reviews BEGIN SELECT 1; END;
    `);
    applyMigrations(database, 13, 13);
    assert.equal(profileRow(database).current_basis_hash, null);
    assert.equal(await backfillCandidateProfileBasisHashes(d1Adapter(database)), 1);
    const expected = await currentBasis(database);
    assert.equal(profileRow(database).current_basis_hash, expected.hash);
    assert.equal(expected.basis.directoryVersionId, "directory-version-a");
  } finally {
    database.close();
  }
});

test("candidate identity decisions are append-only, audited, reversible and public only at the current leaf", async () => {
  const database = createCandidateDatabase();
  try {
    const db = d1Adapter(database);
    await backfillCandidateProfileBasisHashes(db);
    const { basis, hash } = await currentBasis(database);
    assert.deepEqual(await queryPublicCandidateDirectory(db), []);
    assert.equal(await isCurrentPublicCandidateProfile(db, candidacyId, hash), false);

    const approval = await decide(db, hash, "approved");
    assert.equal(approval.idempotent, false);
    assert.equal(profileRow(database).publication_state, "published");
    assert.equal((await queryPublicCandidateDirectory(db))[0]?.name, "Candidate Alpha");
    assert.equal(await isCurrentPublicCandidateProfile(db, candidacyId, hash), true);

    const replay = await decide(db, hash, "approved");
    assert.equal(replay.idempotent, true);
    assert.equal(replay.reviewId, approval.reviewId);
    const audit = database.prepare(
      `SELECT payload FROM audit_events
        WHERE action = 'candidate-profile.reviewed'
          AND entity_id = ? ORDER BY sequence DESC LIMIT 1`,
    ).get(candidacyId);
    assert.ok(audit);
    const auditPayload = JSON.parse(audit.payload);
    assert.equal(auditPayload.basisHash, hash);
    assert.equal(auditPayload.reviewId, approval.reviewId);
    assert.deepEqual(auditPayload.identityBasis, basis);
    assert.equal("biography" in auditPayload.identityBasis, false);
    assert.equal("contacts" in auditPayload.identityBasis, false);

    const rejection = await decide(db, hash, "rejected", approval.reviewId);
    assert.equal(profileRow(database).publication_state, "withheld");
    assert.deepEqual(await queryPublicCandidateDirectory(db), []);
    assert.equal(await isCurrentPublicCandidateProfile(db, candidacyId, hash), false);
    assert.equal((await decide(db, hash, "rejected", approval.reviewId)).idempotent, true);

    await assert.rejects(
      decide(db, hash, "approved", approval.reviewId),
      CandidateProfileReviewConflictError,
    );
    const restoration = await decide(db, hash, "approved", rejection.reviewId);
    assert.equal(restoration.supersedesReviewId, rejection.reviewId);
    assert.equal((await queryPublicCandidateDirectory(db)).length, 1);
    assert.equal(await isCurrentPublicCandidateProfile(db, candidacyId, hash), true);
    assert.deepEqual(await getPublishableCandidatePortraitsSafe(), {});
    const portraitResponse = await getCandidatePortrait();
    assert.equal(portraitResponse.status, 404);
    assert.equal(portraitResponse.headers.get("cache-control"), "no-store");
  } finally {
    database.close();
  }
});

test("forged and stale basis hashes are repaired but can never be approved", async () => {
  const database = createCandidateDatabase();
  try {
    const db = d1Adapter(database);
    const forged = "f".repeat(64);
    database.prepare(
      "UPDATE candidate_profiles SET current_basis_hash = ? WHERE candidacy_id = ?",
    ).run(forged, candidacyId);
    const actual = await currentBasis(database);
    assert.notEqual(actual.hash, forged);
    await assert.rejects(decide(db, forged, "approved"), CandidateProfileReviewConflictError);
    assert.equal(profileRow(database).current_basis_hash, actual.hash);
    assert.equal(database.prepare(
      "SELECT COUNT(*) AS count FROM reviews WHERE target_type = 'candidate-profile-version'",
    ).get().count, 0);
  } finally {
    database.close();
  }
});

test("every projected mutable identity field invalidates the old public approval", async () => {
  const database = createCandidateDatabase();
  try {
    const db = d1Adapter(database);
    await backfillCandidateProfileBasisHashes(db);
    const first = await currentBasis(database);
    await decide(db, first.hash, "approved");

    const mutations = [
      () => database.prepare("UPDATE people SET full_name = 'Candidate Alpha Updated' WHERE id = 'person-alpha'").run(),
      () => database.prepare("UPDATE candidacies SET affiliation = 'Liberal Vannin' WHERE id = ?").run(candidacyId),
      () => {
        database.prepare(
          "INSERT INTO people (id, full_name, sort_name, profile_state) VALUES ('person-beta', 'Candidate Beta', 'Beta, Candidate', 'draft')",
        ).run();
        database.prepare("UPDATE candidacies SET person_id = 'person-beta' WHERE id = ?").run(candidacyId);
      },
      () => {
        database.prepare("INSERT INTO constituencies (id, name) VALUES ('middle', 'Middle')").run();
        database.prepare("UPDATE candidacies SET constituency_id = 'middle' WHERE id = ?").run(candidacyId);
      },
      () => database.prepare("UPDATE constituencies SET name = 'Middle and Santon' WHERE id = 'middle'").run(),
      () => database.prepare("UPDATE candidate_profiles SET observed_constituency_id = 'middle' WHERE candidacy_id = ?").run(candidacyId),
      () => database.prepare("UPDATE candidate_profiles SET slug = 'candidate-alpha-updated' WHERE candidacy_id = ?").run(candidacyId),
      () => database.prepare("UPDATE candidate_profiles SET profile_url_hash = ? WHERE candidacy_id = ?").run("e".repeat(64), candidacyId),
    ];

    for (const mutate of mutations) {
      mutate();
      assert.equal(profileRow(database).current_basis_hash, null);
      assert.equal(profileRow(database).review_state, "needs-update");
      assert.equal(profileRow(database).publication_state, "withheld");
      assert.deepEqual(await queryPublicCandidateDirectory(db), []);
      await backfillCandidateProfileBasisHashes(db);
      assert.match(profileRow(database).current_basis_hash, /^[0-9a-f]{64}$/);
    }

    database.prepare("UPDATE candidacies SET declaration_status = 'withdrawn' WHERE id = ?")
      .run(candidacyId);
    assert.equal(profileRow(database).current_basis_hash, null);
    await backfillCandidateProfileBasisHashes(db);
    const withdrawnHash = profileRow(database).current_basis_hash;
    assert.match(withdrawnHash, /^[0-9a-f]{64}$/);
    assert.deepEqual(await queryPublicCandidateDirectory(db), []);
    await assert.rejects(
      decide(db, withdrawnHash, "approved"),
      CandidateProfileReviewValidationError,
    );
  } finally {
    database.close();
  }
});

test("a current candidate review without its immutable audit event cannot be superseded or published", async () => {
  const database = createCandidateDatabase();
  try {
    const db = d1Adapter(database);
    await backfillCandidateProfileBasisHashes(db);
    const { hash } = await currentBasis(database);
    database.prepare(
      `INSERT INTO reviews (
         id, target_type, target_id, decision, rationale, reviewer_id, created_at
       ) VALUES (
         'unaudited-profile-review', 'candidate-profile-version', ?, 'approved',
         'Inserted without the matching immutable audit event.', 'rogue-reviewer',
         '2026-08-11T11:00:00.000Z'
       )`,
    ).run(hash);
    database.prepare(
      `UPDATE candidate_profiles
          SET review_state = 'approved', publication_state = 'published'
        WHERE candidacy_id = ?`,
    ).run(candidacyId);
    assert.deepEqual(await queryPublicCandidateDirectory(db), []);
    assert.equal(await isCurrentPublicCandidateProfile(db, candidacyId, hash), false);
    await assert.rejects(
      decide(db, hash, "rejected", "unaudited-profile-review"),
      CandidateProfileReviewConflictError,
    );
  } finally {
    database.close();
  }
});

test("unchanged observations preserve approval while A to B to A creates a fresh review target", async () => {
  const database = createCandidateDatabase();
  try {
    const db = d1Adapter(database);
    await backfillCandidateProfileBasisHashes(db);
    const original = await currentBasis(database);
    await decide(db, original.hash, "approved");

    insertDirectoryOccurrence(database, {
      chainHash: "1".repeat(64),
      observationId: "directory-observation-a-unchanged",
      observedAt: "2026-08-11T10:00:00.000Z",
      payloadHash: directoryPayloadHashA,
      snapshotId: "directory-snapshot-a-unchanged",
      versionId: null,
    });
    database.prepare(
      "UPDATE candidate_profiles SET current_directory_observation_id = ? WHERE candidacy_id = ?",
    ).run("directory-observation-a-unchanged", candidacyId);
    await backfillCandidateProfileBasisHashes(db);
    assert.equal(profileRow(database).current_basis_hash, original.hash);
    assert.equal(profileRow(database).publication_state, "published");

    insertDirectoryOccurrence(database, {
      chainHash: "2".repeat(64),
      observationId: "directory-observation-b",
      observedAt: "2026-08-11T11:00:00.000Z",
      payloadHash: directoryPayloadHashB,
      snapshotId: "directory-snapshot-b",
      versionId: "directory-version-b",
    });
    database.prepare(
      "UPDATE candidate_profiles SET current_directory_observation_id = ? WHERE candidacy_id = ?",
    ).run("directory-observation-b", candidacyId);
    await backfillCandidateProfileBasisHashes(db);
    const middle = await currentBasis(database);
    assert.notEqual(middle.hash, original.hash);
    assert.equal(middle.basis.directoryVersionId, "directory-version-b");
    await decide(db, middle.hash, "approved");

    insertDirectoryOccurrence(database, {
      chainHash: "3".repeat(64),
      observationId: "directory-observation-a-returned",
      observedAt: "2026-08-11T12:00:00.000Z",
      payloadHash: directoryPayloadHashA,
      snapshotId: "directory-snapshot-a-returned",
      versionId: "directory-version-a-returned",
    });
    database.prepare(
      "UPDATE candidate_profiles SET current_directory_observation_id = ? WHERE candidacy_id = ?",
    ).run("directory-observation-a-returned", candidacyId);
    await backfillCandidateProfileBasisHashes(db);
    const returned = await currentBasis(database);
    assert.notEqual(returned.hash, original.hash);
    assert.notEqual(returned.hash, middle.hash);
    assert.equal(returned.basis.directoryVersionId, "directory-version-a-returned");
    await decide(db, returned.hash, "approved");
    assert.equal((await queryPublicCandidateDirectory(db)).length, 1);
  } finally {
    database.close();
  }
});
