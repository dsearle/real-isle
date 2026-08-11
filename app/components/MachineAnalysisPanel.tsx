"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  citationLocatorLabel,
  extractionConfidencePercent,
  machineAnalysisStatusCopy,
  type MachineAnalysisAdminView,
  type MachineAnalysisPublicationStatus,
  type MachineAnalysisQueueItemView,
  type MachineAnalysisReviewAction,
  type MachineAnalysisReviewReceiptView,
} from "../lib/evidence/machine-analysis-view";
import styles from "./MachineAnalysisPanel.module.css";

type ReviewHandler = (input: {
  action: MachineAnalysisReviewAction;
  analysisId: string;
  rationale: string;
  supersedesDecisionId: string | null;
}) => Promise<MachineAnalysisReviewReceiptView>;

const statusOrder: MachineAnalysisPublicationStatus[] = [
  "machine-analysed",
  "human-verified",
  "disputed",
  "withdrawn",
];

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Isle_of_Man",
});

function formatTime(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? timeFormatter.format(date) : "Time unavailable";
}

function shortHash(value: string) {
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
}

function confidenceLabel(value: number) {
  const confidence = extractionConfidencePercent(value);
  return confidence === null ? "unavailable" : `${confidence}%`;
}

function availableActions(status: MachineAnalysisPublicationStatus) {
  if (status === "machine-analysed") return ["verify", "withdraw"] as const;
  if (status === "human-verified" || status === "disputed") return ["withdraw"] as const;
  return ["restore", "verify"] as const;
}

const actionCopy: Record<MachineAnalysisReviewAction, { help: string; label: string }> = {
  restore: {
    help: "Restore the unchanged machine result with the Machine analysed label. This does not mark it as human verified.",
    label: "Restore as machine analysed",
  },
  verify: {
    help: "Confirm that the extraction matches every displayed citation. This is not an independent fact-check of the source.",
    label: "Mark human verified",
  },
  withdraw: {
    help: "Reject this analysis and remove its findings from public display while retaining its audit record.",
    label: "Reject and withdraw",
  },
};

function AnalysisReviewControls({
  analysis,
  onReview,
}: {
  analysis: MachineAnalysisAdminView;
  onReview: ReviewHandler;
}) {
  const panelId = useId();
  const rationaleRef = useRef<HTMLTextAreaElement>(null);
  const [action, setAction] = useState<MachineAnalysisReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rationale, setRationale] = useState("");
  const [receipt, setReceipt] = useState<MachineAnalysisReviewReceiptView | null>(null);

  const openAction = (nextAction: MachineAnalysisReviewAction) => {
    setAction(nextAction);
    setError(null);
    requestAnimationFrame(() => rationaleRef.current?.focus());
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!action || pending) return;
    const normalizedRationale = rationale.replace(/\s+/g, " ").trim();
    if (normalizedRationale.length < 12) {
      setError("Add at least 12 characters explaining this audited decision.");
      rationaleRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const nextReceipt = await onReview({
        action,
        analysisId: analysis.analysisId,
        rationale: normalizedRationale,
        supersedesDecisionId: analysis.currentDecisionId,
      });
      setReceipt(nextReceipt);
      setAction(null);
      setRationale("");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The decision could not be recorded.");
    } finally {
      setPending(false);
    }
  };

  if (receipt) {
    return (
      <div aria-live="polite" className={styles.decisionReceipt} tabIndex={-1}>
        <strong>{machineAnalysisStatusCopy[receipt.status].label}</strong>
        <span>Decision #{receipt.auditSequence} recorded {formatTime(receipt.createdAt)}</span>
        <code>{shortHash(receipt.auditEventHash)}</code>
      </div>
    );
  }

  return (
    <div className={styles.reviewControls}>
      <div className={styles.actionButtons}>
        {availableActions(analysis.status).map((nextAction) => (
          <button
            aria-controls={action === nextAction ? panelId : undefined}
            aria-expanded={action === nextAction}
            data-action={nextAction}
            disabled={pending}
            key={nextAction}
            onClick={() => openAction(nextAction)}
            type="button"
          >
            {actionCopy[nextAction].label}
          </button>
        ))}
      </div>
      {action ? (
        <form id={panelId} onSubmit={submit}>
          <fieldset disabled={pending}>
            <legend>{actionCopy[action].label}</legend>
            <p>{actionCopy[action].help}</p>
            <label>
              <span>Audited rationale</span>
              <textarea
                maxLength={1_000}
                onChange={(event) => setRationale(event.target.value)}
                ref={rationaleRef}
                required
                value={rationale}
              />
            </label>
            <small>{rationale.length}/1,000 characters</small>
            {error ? <p className={styles.decisionError} role="alert">{error}</p> : null}
            <div>
              <button disabled={pending} type="submit">{pending ? "Recording…" : "Record decision"}</button>
              <button disabled={pending} onClick={() => setAction(null)} type="button">Cancel</button>
            </div>
          </fieldset>
        </form>
      ) : null}
    </div>
  );
}

function AdminAnalysisCard({ analysis, onReview }: { analysis: MachineAnalysisAdminView; onReview: ReviewHandler }) {
  const status = machineAnalysisStatusCopy[analysis.status];
  const confidence = extractionConfidencePercent(analysis.overallExtractionConfidence);
  return (
    <article className={styles.analysisCard}>
      <div className={styles.cardHeading}>
        <div>
          <span data-status={analysis.status}>{status.label}</span>
          <small>{status.description}</small>
        </div>
        <strong>{confidence === null ? "—" : `${confidence}%`}<small> extraction/citation confidence</small></strong>
      </div>
      <p className={styles.sourceLabel}>{analysis.sourceName} · {formatTime(analysis.provenance.generatedAt)}</p>
      <h3>{analysis.title}</h3>
      <div className={styles.cardCounts}>
        <span>{analysis.findings.length} finding{analysis.findings.length === 1 ? "" : "s"}</span>
        <span>{analysis.citations.length} citation{analysis.citations.length === 1 ? "" : "s"}</span>
        <span>{analysis.decisionCount} human decision{analysis.decisionCount === 1 ? "" : "s"}</span>
      </div>
      <ol className={styles.findingList}>
        {analysis.findings.slice(0, 4).map((finding) => (
          <li key={finding.findingId}>
            <p>{finding.text}</p>
            <small>
              {finding.kind.replaceAll("-", " ")} · extraction/citation confidence {confidenceLabel(finding.extractionConfidence)} · {finding.citationIds.length} citation{finding.citationIds.length === 1 ? "" : "s"}
            </small>
          </li>
        ))}
      </ol>
      <details className={styles.adminCitations}>
        <summary>Inspect exact public extracts and locators</summary>
        <ol>{analysis.citations.map((citation) => (
          <li key={citation.citationId}>
            <strong>{citation.sourceTitle}</strong>
            <small>{citationLocatorLabel(citation.locator)}</small>
            {citation.publicExcerpt ? <blockquote>{citation.publicExcerpt}</blockquote> : <p>Extract withheld by the publication-rights gate.</p>}
            <code>version {shortHash(citation.sourceVersionHash)} · capture {citation.documentCaptureId} · snapshot {citation.sourceSnapshotId} · block {shortHash(citation.blockHash)} · extract {shortHash(citation.excerptHash)}</code>
            <a href={citation.sourceUrl} rel="noreferrer" target="_blank">Open source ↗</a>
          </li>
        ))}</ol>
      </details>
      <details className={styles.adminProvenance}>
        <summary>Model and prompt provenance</summary>
        <dl>
          <div><dt>Model</dt><dd>{analysis.provenance.modelProvider} · {analysis.provenance.modelName} · {analysis.provenance.modelVersion}</dd></div>
          <div><dt>Prompt</dt><dd>{analysis.provenance.promptTemplateId} · {analysis.provenance.promptTemplateVersion}</dd></div>
          <div><dt>Prompt hash</dt><dd><code>{shortHash(analysis.provenance.promptTemplateHash)}</code></dd></div>
          <div><dt>Extractor hash</dt><dd><code>{shortHash(analysis.provenance.extractorConfigHash)}</code></dd></div>
          <div><dt>Audit</dt><dd><code>{shortHash(analysis.auditFingerprint)}</code></dd></div>
        </dl>
      </details>
      <AnalysisReviewControls analysis={analysis} onReview={onReview} />
    </article>
  );
}

function QueueCard({ item }: { item: MachineAnalysisQueueItemView }) {
  const warning = item.state === "failed" || item.state === "quarantined";
  return (
    <article className={styles.queueCard}>
      <div><span data-warning={warning}>{item.state}</span><small>{item.attemptCount} attempt{item.attemptCount === 1 ? "" : "s"}</small></div>
      <h3>{item.sourceTitle}</h3>
      <p>{item.sourceName}</p>
      <dl>
        <div><dt>Queued</dt><dd>{formatTime(item.createdAt)}</dd></div>
        <div><dt>Last updated</dt><dd>{formatTime(item.updatedAt)}</dd></div>
        <div><dt>Next retry</dt><dd>{formatTime(item.nextAttemptAt)}</dd></div>
        <div><dt>Result</dt><dd>{item.resultId ? shortHash(item.resultId) : "No result yet"}</dd></div>
      </dl>
      <code>source version {shortHash(item.sourceItemVersionId)}</code>
      <code>capture {shortHash(item.documentCaptureId)}</code>
      <code>analyser configuration {shortHash(item.analyzerConfigHash)}</code>
      {item.failureSummary ? (
        <div className={styles.queueFailure} role="status">
          <strong>{item.failureCode ?? "Analysis failed"}</strong>
          <p>{item.failureSummary}</p>
        </div>
      ) : null}
    </article>
  );
}

export function MachineAnalysisPanel({
  analyses,
  onReview,
  queue,
}: {
  analyses: readonly MachineAnalysisAdminView[];
  onReview: ReviewHandler;
  queue: readonly MachineAnalysisQueueItemView[];
}) {
  const [status, setStatus] = useState<MachineAnalysisPublicationStatus>("machine-analysed");
  const [view, setView] = useState<"outputs" | "queue">("outputs");
  const counts = useMemo(() => {
    const next: Record<MachineAnalysisPublicationStatus, number> = {
      disputed: 0,
      "human-verified": 0,
      "machine-analysed": 0,
      withdrawn: 0,
    };
    for (const analysis of analyses) next[analysis.status] += 1;
    return next;
  }, [analyses]);
  const visibleAnalyses = analyses.filter((analysis) => analysis.status === status);
  const failureCount = queue.filter((item) => item.state === "failed" || item.state === "quarantined").length;

  return (
    <div className={styles.panel}>
      <section className={styles.intro}>
        <div><span>Machine analysis</span><h2>Automatic reading, with every citation and decision visible.</h2></div>
        <p>Eligible high-confidence analysis can publish without waiting for manual approval. It is always labelled Machine analysed and Not checked by a person until a reviewer verifies it. Candidate mentions never become inferred positions or election scores.</p>
      </section>
      <nav aria-label="Machine analysis workspaces" className={styles.viewSwitch}>
        <button aria-pressed={view === "outputs"} onClick={() => setView("outputs")} type="button">Published outputs <strong>{analyses.length}</strong></button>
        <button aria-pressed={view === "queue"} onClick={() => setView("queue")} type="button">Queue & failures <strong>{failureCount}</strong></button>
      </nav>

      {view === "outputs" ? (
        <>
          <nav aria-label="Machine analysis publication states" className={styles.statusBar}>
            {statusOrder.map((entry) => (
              <button aria-pressed={status === entry} key={entry} onClick={() => setStatus(entry)} type="button">
                <span>{machineAnalysisStatusCopy[entry].label}</span>
                <strong>{counts[entry]}</strong>
                <small>{machineAnalysisStatusCopy[entry].description}</small>
              </button>
            ))}
          </nav>
          {visibleAnalyses.length ? (
            <div className={styles.analysisGrid}>
              {visibleAnalyses.map((analysis) => <AdminAnalysisCard analysis={analysis} key={analysis.analysisId} onReview={onReview} />)}
            </div>
          ) : (
            <div className={styles.empty}><strong>No analyses in this state.</strong><span>New eligible outputs and later human decisions will appear here.</span></div>
          )}
        </>
      ) : queue.length ? (
        <div className={styles.queueGrid}>{queue.map((item) => <QueueCard item={item} key={item.jobId} />)}</div>
      ) : (
        <div className={styles.empty}><strong>The analysis queue is empty.</strong><span>New source versions will appear here when scheduled for automatic reading.</span></div>
      )}
    </div>
  );
}
