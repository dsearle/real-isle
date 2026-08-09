import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { PrioritisedNewsFeed } from "../components/PrioritisedNewsFeed";
import { constituencies, updates } from "../lib/data";
import { getEvidenceDashboardSafe } from "../lib/evidence/status";

export const metadata: Metadata = {
  title: "Election desk",
  description: "Reviewed election updates with direct links to the original sources.",
};

export default async function LatestPage() {
  const dashboard = await getEvidenceDashboardSafe();
  return (
    <main>
      <Header />
      <section className="desk-page-hero">
        <div className="shell">
          <p className="eyebrow">Monitored · reviewed · linked</p>
          <h1>The election desk</h1>
          <p>Campaign updates are separated from the evidence The People’s Isle has reviewed and published.</p>
        </div>
      </section>
      <section className="section shell desk-page-layout">
        <div className="desk-filter">
          <span className="status-live"><i aria-hidden="true" /> {dashboard ? "Monitor active" : "Monitor initialising"}</span>
          <h2>Source coverage</h2>
          <ul>
            {(dashboard?.sources ?? []).slice(0, 5).map((source) => (
              <li key={source.id}>
                <span>{source.name}</span>
                <b>{source.last_success_at ? "Checked" : "Queued"}</b>
              </li>
            ))}
            {!dashboard ? <li><span>Evidence store</span><b>Preparing</b></li> : null}
          </ul>
          <p>
            {dashboard
              ? `${dashboard.counts.sourceItems} records captured. Automated material stays private until it is reviewed.`
              : "The maintained source registry will appear after its first pull."}
          </p>
        </div>
        <PrioritisedNewsFeed constituencies={constituencies} updates={updates} />
      </section>
      <Footer />
    </main>
  );
}
