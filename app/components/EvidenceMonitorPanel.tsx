import type { EvidenceDashboard } from "../lib/evidence/status";

function formatTime(value: string | null) {
  if (!value) return "Awaiting first pull";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Isle_of_Man",
  }).format(new Date(value));
}

export function EvidenceMonitorPanel({ dashboard }: { dashboard: EvidenceDashboard | null }) {
  if (!dashboard) {
    return (
      <section className="evidence-monitor-panel is-initialising">
        <p className="eyebrow eyebrow-dark">Evidence monitor</p>
        <h2>Preparing the maintained evidence store</h2>
        <p>The source registry will appear here as soon as the first database migration and pull complete.</p>
      </section>
    );
  }

  return (
    <section className="evidence-monitor-panel">
      <div className="evidence-monitor-heading">
        <div>
          <p className="eyebrow eyebrow-dark">System-maintained evidence ledger</p>
          <h2>{dashboard.counts.sources} monitored sources</h2>
        </div>
        <span className="evidence-ledger-seal">Chain #{dashboard.auditSequence}</span>
      </div>
      <div className="evidence-monitor-stats">
        <div><strong>{dashboard.counts.sourceItems}</strong><span>source records</span></div>
        <div><strong>{dashboard.counts.snapshots}</strong><span>immutable captures</span></div>
        <div><strong>{dashboard.counts.pendingReview}</strong><span>awaiting review</span></div>
        <div><strong>{dashboard.auditHeadHash.slice(0, 10)}</strong><span>audit head</span></div>
      </div>
      <div className="evidence-source-grid">
        {dashboard.sources.map((source) => (
          <article key={source.id}>
            <div>
              <span className={source.consecutive_failures || source.last_error ? "source-health is-warning" : "source-health"} />
              <strong>{source.name}</strong>
            </div>
            <small>Tier {source.source_tier} · {formatTime(source.last_success_at)}</small>
          </article>
        ))}
      </div>
      {dashboard.reviewItems.length ? (
        <div className="evidence-inbox">
          <div><h3>Newly discovered</h3><span>Private until reviewed</span></div>
          {dashboard.reviewItems.slice(0, 6).map((item) => (
            <a href={item.canonical_url} key={item.id} rel="noreferrer" target="_blank">
              <span>{item.source_name}</span>
              <strong>{item.title}</strong>
              <small>{item.candidate_ids ? "Candidate mention detected" : "Needs entity review"} ↗</small>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
