import Link from "next/link";
import { ConstituencyExplorer } from "./components/ConstituencyExplorer";
import { EvidenceCard } from "./components/EvidenceCard";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { IssueMatrix } from "./components/IssueMatrix";
import { candidates, updates } from "./lib/data";

export default function Home() {
  const featuredCandidates = candidates.slice(0, 4);

  return (
    <main>
      <Header />

      <section className="hero">
        <div className="hero-backdrop" aria-hidden="true" />
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">2026 House of Keys election</p>
            <h1>
              See the Island.<br />
              <em>See the evidence.</em>
            </h1>
            <p className="hero-intro">
              One independent place to examine who is standing, what they have
              said, and the original sources behind every summary.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#constituencies">
                Find your constituency
              </a>
              <Link className="button button-quiet" href="/compass">
                Try the private compass <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="hero-meta" aria-label="Election facts">
              <div>
                <strong>12</strong>
                <span>constituencies</span>
              </div>
              <div>
                <strong>24</strong>
                <span>seats</span>
              </div>
              <div>
                <strong>24 Sep</strong>
                <span>polling day</span>
              </div>
            </div>
          </div>

          <div className="hero-desk" aria-label="Real Isle editorial status">
            <div className="desk-topline">
              <span className="status-live">
                <i aria-hidden="true" /> Election desk monitoring
              </span>
              <span>Preview · 9 Aug 2026</span>
            </div>
            <p className="desk-kicker">What changed today</p>
            <h2>Prospective candidates are still declaring.</h2>
            <p>
              Formal nominations do not close until 1pm on 26 August. Profiles
              therefore distinguish a public declaration from official
              nomination.
            </p>
            <a
              className="source-link"
              href="https://elections.gov.im/house-of-keys-general-election-2026/"
              target="_blank"
              rel="noreferrer"
            >
              Government election timetable <span aria-hidden="true">↗</span>
            </a>
            <div className="desk-stamp">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Source checked</strong>
                <small>Original link and observed date recorded</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ticker" aria-label="Important election dates">
        <div className="shell ticker-track">
          <span className="ticker-label">Election clock</span>
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
            <Link className="button button-ink" href="/latest">
              Open the election desk
            </Link>
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
            <Link className="button button-coral" href="/compass">
              Start the compass <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
