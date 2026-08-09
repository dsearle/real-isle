import { ConstituencyExplorer } from "./components/ConstituencyExplorer";
import { EvidenceCard } from "./components/EvidenceCard";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HeroIsland } from "./components/HeroIsland";
import { IssueMatrix } from "./components/IssueMatrix";
import { candidates, updates } from "./lib/data";

export default function Home() {
  const featuredCandidates = candidates.slice(0, 4);
  const heroCandidates = candidates.slice(0, 5).map((candidate) => ({
    slug: candidate.slug,
    name: candidate.name,
    initials: candidate.initials,
    constituency: candidate.constituency,
    priority: candidate.priorities[0],
    evidenceCount: candidate.evidenceCount,
  }));

  return (
    <main>
      <Header />

      <section className="hero hero-v2">
        <div className="hero-atmosphere" aria-hidden="true">
          <i /><i /><i />
        </div>
        <div className="shell hero-grid hero-grid-v2">
          <div className="hero-copy">
            <p className="eyebrow">A clearer way to choose</p>
            <h1>
              Your Isle,<br />
              <em>Your Future</em>
            </h1>
            <p className="hero-intro">
              Move through the Island, meet the people standing in your area,
              and trace every position back to what was actually said.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#constituencies">
                Find your constituency
              </a>
              <a className="button button-quiet" href="/compass">
                Try the private compass <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="hero-meta hero-meta-v2" aria-label="Real Isle evidence coverage">
              <div>
                <strong>12</strong>
                <span>areas mapped</span>
              </div>
              <div>
                <strong>6</strong>
                <span>profiles reviewed</span>
              </div>
              <div>
                <strong>100%</strong>
                <span>claims linked</span>
              </div>
            </div>
          </div>
          <HeroIsland candidates={heroCandidates} />
        </div>
      </section>

      <section className="ticker" aria-label="Important election dates">
        <div className="shell ticker-track">
          <span className="ticker-label"><i aria-hidden="true" /> Election countdown</span>
          <span><b>13 Aug</b> Keys dissolved</span>
          <span><b>25 Aug</b> Voter registration deadline</span>
          <span><b>26 Aug</b> Nominations close</span>
          <span><b>24 Sep</b> Polling day · 8am–8pm</span>
        </div>
      </section>

      <section className="section shell" id="constituencies">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow eyebrow-dark">Explore the election</p>
            <h2>Your Island, constituency by constituency.</h2>
          </div>
          <p>
            Choose an area to see declared candidates and the strength of the
            evidence currently held for each profile.
          </p>
        </div>
        <ConstituencyExplorer />
      </section>

      <section className="section section-ink" id="candidates">
        <div className="shell">
          <div className="section-heading section-heading-light split-heading">
            <div>
              <p className="eyebrow">Evidence-led profiles</p>
              <h2>Start with the claim. End at the source.</h2>
            </div>
            <p>
              These prospective-candidate records are a live editorial preview,
              not the final notice of poll.
            </p>
          </div>
          <div className="candidate-grid">
            {featuredCandidates.map((candidate) => (
              <EvidenceCard key={candidate.slug} candidate={candidate} />
            ))}
          </div>
          <div className="section-cta">
            <a className="text-link text-link-light" href="#constituencies">
              Browse all monitored constituencies <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      <section className="section shell" id="issues">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow eyebrow-dark">The defining questions</p>
            <h2>Compare what candidates have actually said.</h2>
          </div>
          <p>
            “Not found” is a meaningful result. Real Isle does not infer a
            position from party, biography, likes, or silence.
          </p>
        </div>
        <IssueMatrix />
      </section>

      <section className="section section-sand" id="latest">
        <div className="shell latest-layout">
          <div className="latest-heading">
            <p className="eyebrow eyebrow-dark">Latest evidence</p>
            <h2>The campaign, with the noise turned down.</h2>
            <p>
              A monitored stream becomes public only after its source,
              candidate, constituency and claims have been checked.
            </p>
            <a className="button button-ink" href="/latest">
              Open the election desk
            </a>
          </div>
          <div className="update-list">
            {updates.slice(0, 3).map((update) => (
              <article className="update-row" key={update.title}>
                <div className="update-time">
                  <strong>{update.date}</strong>
                  <span>{update.source}</span>
                </div>
                <div>
                  <span className={`evidence-pill ${update.stateClass}`}>
                    {update.state}
                  </span>
                  <h3>{update.title}</h3>
                  <p>{update.summary}</p>
                  <a href={update.url} target="_blank" rel="noreferrer">
                    Read original source <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section shell trust-section">
        <div className="trust-card trust-card-main">
          <span className="trust-number">01</span>
          <p className="eyebrow eyebrow-dark">How Real Isle earns trust</p>
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
          <p>The launch compass runs in your browser. Answers are not sent to Real Isle.</p>
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
