import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  appendLegacyCollectionAssessment,
  prepareCollectionAssessment,
} from "../app/lib/evidence/collection-assessment.ts";
import {
  canonicalRateLimitHost,
  documentRetentionOutcome,
  fairDueDocuments,
  persistedDocumentCrawlState,
  runDueDocumentAcquisition,
} from "../app/lib/evidence/document-acquisition.ts";
import { projectCollectionReason } from "../app/lib/evidence/collection-reason.ts";
import { analyzeReadableDocument } from "../app/lib/evidence/machine-analysis.ts";
import {
  ControlledFetchError,
  fetchControlled,
  validateExactSourceUrl,
} from "../app/lib/evidence/controlled-fetch.ts";
import { monitoredSources } from "../app/lib/evidence/catalogue.ts";
import { extractReadableHtml } from "../app/lib/evidence/readable-html.ts";
import { parseRobotsTxt, robotsAllowsUrl } from "../app/lib/evidence/robots.ts";
import { seedEvidenceReferenceData } from "../app/lib/evidence/seed.ts";

function migrationsThrough17(database) {
  const files = readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 17)
    .sort();
  for (const file of files) {
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

async function freezeEligibleAssessment(DB, sourceItemId, sourceItemVersionId, title) {
  const assessment = await prepareCollectionAssessment(
    sourceItemVersionId,
    projectCollectionReason({
      candidates: [],
      constituencies: [],
      itemType: "news",
      sourceFeedType: "rss",
      sourceId: "manx-radio-election",
      sourceName: "Manx Radio election news",
      summary: "Candidate interview",
      title,
      topics: [],
    }),
  );
  await appendLegacyCollectionAssessment({
    actor: { id: "collector-test", type: "system" },
    assessment,
    db: DB,
    sourceItemId,
  });
}

test("controlled fetching accepts only exact public HTTPS hosts", async () => {
  assert.equal(
    validateExactSourceUrl(
      "https://www.manxradio.com/election/story#comments",
      ["www.manxradio.com"],
    ).toString(),
    "https://www.manxradio.com/election/story",
  );
  for (const rawUrl of [
    "http://www.manxradio.com/story",
    "https://www.manxradio.com:8443/story",
    "https://127.0.0.1/story",
    "https://evil.www.manxradio.com/story",
  ]) {
    assert.throws(
      () => validateExactSourceUrl(rawUrl, ["www.manxradio.com", "127.0.0.1"]),
      ControlledFetchError,
    );
  }

  await assert.rejects(
    fetchControlled("https://www.manxradio.com/story", {
      acceptedContentTypes: ["text/html"],
      allowedHosts: ["www.manxradio.com"],
      fetchImpl: async () =>
        new Response(null, {
          headers: { location: "https://tracker.example/story" },
          status: 302,
        }),
      maximumBytes: 1024,
    }),
    /exact source host is not allowlisted/i,
  );
  await assert.rejects(
    fetchControlled("https://www.manxradio.com/story", {
      acceptedContentTypes: ["text/html"],
      allowedHosts: ["www.manxradio.com", "manxradio.com"],
      fetchImpl: async () =>
        new Response(null, {
          headers: { location: "https://manxradio.com/story" },
          status: 301,
        }),
      maximumBytes: 1024,
    }),
    /cross-host source redirects are not permitted/i,
  );
});

test("controlled fetching sends validators and bounds type and decoded bytes", async () => {
  let observedHeaders;
  const response = await fetchControlled("https://news.example.im/story", {
    acceptedContentTypes: ["text/html"],
    allowedHosts: ["news.example.im"],
    etag: '"version-a"',
    fetchImpl: async (_url, init) => {
      observedHeaders = new Headers(init.headers);
      return new Response(null, { status: 304 });
    },
    lastModified: "Mon, 10 Aug 2026 10:00:00 GMT",
    maximumBytes: 64,
  });
  assert.equal(response.status, 304);
  assert.equal(observedHeaders.get("if-none-match"), '"version-a"');
  assert.equal(observedHeaders.get("if-modified-since"), "Mon, 10 Aug 2026 10:00:00 GMT");
  assert.match(observedHeaders.get("user-agent"), /PeoplesIsleBot/);

  await assert.rejects(
    fetchControlled("https://news.example.im/story", {
      acceptedContentTypes: ["text/html"],
      allowedHosts: ["news.example.im"],
      fetchImpl: async () => new Response("plain", { headers: { "content-type": "text/plain" } }),
      maximumBytes: 64,
    }),
    /unsupported content type/i,
  );
  await assert.rejects(
    fetchControlled("https://news.example.im/story", {
      acceptedContentTypes: ["text/html"],
      allowedHosts: ["news.example.im"],
      fetchImpl: async () => new Response("x".repeat(65), { headers: { "content-type": "text/html" } }),
      maximumBytes: 64,
    }),
    /exceeds 64 bytes/i,
  );
  await assert.rejects(
    fetchControlled("https://news.example.im/story", {
      acceptedContentTypes: ["text/html"],
      allowedHosts: ["news.example.im"],
      fetchImpl: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        }),
      maximumBytes: 64,
      timeoutMs: 5,
    }),
    /timed out|timeout/i,
  );
});

test("robots parsing applies the matching group, longest rule and crawl delay", () => {
  const policy = parseRobotsTxt(
    `User-agent: *
     Disallow: /everybody
     Crawl-delay: 2

     User-agent: PeoplesIsleBot
     Disallow: /election/private
     Allow: /election/private/public
     Disallow: /*.pdf$
     Crawl-delay: 8.25

     User-agent: AnotherBot
     Disallow: /`,
    "PeoplesIsleBot",
  );
  assert.equal(policy.crawlDelayMs, 8_250);
  assert.equal(robotsAllowsUrl(policy.rules, "https://news.example.im/election/open"), true);
  assert.equal(robotsAllowsUrl(policy.rules, "https://news.example.im/election/private/notes"), false);
  assert.equal(
    robotsAllowsUrl(policy.rules, "https://news.example.im/election/private/public/notes"),
    true,
  );
  assert.equal(robotsAllowsUrl(policy.rules, "https://news.example.im/manifesto.pdf"), false);
  assert.equal(robotsAllowsUrl(policy.rules, "https://news.example.im/manifesto.pdf?download=1"), true);
  assert.equal(robotsAllowsUrl(policy.rules, "https://news.example.im/everybody"), true);
});

test("readable extraction is deterministic and preserves raw UTF-8 and normalized offsets", async () => {
  const html = `<!doctype html><html lang="en"><head>
    <meta property="og:title" content="Election &amp; Island">
    <meta name="author" content="Island Desk">
    <script>secret navigation text</script></head><body>
    <nav><p>Menu that must be excluded</p></nav>
    <article><h1>Election &amp; Island</h1>
    <p>Café voters discuss <strong>health</strong> and housing.</p>
    <p aria-hidden="true">Hidden copy</p></article></body></html>`;
  const first = await extractReadableHtml(html);
  const second = await extractReadableHtml(html);
  assert.deepEqual(first, second);
  assert.equal(first.text, "Election & Island\n\nCafé voters discuss health and housing.");
  assert.equal(first.metadata.title, "Election & Island");
  assert.equal(first.metadata.byline, "Island Desk");
  assert.equal(first.blocks.length, 2);
  const bytes = new TextEncoder().encode(html);
  for (const block of first.blocks) {
    assert.equal(first.text.slice(block.textStart, block.textEnd), block.text);
    const raw = new TextDecoder().decode(bytes.slice(block.rawByteStart, block.rawByteEnd));
    assert.match(raw, new RegExp(`^<${block.kind}`));
  }
  assert.equal(first.text.includes("Menu"), false);
  assert.equal(first.text.includes("secret"), false);
  assert.equal(first.text.includes("Hidden"), false);

  const paywall = await extractReadableHtml(`
    <html><body><article><h1>Subscriber report</h1>
      <p>Subscribe to continue reading this candidate interview.</p>
      <div class="paywall">Already a subscriber?</div>
      <p>${"Restricted article copy. ".repeat(10)}</p>
    </article><script type="application/ld+json">{"isAccessibleForFree":false}</script></body></html>
  `);
  assert.equal(paywall.accessBarrier, "paywall");
});

test("retention, persisted states and rate-limit hosts fail closed", () => {
  for (const source of monitoredSources) {
    assert.equal(documentRetentionOutcome(source), "metadata-only");
  }
  const official = monitoredSources.find((source) => source.id === "tynwald-hansard");
  assert.equal(
    documentRetentionOutcome({ ...official, storeFullContent: true }),
    "metadata-only",
  );
  assert.equal(persistedDocumentCrawlState("deferred"), "pending");
  assert.equal(persistedDocumentCrawlState("captured"), "ready");
  assert.equal(canonicalRateLimitHost("www.manxradio.com"), "manxradio.com");
  assert.equal(canonicalRateLimitHost("media.manxradio.com."), "manxradio.com");
  assert.equal(canonicalRateLimitHost("www.iomtoday.co.im"), "www.iomtoday.co.im");
});

test("fair due selection rotates between publishers", () => {
  const row = (sourceId, itemId) => ({ source_id: sourceId, source_item_id: itemId });
  assert.deepEqual(
    fairDueDocuments(
      [row("source-a", "a1"), row("source-a", "a2"), row("source-b", "b1")],
      3,
    ).map((item) => item.source_item_id),
    ["a1", "b1", "a2"],
  );
});

test("rights-limited article text reaches the callback synchronously but is not retained", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  migrationsThrough17(database);
  const DB = d1Adapter(database);
  const r2Writes = [];
  const SNAPSHOTS = {
    async head() {
      return null;
    },
    async put(...args) {
      r2Writes.push(args);
    },
  };
  const bindings = { DB, SNAPSHOTS };
  await seedEvidenceReferenceData(DB);
  database.exec(`
    INSERT INTO ingestion_runs (
      id, source_id, trigger, idempotency_key, actor_type, actor_id,
      parser_version, status, started_at, finished_at
    ) VALUES (
      'feed-run', 'manx-radio-election', 'manual', 'feed-run', 'system',
      'test', 'feed-v1', 'succeeded', '2026-08-11T09:00:00Z', '2026-08-11T09:01:00Z'
    );
    INSERT INTO source_items (
      id, source_id, external_id, canonical_url, canonical_url_hash, item_type,
      title, summary, first_seen_at, last_seen_at, latest_version_id,
      content_hash, source_tier
    ) VALUES (
      'article-item', 'manx-radio-election', 'article-1',
      'https://www.manxradio.com/news/isle-of-man-news/election-story/',
      '${"a".repeat(64)}', 'news', 'Election story', 'Candidate interview',
      '2026-08-11T09:00:00Z', '2026-08-11T09:00:00Z', 'feed-version',
      '${"b".repeat(64)}', 3
    );
    INSERT INTO source_item_versions (
      id, source_item_id, ingestion_run_id, observed_at, payload, payload_hash,
      parser_version
    ) VALUES (
      'feed-version', 'article-item', 'feed-run', '2026-08-11T09:00:00Z',
      '{"title":"Election story"}', '${"b".repeat(64)}', 'feed-v1'
    );
  `);
  await freezeEligibleAssessment(DB, "article-item", "feed-version", "Election story");

  const robotsBody = `User-agent: PeoplesIsleBot\nAllow: /\nCrawl-delay: 8.25\n`;
  const first = await runDueDocumentAcquisition(bindings, {
    actor: { id: "collector-test", type: "system" },
    fetchImpl: async (url) => {
      assert.equal(new URL(url).pathname, "/robots.txt");
      return new Response(robotsBody, { headers: { "content-type": "text/plain" } });
    },
    limit: 1,
  });
  assert.equal(first.results[0].outcome, "deferred");
  assert.equal(
    database.prepare("SELECT crawl_state FROM source_document_heads WHERE source_item_id = 'article-item'").get().crawl_state,
    "pending",
  );
  assert.deepEqual(
    database.prepare("SELECT host FROM ingestion_host_rate_limits").all().map((row) => row.host),
    ["manxradio.com"],
  );

  database.exec(`
    UPDATE ingestion_host_rate_limits
       SET next_request_at_ms = 0, lease_token = NULL, lease_expires_at_ms = NULL;
    UPDATE source_document_heads SET next_check_at = '1970-01-01T00:00:00Z';
  `);
  const sentinel = "RIGHTS_LIMITED_FULL_TEXT_SENTINEL";
  const longOpening = "Island voters compare candidate commitments and public services. ".repeat(10);
  const articleHtml = `<!doctype html><html lang="en"><head>
    <meta property="og:title" content="Election interview">
    <meta name="author" content="Manx Radio">
    </head><body><article><h1>Election interview</h1>
    <p>${longOpening}</p><p>Health and Manx Care remains a topic for this election interview.</p>
    <p>${sentinel} with exact source evidence.</p></article></body></html>`;
  let callbackDocument = null;
  const second = await runDueDocumentAcquisition(bindings, {
    actor: { id: "collector-test", type: "system" },
    analyze: async (analysisDb, document, context) => {
      callbackDocument = document;
      await analyzeReadableDocument(analysisDb, document, context);
    },
    fetchImpl: async (url, init) => {
      assert.notEqual(new URL(url).pathname, "/robots.txt");
      assert.equal(new Headers(init.headers).has("cookie"), false);
      return new Response(articleHtml, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          etag: '"article-v1"',
        },
      });
    },
    limit: 1,
  });
  assert.equal(second.results[0].outcome, "captured");
  assert.equal(second.results[0].analysis, "completed");
  assert.match(callbackDocument.text, new RegExp(sentinel));
  assert.equal(callbackDocument.blocks.every((block) => block.id.startsWith(second.results[0].captureId)), true);

  const capture = database.prepare(`
    SELECT extraction_manifest_json, retention_outcome, readable_text_storage_key,
           short_extract
      FROM source_document_captures WHERE id = ?
  `).get(second.results[0].captureId);
  const snapshot = database.prepare(`
    SELECT storage_key, retention_outcome, capture_method
      FROM source_snapshots
     WHERE id = (SELECT snapshot_id FROM source_document_captures WHERE id = ?)
  `).get(second.results[0].captureId);
  assert.equal(capture.retention_outcome, "metadata-only");
  assert.equal(capture.readable_text_storage_key, null);
  assert.equal(capture.short_extract.includes(sentinel), false);
  assert.equal(capture.extraction_manifest_json.includes(sentinel), false);
  assert.equal(snapshot.storage_key, null);
  assert.equal(snapshot.retention_outcome, "metadata-only");
  assert.equal(snapshot.capture_method, "article-html-v1");
  assert.equal(r2Writes.length, 0);
  const analysis = database.prepare(`
    SELECT result.gate_status, head.publication_state, finding.topic_id,
           finding.stance, finding.stance_basis
      FROM machine_analysis_heads head
      JOIN machine_analysis_results result ON result.id = head.published_result_id
      JOIN machine_analysis_findings finding ON finding.result_id = result.id
     WHERE head.source_item_id = 'article-item'
  `).get();
  assert.deepEqual(
    { ...analysis },
    {
      gate_status: "eligible",
      publication_state: "published",
      topic_id: "health",
      stance: null,
      stance_basis: "none",
    },
  );

  database.exec(`
    UPDATE sources
       SET rights_state = 'metadata-only', store_full_content = 0
     WHERE id = 'manx-radio-election';
    INSERT INTO ingestion_runs (
      id, source_id, trigger, idempotency_key, actor_type, actor_id,
      parser_version, status, started_at, finished_at
    ) VALUES (
      'feed-run-2', 'manx-radio-election', 'manual', 'feed-run-2', 'system',
      'test', 'feed-v1', 'succeeded', '2026-08-11T10:00:00Z', '2026-08-11T10:01:00Z'
    );
    INSERT INTO source_item_versions (
      id, source_item_id, ingestion_run_id, observed_at, payload, payload_hash,
      parser_version
    ) VALUES (
      'feed-version-2', 'article-item', 'feed-run-2', '2026-08-11T10:00:00Z',
      '{"title":"Election story updated"}', '${"c".repeat(64)}', 'feed-v1'
    );
    UPDATE source_items
       SET latest_version_id = 'feed-version-2', content_hash = '${"c".repeat(64)}'
     WHERE id = 'article-item';
    UPDATE ingestion_host_rate_limits
       SET next_request_at_ms = 0, lease_token = NULL, lease_expires_at_ms = NULL;
    UPDATE source_document_heads SET next_check_at = '1970-01-01T00:00:00Z';
  `);
  await freezeEligibleAssessment(DB, "article-item", "feed-version-2", "Election story updated");
  const changedFeedVersion = await runDueDocumentAcquisition(bindings, {
    actor: { id: "collector-test", type: "system" },
    fetchImpl: async (_url, init) => {
      const headers = new Headers(init.headers);
      assert.equal(headers.has("if-none-match"), false);
      assert.equal(headers.has("if-modified-since"), false);
      return new Response(articleHtml, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          etag: '"article-v1"',
        },
      });
    },
    limit: 1,
  });
  assert.equal(changedFeedVersion.results[0].outcome, "captured");
  const latestCapture = database.prepare(`
    SELECT capture.source_item_version_id, capture.rights_state,
           snapshot.storage_key
      FROM source_document_heads head
      JOIN source_document_captures capture ON capture.id = head.current_capture_id
      JOIN source_snapshots snapshot ON snapshot.id = capture.snapshot_id
     WHERE head.source_item_id = 'article-item'
  `).get();
  assert.equal(latestCapture.source_item_version_id, "feed-version-2");
  assert.equal(latestCapture.rights_state, "metadata-only");
  assert.equal(latestCapture.storage_key, null);

  database.exec(`
    INSERT INTO ingestion_runs (
      id, source_id, trigger, idempotency_key, actor_type, actor_id,
      parser_version, status, started_at, finished_at
    ) VALUES (
      'feed-run-3', 'manx-radio-election', 'manual', 'feed-run-3', 'system',
      'test', 'feed-v1', 'succeeded', '2026-08-11T11:00:00Z', '2026-08-11T11:01:00Z'
    );
    INSERT INTO source_item_versions (
      id, source_item_id, ingestion_run_id, observed_at, payload, payload_hash,
      parser_version
    ) VALUES (
      'feed-version-3', 'article-item', 'feed-run-3', '2026-08-11T11:00:00Z',
      '{"title":"Election story policy race"}', '${"d".repeat(64)}', 'feed-v1'
    );
    UPDATE source_items
       SET latest_version_id = 'feed-version-3', content_hash = '${"d".repeat(64)}'
     WHERE id = 'article-item';
    UPDATE ingestion_host_rate_limits
       SET next_request_at_ms = 0, lease_token = NULL, lease_expires_at_ms = NULL;
    UPDATE source_document_heads SET next_check_at = '1970-01-01T00:00:00Z';
  `);
  await freezeEligibleAssessment(DB, "article-item", "feed-version-3", "Election story policy race");
  const captureCountBeforePolicyRace = database
    .prepare("SELECT COUNT(*) AS count FROM source_document_captures")
    .get().count;
  const policyRace = await runDueDocumentAcquisition(bindings, {
    actor: { id: "collector-test", type: "system" },
    fetchImpl: async () => {
      database.prepare("UPDATE sources SET active = 0 WHERE id = 'manx-radio-election'").run();
      return new Response(articleHtml, { headers: { "content-type": "text/html" } });
    },
    limit: 1,
  });
  assert.equal(policyRace.results[0].outcome, "deferred");
  assert.equal(policyRace.results[0].analysis, "skipped-stale");
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM source_document_captures").get().count,
    captureCountBeforePolicyRace,
  );
  let inactiveFetches = 0;
  const inactive = await runDueDocumentAcquisition(bindings, {
    actor: { id: "collector-test", type: "system" },
    fetchImpl: async () => {
      inactiveFetches += 1;
      throw new Error("inactive source must not be fetched");
    },
    limit: 1,
  });
  assert.equal(inactive.attempted, 0);
  assert.equal(inactiveFetches, 0);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);

  assert.throws(
    () => database.prepare("UPDATE source_document_captures SET short_extract = 'changed'").run(),
    /immutable/,
  );
  database.close();
});
