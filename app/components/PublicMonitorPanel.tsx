"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PublicMonitorSnapshot,
  PublicMonitorSourceHealth,
  PublicMonitorSourceKind,
} from "../lib/evidence/public-monitor";
import styles from "./PublicMonitorPanel.module.css";

const BASE_REFRESH_MS = 45_000;
const MAX_REFRESH_MS = 5 * 60_000;

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "Europe/Isle_of_Man",
});

function formatClock(value: string | null) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? clockFormatter.format(date) : "Time unavailable";
}

function kindLabel(kind: PublicMonitorSourceKind) {
  if (kind === "candidate-registry") return "Candidate registry";
  if (kind === "video") return "Video feed";
  if (kind === "feed") return "News feed";
  return "Public source";
}

function healthLabel(health: PublicMonitorSourceHealth) {
  if (health === "current") return "On schedule";
  if (health === "delayed") return "Check delayed";
  return "Awaiting first check";
}

function activitySummary(activity: PublicMonitorSnapshot["activity"][number]) {
  const parts: string[] = [];
  if (activity.newItems) {
    parts.push(`${activity.newItems} new record${activity.newItems === 1 ? "" : "s"}`);
  }
  if (activity.updatedItems) {
    parts.push(`${activity.updatedItems} changed record${activity.updatedItems === 1 ? "" : "s"}`);
  }
  if (activity.outcome === "partly-checked") {
    return parts.length
      ? `${parts.join(" · ")} · partly checked`
      : "Partly checked · one or more records will be retried";
  }
  return parts.length ? parts.join(" · ") : "Checked · no detected change";
}

export function PublicMonitorPanel({
  initialSnapshot,
}: {
  initialSnapshot: PublicMonitorSnapshot | null;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [expanded, setExpanded] = useState(false);
  const [connectionState, setConnectionState] = useState<"connected" | "reconnecting">(
    initialSnapshot ? "connected" : "reconnecting",
  );
  const failureCountRef = useRef(0);
  const hasInitialSnapshot = Boolean(initialSnapshot);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const schedule = (delay: number) => {
      if (cancelled) return;
      timer = setTimeout(refresh, delay);
    };

    const refresh = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") {
        schedule(BASE_REFRESH_MS);
        return;
      }

      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/public/monitor", {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Monitor unavailable");
        const nextSnapshot = await response.json() as PublicMonitorSnapshot;
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setConnectionState("connected");
        failureCountRef.current = 0;
        schedule(BASE_REFRESH_MS);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setConnectionState("reconnecting");
        failureCountRef.current += 1;
        const backoff = Math.min(
          MAX_REFRESH_MS,
          BASE_REFRESH_MS * 2 ** Math.min(3, failureCountRef.current),
        );
        schedule(backoff + Math.round(Math.random() * 4_000));
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      schedule(500);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(hasInitialSnapshot ? BASE_REFRESH_MS : 500);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasInitialSnapshot]);

  const counts = snapshot?.counts;
  const sources = snapshot?.sources ?? [];
  const activity = snapshot?.activity ?? [];
  const currentSources = sources.filter((source) => source.health === "current").length;
  const hasRecentChecks = Boolean(counts?.checks24h);

  return (
    <aside aria-labelledby="research-monitor-title" className={styles.rail}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>
            <i aria-hidden="true" className={hasRecentChecks ? styles.signalCurrent : styles.signalIdle} />
            Research monitor
          </p>
          <h2 id="research-monitor-title">The source watch</h2>
        </div>
        <button
          aria-controls="research-monitor-body"
          aria-expanded={expanded}
          className={styles.mobileToggle}
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          {expanded ? "Close" : "Open"}
        </button>
      </div>

      <p className={styles.intro}>
        Configured for periodic checks of approved public election sources. New records stay private until a human reviews them.
      </p>

      <div className={styles.connectionStatus}>
        <span
          aria-live="polite"
          className={connectionState === "connected" ? styles.connected : styles.reconnecting}
        >
          {connectionState === "reconnecting"
            ? "Status connection unavailable · retrying quietly"
            : snapshot?.state === "active"
              ? `${currentSources} of ${sources.length} sources on schedule`
              : snapshot?.state === "idle"
                ? "No recent source checks · monitoring is delayed"
                : "Waiting for the first completed source check"}
        </span>
        {snapshot ? <time dateTime={snapshot.generatedAt}>Status read {formatClock(snapshot.generatedAt)}</time> : null}
      </div>

      <div className={styles.body} data-open={expanded} id="research-monitor-body">
        <dl className={styles.metrics}>
          <div>
            <dt>Sources configured</dt>
            <dd>{counts?.monitoredSources ?? "—"}</dd>
          </div>
          <div>
            <dt>Checks · 24h</dt>
            <dd>{counts?.checks24h ?? "—"}</dd>
          </div>
          <div>
            <dt>New records · 24h</dt>
            <dd>{counts?.newItems24h ?? "—"}</dd>
          </div>
        </dl>

        <section aria-labelledby="monitor-activity-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <h3 id="monitor-activity-title">Recent collection activity</h3>
            <span>{hasRecentChecks ? "Scheduled checks" : "Waiting for a completed check"}</span>
          </div>
          {activity.length ? (
            <ol className={styles.activityList}>
              {activity.slice(0, 6).map((item, index) => (
                <li key={`${item.sourceName}-${item.checkedAt}-${index}`}>
                  <i aria-hidden="true" data-outcome={item.outcome} />
                  <div>
                    <strong>{item.sourceName}</strong>
                    <span>{activitySummary(item)}</span>
                    <small>
                      {kindLabel(item.sourceKind)} · <time dateTime={item.checkedAt}>{formatClock(item.checkedAt)}</time>
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyState}>
              The monitor has no completed source check to show yet. It will report activity here without revealing unreviewed content.
            </p>
          )}
        </section>

        <section aria-labelledby="monitor-sources-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <h3 id="monitor-sources-title">Coverage status</h3>
            <span>Island-wide</span>
          </div>
          <ul className={styles.sourceList}>
            {sources.map((source) => (
              <li key={`${source.name}-${source.kind}`}>
                <div>
                  <strong>{source.name}</strong>
                  <small>{kindLabel(source.kind)}</small>
                </div>
                <span data-health={source.health}>{healthLabel(source.health)}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.disclosure}>
          <strong>Discovery is not publication.</strong>
          <p>Nothing found by the monitor appears in candidate analysis or news until its source and relevance have been reviewed.</p>
          <a href="/latest">See reviewed election updates <span aria-hidden="true">→</span></a>
        </div>
      </div>
    </aside>
  );
}
