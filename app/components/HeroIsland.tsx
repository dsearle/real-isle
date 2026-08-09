"use client";

import { useRef, useState } from "react";
import { IslandTerrain } from "./IslandTerrain";

export type HeroCandidate = {
  slug: string;
  name: string;
  initials: string;
  constituency: string;
  priority: string;
  evidenceCount: number;
};

export function HeroIsland({ candidates }: { candidates: HeroCandidate[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [activeSlug, setActiveSlug] = useState(candidates[0]?.slug ?? "");
  const active = candidates.find((candidate) => candidate.slug === activeSlug) ?? candidates[0];

  function moveStage(event: React.PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage || event.pointerType === "touch") return;
    const bounds = stage.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    stage.style.setProperty("--stage-rx", `${(-y * 8).toFixed(2)}deg`);
    stage.style.setProperty("--stage-ry", `${(x * 11).toFixed(2)}deg`);
    stage.style.setProperty("--stage-x", `${(x * 14).toFixed(2)}px`);
    stage.style.setProperty("--stage-y", `${(y * 12).toFixed(2)}px`);
  }

  function resetStage() {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty("--stage-rx", "0deg");
    stage.style.setProperty("--stage-ry", "0deg");
    stage.style.setProperty("--stage-x", "0px");
    stage.style.setProperty("--stage-y", "0px");
  }

  return (
    <div
      className="hero-island-stage"
      onPointerLeave={resetStage}
      onPointerMove={moveStage}
      ref={stageRef}
    >
      <div className="stage-hud stage-hud-top">
        <span><i aria-hidden="true" /> People standing near you</span>
        <small>Pick a card</small>
      </div>

      <IslandTerrain />

      <div className="floating-candidates" aria-label="Featured candidate profiles">
        {candidates.map((candidate, index) => (
          <a
            aria-label={`Open ${candidate.name}'s full candidate profile`}
            className={`floating-candidate floating-candidate-${index + 1} ${candidate.slug === active.slug ? "is-active" : ""}`}
            href={`/candidates/${candidate.slug}`}
            key={candidate.slug}
            onFocus={() => setActiveSlug(candidate.slug)}
            onPointerEnter={() => setActiveSlug(candidate.slug)}
          >
            <span className="floating-avatar">{candidate.initials}</span>
            <span className="floating-copy">
              <strong>{candidate.name}</strong>
              <small>{candidate.constituency}</small>
            </span>
            <i className="floating-signal" aria-hidden="true" />
          </a>
        ))}
      </div>

      {active ? (
        <div className="stage-hud stage-hud-bottom" aria-live="polite">
          <div>
            <span>Meet</span>
            <strong>{active.name}</strong>
          </div>
          <div className="stage-priority">
            <span>On their list</span>
            <strong>{active.priority}</strong>
          </div>
          <a href={`/candidates/${active.slug}`} aria-label={`Open ${active.name}'s evidence profile`}>
            Full profile <b aria-hidden="true">↗</b>
          </a>
        </div>
      ) : null}
    </div>
  );
}
