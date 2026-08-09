"use client";

import { useState } from "react";

const initialItems = [
  { id: 1, type: "Candidate declaration", candidate: "Steve Curphey", constituency: "Ayre and Michael", claim: "Government reform, fairer taxation and health-service budgetary control are stated priorities.", source: "Manx Radio", risk: "Standard", url: "https://www.manxradio.com/news/isle-of-man-news/seventh-candidate-to-stand-for-election-in-ayre-and-michael/" },
  { id: 2, type: "Issue position", candidate: "Rachel Glover", constituency: "Onchan", claim: "Healthcare value should be measured against what is delivered.", source: "Manx Radio profile", risk: "Standard", url: "https://www.manxradio.com/election-2026/election-candidates/rachel-glover/" },
  { id: 3, type: "Missing evidence", candidate: "Peter Shimmin", constituency: "Douglas Central", claim: "No reviewed offshore-wind position has been found.", source: "Current source set", risk: "Second pass", url: "https://www.manxradio.com/election-2026/election-candidates/peter-shimmin/" },
] as const;

export function ReviewQueue() {
  const [decisions, setDecisions] = useState<Record<number, string>>({});

  return (
    <div className="review-layout">
      <aside className="review-nav">
        <h2>Queue</h2>
        <button className="is-active" type="button"><span>Needs review</span><b>{initialItems.length}</b></button>
        <button type="button"><span>Second pass</span><b>1</b></button>
        <button type="button"><span>Approved today</span><b>{Object.values(decisions).filter((value) => value === "Approved").length}</b></button>
        <button type="button"><span>Held</span><b>{Object.values(decisions).filter((value) => value === "Held").length}</b></button>
        <div className="audit-health">
          <span aria-hidden="true">✓</span>
          <strong>Audit trail ready</strong>
          <small>Prototype state only</small>
        </div>
      </aside>
      <div className="review-queue" aria-live="polite">
        <div className="queue-toolbar">
          <h2>Claims awaiting a decision</h2>
          <span>Oldest first</span>
        </div>
        {initialItems.map((item) => (
          <article className={`review-item ${decisions[item.id] ? "is-decided" : ""}`} key={item.id}>
            <div className="review-item-top">
              <span className="review-type">{item.type}</span>
              <span className={item.risk === "Second pass" ? "risk-high" : "risk-standard"}>{item.risk}</span>
            </div>
            <div className="review-person">
              <span>{item.candidate.split(" ").map((part) => part[0]).join("")}</span>
              <div><strong>{item.candidate}</strong><small>{item.constituency}</small></div>
            </div>
            <blockquote>{item.claim}</blockquote>
            <a href={item.url} target="_blank" rel="noreferrer">Inspect {item.source} source ↗</a>
            {decisions[item.id] ? (
              <div className="decision-state"><span>✓</span><strong>{decisions[item.id]}</strong><button onClick={() => setDecisions((previous) => ({ ...previous, [item.id]: "" }))} type="button">Undo</button></div>
            ) : (
              <div className="review-actions">
                <button className="approve-action" onClick={() => setDecisions((previous) => ({ ...previous, [item.id]: "Approved" }))} type="button">Approve</button>
                <button onClick={() => setDecisions((previous) => ({ ...previous, [item.id]: "Held" }))} type="button">Hold</button>
                <button onClick={() => setDecisions((previous) => ({ ...previous, [item.id]: "Needs correction" }))} type="button">Request correction</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
