"use client";

import Link from "next/link";
import { useRef, useState } from "react";

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
        <span><i aria-hidden="true" /> Live candidate network</span>
        <small>Move to explore</small>
      </div>

      <div className="island-scene" aria-hidden="true">
        <div className="orbit-line orbit-line-one" />
        <div className="orbit-line orbit-line-two" />
        <div className="orbit-line orbit-line-three" />
        <div className="island-platform">
          <div className="island-depth island-depth-three" />
          <div className="island-depth island-depth-two" />
          <div className="island-depth island-depth-one" />
          <div className="island-surface">
            <i className="terrain-line terrain-line-one" />
            <i className="terrain-line terrain-line-two" />
            <i className="terrain-line terrain-line-three" />
            <i className="terrain-glow" />
          </div>
        </div>
        <span className="island-ping ping-one" />
        <span className="island-ping ping-two" />
        <span className="island-ping ping-three" />
      </div>

      <div className="floating-candidates" aria-label="Featured candidate profiles">
        {candidates.map((candidate, index) => (
          <Link
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
          </Link>
        ))}
      </div>

      {active ? (
        <div className="stage-hud stage-hud-bottom" aria-live="polite">
          <div>
            <span>Focus profile</span>
            <strong>{active.name}</strong>
          </div>
          <div className="stage-priority">
            <span>Stated priority</span>
            <strong>{active.priority}</strong>
          </div>
          <Link href={`/candidates/${active.slug}`} aria-label={`Open ${active.name}'s evidence profile`}>
            {active.evidenceCount} source{active.evidenceCount === 1 ? "" : "s"} <b aria-hidden="true">↗</b>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
