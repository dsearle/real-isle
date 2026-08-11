"use client";

/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The overflowing comparison region must be keyboard-scrollable. */

import { useCivicPreferences } from "./CivicPreferences";
import styles from "./IssueMatrix.module.css";

const issues = [
  { id: "manxcare", label: "Manx Care", question: "How should health delivery and accountability change?" },
  { id: "wind", label: "Offshore wind", question: "What should the Island accept, reject or renegotiate?" },
  { id: "housing", label: "Housing", question: "How should supply and affordability be addressed?" },
] as const;

type IssueMatrixCandidate = {
  constituencyId: string;
  constituencyName: string;
  initials: string;
  name: string;
  slug: string;
};

export function IssueMatrix({
  candidates,
  constituencies,
}: {
  candidates: readonly IssueMatrixCandidate[];
  constituencies: readonly { id: string; name: string }[];
}) {
  const { selectedConstituencyId } = useCivicPreferences();
  const selected = constituencies.find(
    (constituency) => constituency.id === selectedConstituencyId,
  );
  const selectedCandidates = candidates
    .filter((candidate) => candidate.constituencyId === selected?.id)
    .toSorted((left, right) => left.name.localeCompare(right.name, "en-GB"));
  const compared = selectedCandidates;

  return (
    <div className="matrix-wrap">
      <p className={styles.context} aria-live="polite">
        {selected
          ? selectedCandidates.length
            ? `Showing every approved candidate profile for ${selected.name}, alphabetically.`
            : `No approved candidate profile for ${selected.name} is available yet.`
          : "Choose an area above to compare all of its approved candidate profiles."}
      </p>
      {compared.length ? (
        <>
          <p className={styles.scrollInstructions} id="issue-matrix-scroll-instructions">
            Scroll horizontally to compare every candidate. Keyboard users can focus this table area and use the arrow keys.
          </p>
          <div
            aria-describedby="issue-matrix-scroll-instructions"
            aria-label={`Scrollable candidate issue comparison for ${selected?.name ?? "selected area"}`}
            className={`matrix-scroll ${styles.scrollRegion}`}
            role="region"
            tabIndex={0}
          >
            <table className="issue-matrix">
              <thead>
                <tr>
                  <th scope="col">Issue</th>
                  {compared.map((candidate) => (
                    <th scope="col" key={candidate.slug}>
                      <span>{candidate.initials}</span>
                      {candidate.name}
                      <small className={styles.candidateConstituency}>{candidate.constituencyName}</small>
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
                    {compared.map((candidate) => (
                      <td key={candidate.slug}>
                        <span className="position-state position-missing">Awaiting review</span>
                        <p>No proposition-level position is published until its exact evidence completes review.</p>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          {selected
            ? `There are no approved candidate profiles for ${selected.name} to compare yet.`
            : "Select a constituency to begin. Profiles appear only after their public identity basis has been approved."}
        </div>
      )}
      {compared.length ? (
        <div className="matrix-legend">
          <span><i className="legend-missing" /> Awaiting proposition-level review</span>
        </div>
      ) : null}
    </div>
  );
}
