"use client";

import { useRef, type PointerEvent } from "react";

type AnimatedCandidatePortraitProps = {
  initials: string;
  name: string;
  priorities: string[];
  status: string;
};

export function AnimatedCandidatePortrait({
  initials,
  name,
  priorities,
  status,
}: AnimatedCandidatePortraitProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  function movePortrait(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    stage.style.setProperty("--portrait-rx", `${(-y * 8).toFixed(2)}deg`);
    stage.style.setProperty("--portrait-ry", `${(x * 10).toFixed(2)}deg`);
  }

  function resetPortrait() {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty("--portrait-rx", "0deg");
    stage.style.setProperty("--portrait-ry", "0deg");
  }

  return (
    <div
      aria-label={`Animated profile placeholder for ${name}`}
      className="profile-portrait-stage"
      data-profile-reveal
      onPointerLeave={resetPortrait}
      onPointerMove={movePortrait}
      ref={stageRef}
    >
      <span className="profile-portrait-spark spark-one" aria-hidden="true">✦</span>
      <span className="profile-portrait-spark spark-two" aria-hidden="true">●</span>
      <span className="profile-portrait-spark spark-three" aria-hidden="true">✦</span>
      <span className="profile-status-sticker">{status}</span>

      <div className="profile-portrait profile-portrait-interactive">
        <span className="profile-avatar-halo" aria-hidden="true" />
        <span className="profile-avatar-initials">{initials}</span>
        <small>Rights-cleared portrait pending</small>
      </div>

      {priorities.slice(0, 3).map((priority, index) => (
        <span
          aria-hidden="true"
          className={`profile-float-tag profile-float-tag-${index + 1}`}
          key={priority}
          title={priority}
        >
          {priority}
        </span>
      ))}
    </div>
  );
}
