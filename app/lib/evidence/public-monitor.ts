export type PublicMonitorSourceKind = "candidate-registry" | "feed" | "other" | "video";

export type PublicMonitorSourceHealth = "awaiting-first-check" | "current" | "delayed";

export type PublicMonitorSnapshot = {
  activity: Array<{
    checkedAt: string;
    newItems: number;
    outcome: "checked" | "new-information" | "partly-checked";
    sourceKind: PublicMonitorSourceKind;
    sourceName: string;
    updatedItems: number;
  }>;
  counts: {
    checkedSources24h: number;
    checks24h: number;
    monitoredSources: number;
    newItems24h: number;
    updatedItems24h: number;
  };
  generatedAt: string;
  sources: Array<{
    checks24h: number;
    health: PublicMonitorSourceHealth;
    kind: PublicMonitorSourceKind;
    lastSuccessfulCheckAt: string | null;
    name: string;
    newItems24h: number;
    updatedItems24h: number;
  }>;
  state: "active" | "idle" | "initialising";
};

type PublicMonitorSourceRow = {
  checks_24h: number;
  feed_type: string;
  last_success_at: string | null;
  name: string;
  new_items_24h: number;
  poll_interval_minutes: number;
  updated_items_24h: number;
};

type PublicMonitorActivityRow = {
  changed_item_count: number;
  checked_at: string;
  feed_type: string;
  new_item_count: number;
  source_name: string;
  status: string;
};

type PublicMonitorDatabase = Pick<D1Database, "prepare">;

const ACTIVITY_LIMIT = 14;
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;
const COMPLETED_RUN_STATES = "'succeeded', 'no_change', 'partial'";

const sourceSummarySql = `
  SELECT sources.name, sources.feed_type, sources.poll_interval_minutes,
         sources.last_success_at,
         COUNT(runs.started_at) AS checks_24h,
         COALESCE(SUM(runs.new_item_count), 0) AS new_items_24h,
         COALESCE(SUM(runs.changed_item_count), 0) AS updated_items_24h
    FROM sources
    LEFT JOIN ingestion_runs runs
      ON runs.source_id = sources.id
     AND runs.started_at >= ?
     AND runs.status IN (${COMPLETED_RUN_STATES})
   WHERE sources.active = 1
   GROUP BY sources.name, sources.feed_type, sources.poll_interval_minutes,
            sources.last_success_at, sources.source_tier
   ORDER BY sources.source_tier, sources.name
`;

const recentActivitySql = `
  SELECT sources.name AS source_name, sources.feed_type,
         runs.finished_at AS checked_at, runs.new_item_count,
         runs.changed_item_count, runs.status
    FROM ingestion_runs runs
    JOIN sources ON sources.id = runs.source_id AND sources.active = 1
   WHERE runs.finished_at IS NOT NULL
     AND runs.status IN (${COMPLETED_RUN_STATES})
   ORDER BY runs.finished_at DESC
   LIMIT ?
`;

function asCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function asTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function asSourceName(value: unknown) {
  if (typeof value !== "string") return "Monitored source";
  return value.trim().slice(0, 120) || "Monitored source";
}

function sourceKind(feedType: string): PublicMonitorSourceKind {
  if (feedType === "candidate-directory") return "candidate-registry";
  if (feedType === "youtube") return "video";
  if (feedType === "rss" || feedType === "atom") return "feed";
  return "other";
}

function sourceHealth(input: {
  generatedAtMs: number;
  lastSuccessfulCheckAt: string | null;
  pollIntervalMinutes: number;
}): PublicMonitorSourceHealth {
  if (!input.lastSuccessfulCheckAt) return "awaiting-first-check";
  const checkedAtMs = Date.parse(input.lastSuccessfulCheckAt);
  if (!Number.isFinite(checkedAtMs)) return "delayed";

  const cadenceMinutes = Math.min(24 * 60, Math.max(1, asCount(input.pollIntervalMinutes)));
  const currentWindowMs = Math.max(30, cadenceMinutes * 3) * 60 * 1_000;
  return input.generatedAtMs - checkedAtMs <= currentWindowMs ? "current" : "delayed";
}

export function emptyPublicMonitorSnapshot(now = new Date()): PublicMonitorSnapshot {
  return {
    activity: [],
    counts: {
      checkedSources24h: 0,
      checks24h: 0,
      monitoredSources: 0,
      newItems24h: 0,
      updatedItems24h: 0,
    },
    generatedAt: now.toISOString(),
    sources: [],
    state: "initialising",
  };
}

export function buildPublicMonitorSnapshot(input: {
  activityRows: readonly PublicMonitorActivityRow[];
  generatedAt: string;
  sourceRows: readonly PublicMonitorSourceRow[];
}): PublicMonitorSnapshot {
  const generatedAtMs = Date.parse(input.generatedAt);
  const safeGeneratedAtMs = Number.isFinite(generatedAtMs) ? generatedAtMs : Date.now();
  const generatedAt = new Date(safeGeneratedAtMs).toISOString();
  const sources = input.sourceRows.map((row) => {
    const lastSuccessfulCheckAt = asTimestamp(row.last_success_at);
    return {
      checks24h: asCount(row.checks_24h),
      health: sourceHealth({
        generatedAtMs: safeGeneratedAtMs,
        lastSuccessfulCheckAt,
        pollIntervalMinutes: row.poll_interval_minutes,
      }),
      kind: sourceKind(row.feed_type),
      lastSuccessfulCheckAt,
      name: asSourceName(row.name),
      newItems24h: asCount(row.new_items_24h),
      updatedItems24h: asCount(row.updated_items_24h),
    };
  });
  const currentSourceCount = sources.filter((source) => source.health === "current").length;

  const activity = input.activityRows.flatMap((row) => {
    const checkedAt = asTimestamp(row.checked_at);
    if (!checkedAt) return [];
    const newItems = asCount(row.new_item_count);
    const updatedItems = asCount(row.changed_item_count);
    return [{
      checkedAt,
      newItems,
      outcome: row.status === "partial"
        ? "partly-checked" as const
        : newItems + updatedItems > 0
          ? "new-information" as const
          : "checked" as const,
      sourceKind: sourceKind(row.feed_type),
      sourceName: asSourceName(row.source_name),
      updatedItems,
    }];
  });

  return {
    activity,
    counts: {
      checkedSources24h: sources.filter((source) => source.checks24h > 0).length,
      checks24h: sources.reduce((total, source) => total + source.checks24h, 0),
      monitoredSources: sources.length,
      newItems24h: sources.reduce((total, source) => total + source.newItems24h, 0),
      updatedItems24h: sources.reduce((total, source) => total + source.updatedItems24h, 0),
    },
    generatedAt,
    sources,
    state: sources.length === 0 ? "initialising" : currentSourceCount > 0 ? "active" : "idle",
  };
}

export async function queryPublicMonitorSnapshot(
  db: PublicMonitorDatabase,
  now = new Date(),
): Promise<PublicMonitorSnapshot> {
  const cutoff = new Date(now.getTime() - ONE_DAY_MS).toISOString();
  const [sourceRows, activityRows] = await Promise.all([
    db.prepare(sourceSummarySql).bind(cutoff).all<PublicMonitorSourceRow>(),
    db.prepare(recentActivitySql).bind(ACTIVITY_LIMIT).all<PublicMonitorActivityRow>(),
  ]);
  return buildPublicMonitorSnapshot({
    activityRows: activityRows.results,
    generatedAt: now.toISOString(),
    sourceRows: sourceRows.results,
  });
}

export async function getPublicMonitorSnapshot(now = new Date()) {
  // Keep the Workers-only environment import out of module initialization so
  // static rendering and Node-based contract tests can import this projection.
  const { getEvidenceBindings } = await import("../../../db");
  return queryPublicMonitorSnapshot(getEvidenceBindings().DB, now);
}

export async function getPublicMonitorSnapshotSafe(now = new Date()) {
  try {
    return await getPublicMonitorSnapshot(now);
  } catch {
    return emptyPublicMonitorSnapshot(now);
  }
}
