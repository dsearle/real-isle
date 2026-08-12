"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicMonitorSnapshot } from "../lib/evidence/public-monitor";
import styles from "./PublicActivityBadge.module.css";

const REFRESH_MS = 30_000;
const RETRY_MS = 12_000;

type ConnectionState = "checking" | "connected" | "reconnecting";

const relativeFormatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

function relativeTime(value: string | null | undefined, now: number) {
  if (!value) return "not checked yet";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "time unavailable";
  const seconds = Math.round((timestamp - now) / 1_000);
  const minutes = Math.round(seconds / 60);
  if (Math.abs(seconds) < 45) return relativeFormatter.format(seconds, "second");
  if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, "minute");
  return relativeFormatter.format(Math.round(minutes / 60), "hour");
}

function deriveState(snapshot: PublicMonitorSnapshot | null, connectionState: ConnectionState) {
  if (connectionState === "checking") {
    return {
      label: "Checking now",
      tone: "checking" as const,
    };
  }
  if (connectionState === "reconnecting") {
    return {
      label: "Reconnecting",
      tone: "reconnecting" as const,
    };
  }
  if (!snapshot || snapshot.state === "initialising") {
    return {
      label: "Starting watch",
      tone: "initialising" as const,
    };
  }
  if (snapshot.state === "idle") {
    return {
      label: "Checks delayed",
      tone: "delayed" as const,
    };
  }
  const currentSources = snapshot.sources.filter((source) => source.health === "current").length;
  return {
    label: currentSources ? "Source watch active" : "Checks delayed",
    tone: currentSources ? "active" as const : "delayed" as const,
  };
}

export function PublicActivityBadge() {
  const [snapshot, setSnapshot] = useState<PublicMonitorSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
  const [now, setNow] = useState(() => Date.now());
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const schedule = (delay: number) => {
      if (cancelled) return;
      timer = window.setTimeout(refresh, delay);
    };

    const refresh = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") {
        schedule(REFRESH_MS);
        return;
      }

      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;
      setConnectionState((current) => (current === "connected" ? "checking" : current));

      try {
        const response = await fetch("/api/public/monitor", {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Public monitor unavailable");
        const nextSnapshot = await response.json() as PublicMonitorSnapshot;
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setNow(Date.now());
        setConnectionState("connected");
        schedule(REFRESH_MS);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setConnectionState("reconnecting");
        schedule(RETRY_MS);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) window.clearTimeout(timer);
      schedule(250);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(250);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      inFlightRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const state = deriveState(snapshot, connectionState);
  const checkedText = useMemo(
    () => relativeTime(snapshot?.generatedAt, now),
    [now, snapshot?.generatedAt],
  );
  const sourceCount = snapshot?.counts.monitoredSources ?? 0;
  const accessibleLabel = `${state.label}. ${sourceCount} monitored source${sourceCount === 1 ? "" : "s"}. Status read ${checkedText}.`;

  return (
    <a
      aria-label={accessibleLabel}
      className={styles.badge}
      data-tone={state.tone}
      href="/latest"
      title="Periodic public source monitor"
    >
      <span aria-hidden="true" className={styles.signal}>
        <i />
      </span>
      <span className={styles.copy}>
        <span aria-live="polite" className={styles.label}>{state.label}</span>
        <span className={styles.meta}>
          {sourceCount ? `${sourceCount} sources` : "Public monitor"} · {checkedText}
        </span>
      </span>
    </a>
  );
}
