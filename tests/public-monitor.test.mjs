import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicMonitorSnapshot,
  emptyPublicMonitorSnapshot,
  queryPublicMonitorSnapshot,
} from "../app/lib/evidence/public-monitor.ts";

const now = new Date("2026-08-11T12:00:00.000Z");

test("public monitor projection contains only aggregate source activity", () => {
  const snapshot = buildPublicMonitorSnapshot({
    generatedAt: now.toISOString(),
    sourceRows: [
      {
        checks_24h: 6,
        feed_type: "rss",
        last_success_at: "2026-08-11T11:50:00.000Z",
        name: "Island newsroom",
        new_items_24h: 3,
        poll_interval_minutes: 10,
        updated_items_24h: 1,
        canonical_url: "https://private.example/unreviewed-story",
        last_error: "private fetch detail",
        reviewer_id: "founder-account",
        snapshot_id: "snapshot-private",
        title: "Unreviewed allegation",
      },
    ],
    activityRows: [
      {
        changed_item_count: 1,
        checked_at: "2026-08-11T11:50:00.000Z",
        error_summary: "private parser detail",
        feed_type: "rss",
        id: "internal-run-id",
        new_item_count: 3,
        source_name: "Island newsroom",
        status: "succeeded",
      },
    ],
  });

  assert.deepEqual(snapshot, {
    activity: [{
      checkedAt: "2026-08-11T11:50:00.000Z",
      newItems: 3,
      outcome: "new-information",
      sourceKind: "feed",
      sourceName: "Island newsroom",
      updatedItems: 1,
    }],
    counts: {
      checkedSources24h: 1,
      checks24h: 6,
      monitoredSources: 1,
      newItems24h: 3,
      updatedItems24h: 1,
    },
    generatedAt: now.toISOString(),
    sources: [{
      checks24h: 6,
      health: "current",
      kind: "feed",
      lastSuccessfulCheckAt: "2026-08-11T11:50:00.000Z",
      name: "Island newsroom",
      newItems24h: 3,
      updatedItems24h: 1,
    }],
    state: "active",
  });

  const serialized = JSON.stringify(snapshot);
  for (const privateValue of [
    "private.example",
    "Unreviewed allegation",
    "private fetch detail",
    "private parser detail",
    "founder-account",
    "snapshot-private",
    "internal-run-id",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("public source health is derived only from successful-check recency", () => {
  const source = (name, lastSuccess, pollIntervalMinutes) => ({
    checks_24h: 0,
    feed_type: "youtube",
    last_success_at: lastSuccess,
    name,
    new_items_24h: 0,
    poll_interval_minutes: pollIntervalMinutes,
    updated_items_24h: 0,
  });
  const snapshot = buildPublicMonitorSnapshot({
    activityRows: [],
    generatedAt: now.toISOString(),
    sourceRows: [
      source("Current source", "2026-08-11T11:40:00.000Z", 10),
      source("Delayed source", "2026-08-11T09:00:00.000Z", 15),
      source("New source", null, 15),
    ],
  });

  assert.deepEqual(snapshot.sources.map(({ health, kind, name }) => ({ health, kind, name })), [
    { health: "current", kind: "video", name: "Current source" },
    { health: "delayed", kind: "video", name: "Delayed source" },
    { health: "awaiting-first-check", kind: "video", name: "New source" },
  ]);
  assert.equal(snapshot.state, "active");
});

test("configured sources without a current successful check are reported as idle", () => {
  const snapshot = buildPublicMonitorSnapshot({
    activityRows: [],
    generatedAt: now.toISOString(),
    sourceRows: [{
      checks_24h: 0,
      feed_type: "rss",
      last_success_at: "2026-08-10T08:00:00.000Z",
      name: "Delayed newsroom",
      new_items_24h: 0,
      poll_interval_minutes: 10,
      updated_items_24h: 0,
    }],
  });

  assert.equal(snapshot.state, "idle");
});

test("partial collection runs are never presented as fully checked", () => {
  const snapshot = buildPublicMonitorSnapshot({
    activityRows: [{
      changed_item_count: 0,
      checked_at: "2026-08-11T11:55:00.000Z",
      feed_type: "rss",
      new_item_count: 0,
      source_name: "Island newsroom",
      status: "partial",
    }],
    generatedAt: now.toISOString(),
    sourceRows: [],
  });

  assert.equal(snapshot.activity[0]?.outcome, "partly-checked");
});

test("monitor queries read only active source metadata and aggregate ingestion runs", async () => {
  const preparedSql = [];
  const database = {
    prepare(sql) {
      preparedSql.push(sql);
      return {
        bind() {
          return this;
        },
        async all() {
          return { results: [] };
        },
      };
    },
  };

  const snapshot = await queryPublicMonitorSnapshot(database, now);
  assert.deepEqual(snapshot, emptyPublicMonitorSnapshot(now));
  assert.equal(preparedSql.length, 2);

  const queryText = preparedSql.join("\n").toLowerCase();
  assert.match(queryText, /ingestion_runs/);
  assert.match(queryText, /sources\.active = 1/);
  assert.doesNotMatch(
    queryText,
    /source_items|source_snapshots|reviews|reviewer_id|audit_events|audit_head_hash|canonical_url|error_summary|last_error/,
  );
});
