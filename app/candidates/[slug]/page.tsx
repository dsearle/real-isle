/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's deployed client router currently throws on navigation; document links are intentional. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { candidates, getCandidate } from "../../lib/data";

export function generateStaticParams() {
  return candidates.map((candidate) => ({ slug: candidate.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const candidate = getCandidate(slug);
  if (!candidate) return { title: "Candidate not found" };
  return {
    title: candidate.name,
    description: `Evidence profile for ${candidate.name}, a declared prospective candidate in ${candidate.constituency}.`,
  };
}

export default async function CandidatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const candidate = getCandidate(slug);
  if (!candidate) notFound();

  return (
    <main>
      <Header />
      <section className="profile-hero">
        <div className="shell profile-breadcrumb">
          <a href="/#constituencies">All constituencies</a>
          <span aria-hidden="true">/</span>
          <span>{candidate.constituency}</span>
        </div>
        <div className="shell profile-hero-grid">
          <div className="profile-portrait">
            <span>{candidate.initials}</span>
            <small>Rights-cleared portrait pending</small>
          </div>
          <div className="profile-title">
            <div className="candidate-status-row">
              <span className="candidate-status"><i aria-hidden="true" /> {candidate.status}</span>
              <span>Prospective candidate</span>
            </div>
            <p className="eyebrow">{candidate.constituency} · {candidate.affiliation}</p>
            <h1>{candidate.name}</h1>
            <p>{candidate.summary}</p>
            <div className="profile-warning">
              <b>Declaration status</b>
              <span>Formal nominations close at 1pm on 26 August 2026.</span>
            </div>
          </div>
          <aside className="profile-verification">
            <span className="verification-mark" aria-hidden="true">✓</span>
            <p>Evidence profile</p>
            <strong>{candidate.evidenceCount} reviewed source</strong>
            <small>Last reviewed 9 Aug 2026</small>
          </aside>
        </div>
      </section>

      <section className="section shell profile-layout">
        <article className="profile-main">
          <div className="profile-section-heading">
            <span>01</span>
            <div>
              <p className="eyebrow eyebrow-dark">Stated priorities</p>
              <h2>In the candidate’s public record</h2>
            </div>
          </div>
          <ol className="priority-list">
            {candidate.priorities.map((priority, index) => (
              <li key={priority}>
                <span>0{index + 1}</span>
                <strong>{priority}</strong>
              </li>
            ))}
          </ol>

          <div className="profile-section-heading positions-heading">
            <span>02</span>
            <div>
              <p className="eyebrow eyebrow-dark">Issue record</p>
              <h2>Position by position</h2>
            </div>
          </div>
          <div className="position-cards">
            {[
              ["manxcare", "Manx Care"],
              ["wind", "Offshore wind"],
              ["housing", "Housing and affordability"],
            ].map(([key, label]) => {
              const position = candidate.positions[key];
              return (
                <div className="position-card" key={key}>
                  <div>
                    <h3>{label}</h3>
                    <span className={`position-state position-${position.state}`}>{position.label}</span>
                  </div>
                  <p>{position.detail}</p>
                  <a href={candidate.sources[0].url} target="_blank" rel="noreferrer">Inspect evidence ↗</a>
                </div>
              );
            })}
          </div>
        </article>

        <aside className="evidence-rail">
          <div className="evidence-rail-header">
            <p className="eyebrow eyebrow-dark">Source ledger</p>
            <h2>Original evidence</h2>
          </div>
          {candidate.sources.map((source, index) => (
            <a className="source-ledger-item" href={source.url} key={source.url} target="_blank" rel="noreferrer">
              <span>0{index + 1}</span>
              <div>
                <strong>{source.label}</strong>
                <small>Observed {source.observed}</small>
                <small className="ledger-url">{new URL(source.url).hostname}</small>
              </div>
              <i aria-hidden="true">↗</i>
            </a>
          ))}
          <div className="audit-note">
            <span aria-hidden="true">⌁</span>
            <h3>Audit preview</h3>
            <p>Source snapshots, evidence spans and revision hashes will be exposed here once the publication ledger is connected.</p>
          </div>
          <a className="dispute-link" href="mailto:editor@realisle.im?subject=Profile evidence challenge">
            Challenge or correct this profile
          </a>
        </aside>
      </section>
      <Footer />
    </main>
  );
}
