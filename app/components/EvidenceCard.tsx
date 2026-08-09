import Link from "next/link";
import type { Candidate } from "../lib/data";

export function EvidenceCard({ candidate }: { candidate: Candidate }) {
  return (
    <article className="candidate-card">
      <div className="candidate-portrait" aria-label={`${candidate.name} portrait pending rights clearance`}>
        <span>{candidate.initials}</span>
        <small>Portrait pending</small>
      </div>
      <div className="candidate-card-body">
        <div className="candidate-status-row">
          <span className="candidate-status"><i aria-hidden="true" /> {candidate.status}</span>
          <span>{candidate.affiliation}</span>
        </div>
        <p className="candidate-constituency">{candidate.constituency}</p>
        <h3>{candidate.name}</h3>
        <p>{candidate.summary}</p>
        <div className="evidence-meter" aria-label={`${candidate.evidenceCount} reviewed source`}>
          <span><i style={{ width: `${Math.min(candidate.evidenceCount * 25 + 20, 100)}%` }} /></span>
          <small>{candidate.evidenceCount} reviewed source{candidate.evidenceCount === 1 ? "" : "s"}</small>
        </div>
        <Link href={`/candidates/${candidate.slug}`}>
          Open evidence profile <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
