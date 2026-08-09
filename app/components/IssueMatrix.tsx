"use client";

import { candidates, constituencies } from "../lib/data";
import { useCivicPreferences } from "./CivicPreferences";
import styles from "./IssueMatrix.module.css";

const issues = [
  { id: "manxcare", label: "Manx Care", question: "How should health delivery and accountability change?" },
  { id: "wind", label: "Offshore wind", question: "What should the Island accept, reject or renegotiate?" },
  { id: "housing", label: "Housing", question: "How should supply and affordability be addressed?" },
] as const;

export function IssueMatrix() {
  const { selectedConstituencyId } = useCivicPreferences();
  const selected = constituencies.find(
    (constituency) => constituency.id === selectedConstituencyId,
  );
  const selectedCandidates = candidates
    .filter((candidate) => candidate.constituency === selected?.name)
    .toSorted((left, right) => left.name.localeCompare(right.name, "en-GB"));
  const otherCandidates = candidates
    .filter((candidate) => candidate.constituency !== selected?.name)
    .toSorted((left, right) => left.name.localeCompare(right.name, "en-GB"));
  const compared = [...selectedCandidates, ...otherCandidates].slice(0, 4);

  return (
    <div className="matrix-wrap">
      <p className={styles.context} aria-live="polite">
        {selected
          ? selectedCandidates.length
            ? `Candidates for ${selected.name} are grouped first. Each group remains alphabetical.`
            : `No reviewed candidate profile for ${selected.name} yet. Showing other reviewed profiles alphabetically.`
          : "Choose an area above to prioritise its reviewed candidates in this comparison."}
      </p>
      <div className="matrix-scroll" role="region" aria-label="Scrollable candidate issue comparison">
        <table className="issue-matrix">
          <thead>
            <tr>
              <th scope="col">Issue</th>
              {compared.map((candidate) => (
                <th scope="col" key={candidate.slug}>
                  <span>{candidate.initials}</span>
                  {candidate.name}
                  <small className={styles.candidateConstituency}>{candidate.constituency}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.id}>
                <th scope="row">
                  <strong>{issue.label}</strong>
                  <small>{issue.question}</small>
                </th>
                {compared.map((candidate) => {
                  const position = candidate.positions[issue.id];
                  return (
                    <td key={candidate.slug}>
                      <span className={`position-state position-${position.state}`}>{position.label}</span>
                      <p>{position.detail}</p>
                      <a href={candidate.sources[0].url} target="_blank" rel="noreferrer">
                        Evidence ↗
                      </a>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="matrix-legend">
        <span><i className="legend-found" /> Attributable position</span>
        <span><i className="legend-partial" /> Direction or priority only</span>
        <span><i className="legend-missing" /> No reviewed position found</span>
      </div>
    </div>
  );
}
