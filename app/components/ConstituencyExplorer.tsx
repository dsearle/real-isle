"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { candidates, constituencies } from "../lib/data";

export function ConstituencyExplorer() {
  const [selectedId, setSelectedId] = useState("onchan");
  const selected = constituencies.find((constituency) => constituency.id === selectedId) ?? constituencies[0];
  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selected.candidates.includes(candidate.slug as never)),
    [selected],
  );

  return (
    <div className="explorer">
      <div className="map-panel">
        <div className="map-caption">
          <span>Interactive Island</span>
          <small>Illustrative navigation · boundary map to follow</small>
        </div>
        <div className="island-map" role="group" aria-label="Choose an Isle of Man constituency">
          <div className="island-shadow" aria-hidden="true" />
          <div className="island-land" aria-hidden="true">
            <i className="contour contour-one" />
            <i className="contour contour-two" />
            <i className="contour contour-three" />
          </div>
          {constituencies.map((constituency) => (
            <button
              aria-label={`Explore ${constituency.name}`}
              aria-pressed={constituency.id === selected.id}
              className={`map-marker ${constituency.id === selected.id ? "is-active" : ""}`}
              key={constituency.id}
              onClick={() => setSelectedId(constituency.id)}
              style={{ left: `${constituency.x}%`, top: `${constituency.y}%` }}
              type="button"
            >
              <span>{constituency.short}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="constituency-panel" aria-live="polite">
        <p className="panel-step">Selected constituency</p>
        <h3>{selected.name}</h3>
        <div className="constituency-facts">
          <span><b>2</b> seats</span>
          <span><b>{selected.declared}</b> candidate status</span>
        </div>
        {selectedCandidates.length ? (
          <div className="mini-candidates">
            {selectedCandidates.map((candidate) => (
              <Link className="mini-candidate" href={`/candidates/${candidate.slug}`} key={candidate.slug}>
                <span>{candidate.initials}</span>
                <div>
                  <strong>{candidate.name}</strong>
                  <small>{candidate.status} · {candidate.evidenceCount} source reviewed</small>
                </div>
                <i aria-hidden="true">→</i>
              </Link>
            ))}
          </div>
        ) : (
          <div className="monitoring-note">
            <span aria-hidden="true">⌁</span>
            <div>
              <strong>Profile review in progress</strong>
              <p>Candidate records will appear here only after a declaration source has been checked.</p>
            </div>
          </div>
        )}
        <a
          className="official-map-link"
          href="https://elections.gov.im/house-of-keys-general-election-2026/"
          target="_blank"
          rel="noreferrer"
        >
          Check the official boundary map <span aria-hidden="true">↗</span>
        </a>
        <div className="constituency-list" aria-label="All constituencies">
          {constituencies.map((constituency) => (
            <button
              className={constituency.id === selected.id ? "is-current" : ""}
              key={constituency.id}
              onClick={() => setSelectedId(constituency.id)}
              type="button"
            >
              {constituency.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
