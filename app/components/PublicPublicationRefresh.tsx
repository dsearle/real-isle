"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";
import {
  isPublicProjectionPath,
  isPublicPublicationHead,
  reconcilePublicPublicationHead,
  type PublicationRefreshState,
} from "../lib/evidence/publication-refresh";

const BASE_POLL_INTERVAL_MS = 15_000;
const MAX_POLL_INTERVAL_MS = 120_000;
const SESSION_HEAD_KEY = "peoples-isle.publication-head.v1";

function retryDelay(failureCount: number) {
  const exponent = Math.min(3, Math.max(0, failureCount - 1));
  return Math.min(MAX_POLL_INTERVAL_MS, BASE_POLL_INTERVAL_MS * (2 ** exponent));
}

function isPublicationHead(value: unknown): value is { head: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return isPublicPublicationHead((value as { head?: unknown }).head);
}

/**
 * Keeps already-open public Server Component pages aligned with the current
 * approved publication projection. The endpoint exposes only an opaque token;
 * all editorial metadata stays server-side.
 */
export function PublicPublicationRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const publicationState = useRef<PublicationRefreshState>({
    head: null,
    synchronized: false,
  });

  useEffect(() => {
    if (!isPublicProjectionPath(pathname)) return;

    let disposed = false;
    let failureCount = 0;
    let inFlight = false;
    let pendingImmediateCheck = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!publicationState.current.synchronized) {
      try {
        const savedHead = window.sessionStorage.getItem(SESSION_HEAD_KEY);
        if (isPublicPublicationHead(savedHead)) {
          publicationState.current = { head: savedHead, synchronized: true };
        }
      } catch {
        // Storage is an optimisation only; the first successful poll remains
        // a fail-safe synchronization point when storage is unavailable.
      }
    }

    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      if (disposed || document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        void checkPublicationHead();
      }, delayMs);
    };

    const checkPublicationHead = async () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (inFlight) {
        pendingImmediateCheck = true;
        return;
      }

      inFlight = true;
      let nextDelay = BASE_POLL_INTERVAL_MS;
      try {
        const response = await fetch("/api/public/publication-head", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("Publication head request failed.");
        const payload: unknown = await response.json();
        if (disposed) return;
        if (!isPublicationHead(payload)) throw new Error("Publication head response was invalid.");

        const nextState = reconcilePublicPublicationHead(publicationState.current, payload.head);
        publicationState.current = {
          head: nextState.head,
          synchronized: nextState.synchronized,
        };
        try {
          window.sessionStorage.setItem(SESSION_HEAD_KEY, payload.head);
        } catch {
          // A blocked storage API must not stop publication refreshes.
        }
        failureCount = 0;
        if (nextState.shouldRefresh) {
          // Record the new head before refreshing so the refreshed RSC payload
          // cannot cause a repeated refresh for the same publication change.
          startTransition(() => router.refresh());
        }
      } catch {
        failureCount += 1;
        nextDelay = retryDelay(failureCount);
      } finally {
        inFlight = false;
        if (pendingImmediateCheck && document.visibilityState === "visible") {
          pendingImmediateCheck = false;
          schedule(0);
        } else {
          schedule(nextDelay);
        }
      }
    };

    const checkNow = () => {
      if (document.visibilityState !== "visible") return;
      clearTimer();
      if (inFlight) {
        pendingImmediateCheck = true;
        return;
      }
      void checkPublicationHead();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkNow();
      } else {
        clearTimer();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", checkNow);
    window.addEventListener("online", checkNow);
    checkNow();

    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", checkNow);
      window.removeEventListener("online", checkNow);
    };
  }, [pathname, router]);

  return null;
}
