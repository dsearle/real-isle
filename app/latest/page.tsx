import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { updates } from "../lib/data";

export const metadata: Metadata = {
  title: "Election desk",
  description: "Reviewed election updates with direct links to the original sources.",
};

export default function LatestPage() {
  return (
    <main>
      <Header />
      <section className="desk-page-hero">
        <div className="shell">
          <p className="eyebrow">Monitored · reviewed · linked</p>
          <h1>The election desk</h1>
          <p>Campaign updates are separated from the evidence Real Isle has reviewed and published.</p>
        </div>
      </section>
      <section className="section shell desk-page-layout">
        <div className="desk-filter">
          <span className="status-live"><i aria-hidden="true" /> Monitor active</span>
          <h2>Source coverage</h2>
          <ul>
            <li><span>Government elections</span><b>Primary</b></li>
            <li><span>Manx Radio</span><b>Active</b></li>
            <li><span>BBC Isle of Man</span><b>Queued</b></li>
            <li><span>Isle of Man Today</span><b>Queued</b></li>
            <li><span>Candidate channels</span><b>Manual review</b></li>
          </ul>
          <p>Prototype coverage state. Automated ingestion is the next build stage.</p>
        </div>
        <div className="desk-feed">
          {updates.map((update, index) => (
            <article key={update.title}>
              <div className="feed-index">0{index + 1}</div>
              <div>
                <div className="feed-meta">
                  <span>{update.date} 2026</span>
                  <span>{update.source}</span>
                  <span className={`evidence-pill ${update.stateClass}`}>{update.state}</span>
                </div>
                <h2>{update.title}</h2>
                <p>{update.summary}</p>
                <a href={update.url} target="_blank" rel="noreferrer">Open original source ↗</a>
              </div>
            </article>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
