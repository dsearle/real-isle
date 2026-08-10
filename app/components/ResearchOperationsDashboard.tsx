"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  CandidateRegistryStatus,
  EvidenceDashboard,
  EvidenceReviewItem,
  TranscriptQueueItem,
} from "../lib/evidence/status";
import styles from "./ResearchOperationsDashboard.module.css";

type WorkspaceTab = "overview" | "candidates" | "evidence" | "transcripts" | "sources";
type ReviewDecision = "approved" | "rejected";

type ReviewReceipt = {
  auditEventHash: string;
  auditSequence: number;
  candidateIds: string[];
  createdAt: string;
  decision: ReviewDecision;
  idempotent: boolean;
  publicationState: string;
  reviewKind: "candidate-assignment" | "source-version";
  reviewId: string;
  reviewState: string;
  versionId: string;
};

const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "candidates", label: "Candidates" },
  { id: "evidence", label: "Evidence inbox" },
  { id: "transcripts", label: "Transcripts" },
  { id: "sources", label: "Sources & runs" },
];

function formatTime(value: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Isle_of_Man",
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function readableState(value: string | null) {
  return (value ?? "not set").replaceAll("-", " ");
}

function shortHash(value: string | null) {
  return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "Not captured";
}

function StatePill({ state, tone = "neutral" }: { state: string; tone?: "good" | "neutral" | "warn" }) {
  return <span className={`${styles.statePill} ${styles[`statePill${tone}`]}`}>{readableState(state)}</span>;
}

function AdminPortrait({ candidate }: { candidate: CandidateRegistryStatus }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(candidate.portrait_remote_url)
    && candidate.portrait_rights_state !== "takedown"
    && !failed;
  return (
    <div className={styles.adminPortrait}>
      {showImage ? (
        // Private source preview only. Public cards use a separate rights-gated media route.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`${candidate.full_name} source portrait preview`}
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={candidate.portrait_remote_url ?? undefined}
        />
      ) : (
        <span>{initials(candidate.full_name)}</span>
      )}
      <small>Private source preview</small>
    </div>
  );
}

function CandidateCoverageCard({ candidate }: { candidate: CandidateRegistryStatus }) {
  const profileParsed = candidate.completeness_state === "profile-parsed";
  return (
    <article className={styles.candidateCoverageCard}>
      <AdminPortrait candidate={candidate} />
      <div className={styles.candidateCoverageBody}>
        <div className={styles.cardStateRow}>
          <StatePill state={candidate.completeness_state} tone={profileParsed ? "good" : "warn"} />
          <StatePill state={`profile ${candidate.review_state}`} tone={candidate.review_state === "approved" ? "good" : "warn"} />
          <StatePill state={`analysis ${candidate.intelligence_state}`} tone={candidate.intelligence_state === "approved" ? "good" : "neutral"} />
          <StatePill state={`photo ${candidate.portrait_rights_state ?? "not found"}`} />
        </div>
        <h3>{candidate.full_name}</h3>
        <p className={styles.constituencyLabel}>{candidate.constituency_name}</p>
        {candidate.biography_excerpt ? (
          <p className={styles.biographyExcerpt}>{candidate.biography_excerpt}</p>
        ) : (
          <p className={styles.biographyEmpty}>Profile text has not been parsed yet.</p>
        )}
        <dl className={styles.coverageMetrics}>
          <div><dt>Profile paragraphs</dt><dd>{candidate.biography_paragraph_count}</dd></div>
          <div><dt>Links / socials</dt><dd>{candidate.link_count} / {candidate.social_count}</dd></div>
          <div><dt>Documents</dt><dd>{candidate.document_count}</dd></div>
          <div><dt>Interviews</dt><dd>{candidate.interview_count}</dd></div>
          <div><dt>Manifestos</dt><dd>{candidate.manifesto_count}</dd></div>
          <div><dt>Transcript inputs</dt><dd>{candidate.transcript_source_count}</dd></div>
          <div><dt>Approved dossier sources</dt><dd>{candidate.dossier_evidence_count}</dd></div>
        </dl>
        <div className={styles.cardProvenance}>
          <span>Profile snapshot</span>
          <code>{shortHash(candidate.profile_snapshot_hash)}</code>
        </div>
        <div className={styles.cardFooter}>
          <span>Checked {formatTime(candidate.last_profile_checked_at)}</span>
          <div className={styles.cardFooterLinks}>
            <a href={`/candidates/${candidate.slug}`}>Open dossier →</a>
            <a href={candidate.profile_url} rel="noreferrer" target="_blank">Source ↗</a>
          </div>
        </div>
      </div>
    </article>
  );
}

function ReviewDecisionControls({
  candidateOptions,
  item,
  receipt,
  onDecided,
}: {
  candidateOptions: CandidateRegistryStatus[];
  item: EvidenceReviewItem;
  receipt?: ReviewReceipt;
  onDecided: (receipt: ReviewReceipt) => void;
}) {
  const panelId = useId();
  const approveButtonRef = useRef<HTMLButtonElement>(null);
  const assignmentRef = useRef<HTMLFieldSetElement>(null);
  const rejectButtonRef = useRef<HTMLButtonElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const rationaleRef = useRef<HTMLTextAreaElement>(null);
  const initialCandidateIds = useMemo(
    () => item.candidateAssociations.map((candidate) => candidate.candidacyId),
    [item.candidateAssociations],
  );
  const [assignmentOptionIds, setAssignmentOptionIds] = useState(initialCandidateIds);
  const [candidateIds, setCandidateIds] = useState(initialCandidateIds);
  const [candidateToAdd, setCandidateToAdd] = useState("");
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const actionable = Boolean(item.latest_version_id && item.content_hash);

  function openDecision(nextDecision: ReviewDecision) {
    setAssignmentOptionIds(initialCandidateIds);
    setCandidateIds(initialCandidateIds);
    setCandidateToAdd("");
    setDecision(nextDecision);
    setError(null);
    setRationale("");
    requestAnimationFrame(() => {
      if (nextDecision === "approved") assignmentRef.current?.focus();
      else rationaleRef.current?.focus();
    });
  }

  function cancelDecision() {
    const trigger = decision === "approved" ? approveButtonRef : rejectButtonRef;
    setDecision(null);
    setError(null);
    setRationale("");
    setAssignmentOptionIds(initialCandidateIds);
    setCandidateIds(initialCandidateIds);
    setCandidateToAdd("");
    requestAnimationFrame(() => trigger.current?.focus());
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision || !item.latest_version_id || !item.content_hash) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/evidence/review", {
        body: JSON.stringify({
          candidateSuggestionFingerprint: item.candidateSuggestionFingerprint,
          decision,
          expectedContentHash: item.content_hash,
          expectedVersionId: item.latest_version_id,
          itemId: item.id,
          rationale,
          reviewKind: item.association_review_only ? "candidate-assignment" : "source-version",
          candidateIds: decision === "approved" ? candidateIds : [],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string; receipt?: ReviewReceipt };
      if (!response.ok || !result.receipt) {
        throw new Error(result.error ?? "The review could not be recorded.");
      }
      setDecision(null);
      onDecided(result.receipt);
      requestAnimationFrame(() => receiptRef.current?.focus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The review could not be recorded.");
    } finally {
      setPending(false);
    }
  }

  if (receipt) {
    const assignmentOnly = receipt.reviewKind === "candidate-assignment";
    return (
      <div
        aria-live="polite"
        className={`${styles.decisionReceipt} ${
          receipt.decision === "approved"
            ? styles.decisionReceiptApproved
            : styles.decisionReceiptRejected
        }`}
        ref={receiptRef}
        tabIndex={-1}
      >
        <strong>{assignmentOnly
          ? receipt.decision === "approved" ? "Candidate filing confirmed" : "Candidate matches dismissed"
          : receipt.decision === "approved" ? "Approved" : "Rejected and withheld"}</strong>
        <span>{formatTime(receipt.createdAt)} · Audit #{receipt.auditSequence}</span>
        <code>{shortHash(receipt.auditEventHash)}</code>
        <small>{assignmentOnly
          ? "The source remains approved; this separate candidate-filing decision is immutable."
          : "The captured version and this decision remain in the audit record."}</small>
        {receipt.candidateIds.length ? (
          <small>Added to {receipt.candidateIds.length} private candidate dossier{receipt.candidateIds.length === 1 ? "" : "s"}.</small>
        ) : null}
      </div>
    );
  }

  if (!actionable) {
    return (
      <div className={styles.reviewDecisionUnavailable}>
        This record has no immutable version yet, so it cannot be reviewed safely.
      </div>
    );
  }

  return (
    <div className={styles.reviewDecision}>
      <div className={styles.reviewActionButtons}>
        <button
          aria-expanded={decision === "approved"}
          aria-controls={decision === "approved" ? panelId : undefined}
          className={styles.approveButton}
          disabled={pending}
          onClick={() => openDecision("approved")}
          ref={approveButtonRef}
          type="button"
        >
          {item.association_review_only ? "Confirm candidate filing" : "Approve"}
        </button>
        <button
          aria-expanded={decision === "rejected"}
          aria-controls={decision === "rejected" ? panelId : undefined}
          className={styles.rejectButton}
          disabled={pending}
          onClick={() => openDecision("rejected")}
          ref={rejectButtonRef}
          type="button"
        >
          {item.association_review_only ? "Dismiss candidate matches" : "Reject"}
        </button>
      </div>
      {decision ? (
        <form className={styles.decisionPanel} id={panelId} onSubmit={submitDecision}>
          <fieldset aria-busy={pending} disabled={pending}>
            <legend>
              {item.association_review_only
                ? decision === "approved" ? "Confirm this candidate filing?" : "Dismiss these candidate matches?"
                : decision === "approved" ? "Approve this captured version?" : "Reject this captured version?"}
            </legend>
            <p className={styles.decisionHelp}>
              {item.association_review_only
                ? decision === "approved"
                  ? "This source was approved before candidate filing was introduced. Confirm which dossiers should receive the immutable version; the source itself stays approved."
                  : "Record that the detected candidates should not receive this already-approved source. The source itself stays approved."
                : decision === "approved"
                ? "Approval freezes the selected candidate links and adds this version to their private research dossiers. It does not publish copied source text or a political claim."
                : "Rejection keeps the snapshot for audit, records your reason and withholds this item."}
            </p>
            {decision === "approved" ? (
              <fieldset className={styles.candidateAssignment} ref={assignmentRef} tabIndex={-1}>
                <legend>Candidate dossiers</legend>
                {assignmentOptionIds.length ? (
                  <div className={styles.candidateAssignmentList}>
                    {assignmentOptionIds.map((candidateId) => {
                      const candidate = candidateOptions.find((entry) => entry.candidacy_id === candidateId);
                      const detected = item.candidateAssociations.find((entry) => entry.candidacyId === candidateId);
                      return (
                        <label key={candidateId}>
                          <input
                            checked={candidateIds.includes(candidateId)}
                            onChange={(event) => setCandidateIds((current) => event.target.checked
                              ? current.includes(candidateId) ? current : [...current, candidateId]
                              : current.filter((id) => id !== candidateId))}
                            type="checkbox"
                          />
                          <span>{candidate?.full_name ?? candidateId}<small>{detected
                            ? `${candidate?.constituency_name ?? detected.constituencyName} · system suggestion via ${readableState(detected.matchMethod)} · “${detected.mentionText}”`
                            : `${candidate?.constituency_name ?? "Constituency unknown"} · reviewer added`}</small></span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p>No candidate is assigned. The item can still be approved for editorial use.</p>
                )}
                <label className={styles.candidateAddLabel}>
                  <span>Add another candidate</span>
                  <select
                    onChange={(event) => {
                      const candidateId = event.target.value;
                      if (candidateId) {
                        setAssignmentOptionIds((current) => current.includes(candidateId) ? current : [...current, candidateId]);
                        setCandidateIds((current) => current.includes(candidateId) ? current : [...current, candidateId]);
                      }
                      setCandidateToAdd("");
                    }}
                    value={candidateToAdd}
                  >
                    <option value="">Choose a candidate…</option>
                    {candidateOptions
                      .filter((candidate) => !assignmentOptionIds.includes(candidate.candidacy_id))
                      .map((candidate) => (
                        <option key={candidate.candidacy_id} value={candidate.candidacy_id}>
                          {candidate.full_name} · {candidate.constituency_name}
                        </option>
                      ))}
                  </select>
                </label>
                <small aria-live="polite">{candidateIds.length} candidate dossier{candidateIds.length === 1 ? "" : "s"} selected. Detected matches start selected; uncheck a false match or add a missed candidate.</small>
              </fieldset>
            ) : null}
            <label className={styles.decisionLabel}>
                <span>{decision === "approved" ? "Review note (optional)" : item.association_review_only ? "Reason for dismissing the matches" : "Reason for rejection"}</span>
              <textarea
                className={styles.rationaleInput}
                maxLength={500}
                minLength={decision === "rejected" ? 20 : undefined}
                onChange={(event) => setRationale(event.target.value)}
                placeholder={
                  decision === "approved"
                    ? "Add anything another reviewer should know"
                    : item.association_review_only
                      ? "Explain why the detected candidates should not receive this source"
                    : "Explain what is inaccurate, unsuitable or needs correction"
                }
                required={decision === "rejected"}
                ref={rationaleRef}
                value={rationale}
              />
            </label>
            <small className={styles.decisionCounter}>{rationale.length}/500</small>
            {error ? <p className={styles.decisionError} role="alert">{error}</p> : null}
            <div className={styles.confirmActions}>
              <button
                className={decision === "approved" ? styles.approveButton : styles.rejectButton}
                type="submit"
              >
                {pending
                  ? decision === "approved" ? item.association_review_only ? "Filing…" : "Approving…" : item.association_review_only ? "Dismissing…" : "Rejecting…"
                  : decision === "approved" ? item.association_review_only ? "Confirm candidate filing" : "Confirm approval" : item.association_review_only ? "Dismiss matches" : "Confirm rejection"}
              </button>
              <button className={styles.cancelButton} onClick={cancelDecision} type="button">Cancel</button>
            </div>
          </fieldset>
        </form>
      ) : null}
    </div>
  );
}

function EvidenceInboxCard({
  candidateOptions,
  item,
  receipt,
  onDecided,
}: {
  candidateOptions: CandidateRegistryStatus[];
  item: EvidenceReviewItem;
  receipt?: ReviewReceipt;
  onDecided: (receipt: ReviewReceipt) => void;
}) {
  return (
    <article className={styles.evidenceInboxCard}>
      <div className={styles.cardStateRow}>
        <StatePill state={item.item_type} />
        <StatePill
          state={receipt?.reviewKind === "source-version" ? receipt.reviewState : item.review_state}
          tone={(receipt?.reviewKind === "source-version" ? receipt.reviewState : item.review_state) === "approved" ? "good" : "warn"}
        />
        {item.association_review_only && !receipt ? <StatePill state="candidate filing pending" tone="warn" /> : null}
      </div>
      <p className={styles.inboxSource}>{item.source_name} · {formatTime(item.published_at ?? item.first_seen_at)}</p>
      <h3>{item.title}</h3>
      <p>{item.summary || "No publisher summary was supplied. Open the captured source record for inspection."}</p>
      <div className={styles.evidenceMeta}>
        <span>{item.candidateAssociations.length
          ? item.candidateAssociations.map((candidate) => candidate.fullName).join(", ")
          : "No candidate association detected"}</span>
        <code>{shortHash(item.content_hash)}</code>
      </div>
      <a href={item.canonical_url} rel="noreferrer" target="_blank">Inspect original source ↗</a>
      <ReviewDecisionControls candidateOptions={candidateOptions} item={item} onDecided={onDecided} receipt={receipt} />
    </article>
  );
}

function TranscriptCard({ item }: { item: TranscriptQueueItem }) {
  const permissionNeeded = item.access_state === "permission-required";
  const isPublisherTranscript = item.input_kind === "publisher-transcript";
  return (
    <article className={styles.transcriptCard}>
      <div className={styles.transcriptCardHeader}>
        <span className={styles.platformBadge}>{item.platform}</span>
        <StatePill state={item.processing_state} tone={item.processing_state === "failed" ? "warn" : "neutral"} />
      </div>
      <p>{item.constituency_name}</p>
      <h3>{item.candidate_name}</h3>
      <strong>{item.source_title}</strong>
      <div className={styles.transcriptRoute}>
        <span>{isPublisherTranscript ? "Publisher transcript" : "Interview media"}</span>
        <i aria-hidden="true">→</i>
        <span>{permissionNeeded ? "Access permission" : "Private capture"}</span>
        <i aria-hidden="true">→</i>
        <span>Human review</span>
      </div>
      <dl>
        <div><dt>Access</dt><dd>{readableState(item.access_state)}</dd></div>
        <div><dt>Rights</dt><dd>{readableState(item.rights_state)}</dd></div>
        <div><dt>Retention</dt><dd>{readableState(item.retention_outcome)}</dd></div>
        <div><dt>Attempts</dt><dd>{item.attempt_count}</dd></div>
      </dl>
      {permissionNeeded ? (
        <p className={styles.accessNote}>Caption text is not available through YouTube’s public metadata API. A supplied transcript or OAuth account with permission to edit the video is required. OAuth caption data remains private editorial input.</p>
      ) : (
        <p className={styles.accessNote}>A publisher-linked transcript may be captured only after a recorded processing basis, then hashed, parsed and presented for review before any excerpt is published.</p>
      )}
      {item.last_error ? <p className={styles.errorNote}>{item.last_error}</p> : null}
      <div className={styles.cardFooter}>
        <span>Found {formatTime(item.last_seen_at)}</span>
        <a href={item.source_url} rel="noreferrer" target="_blank">Open input ↗</a>
      </div>
    </article>
  );
}

function OverviewPanel({
  dashboard,
  decidedCount,
}: {
  dashboard: EvidenceDashboard;
  decidedCount: number;
}) {
  const unhealthySources = dashboard.sources.filter(
    (source) => source.consecutive_failures > 0 || source.last_error,
  );
  const permissionNeeded = dashboard.transcriptQueue.filter(
    (item) => item.access_state === "permission-required",
  ).length;
  return (
    <div className={styles.panelStack}>
      <section className={styles.operationsHero}>
        <div>
          <span>Live private research store</span>
          <h2>{dashboard.counts.sourceItems} source records, with every step visible.</h2>
          <p>This workspace shows discovered material before it reaches the public site. Collection is automatic; publication is not.</p>
        </div>
        <div className={styles.auditSeal}>
          <span>Audit chain</span>
          <strong>#{dashboard.auditSequence}</strong>
          <code>{shortHash(dashboard.auditHeadHash)}</code>
        </div>
      </section>

      <section className={styles.statGrid} aria-label="Research store summary">
        <div><strong>{dashboard.counts.candidates}</strong><span>candidate records</span><small>{dashboard.counts.parsedCandidateProfiles} profiles parsed</small></div>
        <div><strong>{dashboard.counts.snapshots}</strong><span>immutable captures</span><small>private R2 evidence</small></div>
        <div><strong>{dashboard.counts.candidatePortraits}</strong><span>portrait references</span><small>{dashboard.counts.publishableCandidatePortraits} cleared publicly</small></div>
        <div><strong>{dashboard.counts.candidateLinks}</strong><span>candidate links</span><small>social, contact and media</small></div>
        <div><strong>{dashboard.counts.candidateDocuments}</strong><span>documents found</span><small>manifestos and transcripts</small></div>
        <div><strong>{dashboard.counts.transcriptSources}</strong><span>transcript inputs</span><small>{dashboard.counts.transcriptsReadyForReview} ready to review</small></div>
        <div><strong>{Math.max(0, dashboard.counts.pendingEditorial - decidedCount)}</strong><span>records need review</span><small>founder decisions are audited</small></div>
        <div><strong>{dashboard.counts.claims}</strong><span>claim proposals</span><small>none published by automation</small></div>
      </section>

      <section className={styles.pipelineSection}>
        <div className={styles.sectionTitle}>
          <div><span>System model</span><h2>From discovery to defensible public record</h2></div>
          <small>Each hand-off keeps its source hash, method and state.</small>
        </div>
        <ol className={styles.pipelineRail}>
          <li><b>01</b><strong>Monitor</strong><span>{dashboard.counts.sources} approved sources</span></li>
          <li><b>02</b><strong>Capture</strong><span>{dashboard.counts.snapshots} immutable snapshots</span></li>
          <li><b>03</b><strong>Resolve</strong><span>{dashboard.counts.candidates} candidate identities</span></li>
          <li><b>04</b><strong>Transcribe</strong><span>{dashboard.counts.transcriptSources} inputs discovered</span></li>
          <li><b>05</b><strong>Extract</strong><span>private claim proposals</span></li>
          <li><b>06</b><strong>Review</strong><span>authenticated, versioned decisions</span></li>
          <li><b>07</b><strong>Publish</strong><span>source-linked revisions</span></li>
        </ol>
      </section>

      <div className={styles.overviewColumns}>
        <section className={styles.attentionPanel}>
          <div className={styles.sectionTitle}><div><span>Needs attention</span><h2>What the system cannot decide alone</h2></div></div>
          <ul>
            <li><strong>{dashboard.counts.pendingCandidateReview}</strong><span>candidate profiles need identity/editorial review</span></li>
            <li><strong>{dashboard.counts.candidatePortraits - dashboard.counts.publishableCandidatePortraits}</strong><span>portrait references need a documented reuse basis</span></li>
            <li><strong>{permissionNeeded}</strong><span>interview sources need caption or media access permission</span></li>
            <li><strong>{unhealthySources.length}</strong><span>sources currently report a failure or warning</span></li>
          </ul>
        </section>
        <section className={styles.recentRunsPanel}>
          <div className={styles.sectionTitle}><div><span>Latest activity</span><h2>Collector runs</h2></div></div>
          <div className={styles.miniRunList}>
            {dashboard.recentRuns.slice(0, 6).map((run) => (
              <article key={run.id}>
                <i className={run.error_count ? styles.runWarning : styles.runHealthy} aria-hidden="true" />
                <div><strong>{run.source_name}</strong><span>{formatTime(run.started_at)}</span></div>
                <small>{run.new_item_count} new · {run.changed_item_count} changed · {run.error_count} errors</small>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function CandidatesPanel({ dashboard }: { dashboard: EvidenceDashboard }) {
  const [query, setQuery] = useState("");
  const [constituency, setConstituency] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const constituencies = useMemo(
    () => [...new Set(dashboard.candidateProfiles.map((candidate) => candidate.constituency_name))].sort(),
    [dashboard.candidateProfiles],
  );
  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return dashboard.candidateProfiles.filter((candidate) => {
      if (normalizedQuery && !candidate.full_name.toLowerCase().includes(normalizedQuery)) return false;
      if (constituency !== "all" && candidate.constituency_name !== constituency) return false;
      if (coverage === "parsed" && candidate.completeness_state !== "profile-parsed") return false;
      if (coverage === "directory" && candidate.completeness_state !== "directory-only") return false;
      if (coverage === "transcript" && candidate.transcript_source_count === 0) return false;
      if (coverage === "manifesto" && candidate.manifesto_count === 0) return false;
      return true;
    });
  }, [constituency, coverage, dashboard.candidateProfiles, query]);

  return (
    <div className={styles.panelStack}>
      <section className={styles.panelIntro}>
        <div><span>Candidate registry</span><h2>See what has been found—and what is still missing.</h2></div>
        <p>Portraits on this screen are private source previews. A public player card only receives an image after permission or a reusable licence is recorded.</p>
      </section>
      <div className={styles.filterBar}>
        <label><span>Search candidate</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a name" type="search" value={query} /></label>
        <label><span>Constituency</span><select onChange={(event) => setConstituency(event.target.value)} value={constituency}><option value="all">All constituencies</option>{constituencies.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label><span>Coverage</span><select onChange={(event) => setCoverage(event.target.value)} value={coverage}><option value="all">All records</option><option value="parsed">Profile parsed</option><option value="directory">Directory only</option><option value="transcript">Transcript found</option><option value="manifesto">Manifesto found</option></select></label>
        <strong>{candidates.length} shown</strong>
      </div>
      <div className={styles.candidateCoverageGrid}>
        {candidates.map((candidate) => <CandidateCoverageCard candidate={candidate} key={candidate.candidacy_id} />)}
      </div>
    </div>
  );
}

function EvidencePanel({
  dashboard,
  receipts,
  onDecided,
}: {
  dashboard: EvidenceDashboard;
  receipts: Record<string, ReviewReceipt>;
  onDecided: (receipt: ReviewReceipt) => void;
}) {
  return (
    <div className={styles.panelStack}>
      <section className={styles.panelIntro}>
        <div><span>Unreviewed source stream</span><h2>The latest material waiting for a human decision.</h2></div>
        <p>These records are private. The source URL, capture pointer and content hash remain attached even if the publisher later changes or removes the page.</p>
      </section>
      {dashboard.reviewItems.length ? (
        <div className={styles.evidenceInboxGrid}>{dashboard.reviewItems.map((item) => (
          <EvidenceInboxCard
            candidateOptions={dashboard.candidateProfiles}
            item={item}
            key={item.id}
            onDecided={onDecided}
            receipt={item.latest_version_id ? receipts[item.latest_version_id] : undefined}
          />
        ))}</div>
      ) : (
        <div className={styles.emptyState}><strong>The evidence inbox is clear.</strong><span>New source records will appear after the next successful monitor run.</span></div>
      )}
    </div>
  );
}

function TranscriptsPanel({ dashboard }: { dashboard: EvidenceDashboard }) {
  return (
    <div className={styles.panelStack}>
      <section className={styles.panelIntro}>
        <div><span>Interview intelligence</span><h2>Transcripts become evidence one timestamp at a time.</h2></div>
        <p>The live collector currently discovers publisher transcripts and interview media; processing remains disabled until a rights decision is recorded. YouTube captions require an OAuth account with permission to edit the video and remain private editorial input—the system will never scrape the player or use undocumented downloads.</p>
      </section>
      <section className={styles.transcriptModel}>
        <article><b>1</b><strong>Input</strong><span>DOCX, caption track, permitted audio or candidate upload</span></article>
        <article><b>2</b><strong>Job</strong><span>Access, rights, attempts, processor version and errors</span></article>
        <article><b>3</b><strong>Transcript</strong><span>Immutable content hash and private R2 artefact</span></article>
        <article><b>4</b><strong>Segments</strong><span>Speaker, start/end time, confidence and exact text hash</span></article>
        <article><b>5</b><strong>Claim proposal</strong><span>Topic classification plus a segment-level evidence link</span></article>
      </section>
      {dashboard.transcriptQueue.length ? (
        <div className={styles.transcriptGrid}>{dashboard.transcriptQueue.map((item) => <TranscriptCard item={item} key={item.id} />)}</div>
      ) : (
        <div className={styles.emptyState}><strong>No transcript input has been discovered yet.</strong><span>Candidate profile documents, YouTube embeds and podcast transcript links will appear here.</span></div>
      )}
    </div>
  );
}

function SourcesPanel({ dashboard }: { dashboard: EvidenceDashboard }) {
  return (
    <div className={styles.panelStack}>
      <section className={styles.panelIntro}>
        <div><span>Collection operations</span><h2>Every source, cadence and failure in one place.</h2></div>
        <p>Sources are exact-host allowlisted, response-limited and independently leased. One failing publisher cannot silently become “no news.”</p>
      </section>
      <div className={styles.sourceTableWrap}>
        <table className={styles.sourceTable}>
          <thead><tr><th>Source</th><th>Type / tier</th><th>Last success</th><th>Next check</th><th>Health</th></tr></thead>
          <tbody>{dashboard.sources.map((source) => {
            const warning = source.consecutive_failures > 0 || source.last_error;
            return <tr key={source.id}><td><strong>{source.name}</strong><small>Every {source.poll_interval_minutes} minutes</small></td><td>{source.feed_type}<small>Tier {source.source_tier}</small></td><td>{formatTime(source.last_success_at)}</td><td>{formatTime(source.next_check_at)}</td><td><span className={warning ? styles.healthWarning : styles.healthGood}>{warning ? `Warning · ${source.consecutive_failures} failures` : "Healthy"}</span>{source.last_error ? <small title={source.last_error}>{source.last_error}</small> : null}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <section className={styles.fullRunList}>
        <div className={styles.sectionTitle}><div><span>Run history</span><h2>Recent ingestion results</h2></div></div>
        {dashboard.recentRuns.map((run) => (
          <article key={run.id}>
            <div><i className={run.error_count ? styles.runWarning : styles.runHealthy} aria-hidden="true" /><strong>{run.source_name}</strong><span>{readableState(run.status)}</span></div>
            <dl><div><dt>Discovered</dt><dd>{run.discovered_count}</dd></div><div><dt>Processed</dt><dd>{run.processed_item_count}</dd></div><div><dt>New</dt><dd>{run.new_item_count}</dd></div><div><dt>Changed</dt><dd>{run.changed_item_count}</dd></div><div><dt>Errors</dt><dd>{run.error_count}</dd></div></dl>
            <time>{formatTime(run.started_at)}</time>
            {run.error_summary ? <p>{run.error_summary}</p> : null}
          </article>
        ))}
      </section>
    </div>
  );
}

export function ResearchOperationsDashboard({
  dashboard,
  reviewerName,
}: {
  dashboard: EvidenceDashboard | null;
  reviewerName: string;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [reviewReceipts, setReviewReceipts] = useState<Record<string, ReviewReceipt>>({});
  const decidedCount = Object.keys(reviewReceipts).length;
  if (!dashboard) {
    return <section className={styles.unavailable}><span>Evidence store</span><h2>The research database is not available in this runtime.</h2><p>No unpublished records have been exposed. Apply the current D1 migrations and retry.</p></section>;
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div><span>Founder workspace · private</span><h1>Research operations</h1><p>See what the collectors found, how complete each record is, and what needs your judgement before publication.</p></div>
        <div className={styles.reviewerIdentity}><span>{initials(reviewerName)}</span><div><strong>{reviewerName}</strong><small>Founder reviewer</small></div></div>
      </header>
      <nav aria-label="Research workspace sections" className={styles.tabBar}>
        {workspaceTabs.map((tab) => (
          <button
            aria-pressed={activeTab === tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
            {tab.id === "evidence" ? <b>{Math.max(0, dashboard.counts.pendingReview - decidedCount)}</b> : null}
            {tab.id === "transcripts" ? <b>{dashboard.counts.transcriptSources}</b> : null}
          </button>
        ))}
      </nav>
      <div aria-label={`${workspaceTabs.find((tab) => tab.id === activeTab)?.label} workspace`} role="region">
        {activeTab === "overview" ? <OverviewPanel dashboard={dashboard} decidedCount={decidedCount} /> : null}
        {activeTab === "candidates" ? <CandidatesPanel dashboard={dashboard} /> : null}
        {activeTab === "evidence" ? (
          <EvidencePanel
            dashboard={dashboard}
            onDecided={(receipt) => setReviewReceipts((current) => ({
              ...current,
              [receipt.versionId]: receipt,
            }))}
            receipts={reviewReceipts}
          />
        ) : null}
        {activeTab === "transcripts" ? <TranscriptsPanel dashboard={dashboard} /> : null}
        {activeTab === "sources" ? <SourcesPanel dashboard={dashboard} /> : null}
      </div>
    </div>
  );
}
