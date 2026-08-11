import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HomeViewExperience } from "./components/HomeViewExperience";
import { IssueMatrix } from "./components/IssueMatrix";
import {
  constituencies,
  constituencyBoundarySource,
} from "./lib/data";
import {
  getPublicCandidateDirectorySafe,
  getPublicEvidenceSnapshotSafe,
} from "./lib/evidence/public-evidence";
import { getPublishableCandidatePortraitsSafe } from "./lib/evidence/public-media";
import { getPublicMonitorSnapshotSafe } from "./lib/evidence/public-monitor";

export const dynamic = "force-dynamic";

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

export default async function Home() {
  const [publicCandidates, publicEvidence, publishablePortraits, monitorSnapshot] = await Promise.all([
    getPublicCandidateDirectorySafe(),
    getPublicEvidenceSnapshotSafe({ limit: 40 }),
    getPublishableCandidatePortraitsSafe(),
    getPublicMonitorSnapshotSafe(),
  ]);
  const homeCandidates = publicCandidates.map((candidate) => ({
    constituencyId: candidate.constituencyId,
    constituencyName: candidate.constituencyName,
    evidenceCount: candidate.evidenceCount,
    initials: candidate.initials,
    name: candidate.name,
    portraitUrl: publishablePortraits[candidate.slug] ?? null,
    slug: candidate.slug,
    status: candidate.status,
  }));
  const homeConstituencies = constituencies.map(({ id, name, short, x, y }) => ({
    id,
    name,
    short,
    x,
    y,
  }));
  const homeUpdates = publicEvidence.records
    .toSorted((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))
    .map((record) => ({
      candidateSlugs: record.associations.flatMap((association) => (
        association.type === "candidate" && association.slug ? [association.slug] : []
      )),
      constituencyIds: record.associations.flatMap((association) => (
        association.type === "constituency" ? [association.id] : []
      )),
      date: shortDate.format(new Date(record.reviewedAt)),
      dateQualifier: "Reviewed" as const,
      sortDate: record.reviewedAt,
      source: record.sourceName,
      state: "Approved source",
      stateClass: "state-reviewed",
      summary: record.coverageSummary,
      title: record.title,
      url: record.canonicalUrl,
    }));

  return (
    <main>
      <Header />

      <HomeViewExperience
        boundarySourceUrl={constituencyBoundarySource.url}
        candidates={homeCandidates}
        constituencies={homeConstituencies}
        monitorSnapshot={monitorSnapshot}
        updates={homeUpdates}
      />

      <section className="ticker" aria-label="Important election dates">
        <div className="shell ticker-track">
          <span className="ticker-label"><i aria-hidden="true" /> Election countdown</span>
          <span><b>13 Aug</b> Keys dissolved</span>
          <span><b>25 Aug</b> Voter registration deadline</span>
          <span><b>26 Aug</b> Nominations close</span>
          <span><b>24 Sep</b> Polling day · 8am–8pm</span>
        </div>
      </section>

      <section className="section shell" id="issues">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow eyebrow-dark">The defining questions</p>
            <h2>Track each issue as reviewed positions emerge.</h2>
          </div>
          <p>
            Source approval does not establish a position. The People’s Isle waits
            for proposition-level evidence review and never infers a view from silence.
          </p>
        </div>
        <IssueMatrix candidates={homeCandidates} constituencies={homeConstituencies} />
      </section>

      <section className="section shell trust-section">
        <div className="trust-card trust-card-main">
          <span className="trust-number">01</span>
          <p className="eyebrow eyebrow-dark">How The People’s Isle earns trust</p>
          <h2>Readable in a minute. Linked back to evidence.</h2>
          <p>
            Each public source card shows the reviewed source page, its
            publication or observation date, approved associations and a
            source-version fingerprint. The first public version is
            founder-reviewed by David Searle.
          </p>
        </div>
        <div className="trust-card">
          <span className="trust-icon" aria-hidden="true">⌁</span>
          <h3>Evidence, not vibes</h3>
          <p>Summaries stay visibly connected to manifestos, interviews and reporting.</p>
        </div>
        <div className="trust-card">
          <span className="trust-icon" aria-hidden="true">◇</span>
          <h3>Private by design</h3>
          <p>The launch compass runs in your browser. Answers are not sent to The People’s Isle.</p>
        </div>
        <div className="trust-card trust-card-accent">
          <span className="trust-icon" aria-hidden="true">↺</span>
          <h3>Open to challenge</h3>
          <p>Visitors can challenge published material. Approved corrections update the public record.</p>
        </div>
      </section>

      <section className="compass-callout">
        <div className="shell compass-callout-grid">
          <div>
            <p className="eyebrow">Your choices stay yours</p>
            <h2>Build a view of what matters to you.</h2>
          </div>
          <div>
            <p>
              Work through five defining Island questions. Your answers remain
              on this device and can be cleared instantly.
            </p>
            <a className="button button-coral" href="/compass">
              Start the compass <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
