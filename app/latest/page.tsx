import type { Metadata } from "next";
import { ApprovedEvidenceFeed } from "../components/ApprovedEvidenceFeed";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { PublicMonitorPanel } from "../components/PublicMonitorPanel";
import { constituencies } from "../lib/data";
import { getPublicEvidenceSnapshotSafe } from "../lib/evidence/public-evidence";
import { getPublicMonitorSnapshotSafe } from "../lib/evidence/public-monitor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Election desk",
  description: "Approved election evidence organised by candidate, constituency and topic, with direct links to each reviewed source page.",
};

export default async function LatestPage() {
  const [evidenceSnapshot, monitorSnapshot] = await Promise.all([
    getPublicEvidenceSnapshotSafe(),
    getPublicMonitorSnapshotSafe(),
  ]);
  return (
    <main>
      <Header />
      <section className="desk-page-hero">
        <div className="shell">
          <p className="eyebrow">Monitored · reviewed · linked</p>
          <h1>The election desk</h1>
          <p>Follow the running public record of approved election sources. New discoveries remain private until an editor approves their relevance, associations and publication.</p>
        </div>
      </section>
      <section className="section shell desk-page-layout">
        <ApprovedEvidenceFeed
          constituencies={constituencies}
          snapshot={{
            records: evidenceSnapshot.records.map((record) => ({
              associations: record.associations,
              auditFingerprint: record.auditFingerprint,
              canonicalUrl: record.canonicalUrl,
              coverageSummary: record.coverageSummary,
              firstSeenAt: record.firstSeenAt,
              itemType: record.itemType,
              publishedAt: record.publishedAt,
              reviewedAt: record.reviewedAt,
              sourceName: record.sourceName,
              title: record.title,
              versionId: record.versionId,
            })),
            state: evidenceSnapshot.state,
          }}
        />
        <div className="desk-page-monitor">
          <PublicMonitorPanel initialSnapshot={monitorSnapshot} />
        </div>
      </section>
      <Footer />
    </main>
  );
}
