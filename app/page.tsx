import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HomeViewExperience } from "./components/HomeViewExperience";
import { IssueMatrix } from "./components/IssueMatrix";
import {
  candidates,
  constituencies,
  constituencyBoundarySource,
  updates,
} from "./lib/data";
import { getPublishableCandidatePortraitsSafe } from "./lib/evidence/public-media";

export const dynamic = "force-dynamic";

export default async function Home() {
  const publishablePortraits = await getPublishableCandidatePortraitsSafe();
  const homeCandidates = candidates.flatMap((candidate) => {
    const constituency = constituencies.find((item) => item.name === candidate.constituency);
    if (!constituency) return [];
    return [{
      constituencyId: constituency.id,
      evidenceCount: candidate.evidenceCount,
      initials: candidate.initials,
      name: candidate.name,
      portraitUrl: publishablePortraits[candidate.slug] ?? null,
      priorities: candidate.priorities,
      slug: candidate.slug,
      status: candidate.status,
      summary: candidate.summary,
    }];
  });

  return (
    <main>
      <Header />

      <HomeViewExperience
        boundarySourceUrl={constituencyBoundarySource.url}
        candidates={homeCandidates}
        constituencies={constituencies}
        updates={updates}
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
            <h2>Compare what candidates have actually said.</h2>
          </div>
          <p>
            “Not found” is a meaningful result. The People’s Isle does not infer a
            position from party, biography, likes or silence.
          </p>
        </div>
        <IssueMatrix />
      </section>

      <section className="section shell trust-section">
        <div className="trust-card trust-card-main">
          <span className="trust-number">01</span>
          <p className="eyebrow eyebrow-dark">How The People’s Isle earns trust</p>
          <h2>Readable in a minute. Auditable for years.</h2>
          <p>
            Every published position keeps the source URL, observation time,
            exact evidence span, editorial history and correction trail. The
            first public version is founder-reviewed by David Searle.
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
          <p>Every material claim can be disputed, corrected and followed through its revisions.</p>
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
