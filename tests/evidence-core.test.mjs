import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  candidateProfileMatchesExpectedIdentity,
  parseCandidateDirectory,
  parseCandidateProfile,
} from "../app/lib/evidence/candidate-html.ts";
import { candidateDirectoryStatesSql } from "../app/lib/evidence/candidate-directory-sql.ts";
import { parseFeed } from "../app/lib/evidence/feed.ts";
import { sha256Hex, stableJson } from "../app/lib/evidence/integrity.ts";
import { normalizeReviewRationale } from "../app/lib/evidence/review-validation.ts";
import {
  insertSourceItemCandidateAssignmentReviewSql,
  insertSourceItemReviewSql,
  sourceItemCandidateAssignmentReviewGuardSql,
  sourceItemVersionReviewGuardSql,
  updateSourceItemReviewStateSql,
} from "../app/lib/evidence/review-sql.ts";
import {
  candidateIntelligenceInvalidationSql,
  candidateIntelligenceRevisionInsertGuardSql,
  candidateIntelligenceRevisionUpdateGuardSql,
  sourceItemVersionEntityInsertGuardSql,
  sourceItemVersionEntityNoDeleteSql,
  sourceItemVersionEntityNoUpdateSql,
} from "../app/lib/evidence/candidate-intelligence-sql.ts";
import { candidates, updates } from "../app/lib/data.ts";
import { rotateSourceIdsForWindow } from "../app/lib/evidence/ingestion-scheduling.ts";

test("traffic-triggered monitoring rotates source priority fairly", () => {
  const sourceIds = Array.from({ length: 9 }, (_, index) => `source-${index + 1}`);
  const first = rotateSourceIdsForWindow(sourceIds, 100);
  const second = rotateSourceIdsForWindow(sourceIds, 101);

  assert.equal(first.length > 2, true);
  assert.deepEqual(new Set(first), new Set(second));
  assert.equal(new Set(first).size, first.length);
  assert.deepEqual(first.slice(0, 2).filter((sourceId) => second.slice(0, 2).includes(sourceId)), []);
});

test("candidate directory cards retain constituency and portrait provenance", () => {
  const entries = parseCandidateDirectory(
    `<p><a href="/election-2026/election-constituencies/douglas-south-20211/">
       <strong>Douglas South</strong></a></p>
     <ul><li><a class="gm-sec-title" href="/election-2026/election-candidates/claire-christian/">
       <img class="gm-sec-img" src="https://mmo.aiircdn.com/61/claire.jpg" alt="">
       <p class="gm-sec-description">Claire Christian</p></a></li></ul>`,
    "https://www.manxradio.com/election-2026/election-candidates/",
  );

  assert.deepEqual(entries, [
    {
      constituencyName: "Douglas South",
      name: "Claire Christian",
      portraitUrl: "https://mmo.aiircdn.com/61/claire.jpg",
      profileUrl:
        "https://www.manxradio.com/election-2026/election-candidates/claire-christian/",
      slug: "claire-christian",
    },
  ]);
});

test("candidate directory state lookup prefers the matching snapshot without a correlated ORDER BY", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE candidacies (
        id TEXT PRIMARY KEY,
        declaration_status TEXT NOT NULL
      );
      CREATE TABLE candidate_profiles (
        candidacy_id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        current_directory_observation_id TEXT NOT NULL,
        current_profile_observation_id TEXT
      );
      CREATE TABLE candidate_profile_observations (
        id TEXT PRIMARY KEY,
        source_item_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        payload_hash TEXT NOT NULL
      );
      CREATE TABLE source_item_versions (
        id TEXT PRIMARY KEY,
        source_item_id TEXT NOT NULL,
        snapshot_id TEXT,
        observed_at TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        parser_version TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      INSERT INTO candidacies (id, declaration_status)
      VALUES ('candidate-a', 'prospective'), ('candidate-b', 'prospective');
      INSERT INTO candidate_profiles
        (candidacy_id, slug, current_directory_observation_id, current_profile_observation_id)
      VALUES
        ('candidate-a', 'candidate-a', 'observation-a', NULL),
        ('candidate-b', 'candidate-b', 'observation-b', NULL);
      INSERT INTO candidate_profile_observations
        (id, source_item_id, snapshot_id, observed_at, payload, payload_hash)
      VALUES
        ('observation-a', 'item-a', 'snapshot-a', '2026-08-11T10:00:00Z', '{}', 'hash-a'),
        ('observation-b', 'item-b', 'snapshot-b', '2026-08-11T10:00:00Z', '{}', 'hash-b');
      INSERT INTO source_item_versions
        (id, source_item_id, snapshot_id, observed_at, payload_hash, parser_version, created_at)
      VALUES
        ('version-a-exact', 'item-a', 'snapshot-a', '2026-08-11T09:00:00Z', 'hash-a',
          'candidate-directory-v1', '2026-08-11T09:00:00Z'),
        ('version-a-other', 'item-a', 'snapshot-other', '2026-08-11T09:30:00Z', 'hash-a',
          'candidate-directory-v1', '2026-08-11T09:30:00Z'),
        ('version-b-fallback', 'item-b', 'snapshot-other', '2026-08-11T09:45:00Z', 'hash-b',
          'candidate-directory-v1', '2026-08-11T09:45:00Z');
    `);

    const rows = database.prepare(`${candidateDirectoryStatesSql} ORDER BY profiles.slug`).all();
    assert.deepEqual(
      rows.map(({ slug, current_directory_version_id: versionId }) => ({ slug, versionId })),
      [
        { slug: "candidate-a", versionId: "version-a-exact" },
        { slug: "candidate-b", versionId: "version-b-fallback" },
      ],
    );
  } finally {
    database.close();
  }
});

test("candidate profile parser scopes links and classifies rights-gated media", () => {
  const profile = parseCandidateProfile(
    `<head>
       <meta property="og:image:url" content="https://mmo.aiircdn.com/61/claire-card.jpg">
       <meta property="og:image:width" content="800">
       <meta property="og:image:height" content="600">
       <meta property="og:image:type" content="image/jpeg">
     </head><body>
       <a href="https://www.facebook.com/ManxRadio/">Publisher Facebook</a>
       <div class="s-page"><h1 class="o-headline">Claire Christian</h1>
       <p><img src="https://mmo.aiircdn.com/61/claire-body.jpg"></p>
       <p><strong>Claire Christian</strong></p>
       <p>Claire is standing as an independent candidate in Douglas South.</p>
       <a href="https://candidate.example.im/biography-link">Unverified biography link</a>
       <p><strong>Contact Details:</strong></p>
       <p>E: <a href="mailto:Candidate@Example.im">Candidate@Example.im</a></p>
       <p>P: (07624) 209800</p>
       <p><a href="https://www.facebook.com/candidate">Facebook</a></p>
       <p><a href="https://www.manxradio.com/election-2026/election-info/">Publisher explainer</a></p>
       <p><strong>Candidate Media:</strong></p>
       <p><a href="https://mmo.aiircdn.com/61/manifesto.docx">Manifesto</a></p>
       <iframe src="https://www.youtube.com/embed/example"></iframe>
       <iframe src="https://player.captivate.fm/show/example"></iframe>
       <iframe src="https://player.example.com/embed/unverified"></iframe>
       <div class="o-content-block">advert</div></div>
     </body>`,
    "https://www.manxradio.com/election-2026/election-candidates/claire-christian/",
  );

  assert.equal(profile.name, "Claire Christian");
  assert.deepEqual(profile.biographyParagraphs, [
    "Claire is standing as an independent candidate in Douglas South.",
  ]);
  assert.equal(profile.links.some((link) => link.url === "mailto:candidate@example.im"), true);
  assert.equal(profile.links.some((link) => link.url === "tel:07624209800"), true);
  assert.equal(
    profile.links.some((link) => link.url === "https://www.facebook.com/candidate"),
    true,
  );
  assert.equal(
    profile.links.some((link) => link.url === "https://www.facebook.com/ManxRadio/"),
    false,
  );
  assert.equal(
    profile.links.some((link) => link.url === "https://candidate.example.im/biography-link"),
    false,
  );
  assert.equal(
    profile.links.some(
      (link) => link.url === "https://www.manxradio.com/election-2026/election-info/",
    ),
    false,
  );
  assert.equal(
    profile.links.some((link) => link.url === "https://player.example.com/embed/unverified"),
    false,
  );
  assert.equal(profile.links.some((link) => link.kind === "interview-video"), true);
  assert.equal(profile.links.some((link) => link.kind === "interview-audio"), true);
  assert.deepEqual(profile.documents, [
    {
      kind: "manifesto",
      title: "Manifesto",
      url: "https://mmo.aiircdn.com/61/manifesto.docx",
    },
  ]);
  assert.equal(profile.portraits.length, 2);
});

test("candidate profile identity rejects stale or redirected publisher pages", () => {
  const expected = {
    expectedName: "Andrea Krüger",
    expectedSlug: "andrea-kruger",
    expectedUrl: "https://www.manxradio.com/election-2026/election-candidates/andrea-kruger/",
  };
  assert.equal(
    candidateProfileMatchesExpectedIdentity({
      ...expected,
      observedName: "Andrea Kruger",
      resolvedUrl: expected.expectedUrl,
    }),
    true,
  );
  assert.equal(
    candidateProfileMatchesExpectedIdentity({
      ...expected,
      observedName: "Another Candidate",
      resolvedUrl: expected.expectedUrl,
    }),
    false,
  );
  assert.equal(
    candidateProfileMatchesExpectedIdentity({
      ...expected,
      observedName: "Andrea Kruger",
      resolvedUrl:
        "https://www.manxradio.com/election-2026/election-candidates/another-candidate/",
    }),
    false,
  );
});

test("RSS observations are normalized without tracking fragments", () => {
  const [item] = parseFeed(
    `<?xml version="1.0"?><rss><channel><item>
      <guid>story-1</guid><title>Island &amp; election update</title>
      <link>https://news.example.im/story?utm_source=feed#comments</link>
      <description><![CDATA[<p>A <strong>source-linked</strong> summary.</p>]]></description>
      <pubDate>Sun, 09 Aug 2026 12:00:00 GMT</pubDate>
    </item></channel></rss>`,
    "https://news.example.im/feed.xml",
  );

  assert.equal(item.externalId, "story-1");
  assert.equal(item.title, "Island & election update");
  assert.equal(item.url, "https://news.example.im/story");
  assert.equal(item.summary, "A source-linked summary.");
  assert.equal(item.publishedAt, "2026-08-09T12:00:00.000Z");
});

test("unsupported and empty XML cannot masquerade as successful feeds", () => {
  assert.throws(
    () => parseFeed("<html><title>Request rejected</title></html>", "https://example.im/feed"),
    /not a supported RSS or Atom feed/,
  );
  assert.throws(
    () => parseFeed("<rss><channel /></rss>", "https://example.im/feed"),
    /contains no entries/,
  );
});

test("audit JSON has fixed key ordering and a stable digest", async () => {
  const payload = stableJson({ z: [3, { b: true, a: null }], a: "The People's Isle" });
  assert.equal(payload, "{\"a\":\"The People's Isle\",\"z\":[3,{\"a\":null,\"b\":true}]}");
  assert.equal(
    await sha256Hex(payload),
    "0002c454dbe710b7f7a95a7a91f68983ea8b50f1a45ec539e6e76fd2d9ccc9dc",
  );
  assert.throws(() => stableJson({ invalid: undefined }), /finite JSON values/);
});

test("editorial review notes are bounded and rejection reasons are explicit", () => {
  assert.equal(
    normalizeReviewRationale("approved", ""),
    "Approved after reviewing the cited source and captured version.",
  );
  assert.equal(
    normalizeReviewRationale("approved", "  Source and capture checked.  "),
    "Source and capture checked.",
  );
  assert.throws(
    () => normalizeReviewRationale("rejected", "Too vague"),
    /at least 20 characters/,
  );
  assert.equal(
    normalizeReviewRationale(
      "rejected",
      "This record attributes the statement to the wrong candidate.",
    ),
    "This record attributes the statement to the wrong candidate.",
  );
  assert.throws(
    () => normalizeReviewRationale("approved", "x".repeat(501)),
    /500 characters or fewer/,
  );
});

test("source review transition is atomic, stale-safe and invalidated by changed content", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE source_items (
        id TEXT PRIMARY KEY,
        latest_version_id TEXT,
        content_hash TEXT,
        review_state TEXT NOT NULL,
        publication_state TEXT NOT NULL,
        updated_at TEXT
      );
      CREATE TABLE source_item_versions (
        id TEXT PRIMARY KEY,
        source_item_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL
      );
      CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        rationale TEXT NOT NULL,
        reviewer_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE candidacies (
        id TEXT PRIMARY KEY,
        declaration_status TEXT NOT NULL
      );
      CREATE TABLE source_item_version_entities (
        source_item_version_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        mention_text TEXT NOT NULL,
        match_method TEXT NOT NULL,
        confidence REAL NOT NULL,
        review_id TEXT NOT NULL,
        confirmation_state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (source_item_version_id, entity_type, entity_id)
      );
      CREATE TABLE candidate_intelligence_heads (
        candidacy_id TEXT PRIMARY KEY,
        analysis_state TEXT NOT NULL,
        publication_state TEXT NOT NULL,
        desired_corpus_hash TEXT,
        latest_revision_id TEXT,
        published_revision_id TEXT,
        stale_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE revisions (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL
      );
    `);
    database.exec(sourceItemVersionReviewGuardSql);
    database.exec(sourceItemCandidateAssignmentReviewGuardSql);
    database.exec(sourceItemVersionEntityInsertGuardSql);
    database.exec(sourceItemVersionEntityNoUpdateSql);
    database.exec(sourceItemVersionEntityNoDeleteSql);
    database.exec(candidateIntelligenceInvalidationSql);
    database.exec(candidateIntelligenceRevisionInsertGuardSql);
    database.exec(candidateIntelligenceRevisionUpdateGuardSql);
    database.prepare("INSERT INTO candidacies (id, declaration_status) VALUES (?, ?)")
      .run("candidacy-a", "prospective");
    database.prepare("INSERT INTO candidacies (id, declaration_status) VALUES (?, ?)")
      .run("candidacy-b", "prospective");
    database.prepare(
      `INSERT INTO source_items
        (id, latest_version_id, content_hash, review_state, publication_state)
       VALUES (?, ?, ?, 'unreviewed', 'private')`,
    ).run("item-a", "version-a", "hash-a");
    database.prepare(
      `INSERT INTO source_item_versions (id, source_item_id, payload_hash)
       VALUES (?, ?, ?)`,
    ).run("version-a", "item-a", "hash-a");
    assert.throws(
      () => database.prepare(
        `INSERT INTO source_item_version_entities
          (source_item_version_id, entity_type, entity_id, mention_text,
           match_method, confidence, review_id, confirmation_state, created_at)
         VALUES (?, 'candidacy', ?, ?, ?, ?, ?, 'confirmed', ?)`,
      ).run(
        "version-a",
        "candidacy-a",
        "Candidate A",
        "deterministic-test",
        1,
        "review-a",
        "2026-08-10T09:59:00.000Z",
      ),
      /current approved source version/,
    );

    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(insertSourceItemReviewSql).run(
        "review-a",
        "version-a",
        "approved",
        "Source and captured version checked.",
        "reviewer-a",
        "2026-08-10T10:00:00.000Z",
      );
      database.prepare(updateSourceItemReviewStateSql).run(
        "approved",
        "approved",
        "item-a",
        "version-a",
        "hash-a",
      );
      database.prepare(
        `INSERT INTO source_item_version_entities
          (source_item_version_id, entity_type, entity_id, mention_text,
           match_method, confidence, review_id, confirmation_state, created_at)
         VALUES (?, 'candidacy', ?, ?, ?, ?, ?, 'confirmed', ?)`,
      ).run(
        "version-a",
        "candidacy-a",
        "Candidate A",
        "deterministic-test",
        1,
        "review-a",
        "2026-08-10T10:00:00.000Z",
      );
      database.prepare(
        `INSERT INTO candidate_intelligence_heads
          (candidacy_id, analysis_state, publication_state, desired_corpus_hash,
           published_revision_id, updated_at)
         VALUES (?, 'queued', 'private', ?, NULL, ?)`,
      ).run("candidacy-a", "corpus-a", "2026-08-10T10:00:00.000Z");
      database.prepare(
        `INSERT INTO audit_events (id, action, entity_type, entity_id, payload)
         VALUES (?, 'source-item.reviewed', 'source-item-version', ?, '{}')`,
      ).run("audit-a", "version-a");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    assert.deepEqual(
      { ...database.prepare(
        "SELECT review_state, publication_state FROM source_items WHERE id = 'item-a'",
      ).get() },
      { publication_state: "private", review_state: "approved" },
    );
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM reviews").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count, 1);
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM source_item_version_entities").get().count,
      1,
    );
    assert.throws(
      () => database.prepare(
        `INSERT INTO source_item_version_entities
          (source_item_version_id, entity_type, entity_id, mention_text,
           match_method, confidence, review_id, confirmation_state, created_at)
         VALUES (?, 'candidacy', ?, ?, ?, ?, ?, 'confirmed', ?)`,
      ).run(
        "version-a",
        "candidacy-b",
        "Candidate B",
        "late-unaudited-insert",
        1,
        "review-a",
        "2026-08-10T10:00:30.000Z",
      ),
      /current approved source version/,
    );
    assert.throws(
      () => database.prepare(
        "UPDATE source_item_version_entities SET mention_text = ? WHERE source_item_version_id = ?",
      ).run("Rewritten", "version-a"),
      /immutable/,
    );
    assert.throws(
      () => database.prepare(insertSourceItemReviewSql).run(
        "review-conflict",
        "version-a",
        "rejected",
        "This conflicts with the recorded founder decision.",
        "reviewer-a",
        "2026-08-10T10:01:00.000Z",
      ),
      /stale or already decided/,
    );

    database.prepare(
      `INSERT INTO source_items
        (id, latest_version_id, content_hash, review_state, publication_state)
       VALUES (?, ?, ?, 'unreviewed', 'private')`,
    ).run("item-rejected", "version-rejected", "hash-rejected");
    database.prepare(
      "INSERT INTO source_item_versions (id, source_item_id, payload_hash) VALUES (?, ?, ?)",
    ).run("version-rejected", "item-rejected", "hash-rejected");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(insertSourceItemReviewSql).run(
        "review-rejected",
        "version-rejected",
        "rejected",
        "The source record identifies the wrong candidate in this item.",
        "reviewer-a",
        "2026-08-10T10:02:00.000Z",
      );
      database.prepare(updateSourceItemReviewStateSql).run(
        "rejected",
        "rejected",
        "item-rejected",
        "version-rejected",
        "hash-rejected",
      );
      database.prepare(
        `INSERT INTO audit_events (id, action, entity_type, entity_id, payload)
         VALUES (?, 'source-item.reviewed', 'source-item-version', ?, '{}')`,
      ).run("audit-rejected", "version-rejected");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    assert.deepEqual(
      { ...database.prepare(
        "SELECT review_state, publication_state FROM source_items WHERE id = 'item-rejected'",
      ).get() },
      { publication_state: "withheld", review_state: "rejected" },
    );
    assert.throws(
      () => database.prepare(
        `INSERT INTO source_item_version_entities
          (source_item_version_id, entity_type, entity_id, mention_text,
           match_method, confidence, review_id, confirmation_state, created_at)
         VALUES (?, 'candidacy', ?, ?, ?, ?, ?, 'confirmed', ?)`,
      ).run(
        "version-rejected",
        "candidacy-a",
        "Candidate A",
        "deterministic-test",
        1,
        "review-rejected",
        "2026-08-10T10:02:00.000Z",
      ),
      /current approved source version/,
    );

    database.prepare(
      `INSERT INTO source_items
        (id, latest_version_id, content_hash, review_state, publication_state)
       VALUES (?, ?, ?, 'unreviewed', 'private')`,
    ).run("item-legacy", "version-legacy", "hash-legacy");
    database.prepare(
      "INSERT INTO source_item_versions (id, source_item_id, payload_hash) VALUES (?, ?, ?)",
    ).run("version-legacy", "item-legacy", "hash-legacy");
    database.prepare(insertSourceItemReviewSql).run(
      "review-legacy-source",
      "version-legacy",
      "approved",
      "Source and captured version checked before candidate filing existed.",
      "reviewer-a",
      "2026-08-10T10:03:00.000Z",
    );
    database.prepare(updateSourceItemReviewStateSql).run(
      "approved",
      "approved",
      "item-legacy",
      "version-legacy",
      "hash-legacy",
    );
    database.prepare(insertSourceItemCandidateAssignmentReviewSql).run(
      "review-legacy-assignment",
      "version-legacy",
      "approved",
      "Candidate filing checked against the already-approved source version.",
      "reviewer-a",
      "2026-08-10T10:04:00.000Z",
    );
    database.prepare(
      `INSERT INTO source_item_version_entities
        (source_item_version_id, entity_type, entity_id, mention_text,
         match_method, confidence, review_id, confirmation_state, created_at)
       VALUES (?, 'candidacy', ?, ?, ?, ?, ?, 'confirmed', ?)`,
    ).run(
      "version-legacy",
      "candidacy-a",
      "Candidate A",
      "founder-reconciliation-test",
      1,
      "review-legacy-assignment",
      "2026-08-10T10:04:00.000Z",
    );
    assert.equal(
      database.prepare(
        "SELECT confirmation_state FROM source_item_version_entities WHERE source_item_version_id = ?",
      ).get("version-legacy").confirmation_state,
      "confirmed",
    );

    database.prepare(
      `INSERT INTO source_items
        (id, latest_version_id, content_hash, review_state, publication_state)
       VALUES (?, ?, ?, 'unreviewed', 'private')`,
    ).run("item-dismiss", "version-dismiss", "hash-dismiss");
    database.prepare(
      "INSERT INTO source_item_versions (id, source_item_id, payload_hash) VALUES (?, ?, ?)",
    ).run("version-dismiss", "item-dismiss", "hash-dismiss");
    database.prepare(insertSourceItemReviewSql).run(
      "review-dismiss-source",
      "version-dismiss",
      "approved",
      "Source and captured version checked before candidate filing existed.",
      "reviewer-a",
      "2026-08-10T10:05:00.000Z",
    );
    database.prepare(updateSourceItemReviewStateSql).run(
      "approved",
      "approved",
      "item-dismiss",
      "version-dismiss",
      "hash-dismiss",
    );
    database.prepare(insertSourceItemCandidateAssignmentReviewSql).run(
      "review-dismiss-assignment",
      "version-dismiss",
      "rejected",
      "The detected candidate name belongs to an unrelated quoted statement.",
      "reviewer-a",
      "2026-08-10T10:06:00.000Z",
    );
    assert.throws(
      () => database.prepare(
        `INSERT INTO source_item_version_entities
          (source_item_version_id, entity_type, entity_id, mention_text,
           match_method, confidence, review_id, confirmation_state, created_at)
         VALUES (?, 'candidacy', ?, ?, ?, ?, ?, 'confirmed', ?)`,
      ).run(
        "version-dismiss",
        "candidacy-a",
        "Candidate A",
        "deterministic-test",
        0.7,
        "review-dismiss-assignment",
        "2026-08-10T10:06:00.000Z",
      ),
      /current approved source version/,
    );
    database.prepare(
      `INSERT INTO source_item_version_entities
        (source_item_version_id, entity_type, entity_id, mention_text,
         match_method, confidence, review_id, confirmation_state, created_at)
       VALUES (?, 'candidacy', ?, ?, ?, ?, ?, 'rejected', ?)`,
    ).run(
      "version-dismiss",
      "candidacy-a",
      "Candidate A",
      "deterministic-test",
      0.7,
      "review-dismiss-assignment",
      "2026-08-10T10:06:00.000Z",
    );
    assert.equal(
      database.prepare(
        "SELECT confirmation_state FROM source_item_version_entities WHERE source_item_version_id = ?",
      ).get("version-dismiss").confirmation_state,
      "rejected",
    );

    database.prepare(
      "INSERT INTO source_item_versions (id, source_item_id, payload_hash) VALUES (?, ?, ?)",
    ).run("version-b", "item-a", "hash-b");
    database.prepare("UPDATE source_items SET publication_state = 'published' WHERE id = 'item-a'")
      .run();
    database.prepare(
      `UPDATE source_items SET
         latest_version_id = ?,
         content_hash = ?,
         publication_state = CASE
           WHEN content_hash IS NOT ? AND publication_state = 'published' THEN 'withheld'
           ELSE publication_state
         END,
         review_state = CASE
           WHEN content_hash IS NOT ? AND review_state IN ('approved', 'rejected')
             THEN 'needs-update'
           ELSE review_state
         END
       WHERE id = ?`,
    ).run("version-b", "hash-b", "hash-b", "hash-b", "item-a");
    assert.deepEqual(
      { ...database.prepare(
        "SELECT review_state, publication_state FROM source_items WHERE id = 'item-a'",
      ).get() },
      { publication_state: "withheld", review_state: "needs-update" },
    );
    assert.deepEqual(
      { ...database.prepare(
        `SELECT analysis_state, publication_state, desired_corpus_hash
           FROM candidate_intelligence_heads WHERE candidacy_id = 'candidacy-a'`,
      ).get() },
      {
        analysis_state: "needs-update",
        desired_corpus_hash: null,
        publication_state: "withheld",
      },
    );

    database.prepare(
      "INSERT INTO source_item_versions (id, source_item_id, payload_hash) VALUES (?, ?, ?)",
    ).run("version-a-reverted", "item-a", "hash-a");
    database.prepare(
      `UPDATE source_items SET latest_version_id = ?, content_hash = ? WHERE id = ?`,
    ).run("version-a-reverted", "hash-a", "item-a");
    database.prepare(insertSourceItemReviewSql).run(
      "review-a-reverted",
      "version-a-reverted",
      "approved",
      "The reappearing source content was reviewed as a new semantic transition.",
      "reviewer-a",
      "2026-08-10T10:10:00.000Z",
    );
    database.prepare(updateSourceItemReviewStateSql).run(
      "approved",
      "approved",
      "item-a",
      "version-a-reverted",
      "hash-a",
    );
    assert.equal(
      database.prepare("SELECT review_state FROM source_items WHERE id = 'item-a'").get()
        .review_state,
      "approved",
    );

    database.prepare(
      "INSERT INTO revisions (id, entity_type, entity_id) VALUES (?, 'candidate-analysis', ?)",
    ).run("analysis-revision-a", "candidacy-b");
    database.prepare(
      `INSERT INTO candidate_intelligence_heads
        (candidacy_id, analysis_state, publication_state, latest_revision_id, updated_at)
       VALUES (?, 'approved', 'private', ?, ?)`,
    ).run("candidacy-b", "analysis-revision-a", "2026-08-10T10:11:00.000Z");
    assert.throws(
      () => database.prepare(
        `UPDATE candidate_intelligence_heads
            SET published_revision_id = ?, publication_state = 'published'
          WHERE candidacy_id = ?`,
      ).run("analysis-revision-a", "candidacy-b"),
      /requires an audited approval/,
    );
    database.prepare(
      `INSERT INTO reviews
        (id, target_type, target_id, decision, rationale, reviewer_id, created_at)
       VALUES (?, 'candidate-analysis-revision', ?, 'approved', ?, ?, ?)`,
    ).run(
      "analysis-review-a",
      "analysis-revision-a",
      "The cited campaign overview and its corpus were reviewed.",
      "reviewer-a",
      "2026-08-10T10:12:00.000Z",
    );
    assert.throws(
      () => database.prepare(
        `UPDATE candidate_intelligence_heads
            SET published_revision_id = ?, publication_state = 'published'
          WHERE candidacy_id = ?`,
      ).run("analysis-revision-a", "candidacy-b"),
      /requires an audited approval/,
    );
    database.prepare(
      `INSERT INTO audit_events (id, action, entity_type, entity_id, payload)
       VALUES (?, 'candidate-analysis.reviewed', 'candidate-analysis-revision', ?, ?)`,
    ).run(
      "analysis-audit-a",
      "analysis-revision-a",
      JSON.stringify({ reviewId: "analysis-review-a" }),
    );
    database.prepare(
      `UPDATE candidate_intelligence_heads
          SET published_revision_id = ?, publication_state = 'published'
        WHERE candidacy_id = ?`,
    ).run("analysis-revision-a", "candidacy-b");
    assert.equal(
      database.prepare(
        "SELECT publication_state FROM candidate_intelligence_heads WHERE candidacy_id = ?",
      ).get("candidacy-b").publication_state,
      "published",
    );

    database.prepare(
      `UPDATE candidate_intelligence_heads
          SET analysis_state = 'needs-update', publication_state = 'withheld',
              published_revision_id = NULL, stale_at = ?
        WHERE candidacy_id = ?`,
    ).run("2026-08-10T10:13:00.000Z", "candidacy-b");
    assert.throws(
      () => database.prepare(
        `UPDATE candidate_intelligence_heads
            SET analysis_state = 'approved', publication_state = 'published'
          WHERE candidacy_id = ?`,
      ).run("candidacy-b"),
      /must be current and approved/,
    );
    database.prepare(
      "INSERT INTO revisions (id, entity_type, entity_id) VALUES (?, 'candidate-analysis', ?)",
    ).run("analysis-revision-b", "candidacy-b");
    database.prepare(
      `INSERT INTO reviews
        (id, target_type, target_id, decision, rationale, reviewer_id, created_at)
       VALUES (?, 'candidate-analysis-revision', ?, 'approved', ?, ?, ?)`,
    ).run(
      "analysis-review-b",
      "analysis-revision-b",
      "The refreshed campaign overview and changed evidence corpus were reviewed.",
      "reviewer-a",
      "2026-08-10T10:14:00.000Z",
    );
    database.prepare(
      `INSERT INTO audit_events (id, action, entity_type, entity_id, payload)
       VALUES (?, 'candidate-analysis.reviewed', 'candidate-analysis-revision', ?, ?)`,
    ).run(
      "analysis-audit-b",
      "analysis-revision-b",
      JSON.stringify({ reviewId: "analysis-review-b" }),
    );
    database.prepare(
      `UPDATE candidate_intelligence_heads
          SET latest_revision_id = ?, published_revision_id = ?,
              analysis_state = 'approved', publication_state = 'published', stale_at = NULL
        WHERE candidacy_id = ?`,
    ).run("analysis-revision-b", "analysis-revision-b", "candidacy-b");
    assert.deepEqual(
      { ...database.prepare(
        `SELECT latest_revision_id, published_revision_id, publication_state, stale_at
           FROM candidate_intelligence_heads WHERE candidacy_id = ?`,
      ).get("candidacy-b") },
      {
        latest_revision_id: "analysis-revision-b",
        publication_state: "published",
        published_revision_id: "analysis-revision-b",
        stale_at: null,
      },
    );
  } finally {
    database.close();
  }
});

test("constituency interest uses explicit candidate and update associations", () => {
  const ayreUpdates = updates.filter((update) => update.constituencyIds.includes("ayre-michael"));
  const onchanUpdates = updates.filter((update) => update.constituencyIds.includes("onchan"));
  const islandWideUpdates = updates.filter((update) => update.constituencyIds.length === 0);
  const onchanCandidates = candidates
    .filter((candidate) => candidate.constituency === "Onchan")
    .map((candidate) => candidate.name)
    .sort();

  assert.equal(ayreUpdates.length, 2);
  assert.equal(onchanUpdates.length, 0);
  assert.equal(islandWideUpdates.length, 1);
  assert.deepEqual(onchanCandidates, ["Rachel Glover", "Rob Callister"]);
  assert.deepEqual(
    updates.toSorted((left, right) => right.sortDate.localeCompare(left.sortDate)).map(
      (update) => update.sortDate,
    ),
    ["2026-08-09", "2026-08-09", "2026-07-20", "2026-07-09"],
  );
  assert.equal(updates[0].dateQualifier, "Checked");
  assert.equal(updates[3].dateQualifier, "Reviewed");
});
