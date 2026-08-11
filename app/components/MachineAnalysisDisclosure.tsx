import {
  citationLocatorLabel,
  extractionConfidencePercent,
  machineAnalysisHasCompletePublicCitations,
  machineAnalysisStatusCopy,
  type MachineAnalysisCitationView,
  type MachineAnalysisPublicView,
} from "../lib/evidence/machine-analysis-view";
import styles from "./MachineAnalysisDisclosure.module.css";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Isle_of_Man",
});

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "Time unavailable";
}

function shortFingerprint(value: string) {
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
}

function analysisDomId(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return normalized || "unavailable";
}

function Citation({
  anchorId,
  citation,
  number,
}: {
  anchorId: string;
  citation: MachineAnalysisCitationView;
  number: number;
}) {
  return (
    <li className={styles.citation} id={anchorId}>
      <div className={styles.citationHeading}>
        <span aria-hidden="true">{number}</span>
        <div>
          <strong>{citation.sourceTitle}</strong>
          <small>{citationLocatorLabel(citation.locator)}</small>
        </div>
      </div>
      {citation.publicExcerpt ? (
        <blockquote>
          <p>{citation.publicExcerpt}</p>
          <cite>Exact extract from the cited source version</cite>
        </blockquote>
      ) : (
        <p className={styles.extractWithheld}>
          The exact extract is not cleared for public display. Its locator and fingerprint remain available for audit.
        </p>
      )}
      <dl className={styles.citationFingerprints}>
        <div><dt>Source version ID</dt><dd><code>{citation.sourceVersionId}</code></dd></div>
        <div><dt>Source version hash</dt><dd><code>{shortFingerprint(citation.sourceVersionHash)}</code></dd></div>
        <div><dt>Document capture</dt><dd><code>{citation.documentCaptureId}</code></dd></div>
        <div><dt>Source snapshot</dt><dd><code>{citation.sourceSnapshotId}</code></dd></div>
        <div><dt>Raw capture hash</dt><dd><code>{shortFingerprint(citation.rawContentHash)}</code></dd></div>
        <div><dt>Readable text</dt><dd><code>{shortFingerprint(citation.readableTextHash)}</code></dd></div>
        <div><dt>Document block</dt><dd><code>{citation.blockId} · {shortFingerprint(citation.blockHash)}</code></dd></div>
        <div><dt>Extract</dt><dd><code>{shortFingerprint(citation.excerptHash)}</code></dd></div>
      </dl>
      <a href={citation.sourceUrl} rel="noreferrer" target="_blank">
        Open cited source <span aria-hidden="true">↗</span>
      </a>
    </li>
  );
}

export function MachineAnalysisDisclosure({ analysis }: { analysis: MachineAnalysisPublicView }) {
  const analysisId = `${analysisDomId(analysis.analysisId)}-${analysisDomId(analysis.revisionId)}`;
  const headingId = `machine-analysis-${analysisId}`;
  const citationAnchorPrefix = `analysis-citations-${analysisId}`;
  const statusCopy = machineAnalysisStatusCopy[analysis.status];
  const showFindings = machineAnalysisHasCompletePublicCitations(analysis);
  const citationsById = new Map(analysis.citations.map((citation) => [citation.citationId, citation]));
  const displayedCitationIds = new Set(
    analysis.findings.flatMap((finding) => finding.citationIds),
  );
  const displayedCitations = analysis.citations.filter((citation) => (
    displayedCitationIds.has(citation.citationId)
  ));

  if (!showFindings) {
    return (
      <aside
        aria-labelledby={headingId}
        className={`${styles.tombstone} ${styles[analysis.status]}`}
      >
        <div>
          <span className={styles.statusLabel}>{statusCopy.label}</span>
          <h3 id={headingId}>Machine findings are not displayed</h3>
        </div>
        <p>{analysis.publicStatusNote ?? (
          analysis.status === "disputed" || analysis.status === "withdrawn"
            ? statusCopy.description
            : "The findings are withheld because their exact public citation set is incomplete."
        )}</p>
        <small>
          Status changed {formattedDate(analysis.statusChangedAt)} · audit fingerprint {shortFingerprint(analysis.auditFingerprint)}
        </small>
      </aside>
    );
  }

  const overallConfidence = extractionConfidencePercent(analysis.overallExtractionConfidence);
  return (
    <section aria-labelledby={headingId} className={`${styles.disclosure} ${styles[analysis.status]}`}>
      <header className={styles.header}>
        <div>
          <span className={styles.statusLabel}>{statusCopy.label}</span>
          <h3 id={headingId}>{analysis.title}</h3>
          <p>{statusCopy.description}</p>
        </div>
        <div className={styles.confidence}>
          <strong>{overallConfidence === null ? "—" : `${overallConfidence}%`}</strong>
          <span>Extraction/citation confidence</span>
        </div>
      </header>

      <div className={styles.safetyNote}>
        <strong>What this means</strong>
        <p>
          The system describes content in the cited source. A candidate mention is not treated as a policy position, endorsement, popularity measure or election forecast.
        </p>
      </div>

      <ol className={styles.findings}>
        {analysis.findings.map((finding) => {
          const confidence = extractionConfidencePercent(finding.extractionConfidence);
          const findingCitations = finding.citationIds
            .map((citationId) => citationsById.get(citationId))
            .filter((citation): citation is MachineAnalysisCitationView => Boolean(citation));
          return (
            <li key={finding.findingId}>
              <p>{finding.text}</p>
              <div className={styles.findingMeta}>
                <span>{finding.kind.replaceAll("-", " ")}</span>
                <span>Extraction/citation confidence {confidence === null ? "unavailable" : `${confidence}%`}</span>
                {findingCitations.length ? (
                  <span>
                    {findingCitations.map((citation, index) => (
                      <a href={`#${citationAnchorPrefix}-${analysis.citations.indexOf(citation) + 1}`} key={citation.citationId}>
                        Citation {analysis.citations.indexOf(citation) + 1}{index < findingCitations.length - 1 ? ", " : ""}
                      </a>
                    ))}
                  </span>
                ) : <span>No public citation</span>}
              </div>
              {finding.associations.length ? (
                <ul aria-label="Content associations" className={styles.associations}>
                  {finding.associations.map((association) => (
                    <li key={`${association.type}:${association.id}`}>
                      <small>{association.type}</small>{association.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>

      <details className={styles.citations}>
        <summary>See {displayedCitations.length} exact citation{displayedCitations.length === 1 ? "" : "s"}</summary>
        {displayedCitations.length ? (
          <ol>{displayedCitations.map((citation) => (
            <Citation
              anchorId={`${citationAnchorPrefix}-${analysis.citations.indexOf(citation) + 1}`}
              citation={citation}
              key={citation.citationId}
              number={analysis.citations.indexOf(citation) + 1}
            />
          ))}</ol>
        ) : (
          <p className={styles.noCitations}>No public citation passed the publication gate. The findings should be withdrawn from this projection.</p>
        )}
      </details>

      <details className={styles.provenance}>
        <summary>Model, prompt and audit provenance</summary>
        <dl>
          <div><dt>Model</dt><dd>{analysis.provenance.modelProvider} · {analysis.provenance.modelName} · {analysis.provenance.modelVersion}</dd></div>
          <div><dt>Prompt template</dt><dd>{analysis.provenance.promptTemplateId} · {analysis.provenance.promptTemplateVersion}</dd></div>
          <div><dt>Prompt fingerprint</dt><dd><code>{shortFingerprint(analysis.provenance.promptTemplateHash)}</code></dd></div>
          <div><dt>Extractor configuration</dt><dd><code>{shortFingerprint(analysis.provenance.extractorConfigHash)}</code></dd></div>
          <div><dt>Output schema</dt><dd>{analysis.provenance.outputSchemaVersion}</dd></div>
          <div><dt>Generated</dt><dd>{formattedDate(analysis.provenance.generatedAt)}</dd></div>
          <div><dt>Analysis revision</dt><dd><code>{analysis.revisionId}</code></dd></div>
          <div><dt>Audit fingerprint</dt><dd><code>{shortFingerprint(analysis.auditFingerprint)}</code></dd></div>
        </dl>
      </details>
    </section>
  );
}
