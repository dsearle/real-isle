"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  CandidateRegistryStatus,
  EvidenceDashboard,
  EvidenceReviewItem,
  EvidenceRoutingOption,
  TranscriptQueueItem,
} from "../lib/evidence/status";
import type { CollectionRoute, CollectionSignal } from "../lib/evidence/collection-reason";
import type {
  MachineAnalysisDashboardView,
  MachineAnalysisReviewAction,
  MachineAnalysisReviewReceiptView,
} from "../lib/evidence/machine-analysis-view";
import { MachineAnalysisPanel } from "./MachineAnalysisPanel";
import styles from "./ResearchOperationsDashboard.module.css";

type WorkspaceTab = "overview" | "candidates" | "evidence" | "analysis" | "transcripts" | "sources";
type ReviewDecision = "approved" | "rejected";
type EditorialState = "pending" | "approved" | "rejected";

const EVIDENCE_PAGE_SIZE = 18;

type ReviewReceipt = {
  auditEventHash: string;
  auditSequence: number;
  candidateIds: string[];
  constituencyIds: string[];
  createdAt: string;
  decision: ReviewDecision;
  idempotent: boolean;
  publicationState: string;
  reviewKind: "candidate-assignment" | "source-version";
  reviewId: string;
  reviewState: string;
  supersedesReviewId: string | null;
  topicIds: string[];
  versionId: string;
};

type ReviewReceipts = Record<string, ReviewReceipt>;

type CandidateProfileReviewReceipt = {
  auditEventHash: string;
  auditSequence: number;
  basisHash: string;
  candidacyId: string;
  createdAt: string;
  decision: ReviewDecision;
  idempotent: boolean;
  publicationState: "published" | "withheld";
  reviewId: string;
  reviewState: ReviewDecision;
  supersedesReviewId: string | null;
};

type CandidateProfileReviewReceipts = Record<string, CandidateProfileReviewReceipt>;

type CollectionPreparationReceipt = {
  auditEventHash: string;
  auditSequence: number;
  collectionReasonHash: string;
  collectionRoute: CollectionRoute;
  collectionRuleset: string;
  contentHash: string;
  createdAt: string;
  idempotent: boolean;
  itemId: string;
  versionId: string;
};

function reviewReceiptKey(versionId: string, reviewKind: ReviewReceipt["reviewKind"]) {
  return `${versionId}:${reviewKind}`;
}

const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "candidates", label: "Candidates" },
  { id: "evidence", label: "Evidence library" },
  { id: "analysis", label: "Machine analysis" },
  { id: "transcripts", label: "Transcripts" },
  { id: "sources", label: "Sources & runs" },
];

const collectionRoutes: Array<{
  description: string;
  id: CollectionRoute;
  label: string;
}> = [
  {
    description: "Candidate, dedicated election-source or election-language matches",
    id: "evidence-review",
    label: "Election leads",
  },
  {
    description: "Tracked topics or constituencies without a direct election signal",
    id: "context-monitoring",
    label: "Context monitor",
  },
  {
    description: "Retained source captures with no current relevance match",
    id: "broad-monitoring",
    label: "Broad captures",
  },
];

const editorialStates: Array<{
  description: string;
  id: EditorialState;
  label: string;
}> = [
  {
    description: "Awaiting your first editorial decision",
    id: "pending",
    label: "Needs review",
  },
  {
    description: "Current public citation record",
    id: "approved",
    label: "Approved",
  },
  {
    description: "Withheld but retained for reconsideration",
    id: "rejected",
    label: "Rejected",
  },
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

function readableCollectorMessage(value: string) {
  if (value.includes("observations.snapshot_id")) {
    return "The candidate-directory version lookup was incompatible with SQLite in this run.";
  }
  if (value.includes("ON CONFLICT clause does not match")) {
    return "An older storage-index mismatch prevented records from being processed in this run.";
  }
  if (/timed? out|timeout/i.test(value)) {
    return "The publisher did not respond before the collector deadline.";
  }
  if (/not a supported RSS|feed contains no/i.test(value)) {
    return "The publisher response was not a usable feed.";
  }
  return value.replace(/^D1_ERROR:\s*/i, "Database operation failed: ").slice(0, 220);
}

function summarizeCollectorError(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return readableCollectorMessage(value);
    const entries = parsed.filter((entry): entry is Record<string, unknown> => (
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    ));
    const firstMessage = entries.find((entry) => typeof entry.message === "string")?.message;
    const stages = [...new Set(entries
      .map((entry) => typeof entry.stage === "string" ? readableState(entry.stage) : null)
      .filter((stage): stage is string => Boolean(stage)))];
    const stageText = stages.length ? ` during ${stages.join(", ")}` : "";
    return `${entries.length} record${entries.length === 1 ? "" : "s"} failed${stageText}. ${
      typeof firstMessage === "string" ? readableCollectorMessage(firstMessage) : "See the technical audit detail."
    }`;
  } catch {
    return readableCollectorMessage(value);
  }
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

function candidateProfileState(
  candidate: CandidateRegistryStatus,
  receipt?: CandidateProfileReviewReceipt,
): EditorialState {
  if (receipt) return receipt.decision;
  return candidate.current_profile_review_decision ?? "pending";
}

function safeHttpsUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function CandidateProfileDecisionControls({ candidate, onDecided, receipt }: {
  candidate: CandidateRegistryStatus;
  onDecided: (receipt: CandidateProfileReviewReceipt) => void;
  receipt?: CandidateProfileReviewReceipt;
}) {
  const panelId = useId();
  const rationaleRef = useRef<HTMLTextAreaElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const currentDecision = receipt?.decision ?? candidate.current_profile_review_decision;
  const currentReviewId = receipt?.reviewId ?? candidate.current_profile_review_id;
  const decisionCount = candidate.profile_decision_count + (receipt && !receipt.idempotent ? 1 : 0);
  const sourceUrl = safeHttpsUrl(candidate.identity_source_url);
  const actionable = Boolean(
    candidate.current_basis_hash
    && candidate.directory_version_id
    && candidate.directory_payload_hash
    && sourceUrl,
  );

  useEffect(() => {
    if (decision) requestAnimationFrame(() => rationaleRef.current?.focus());
  }, [decision]);

  useEffect(() => {
    if (receipt) requestAnimationFrame(() => receiptRef.current?.focus());
  }, [receipt]);

  function openDecision(nextDecision: ReviewDecision, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setDecision(nextDecision);
    setRationale("");
    setError(null);
  }

  function cancelDecision() {
    setDecision(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision || !candidate.current_basis_hash) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/candidate-profiles/review", {
        body: JSON.stringify({
          candidacyId: candidate.candidacy_id,
          decision,
          expectedBasisHash: candidate.current_basis_hash,
          expectedPreviousReviewId: currentReviewId,
          rationale,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        error?: string;
        receipt?: CandidateProfileReviewReceipt;
      };
      if (!response.ok || !result.receipt) {
        throw new Error(result.error ?? "The identity decision could not be recorded.");
      }
      setDecision(null);
      onDecided(result.receipt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The identity decision could not be recorded.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.profileReviewDecision} aria-label="Candidate identity decision">
      <div className={styles.identityBasis}>
        <div><span>Name</span><strong>{candidate.full_name}</strong></div>
        <div><span>Election area</span><strong>{candidate.constituency_name}</strong></div>
        <div><span>Affiliation</span><strong>{candidate.affiliation}</strong></div>
        <div><span>Declaration</span><strong>{readableState(candidate.declaration_status)}</strong></div>
        <div><span>Directory area</span><strong>{candidate.observed_constituency_name}</strong></div>
        <div><span>Identity basis</span><code>{shortHash(candidate.current_basis_hash)}</code></div>
        <div><span>Directory version</span><code>{shortHash(candidate.directory_version_id)}</code></div>
        <div><span>Directory payload</span><code>{shortHash(candidate.directory_payload_hash)}</code></div>
      </div>
      {sourceUrl ? <a href={sourceUrl} rel="noreferrer" target="_blank">Open reviewed identity source page ↗</a> : null}
      <p className={styles.profileReviewScope}>Approval publishes only this name, area, affiliation, declaration status and profile route. Biography, contacts, social links, documents, claims and portraits remain private until their own review.</p>
      {currentDecision ? (
        <div
          aria-live="polite"
          className={`${styles.currentDecision} ${currentDecision === "approved" ? styles.currentDecisionApproved : styles.currentDecisionRejected}`}
          ref={receiptRef}
          tabIndex={-1}
        >
          <div><strong>{currentDecision === "approved" ? "Identity shell approved" : "Identity shell rejected"}</strong><span>{formatTime(receipt?.createdAt ?? candidate.current_profile_review_created_at)}</span></div>
          <p>{receipt ? "A new audited identity decision was recorded in this session." : candidate.current_profile_review_rationale ?? "The current identity decision is preserved in the audit history."}</p>
          <small>{decisionCount} identity decision{decisionCount === 1 ? "" : "s"} recorded · later decisions supersede rather than erase.</small>
          {receipt ? <code>Audit #{receipt.auditSequence} · {shortHash(receipt.auditEventHash)}</code> : null}
        </div>
      ) : null}
      {!actionable ? (
        <div className={styles.reviewDecisionUnavailable}>A fresh, internally consistent directory identity basis is required before this profile can be reviewed.</div>
      ) : (
        <>
          <div className={styles.reviewActionButtons}>
            {currentDecision !== "approved" ? <button aria-controls={decision === "approved" ? panelId : undefined} aria-expanded={decision === "approved"} className={styles.approveButton} disabled={pending} onClick={(event) => openDecision("approved", event.currentTarget)} type="button">{currentDecision === "rejected" ? "Restore to approved" : "Approve identity"}</button> : null}
            {currentDecision !== "rejected" ? <button aria-controls={decision === "rejected" ? panelId : undefined} aria-expanded={decision === "rejected"} className={styles.rejectButton} disabled={pending} onClick={(event) => openDecision("rejected", event.currentTarget)} type="button">{currentDecision === "approved" ? "Move to rejected" : "Reject identity"}</button> : null}
          </div>
          {decision ? (
            <form className={styles.decisionPanel} id={panelId} onSubmit={submitDecision}>
              <fieldset aria-busy={pending} disabled={pending}>
                <legend>{decision === "approved" ? "Approve this exact identity basis?" : "Reject this exact identity basis?"}</legend>
                <p className={styles.decisionHelp}>{decision === "approved" ? "Only the public identity shell listed above will be released. This is not approval of the candidate’s biography, media, manifesto or political positions." : "The profile will be withheld from public candidate surfaces. Its source observations and all decisions remain auditable."}</p>
                <label className={styles.decisionLabel}><span>{decision === "approved" ? "Review note (optional)" : "Reason for rejection"}</span><textarea className={styles.rationaleInput} maxLength={500} minLength={decision === "rejected" ? 20 : undefined} onChange={(event) => setRationale(event.target.value)} ref={rationaleRef} required={decision === "rejected"} value={rationale} /></label>
                <small className={styles.decisionCounter}>{rationale.length}/500</small>
                {error ? <p className={styles.decisionError} role="alert">{error}</p> : null}
                <div className={styles.confirmActions}><button className={decision === "approved" ? styles.approveButton : styles.rejectButton} type="submit">{pending ? "Recording…" : decision === "approved" ? "Confirm identity approval" : "Confirm identity rejection"}</button><button className={styles.cancelButton} onClick={cancelDecision} type="button">Cancel</button></div>
              </fieldset>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}

function CandidateCoverageCard({ candidate, onDecided, receipt }: {
  candidate: CandidateRegistryStatus;
  onDecided: (receipt: CandidateProfileReviewReceipt) => void;
  receipt?: CandidateProfileReviewReceipt;
}) {
  const profileParsed = candidate.completeness_state === "profile-parsed";
  const effectiveState = candidateProfileState(candidate, receipt);
  return (
    <article className={styles.candidateCoverageCard}>
      <AdminPortrait candidate={candidate} />
      <div className={styles.candidateCoverageBody}>
        <div className={styles.cardStateRow}>
          <StatePill state={candidate.completeness_state} tone={profileParsed ? "good" : "warn"} />
          <StatePill state={`identity ${effectiveState}`} tone={effectiveState === "approved" ? "good" : "warn"} />
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
        <CandidateProfileDecisionControls candidate={candidate} onDecided={onDecided} receipt={receipt} />
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

function CandidateRoutingFieldset({
  candidateIds,
  candidateOptions,
  item,
  optionIds,
  setCandidateIds,
  setOptionIds,
}: {
  candidateIds: string[];
  candidateOptions: CandidateRegistryStatus[];
  item: EvidenceReviewItem;
  optionIds: string[];
  setCandidateIds: (value: string[] | ((current: string[]) => string[])) => void;
  setOptionIds: (value: string[] | ((current: string[]) => string[])) => void;
}) {
  return (
    <fieldset className={styles.candidateAssignment}>
      <legend>Candidate dossiers</legend>
      {optionIds.length ? (
        <div className={styles.candidateAssignmentList}>
          {optionIds.map((candidateId) => {
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
      ) : <p>No candidate is assigned. The item can still be approved for editorial use.</p>}
      <label className={styles.candidateAddLabel}>
        <span>Add another candidate</span>
        <select
          onChange={(event) => {
            const candidateId = event.target.value;
            if (candidateId) {
              setOptionIds((current) => current.includes(candidateId) ? current : [...current, candidateId]);
              setCandidateIds((current) => current.includes(candidateId) ? current : [...current, candidateId]);
            }
            event.currentTarget.value = "";
          }}
          value=""
        >
          <option value="">Choose a candidate…</option>
          {candidateOptions
            .filter((candidate) => !optionIds.includes(candidate.candidacy_id))
            .map((candidate) => (
              <option key={candidate.candidacy_id} value={candidate.candidacy_id}>
                {candidate.full_name} · {candidate.constituency_name}
              </option>
            ))}
        </select>
      </label>
      <small aria-live="polite">{candidateIds.length} candidate dossier{candidateIds.length === 1 ? "" : "s"} selected. Uncheck a false match or add a missed candidate.</small>
    </fieldset>
  );
}

function ScopeRoutingFieldset({
  constituencyIds,
  constituencyOptions,
  item,
  setConstituencyIds,
  setTopicIds,
  topicIds,
  topicOptions,
}: {
  constituencyIds: string[];
  constituencyOptions: EvidenceRoutingOption[];
  item: EvidenceReviewItem;
  setConstituencyIds: (value: string[] | ((current: string[]) => string[])) => void;
  setTopicIds: (value: string[] | ((current: string[]) => string[])) => void;
  topicIds: string[];
  topicOptions: EvidenceRoutingOption[];
}) {
  const detectedSuggestions = [
    ...item.topicAssociations.map((signal) => ({ kind: "Topic" as const, signal })),
    ...item.constituencyAssociations.map((signal) => ({ kind: "Constituency" as const, signal })),
  ];
  const detectedKeys = new Set(detectedSuggestions.map(({ kind, signal }) => `${kind}:${signal.id}`));
  const reviewerAdded = [
    ...topicIds.flatMap((id) => {
      if (detectedKeys.has(`Topic:${id}`)) return [];
      const option = topicOptions.find((entry) => entry.id === id);
      return option ? [{
        kind: "Topic" as const,
        signal: {
          confidence: 1,
          id: option.id,
          label: option.label,
          matchMethod: "reviewer-added-v1",
          mentionText: option.label,
        },
      }] : [];
    }),
    ...constituencyIds.flatMap((id) => {
      if (detectedKeys.has(`Constituency:${id}`)) return [];
      const option = constituencyOptions.find((entry) => entry.id === id);
      return option ? [{
        kind: "Constituency" as const,
        signal: {
          confidence: 1,
          id: option.id,
          label: option.label,
          matchMethod: "reviewer-added-v1",
          mentionText: option.label,
        },
      }] : [];
    }),
  ];
  const displayedRoutes = [...detectedSuggestions, ...reviewerAdded];
  return (
    <fieldset className={styles.scopeAssignment}>
      <legend>Topic and constituency sections</legend>
      {displayedRoutes.length ? (
        <div className={styles.scopeAssignmentList}>
          {displayedRoutes.map(({ kind, signal }) => {
            const selectedIds = kind === "Topic" ? topicIds : constituencyIds;
            const setter = kind === "Topic" ? setTopicIds : setConstituencyIds;
            return (
              <label key={`${kind}:${signal.id}`}>
                <input
                  checked={selectedIds.includes(signal.id)}
                  onChange={(event) => setter((current) => event.target.checked
                    ? current.includes(signal.id) ? current : [...current, signal.id]
                    : current.filter((id) => id !== signal.id))}
                  type="checkbox"
                />
                <span>{kind}: {signal.label}<small>{signal.matchMethod === "reviewer-added-v1"
                  ? "Added by reviewer"
                  : `Suggested via ${readableState(signal.matchMethod)} · “${signal.mentionText}”`}</small></span>
              </label>
            );
          })}
        </div>
      ) : <p>No topic or constituency route was suggested for this source.</p>}
      <div className={styles.scopeAddControls}>
        <label>
          <span>Add a policy topic</span>
          <select
            onChange={(event) => {
              const id = event.currentTarget.value;
              if (id) setTopicIds((current) => current.includes(id) ? current : [...current, id]);
              event.currentTarget.value = "";
            }}
            value=""
          >
            <option value="">Choose a topic…</option>
            {topicOptions.filter((option) => !topicIds.includes(option.id)).map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Add a constituency</span>
          <select
            onChange={(event) => {
              const id = event.currentTarget.value;
              if (id) setConstituencyIds((current) => current.includes(id) ? current : [...current, id]);
              event.currentTarget.value = "";
            }}
            value=""
          >
            <option value="">Choose a constituency…</option>
            {constituencyOptions.filter((option) => !constituencyIds.includes(option.id)).map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <small aria-live="polite">Unchecked suggestions are frozen as rejected for this decision and do not reach the public evidence projection.</small>
    </fieldset>
  );
}

function CandidateAssignmentControls({
  candidateOptions,
  item,
  lastApprovedReceipt,
  onDecided,
  receipt,
}: {
  candidateOptions: CandidateRegistryStatus[];
  item: EvidenceReviewItem;
  lastApprovedReceipt?: ReviewReceipt;
  onDecided: (receipt: ReviewReceipt) => void;
  receipt?: ReviewReceipt;
}) {
  const router = useRouter();
  const panelId = useId();
  const decisionFieldsetRef = useRef<HTMLFieldSetElement>(null);
  const rationaleRef = useRef<HTMLTextAreaElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const initialCandidateIds = useMemo(
    () => (receipt?.decision ?? item.currentAssignmentDecision?.decision) === "rejected"
      ? lastApprovedReceipt?.candidateIds ?? item.lastApprovedAssignmentCandidateIds
      : item.candidateAssociations.map((candidate) => candidate.candidacyId),
    [item.candidateAssociations, item.currentAssignmentDecision?.decision, item.lastApprovedAssignmentCandidateIds, lastApprovedReceipt?.candidateIds, receipt?.decision],
  );
  const [optionIds, setOptionIds] = useState(initialCandidateIds);
  const [candidateIds, setCandidateIds] = useState(initialCandidateIds);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const currentDecision = receipt?.decision ?? item.currentAssignmentDecision?.decision ?? null;
  const currentReviewId = receipt?.reviewId ?? item.currentAssignmentDecision?.id ?? null;
  const decisionCount = item.assignmentDecisionCount + (receipt && !receipt.idempotent ? 1 : 0);

  useEffect(() => {
    if (decision) {
      if (decision === "approved") decisionFieldsetRef.current?.focus();
      else rationaleRef.current?.focus();
    }
  }, [decision]);

  useEffect(() => {
    if (receipt) requestAnimationFrame(() => receiptRef.current?.focus());
  }, [receipt]);

  function openDecision(nextDecision: ReviewDecision, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setOptionIds(initialCandidateIds);
    setCandidateIds(initialCandidateIds);
    setDecision(nextDecision);
    setRationale("");
    setError(null);
  }

  function cancelDecision() {
    setDecision(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision || !item.latest_version_id || !item.content_hash || !item.collectionReasonHash) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/evidence/review", {
        body: JSON.stringify({
          candidateIds: decision === "approved" ? candidateIds : [],
          candidateSuggestionFingerprint: item.candidateSuggestionFingerprint,
          constituencyIds: [],
          decision,
          expectedCollectionReasonHash: item.collectionReasonHash,
          expectedCollectionRuleset: item.collectionReasonRuleset,
          expectedContentHash: item.content_hash,
          expectedPreviousReviewId: currentReviewId,
          expectedVersionId: item.latest_version_id,
          itemId: item.id,
          rationale,
          reviewKind: "candidate-assignment",
          scopeSuggestionFingerprint: item.collectionScopeSuggestionFingerprint,
          topicIds: [],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string; receipt?: ReviewReceipt };
      if (!response.ok || !result.receipt) throw new Error(result.error ?? "The filing decision could not be recorded.");
      setDecision(null);
      onDecided(result.receipt);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The filing decision could not be recorded.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.assignmentDecision} aria-label="Candidate filing decision">
      <div className={styles.assignmentDecisionHeading}>
        <strong>Candidate filing</strong>
        <span>{currentDecision ? `Currently ${currentDecision}` : "Needs a decision"}</span>
      </div>
      {currentDecision ? (
        <div aria-live="polite" className={`${styles.currentDecision} ${currentDecision === "approved" ? styles.currentDecisionApproved : styles.currentDecisionRejected}`} ref={receiptRef} tabIndex={-1}>
          <div><strong>{currentDecision === "approved" ? "Candidate routes confirmed" : "Candidate routes dismissed"}</strong><span>{formatTime(receipt?.createdAt ?? item.currentAssignmentDecision?.createdAt ?? null)}</span></div>
          <p>{receipt ? "A new audited filing decision was recorded in this session." : item.currentAssignmentDecision?.rationale}</p>
          <small>{decisionCount} filing decision{decisionCount === 1 ? "" : "s"} recorded · the source approval is unchanged.</small>
          {receipt ? <code>Audit #{receipt.auditSequence} · {shortHash(receipt.auditEventHash)}</code> : null}
        </div>
      ) : null}
      <div className={styles.reviewActionButtons}>
        {currentDecision !== "approved" ? <button aria-controls={decision === "approved" ? panelId : undefined} aria-expanded={decision === "approved"} className={styles.approveButton} disabled={pending} onClick={(event) => openDecision("approved", event.currentTarget)} type="button">{currentDecision === "rejected" ? "Restore candidate routes" : "Confirm candidate filing"}</button> : null}
        {currentDecision !== "rejected" ? <button aria-controls={decision === "rejected" ? panelId : undefined} aria-expanded={decision === "rejected"} className={styles.rejectButton} disabled={pending} onClick={(event) => openDecision("rejected", event.currentTarget)} type="button">{currentDecision === "approved" ? "Dismiss candidate routes" : "Dismiss candidate matches"}</button> : null}
      </div>
      {decision ? (
        <form className={styles.decisionPanel} id={panelId} onSubmit={submitDecision}>
          <fieldset aria-busy={pending} disabled={pending} ref={decisionFieldsetRef} tabIndex={-1}>
            <legend>{decision === "approved" ? "Confirm candidate routes?" : "Dismiss candidate routes?"}</legend>
            <p className={styles.decisionHelp}>This is separate from source approval. It can be reconsidered later and every decision remains in the append-only audit history.</p>
            {decision === "approved" ? <CandidateRoutingFieldset candidateIds={candidateIds} candidateOptions={candidateOptions} item={item} optionIds={optionIds} setCandidateIds={setCandidateIds} setOptionIds={setOptionIds} /> : null}
            <label className={styles.decisionLabel}>
              <span>{decision === "approved" ? "Review note (optional)" : "Reason for dismissing the matches"}</span>
              <textarea className={styles.rationaleInput} maxLength={500} minLength={decision === "rejected" ? 20 : undefined} onChange={(event) => setRationale(event.target.value)} ref={rationaleRef} required={decision === "rejected"} value={rationale} />
            </label>
            <small className={styles.decisionCounter}>{rationale.length}/500</small>
            {error ? <p className={styles.decisionError} role="alert">{error}</p> : null}
            <div className={styles.confirmActions}><button className={decision === "approved" ? styles.approveButton : styles.rejectButton} type="submit">{pending ? "Recording…" : decision === "approved" ? "Confirm candidate routes" : "Dismiss candidate routes"}</button><button className={styles.cancelButton} onClick={cancelDecision} type="button">Cancel</button></div>
          </fieldset>
        </form>
      ) : null}
    </section>
  );
}

function ReviewDecisionControls({ candidateOptions, item, lastApprovedAssignmentReceipt, lastApprovedSourceReceipt, onDecided, assignmentReceipt, routingOptions, sourceReceipt }: {
  assignmentReceipt?: ReviewReceipt;
  candidateOptions: CandidateRegistryStatus[];
  item: EvidenceReviewItem;
  lastApprovedAssignmentReceipt?: ReviewReceipt;
  lastApprovedSourceReceipt?: ReviewReceipt;
  onDecided: (receipt: ReviewReceipt) => void;
  routingOptions: EvidenceDashboard["routingOptions"];
  sourceReceipt?: ReviewReceipt;
}) {
  const router = useRouter();
  const panelId = useId();
  const decisionFieldsetRef = useRef<HTMLFieldSetElement>(null);
  const preparationReceiptRef = useRef<HTMLDivElement>(null);
  const rationaleRef = useRef<HTMLTextAreaElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const currentEditorialState: EditorialState = sourceReceipt?.reviewState === "approved" || sourceReceipt?.reviewState === "rejected" ? sourceReceipt.reviewState : item.editorialState;
  const effectiveAssignmentDecision = assignmentReceipt?.decision
    ?? item.currentAssignmentDecision?.decision
    ?? null;
  const sameSessionPriorCandidateIds = lastApprovedSourceReceipt
    ? lastApprovedSourceReceipt.supersedesReviewId === null
      ? effectiveAssignmentDecision === "approved"
        ? lastApprovedAssignmentReceipt?.candidateIds ?? item.lastApprovedAssignmentCandidateIds
        : effectiveAssignmentDecision === "rejected"
          ? []
          : lastApprovedSourceReceipt.candidateIds
      : lastApprovedSourceReceipt.candidateIds
    : null;
  const initialCandidateIds = useMemo(
    () => currentEditorialState === "rejected"
      ? sameSessionPriorCandidateIds ?? item.lastApprovedCandidateIds
      : item.candidateAssociations.map((candidate) => candidate.candidacyId),
    [currentEditorialState, item.candidateAssociations, item.lastApprovedCandidateIds, sameSessionPriorCandidateIds],
  );
  const initialTopicIds = useMemo(
    () => currentEditorialState === "rejected"
      ? lastApprovedSourceReceipt?.topicIds ?? item.lastApprovedTopicIds
      : item.topicAssociations.map((topic) => topic.id),
    [currentEditorialState, item.lastApprovedTopicIds, item.topicAssociations, lastApprovedSourceReceipt?.topicIds],
  );
  const initialConstituencyIds = useMemo(
    () => currentEditorialState === "rejected"
      ? lastApprovedSourceReceipt?.constituencyIds ?? item.lastApprovedConstituencyIds
      : item.constituencyAssociations.map((constituency) => constituency.id),
    [currentEditorialState, item.constituencyAssociations, item.lastApprovedConstituencyIds, lastApprovedSourceReceipt?.constituencyIds],
  );
  const [optionIds, setOptionIds] = useState(initialCandidateIds);
  const [candidateIds, setCandidateIds] = useState(initialCandidateIds);
  const [topicIds, setTopicIds] = useState(initialTopicIds);
  const [constituencyIds, setConstituencyIds] = useState(initialConstituencyIds);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [preparationPending, setPreparationPending] = useState(false);
  const [preparationReceipt, setPreparationReceipt] = useState<CollectionPreparationReceipt | null>(null);
  const exactVersionAvailable = Boolean(item.latest_version_id && item.content_hash);
  const actionable = Boolean(
    exactVersionAvailable
    && item.collectionReasonHash
    && item.collectionReasonRuleset
    && item.collectionReasonState === "frozen",
  );
  const currentReviewId = sourceReceipt?.reviewId ?? item.currentDecision?.id ?? null;
  const decisionCount = item.decisionCount + (sourceReceipt && !sourceReceipt.idempotent ? 1 : 0);
  const effectiveCandidateRouteIds = sourceReceipt?.decision === "approved"
    ? sourceReceipt.supersedesReviewId === null
      ? effectiveAssignmentDecision === "approved"
        ? assignmentReceipt?.candidateIds
          ?? lastApprovedAssignmentReceipt?.candidateIds
          ?? item.lastApprovedAssignmentCandidateIds
        : effectiveAssignmentDecision === "rejected" ? [] : sourceReceipt.candidateIds
      : sourceReceipt.candidateIds
    : sourceReceipt?.decision === "rejected"
      ? sameSessionPriorCandidateIds ?? item.lastApprovedCandidateIds
      : item.lastApprovedCandidateIds;
  const effectiveTopicRouteIds = sourceReceipt?.decision === "approved"
    ? sourceReceipt.topicIds
    : lastApprovedSourceReceipt?.topicIds ?? item.lastApprovedTopicIds;
  const effectiveConstituencyRouteIds = sourceReceipt?.decision === "approved"
    ? sourceReceipt.constituencyIds
    : lastApprovedSourceReceipt?.constituencyIds ?? item.lastApprovedConstituencyIds;
  const effectiveAssignmentReviewAvailable = sourceReceipt
    ? sourceReceipt.decision === "approved"
      && sourceReceipt.supersedesReviewId === null
      && item.assignmentReviewAvailable
    : item.assignmentReviewAvailable;
  const routeLabels = [
    ...effectiveCandidateRouteIds.map((id) => `Candidate: ${candidateOptions.find((candidate) => candidate.candidacy_id === id)?.full_name ?? id}`),
    ...effectiveTopicRouteIds.map((id) => `Topic: ${routingOptions.topics.find((topic) => topic.id === id)?.label ?? id}`),
    ...effectiveConstituencyRouteIds.map((id) => `Constituency: ${routingOptions.constituencies.find((constituency) => constituency.id === id)?.label ?? id}`),
  ];
  const hasLastApprovedFiling = currentEditorialState === "approved"
    || Boolean(lastApprovedSourceReceipt)
    || Boolean(item.currentDecision?.supersedesReviewId);

  useEffect(() => {
    if (decision) {
      if (decision === "approved") decisionFieldsetRef.current?.focus();
      else rationaleRef.current?.focus();
    }
  }, [decision]);

  useEffect(() => {
    if (sourceReceipt) requestAnimationFrame(() => receiptRef.current?.focus());
  }, [sourceReceipt]);

  useEffect(() => {
    if (preparationReceipt) {
      requestAnimationFrame(() => preparationReceiptRef.current?.focus());
    }
  }, [preparationReceipt]);

  function openDecision(nextDecision: ReviewDecision, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setOptionIds(initialCandidateIds);
    setCandidateIds(initialCandidateIds);
    setTopicIds(initialTopicIds);
    setConstituencyIds(initialConstituencyIds);
    setDecision(nextDecision);
    setRationale("");
    setError(null);
  }

  function cancelDecision() {
    setDecision(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function prepareForReview() {
    if (!item.latest_version_id || !item.content_hash) return;
    setPreparationPending(true);
    setPreparationError(null);
    try {
      const response = await fetch("/api/admin/evidence/prepare", {
        body: JSON.stringify({
          expectedContentHash: item.content_hash,
          expectedVersionId: item.latest_version_id,
          itemId: item.id,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        error?: string;
        receipt?: CollectionPreparationReceipt;
      };
      if (!response.ok || !result.receipt) {
        throw new Error(result.error ?? "The source could not be prepared for review.");
      }
      setPreparationReceipt(result.receipt);
      router.refresh();
    } catch (caught) {
      setPreparationError(
        caught instanceof Error ? caught.message : "The source could not be prepared for review.",
      );
    } finally {
      setPreparationPending(false);
    }
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !decision
      || !item.latest_version_id
      || !item.content_hash
      || !item.collectionReasonHash
      || !item.collectionReasonRuleset
    ) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/evidence/review", {
        body: JSON.stringify({
          candidateIds: decision === "approved" ? candidateIds : [],
          candidateSuggestionFingerprint: item.candidateSuggestionFingerprint,
          constituencyIds: decision === "approved" ? constituencyIds : [],
          decision,
          expectedCollectionReasonHash: item.collectionReasonHash,
          expectedCollectionRuleset: item.collectionReasonRuleset,
          expectedContentHash: item.content_hash,
          expectedPreviousReviewId: currentReviewId,
          expectedVersionId: item.latest_version_id,
          itemId: item.id,
          rationale,
          reviewKind: "source-version",
          scopeSuggestionFingerprint: item.collectionScopeSuggestionFingerprint,
          topicIds: decision === "approved" ? topicIds : [],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string; receipt?: ReviewReceipt };
      if (!response.ok || !result.receipt) throw new Error(result.error ?? "The review could not be recorded.");
      setDecision(null);
      onDecided(result.receipt);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The review could not be recorded.");
    } finally {
      setPending(false);
    }
  }

  const preparationStatus = preparationReceipt ? (
    <div
      aria-live="polite"
      className={`${styles.currentDecision} ${styles.currentDecisionPrepared}`}
      ref={preparationReceiptRef}
      tabIndex={-1}
    >
      <div><strong>Collection assessment prepared</strong><span>{formatTime(preparationReceipt.createdAt)}</span></div>
      <p>The exact source version has an audited assessment. It has not been approved or published.</p>
      <code>Audit #{preparationReceipt.auditSequence} · {shortHash(preparationReceipt.auditEventHash)}</code>
    </div>
  ) : null;

  if (!actionable) return (
    <div className={styles.reviewDecisionUnavailable}>
      {preparationStatus}
      <p>{exactVersionAvailable
        ? preparationReceipt
          ? "Refreshing the canonical frozen reason and routing suggestions. Inspect them before making an editorial decision."
          : "This source version needs an audited collection assessment before an editorial decision can be recorded. Preparation does not approve or publish it."
        : "This record has no immutable version yet, so it cannot be reviewed safely."}</p>
      {exactVersionAvailable && !preparationReceipt ? (
        <button
          className={styles.prepareButton}
          disabled={preparationPending}
          onClick={prepareForReview}
          type="button"
        >
          {preparationPending ? "Preparing…" : "Prepare for review"}
        </button>
      ) : null}
      {preparationError ? <p className={styles.decisionError} role="alert">{preparationError}</p> : null}
    </div>
  );

  return (
    <div className={styles.reviewDecision}>
      {preparationStatus}
      {currentEditorialState !== "pending" ? (
        <div aria-live="polite" className={`${styles.currentDecision} ${currentEditorialState === "approved" ? styles.currentDecisionApproved : styles.currentDecisionRejected}`} ref={receiptRef} tabIndex={-1}>
          <div><strong>{currentEditorialState === "approved" ? "Currently approved" : "Currently rejected"}</strong><span>{formatTime(sourceReceipt?.createdAt ?? item.currentDecision?.createdAt ?? null)}</span></div>
          <p>{sourceReceipt ? "A new audited decision was recorded in this session." : item.currentDecision?.rationale ?? "The current decision is recorded in the audit history."}</p>
          <small>{decisionCount} source decision{decisionCount === 1 ? "" : "s"} recorded · later decisions supersede rather than erase earlier ones.</small>
          {sourceReceipt ? <code>Audit #{sourceReceipt.auditSequence} · {shortHash(sourceReceipt.auditEventHash)}</code> : null}
          <div className={styles.currentRouting}>
            <strong>{currentEditorialState === "approved"
              ? "Current public filing"
              : hasLastApprovedFiling ? "Last approved filing" : "Public filing"}</strong>
            <p>{!hasLastApprovedFiling
              ? "This source version has never been public."
              : routeLabels.length
                ? routeLabels.join(" · ")
                : "General approved-source library only; no candidate, topic or constituency route."}</p>
            {currentEditorialState === "approved" ? <small>To correct these routes, move the source to Rejected, then restore it with the revised filing. The citation is withheld while reconsideration is in progress.</small> : null}
          </div>
        </div>
      ) : null}
      <div className={styles.reviewActionButtons}>
        {currentEditorialState !== "approved" ? <button aria-controls={decision === "approved" ? panelId : undefined} aria-expanded={decision === "approved"} className={styles.approveButton} disabled={pending} onClick={(event) => openDecision("approved", event.currentTarget)} type="button">{currentEditorialState === "rejected" ? "Restore to approved" : "Approve"}</button> : null}
        {currentEditorialState !== "rejected" ? <button aria-controls={decision === "rejected" ? panelId : undefined} aria-expanded={decision === "rejected"} className={styles.rejectButton} disabled={pending} onClick={(event) => openDecision("rejected", event.currentTarget)} type="button">{currentEditorialState === "approved" ? "Move to rejected" : "Reject"}</button> : null}
      </div>
      {decision ? (
        <form className={styles.decisionPanel} id={panelId} onSubmit={submitDecision}>
          <fieldset aria-busy={pending} disabled={pending} ref={decisionFieldsetRef} tabIndex={-1}>
            <legend>{decision === "approved" ? currentEditorialState === "rejected" ? "Restore this source to approved?" : "Approve this captured version?" : currentEditorialState === "approved" ? "Move this source to rejected?" : "Reject this captured version?"}</legend>
            <p className={styles.decisionHelp}>{decision === "approved" ? "Approval publishes only this citation’s reviewed metadata to the explicitly selected evidence sections. It does not publish copied source text or infer a political position." : "Rejection removes this citation from public evidence views while preserving every version and decision for audit."}</p>
            {decision === "approved" ? (
              <>
                <CandidateRoutingFieldset candidateIds={candidateIds} candidateOptions={candidateOptions} item={item} optionIds={optionIds} setCandidateIds={setCandidateIds} setOptionIds={setOptionIds} />
                <ScopeRoutingFieldset
                  constituencyIds={constituencyIds}
                  constituencyOptions={routingOptions.constituencies}
                  item={item}
                  setConstituencyIds={setConstituencyIds}
                  setTopicIds={setTopicIds}
                  topicIds={topicIds}
                  topicOptions={routingOptions.topics}
                />
              </>
            ) : null}
            <label className={styles.decisionLabel}><span>{decision === "approved" ? "Review note (optional)" : "Reason for rejection"}</span><textarea className={styles.rationaleInput} maxLength={500} minLength={decision === "rejected" ? 20 : undefined} onChange={(event) => setRationale(event.target.value)} ref={rationaleRef} required={decision === "rejected"} value={rationale} /></label>
            <small className={styles.decisionCounter}>{rationale.length}/500</small>
            {error ? <p className={styles.decisionError} role="alert">{error}</p> : null}
            <div className={styles.confirmActions}><button className={decision === "approved" ? styles.approveButton : styles.rejectButton} type="submit">{pending ? "Recording…" : decision === "approved" ? "Confirm approval" : "Confirm rejection"}</button><button className={styles.cancelButton} onClick={cancelDecision} type="button">Cancel</button></div>
          </fieldset>
        </form>
      ) : null}
      {currentEditorialState === "approved" && effectiveAssignmentReviewAvailable ? <CandidateAssignmentControls candidateOptions={candidateOptions} item={item} lastApprovedReceipt={lastApprovedAssignmentReceipt} onDecided={onDecided} receipt={assignmentReceipt} /> : null}
    </div>
  );
}

function CollectionSignalRow({ kind, signal }: { kind: string; signal: CollectionSignal }) {
  return (
    <li>
      <strong>{kind}: {signal.label}</strong>
      <span>Matched “{signal.mentionText}” · {readableState(signal.matchMethod)} · {Math.round(signal.confidence * 100)}%</span>
    </li>
  );
}

function CollectionReasonPanel({ item }: { item: EvidenceReviewItem }) {
  const reason = item.collectionReason;
  const signals = [
    ...reason.candidates.map((signal) => ({ kind: "Candidate", signal })),
    ...reason.electionSignals.map((signal) => ({ kind: "Election signal", signal })),
    ...reason.topics.map((signal) => ({ kind: "Topic", signal })),
    ...reason.constituencies.map((signal) => ({ kind: "Constituency", signal })),
  ];
  return (
    <section aria-label="Reason for collection" className={styles.collectionReason}>
      <div className={styles.collectionReasonHeading}>
        <strong>Why this was collected</strong>
        <span>{reason.routeLabel}</span>
      </div>
      <p>{reason.reason}</p>
      <dl>
        <div><dt>Source scope</dt><dd>{reason.sourceScope.label}</dd></div>
        <div><dt>Routing rule</dt><dd><code>{reason.ruleId}</code></dd></div>
        <div>
          <dt>Assessment state</dt>
          <dd>{item.collectionReasonState === "frozen" ? "Frozen to source version" : "Not yet frozen"}</dd>
        </div>
        <div>
          <dt>Assessment fingerprint</dt>
          <dd><code>{item.collectionReasonHash ? shortHash(item.collectionReasonHash) : "Pending"}</code></dd>
        </div>
      </dl>
      {signals.length ? (
        <ul>{signals.map(({ kind, signal }) => (
          <CollectionSignalRow key={`${kind}:${signal.id}`} kind={kind} signal={signal} />
        ))}</ul>
      ) : (
        <small>No relevance signal was detected. The capture remains available for audit and any future reconsideration would require a separate audited decision.</small>
      )}
    </section>
  );
}

function EvidenceInboxCard({
  assignmentReceipt,
  candidateOptions,
  item,
  lastApprovedAssignmentReceipt,
  lastApprovedSourceReceipt,
  routingOptions,
  sourceReceipt,
  onDecided,
}: {
  assignmentReceipt?: ReviewReceipt;
  candidateOptions: CandidateRegistryStatus[];
  item: EvidenceReviewItem;
  lastApprovedAssignmentReceipt?: ReviewReceipt;
  lastApprovedSourceReceipt?: ReviewReceipt;
  routingOptions: EvidenceDashboard["routingOptions"];
  sourceReceipt?: ReviewReceipt;
  onDecided: (receipt: ReviewReceipt) => void;
}) {
  return (
    <article className={styles.evidenceInboxCard}>
      <div className={styles.cardStateRow}>
        <StatePill state={item.item_type} />
        <StatePill
          state={item.collectionReason.routeLabel}
          tone={item.collectionReason.route === "evidence-review" ? "good" : "neutral"}
        />
        <StatePill
          state={sourceReceipt?.reviewState ?? item.review_state}
          tone={(sourceReceipt?.reviewState ?? item.review_state) === "approved" ? "good" : "warn"}
        />
        {item.assignmentReviewAvailable ? <StatePill state={`candidate filing ${assignmentReceipt?.decision ?? item.assignmentState}`} tone={(assignmentReceipt?.decision ?? item.assignmentState) === "approved" ? "good" : "warn"} /> : null}
      </div>
      <p className={styles.inboxSource}>{item.source_name} · {formatTime(item.published_at ?? item.first_seen_at)}</p>
      <h3>{item.title}</h3>
      <p>{item.summary || "No publisher summary was supplied. Open the captured source record for inspection."}</p>
      <CollectionReasonPanel item={item} />
      <div className={styles.evidenceMeta}>
        <span>{item.candidateAssociations.length
          ? item.candidateAssociations.map((candidate) => candidate.fullName).join(", ")
          : "No candidate association detected"}</span>
        <code>{shortHash(item.content_hash)}</code>
      </div>
      <a href={item.canonical_url} rel="noreferrer" target="_blank">Inspect original source ↗</a>
      <ReviewDecisionControls assignmentReceipt={assignmentReceipt} candidateOptions={candidateOptions} item={item} lastApprovedAssignmentReceipt={lastApprovedAssignmentReceipt} lastApprovedSourceReceipt={lastApprovedSourceReceipt} onDecided={onDecided} routingOptions={routingOptions} sourceReceipt={sourceReceipt} />
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
        <div><strong>{dashboard.counts.candidatePortraits}</strong><span>portrait references</span><small>public delivery disabled pending audited rights review</small></div>
        <div><strong>{dashboard.counts.candidateLinks}</strong><span>candidate links</span><small>social, contact and media</small></div>
        <div><strong>{dashboard.counts.candidateDocuments}</strong><span>documents found</span><small>manifestos and transcripts</small></div>
        <div><strong>{dashboard.counts.transcriptSources}</strong><span>transcript inputs</span><small>{dashboard.counts.transcriptsReadyForReview} ready to review</small></div>
        <div><strong>{Math.max(0, dashboard.counts.pendingEditorial - decidedCount)}</strong><span>records need review</span><small>founder decisions are audited</small></div>
        <div><strong>{dashboard.counts.approvedEvidence}</strong><span>approved evidence</span><small>eligible citation metadata is public</small></div>
        <div><strong>{dashboard.counts.rejectedEvidence}</strong><span>rejected evidence</span><small>withheld and open to reconsideration</small></div>
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
            <li><strong>{dashboard.counts.candidatePortraits}</strong><span>portrait references need a separate exact-content rights review</span></li>
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

function CandidatesPanel({ dashboard, onDecided, receipts }: {
  dashboard: EvidenceDashboard;
  onDecided: (receipt: CandidateProfileReviewReceipt) => void;
  receipts: CandidateProfileReviewReceipts;
}) {
  const [query, setQuery] = useState("");
  const [constituency, setConstituency] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [editorialState, setEditorialState] = useState<EditorialState>("pending");
  const constituencies = useMemo(
    () => [...new Set(dashboard.candidateProfiles.map((candidate) => candidate.constituency_name))].sort(),
    [dashboard.candidateProfiles],
  );
  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return dashboard.candidateProfiles.filter((candidate) => {
      if (candidateProfileState(candidate, receipts[candidate.candidacy_id]) !== editorialState) return false;
      if (normalizedQuery && !candidate.full_name.toLowerCase().includes(normalizedQuery)) return false;
      if (constituency !== "all" && candidate.constituency_name !== constituency) return false;
      if (coverage === "parsed" && candidate.completeness_state !== "profile-parsed") return false;
      if (coverage === "directory" && candidate.completeness_state !== "directory-only") return false;
      if (coverage === "transcript" && candidate.transcript_source_count === 0) return false;
      if (coverage === "manifesto" && candidate.manifesto_count === 0) return false;
      return true;
    });
  }, [constituency, coverage, dashboard.candidateProfiles, editorialState, query, receipts]);
  const stateCounts = dashboard.candidateProfiles.reduce<Record<EditorialState, number>>((counts, candidate) => {
    counts[candidateProfileState(candidate, receipts[candidate.candidacy_id])] += 1;
    return counts;
  }, { approved: 0, pending: 0, rejected: 0 });

  return (
    <div className={styles.panelStack}>
      <section className={styles.panelIntro}>
        <div><span>Candidate registry</span><h2>See what has been found—and what is still missing.</h2></div>
        <p>Review the exact public identity shell independently from biography, links, documents, claims and portrait rights. Portraits on this screen remain private source previews.</p>
      </section>
      <nav aria-label="Candidate identity decision states" className={styles.reviewStateBar}>
        {editorialStates.map((state) => (
          <button aria-pressed={editorialState === state.id} key={state.id} onClick={() => setEditorialState(state.id)} type="button">
            <span>{state.label}</span><strong>{stateCounts[state.id]}</strong><small>{state.description}</small>
          </button>
        ))}
      </nav>
      <div className={styles.filterBar}>
        <label><span>Search candidate</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a name" type="search" value={query} /></label>
        <label><span>Constituency</span><select onChange={(event) => setConstituency(event.target.value)} value={constituency}><option value="all">All constituencies</option>{constituencies.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label><span>Coverage</span><select onChange={(event) => setCoverage(event.target.value)} value={coverage}><option value="all">All records</option><option value="parsed">Profile parsed</option><option value="directory">Directory only</option><option value="transcript">Transcript found</option><option value="manifesto">Manifesto found</option></select></label>
        <strong>{candidates.length} shown</strong>
      </div>
      <div className={styles.candidateCoverageGrid}>
        {candidates.map((candidate) => <CandidateCoverageCard candidate={candidate} key={candidate.candidacy_id} onDecided={(receipt) => {
          setEditorialState(receipt.decision);
          onDecided(receipt);
        }} receipt={receipts[candidate.candidacy_id]} />)}
      </div>
      {!candidates.length ? <div className={styles.emptyState}><strong>No candidate identities in this lane.</strong><span>Choose another state or clear the filters.</span></div> : null}
    </div>
  );
}

function EvidencePanel({
  approvedReceipts,
  dashboard,
  receipts,
  onDecided,
}: {
  approvedReceipts: ReviewReceipts;
  dashboard: EvidenceDashboard;
  receipts: ReviewReceipts;
  onDecided: (receipt: ReviewReceipt) => void;
}) {
  const router = useRouter();
  const [editorialState, setEditorialState] = useState<EditorialState>("pending");
  const [collectionRoute, setCollectionRoute] = useState<CollectionRoute>("evidence-review");
  const [page, setPage] = useState(0);
  const [automaticReviewPending, setAutomaticReviewPending] = useState(false);
  const [automaticReviewMessage, setAutomaticReviewMessage] = useState<string | null>(null);
  async function runAutomaticReview() {
    setAutomaticReviewPending(true);
    setAutomaticReviewMessage(null);
    try {
      const response = await fetch("/api/admin/evidence/auto-review", {
        body: JSON.stringify({ limit: 120 }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await response.json() as {
        error?: string;
        summary?: { approved: number; conflicts: number; rejected: number; remaining: number; skipped: number };
      };
      if (!response.ok || !result.summary) throw new Error(result.error ?? "Automatic review could not be completed.");
      const { approved, conflicts, rejected, remaining, skipped } = result.summary;
      setAutomaticReviewMessage(
        `Automatic triage recorded ${approved} approvals and ${rejected} withholdings.${conflicts ? ` ${conflicts} changed record${conflicts === 1 ? "" : "s"} will retry.` : ""}${skipped ? ` ${skipped} record${skipped === 1 ? "" : "s"} still need a frozen collection assessment.` : ""}${remaining ? ` ${remaining} pending record${remaining === 1 ? "" : "s"} will be handled by the next pass.` : " Inbox cleared."}`,
      );
      router.refresh();
    } catch (error) {
      setAutomaticReviewMessage(error instanceof Error ? error.message : "Automatic review could not be completed.");
    } finally {
      setAutomaticReviewPending(false);
    }
  }
  const effectiveState = (item: EvidenceReviewItem): EditorialState => {
    const receipt = item.latest_version_id
      ? receipts[reviewReceiptKey(item.latest_version_id, "source-version")]
      : undefined;
    return receipt && (receipt.reviewState === "approved" || receipt.reviewState === "rejected")
      ? receipt.reviewState
      : item.editorialState;
  };
  const stateCounts = dashboard.reviewItems.reduce<Record<EditorialState, number>>((counts, item) => {
    counts[effectiveState(item)] += 1;
    return counts;
  }, { approved: 0, pending: 0, rejected: 0 });
  const stateItems = dashboard.reviewItems.filter((item) => effectiveState(item) === editorialState);
  const routeCounts = stateItems.reduce<Record<CollectionRoute, number>>((counts, item) => {
    counts[item.collectionReason.route] += 1;
    return counts;
  }, { "broad-monitoring": 0, "context-monitoring": 0, "evidence-review": 0 });
  const routedItems = stateItems.filter(
    (item) => item.collectionReason.route === collectionRoute,
  );
  const pageCount = Math.max(1, Math.ceil(routedItems.length / EVIDENCE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * EVIDENCE_PAGE_SIZE;
  const reviewItems = routedItems.slice(pageStart, pageStart + EVIDENCE_PAGE_SIZE);
  const selectedRoute = collectionRoutes.find((route) => route.id === collectionRoute);
  const selectedEditorialState = editorialStates.find((state) => state.id === editorialState);
  return (
    <div className={styles.panelStack}>
      <section className={styles.panelIntro}>
        <div><span>Editorial evidence library</span><h2>Automatically classify, publish, withhold and reconsider every source.</h2></div>
        <p>Clear candidate matches and dedicated election sources are automatically classified with an auditable system decision. Everything else is withheld rather than guessed into a candidate record; every decision can be reconsidered later.</p>
        <div className={styles.automaticReviewAction}>
          <button className={styles.approveButton} disabled={automaticReviewPending} onClick={runAutomaticReview} type="button">
            {automaticReviewPending ? "Classifying…" : "Run automatic triage"}
          </button>
          <span>Processes up to 120 frozen source versions; scheduled runs continue the backlog.</span>
          {automaticReviewMessage ? <p aria-live="polite">{automaticReviewMessage}</p> : null}
        </div>
      </section>
      <nav aria-label="Editorial decision states" className={styles.reviewStateBar}>
        {editorialStates.map((state) => (
          <button
            aria-pressed={editorialState === state.id}
            key={state.id}
            onClick={() => {
              setEditorialState(state.id);
              setPage(0);
            }}
            type="button"
          >
            <span>{state.label}</span>
            <strong>{stateCounts[state.id]}</strong>
            <small>{state.description}</small>
          </button>
        ))}
      </nav>
      <nav aria-label="Evidence collection routes" className={styles.reviewRouteBar}>
        {collectionRoutes.map((route) => (
          <button
            aria-pressed={collectionRoute === route.id}
            key={route.id}
            onClick={() => {
              setCollectionRoute(route.id);
              setPage(0);
            }}
            type="button"
          >
            <span>{route.label}</span>
            <strong>{routeCounts[route.id]}</strong>
            <small>{route.description}</small>
          </button>
        ))}
      </nav>
      <div className={styles.routeSummary}>
        <span>{selectedEditorialState?.label} · {selectedRoute?.label}</span>
        <p>{selectedRoute?.description}. {routedItems.length
          ? `Showing ${pageStart + 1}–${pageStart + reviewItems.length} of ${routedItems.length} ${editorialState} source${routedItems.length === 1 ? "" : "s"}.`
          : `No ${editorialState} sources in this route.`}</p>
      </div>
      {reviewItems.length ? (
        <>
          <div className={styles.evidenceInboxGrid}>{reviewItems.map((item) => (
            <EvidenceInboxCard
              assignmentReceipt={item.latest_version_id ? receipts[reviewReceiptKey(item.latest_version_id, "candidate-assignment")] : undefined}
              candidateOptions={dashboard.candidateProfiles}
              item={item}
              key={item.id}
              lastApprovedAssignmentReceipt={item.latest_version_id ? approvedReceipts[reviewReceiptKey(item.latest_version_id, "candidate-assignment")] : undefined}
              lastApprovedSourceReceipt={item.latest_version_id ? approvedReceipts[reviewReceiptKey(item.latest_version_id, "source-version")] : undefined}
              routingOptions={dashboard.routingOptions}
              onDecided={(receipt) => {
                onDecided(receipt);
                if (
                  receipt.reviewKind === "source-version"
                  && (receipt.reviewState === "approved" || receipt.reviewState === "rejected")
                ) {
                  const targetState = receipt.reviewState;
                  const targetRoute = item.collectionReason.route;
                  const targetItems = dashboard.reviewItems.filter((candidate) => {
                    const candidateState = candidate.latest_version_id === receipt.versionId
                      ? targetState
                      : effectiveState(candidate);
                    return candidateState === targetState
                      && candidate.collectionReason.route === targetRoute;
                  });
                  const targetIndex = targetItems.findIndex(
                    (candidate) => candidate.latest_version_id === receipt.versionId,
                  );
                  setEditorialState(targetState);
                  setCollectionRoute(targetRoute);
                  setPage(targetIndex < 0 ? 0 : Math.floor(targetIndex / EVIDENCE_PAGE_SIZE));
                }
              }}
              sourceReceipt={item.latest_version_id ? receipts[reviewReceiptKey(item.latest_version_id, "source-version")] : undefined}
            />
          ))}</div>
          {pageCount > 1 ? (
            <nav aria-label={`${selectedRoute?.label} pages`} className={styles.reviewPagination}>
              <button disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} type="button">← Newer</button>
              <span>Page {currentPage + 1} of {pageCount}</span>
              <button disabled={currentPage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} type="button">Older →</button>
            </nav>
          ) : null}
        </>
      ) : (
        <div className={styles.emptyState}>
          <strong>No {editorialState} sources are loaded in this route.</strong>
          <span>{editorialState === "pending"
            ? "New matching source records will appear after a successful monitor run."
            : editorialState === "approved"
              ? "Approved sources appear here and in their eligible public evidence sections."
              : "Rejected sources remain available here whenever you want to reconsider them."}</span>
        </div>
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
            const healthLabel = source.consecutive_failures > 0
              ? `Needs retry · ${source.consecutive_failures} consecutive failure${source.consecutive_failures === 1 ? "" : "s"}`
              : source.last_error
                ? "Needs attention · item errors"
                : "Healthy";
            return <tr key={source.id}><td><strong>{source.name}</strong><small>Every {source.poll_interval_minutes} minutes</small></td><td>{source.feed_type}<small>Tier {source.source_tier}</small></td><td>{formatTime(source.last_success_at)}</td><td>{formatTime(source.next_check_at)}</td><td><span className={warning ? styles.healthWarning : styles.healthGood}>{healthLabel}</span>{source.last_error ? <small title={source.last_error}>{summarizeCollectorError(source.last_error)}</small> : null}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <section className={styles.fullRunList}>
        <div className={styles.sectionTitle}><div><span>Run history</span><h2>Recent ingestion results</h2></div></div>
        {dashboard.recentRuns.map((run) => {
          const followedByCleanRun = Boolean(run.followed_by_clean_run);
          return (
            <article className={followedByCleanRun ? styles.resolvedRun : undefined} key={run.id}>
              <div><i className={run.error_count && !followedByCleanRun ? styles.runWarning : styles.runHealthy} aria-hidden="true" /><strong>{run.source_name}</strong><span>{followedByCleanRun ? "historical · later clean run" : readableState(run.status)}</span></div>
              <dl><div><dt>Discovered</dt><dd>{run.discovered_count}</dd></div><div><dt>Processed</dt><dd>{run.processed_item_count}</dd></div><div><dt>New</dt><dd>{run.new_item_count}</dd></div><div><dt>Changed</dt><dd>{run.changed_item_count}</dd></div><div><dt>Errors</dt><dd>{run.error_count}</dd></div></dl>
              <time>{formatTime(run.started_at)}</time>
              {run.error_summary ? (
                <div className={styles.runIssue}>
                  <p><strong>{followedByCleanRun ? "A later source check completed cleanly." : "This run needs attention."}</strong> {summarizeCollectorError(run.error_summary)}{followedByCleanRun ? " This original result remains here for audit; it does not prove that every failed item was recovered." : ""}</p>
                  <details><summary>Technical audit detail</summary><code>{run.error_summary}</code></details>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}

export function ResearchOperationsDashboard({
  dashboard,
  machineAnalysis = null,
  reviewerName,
}: {
  dashboard: EvidenceDashboard | null;
  machineAnalysis?: MachineAnalysisDashboardView | null;
  reviewerName: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [reviewReceipts, setReviewReceipts] = useState<ReviewReceipts>({});
  const [approvedReviewReceipts, setApprovedReviewReceipts] = useState<ReviewReceipts>({});
  const [candidateProfileReceipts, setCandidateProfileReceipts] = useState<CandidateProfileReviewReceipts>({});
  if (!dashboard) {
    return <section className={styles.unavailable}><span>Evidence store</span><h2>The research database is not available in this runtime.</h2><p>No unpublished records have been exposed. Apply the current D1 migrations and retry.</p></section>;
  }
  const newlyDecidedCount = Object.values(reviewReceipts).filter((receipt) =>
    receipt.reviewKind === "source-version"
    && dashboard.reviewItems.some((item) =>
      item.latest_version_id === receipt.versionId
      && item.editorialState === "pending"),
  ).length;
  const pendingEvidenceCount = dashboard.reviewItems.filter((item) => {
    const receipt = item.latest_version_id
      ? reviewReceipts[reviewReceiptKey(item.latest_version_id, "source-version")]
      : undefined;
    return receipt
      ? receipt.reviewState !== "approved" && receipt.reviewState !== "rejected"
      : item.editorialState === "pending";
  }).length;

  async function reviewMachineAnalysis(input: {
    action: MachineAnalysisReviewAction;
    analysisId: string;
    rationale: string;
    supersedesDecisionId: string | null;
  }): Promise<MachineAnalysisReviewReceiptView> {
    const endpoint = input.action === "verify"
      ? `/api/admin/research/analysis/${encodeURIComponent(input.analysisId)}/verify`
      : `/api/admin/research/analysis/${encodeURIComponent(input.analysisId)}/review`;
    const body = input.action === "verify"
      ? {
          expectedReviewId: input.supersedesDecisionId,
          rationale: input.rationale,
        }
      : {
          decision: input.action === "restore" ? "approved" : "rejected",
          expectedReviewId: input.supersedesDecisionId,
          rationale: input.rationale,
        };
    const response = await fetch(endpoint, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await response.json() as {
      error?: string;
      receipt?: MachineAnalysisReviewReceiptView;
    };
    if (!response.ok || !result.receipt) {
      throw new Error(result.error ?? "The machine-analysis decision could not be recorded.");
    }
    router.refresh();
    return result.receipt;
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
            {tab.id === "evidence" ? <b>{pendingEvidenceCount}</b> : null}
            {tab.id === "analysis" ? <b>{machineAnalysis?.analyses.length ?? 0}</b> : null}
            {tab.id === "transcripts" ? <b>{dashboard.counts.transcriptSources}</b> : null}
          </button>
        ))}
      </nav>
      <div aria-label={`${workspaceTabs.find((tab) => tab.id === activeTab)?.label} workspace`} role="region">
        {activeTab === "overview" ? <OverviewPanel dashboard={dashboard} decidedCount={newlyDecidedCount} /> : null}
        {activeTab === "candidates" ? <CandidatesPanel
          dashboard={dashboard}
          onDecided={(receipt) => setCandidateProfileReceipts((current) => ({
            ...current,
            [receipt.candidacyId]: receipt,
          }))}
          receipts={candidateProfileReceipts}
        /> : null}
        {activeTab === "evidence" ? (
          <EvidencePanel
            approvedReceipts={approvedReviewReceipts}
            dashboard={dashboard}
            onDecided={(receipt) => {
              setReviewReceipts((current) => ({
                ...current,
                [reviewReceiptKey(receipt.versionId, receipt.reviewKind)]: receipt,
              }));
              if (receipt.decision === "approved") {
                setApprovedReviewReceipts((current) => ({
                  ...current,
                  [reviewReceiptKey(receipt.versionId, receipt.reviewKind)]: receipt,
                }));
              }
            }}
            receipts={reviewReceipts}
          />
        ) : null}
        {activeTab === "analysis" ? machineAnalysis?.state === "available" ? (
          <MachineAnalysisPanel
            analyses={machineAnalysis.analyses}
            onReview={reviewMachineAnalysis}
            queue={machineAnalysis.queue}
          />
        ) : (
          <section className={styles.unavailable}>
            <span>Machine analysis</span>
            <h2>The automatic-reading workspace is unavailable.</h2>
            <p>No private extracts or stale machine results have been exposed.</p>
          </section>
        ) : null}
        {activeTab === "transcripts" ? <TranscriptsPanel dashboard={dashboard} /> : null}
        {activeTab === "sources" ? <SourcesPanel dashboard={dashboard} /> : null}
      </div>
    </div>
  );
}
