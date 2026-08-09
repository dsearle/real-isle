import { candidates } from "../lib/data";

const issues = [
  { id: "manxcare", label: "Manx Care", question: "How should health delivery and accountability change?" },
  { id: "wind", label: "Offshore wind", question: "What should the Island accept, reject or renegotiate?" },
  { id: "housing", label: "Housing", question: "How should supply and affordability be addressed?" },
] as const;

export function IssueMatrix() {
  const compared = candidates.slice(0, 4);

  return (
    <div className="matrix-wrap">
      <div className="matrix-scroll" role="region" aria-label="Scrollable candidate issue comparison">
        <table className="issue-matrix">
          <thead>
            <tr>
              <th scope="col">Issue</th>
              {compared.map((candidate) => (
                <th scope="col" key={candidate.slug}>
                  <span>{candidate.initials}</span>
                  {candidate.name}
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
