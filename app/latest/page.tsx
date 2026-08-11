import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { PrioritisedNewsFeed } from "../components/PrioritisedNewsFeed";
import { PublicMonitorPanel } from "../components/PublicMonitorPanel";
import { constituencies, updates } from "../lib/data";
import { getPublicMonitorSnapshotSafe } from "../lib/evidence/public-monitor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Election desk",
  description: "Reviewed election updates with direct links to the original sources.",
};

export default async function LatestPage() {
  const monitorSnapshot = await getPublicMonitorSnapshotSafe();
  return (
    <main>
      <Header />
      <section className="desk-page-hero">
        <div className="shell">
          <p className="eyebrow">Monitored · reviewed · linked</p>
          <h1>The election desk</h1>
          <p>The launch briefing is founder-curated and does not mirror the collection stream. New discoveries remain private until separately reviewed and published.</p>
        </div>
      </section>
      <section className="section shell desk-page-layout">
        <PrioritisedNewsFeed constituencies={constituencies} updates={updates} />
        <div className="desk-page-monitor">
          <PublicMonitorPanel initialSnapshot={monitorSnapshot} />
        </div>
      </section>
      <Footer />
    </main>
  );
}
