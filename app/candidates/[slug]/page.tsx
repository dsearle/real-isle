/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's deployed client router currently throws on navigation; document links are intentional. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AnimatedCandidatePortrait } from "../../components/AnimatedCandidatePortrait";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { ProfileMotion } from "../../components/ProfileMotion";
import { candidates } from "../../lib/data";
import { candidateRecordSentence } from "../../lib/evidence/candidate-declaration";
import { getCandidatePageData } from "../../lib/evidence/candidate-intelligence";

export const dynamic = "force-dynamic";

const loadCandidatePage = cache(async (slug: string) => {
  let includePrivate = false;
  try {
    const { getAuthenticatedAdminAccess } = await import("../../lib/admin-auth");
    const access = await getAuthenticatedAdminAccess();
    includePrivate = Boolean(access?.allowed);
  } catch {
    // Authentication failure stays on the fail-closed public projection.
  }
  return getCandidatePageData(slug, { includePrivate });
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pageData = await loadCandidatePage(slug);
  const candidate = pageData?.candidate;
  if (!candidate) return { title: "Candidate not found" };
  return {
    title: candidate.name,
    description: `Evidence profile. ${candidateRecordSentence({
      constituency: candidate.constituency,
      name: candidate.name,
      status: candidate.status,
    })}`,
  };
}

export default async function CandidatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageData = await loadCandidatePage(slug);
  if (!pageData) notFound();
  const {
    candidate,
    dossierEvidence,
    founderPreview,
    identityProvenance,
    overview,
    privateView,
    publishedOverview,
  } = pageData;
  const candidateIndex = [...candidate.slug].reduce((total, character) => total + character.charCodeAt(0), 0) % 6;
  const otherCandidates = (privateView ? candidates : [])
    .filter((entry) => entry.slug !== candidate.slug)
    .sort((a, b) => Number(b.constituency === candidate.constituency) - Number(a.constituency === candidate.constituency))
    .slice(0, 3);
  const sourceLedger = [
    ...dossierEvidence.map((item) => ({
      audit: `Version ${item.versionId.slice(-8)} · Review ${item.reviewId.slice(-8)}`,
      coverage: item.coverageSummary,
      key: `live:${item.versionId}`,
      label: item.title,
      observed: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(item.reviewedAt)),
      source: item.sourceName,
      state: item.publicationState === "published" ? "Published evidence" : "Private founder preview",
      url: item.canonicalUrl,
    })),
    ...(privateView ? candidate.sources : [])
      .filter((source) => !dossierEvidence.some((item) => item.canonicalUrl === source.url))
      .map((source) => ({
        audit: "Last editorial profile",
        coverage: "Private legacy editorial context; this source has not entered the approved public evidence projection.",
        key: `legacy:${source.url}`,
        label: source.label,
        observed: source.observed,
        source: new URL(source.url).hostname,
        state: "Published editorial source",
        url: source.url,
      })),
  ];
  const lastReviewed = overview.latestReviewedAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(overview.latestReviewedAt))
    : privateView && candidate.sources.length ? "9 Aug 2026" : "Not yet reviewed";

  return (
    <main className={`candidate-profile-page candidate-theme-${candidateIndex % 6}`}>
      <Header />
      <ProfileMotion>
      <section className="profile-hero">
        <div className="shell profile-breadcrumb">
          <a href="/#constituencies">All constituencies</a>
          <span aria-hidden="true">/</span>
          <span>{candidate.constituency}</span>
        </div>
        <div className="shell profile-hero-grid">
          <AnimatedCandidatePortrait
            initials={candidate.initials}
            name={candidate.name}
            priorities={candidate.priorities}
            status={candidate.status}
          />
          <div className="profile-title" data-profile-reveal>
            <div className="candidate-status-row">
              <span className="candidate-status"><i aria-hidden="true" /> {candidate.status}</span>
              <span>Directory-listed identity</span>
            </div>
            <p className="eyebrow">{candidate.constituency} · {candidate.affiliation}</p>
            <h1>{candidate.name}</h1>
            <p>{candidate.summary}</p>
            <div className="profile-warning">
              <b>Declaration status</b>
              <span>Formal nominations close at 1pm on 26 August 2026.</span>
            </div>
          </div>
          <aside className="profile-verification" data-profile-reveal>
            <span className="verification-mark" aria-hidden="true">✓</span>
            <p>Evidence profile</p>
            <strong>{candidate.evidenceCount} reviewed source{candidate.evidenceCount === 1 ? "" : "s"}</strong>
            <small>Last reviewed {lastReviewed}</small>
            {identityProvenance ? (
              <div className="identity-provenance">
                <small>Approved identity basis</small>
                <code>{identityProvenance.basisHash.slice(0, 12)}…</code>
                <a href={identityProvenance.sourceUrl} rel="noreferrer" target="_blank">
                  Open identity source page ↗
                </a>
                <small>Identity source only · not evidence of a policy position</small>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      <section className="section shell profile-layout">
        <article className="profile-main">
          <section className={`campaign-overview ${privateView ? "campaign-overview-private" : ""}`} data-profile-reveal>
            <div className="campaign-overview-heading">
              <div>
                <p className="eyebrow eyebrow-dark">{privateView ? "Campaign platform draft" : "Campaign evidence"}</p>
                <h2>Evidence overview</h2>
              </div>
              <span>{privateView
                ? founderPreview ? "Founder preview · private" : "Founder workspace · private"
                : publishedOverview ? "Published analysis revision" : "Public record"}</span>
            </div>
            <p>{overview.text}</p>
            <dl className="campaign-overview-facts">
              <div><dt>Reviewed sources</dt><dd>{privateView ? publishedOverview?.sourceCount ?? overview.sourceCount : overview.sourceCount}</dd></div>
              {privateView ? <div><dt>Analysis workflow</dt><dd>{overview.analysisState.replaceAll("-", " ")}</dd></div> : <div><dt>Overview status</dt><dd>Source record only</dd></div>}
              {privateView ? <div><dt>Coverage fingerprint</dt><dd><code>{overview.inputHash.slice(0, 12)}…</code></dd></div> : null}
              {!privateView && publishedOverview ? <div><dt>Revision fingerprint</dt><dd><code>{publishedOverview.payloadHash.slice(0, 12)}…</code></dd></div> : null}
              {!privateView && publishedOverview ? <div><dt>Reviewed through</dt><dd>{publishedOverview.reviewedThrough ?? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(publishedOverview.createdAt))}</dd></div> : null}
            </dl>
            <small>{overview.caveat}</small>
          </section>

          <div className="profile-section-heading">
            <span>01</span>
            <div>
              <p className="eyebrow eyebrow-dark">Stated priorities</p>
              <h2>In the candidate’s public record</h2>
            </div>
          </div>
          {privateView && candidate.priorities.length ? <><ul className="priority-list">
            {candidate.priorities.map((priority) => (
              <li data-profile-reveal key={priority}>
                <span aria-hidden="true">•</span>
                <strong>{priority}</strong>
              </li>
            ))}
          </ul><p className="profile-record-note">These priorities are retained from the existing editorial profile. Claim-level evidence binding is still being completed.</p></> : <p className="profile-empty-record">{privateView
            ? "No ordered set of campaign priorities has yet completed review. Repeated mentions are not treated as priorities."
            : "Campaign priorities will appear after each assertion has a proposition-level citation and a published review."}</p>}

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
                <div className="position-card" data-profile-reveal key={key}>
                  <div>
                    <h3>{label}</h3>
                    <span className={`position-state position-${privateView ? position.state : "missing"}`}>
                      {privateView ? position.label : "Awaiting citation review"}
                    </span>
                  </div>
                  <p>{privateView ? position.detail : "This topic is awaiting proposition-level citation review."}</p>
                  <span className="profile-no-position-note">{!privateView
                    ? "No candidate position is published here until the exact supporting evidence has been reviewed."
                    : position.state !== "missing"
                    ? "Retained from the existing editorial profile; proposition-level evidence binding is in progress."
                    : position.label === "Not assessed"
                      ? "This question has not yet been reviewed."
                      : "No published position was found in the listed sources. This does not mean the candidate has no view."}</span>
                </div>
              );
            })}
          </div>
        </article>

        <aside className="evidence-rail" data-profile-reveal>
          <div className="evidence-rail-header">
            <p className="eyebrow eyebrow-dark">Approved source ledger</p>
            <h2>Reviewed source pages</h2>
          </div>
          {sourceLedger.map((source, index) => (
            <a className="source-ledger-item" data-profile-reveal href={source.url} key={source.key} target="_blank" rel="noreferrer">
              <span>0{index + 1}</span>
              <div>
                <strong>{source.label}</strong>
                <small>{source.state} · {source.observed}</small>
                <small className="ledger-url">{source.source}</small>
                <small>{source.coverage}</small>
                <small>{source.audit}</small>
              </div>
              <i aria-hidden="true">↗</i>
            </a>
          ))}
          {!sourceLedger.length ? <p className="evidence-ledger-empty">No reviewed evidence is published for this candidate yet.</p> : null}
          <div className="audit-note">
            <span aria-hidden="true">⌁</span>
            <h3>{privateView ? "Private analysis queue" : "Claim-level analysis withheld"}</h3>
            <p>{privateView
              ? "Approved source versions are now frozen to this candidate dossier. Claim extraction and position review are the next stage before any generated analysis can be published."
              : "Source approval records coverage, not what the candidate believes. Positions remain unpublished until exact propositions and citations complete a separate review."}</p>
          </div>
          <a className="dispute-link" href="mailto:editor@realisle.im?subject=Profile evidence challenge">
            Challenge or correct this profile
          </a>
        </aside>
      </section>
      {privateView && otherCandidates.length ? <section className="shell profile-meet-more" aria-labelledby="meet-more-heading">
        <div>
          <p className="eyebrow eyebrow-dark">Keep exploring</p>
          <h2 id="meet-more-heading">Meet another candidate</h2>
        </div>
        <div className="profile-meet-grid">
          {otherCandidates.map((other, index) => (
            <a
              className={`profile-meet-card profile-meet-card-${index + 1}`}
              data-profile-reveal
              href={`/candidates/${other.slug}`}
              key={other.slug}
            >
              <span>{other.initials}</span>
              <div>
                <strong>{other.name}</strong>
                <small>{other.constituency}</small>
              </div>
              <i aria-hidden="true">→</i>
            </a>
          ))}
        </div>
      </section> : null}
      </ProfileMotion>
      <Footer />
    </main>
  );
}
