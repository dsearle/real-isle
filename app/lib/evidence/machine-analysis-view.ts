export type MachineAnalysisPublicationStatus =
  | "machine-analysed"
  | "human-verified"
  | "disputed"
  | "withdrawn";

export type MachineAnalysisQueueState =
  | "queued"
  | "running"
  | "retrying"
  | "succeeded"
  | "failed"
  | "quarantined";

export type MachineAnalysisReviewAction = "restore" | "verify" | "withdraw";

export type MachineAnalysisAssociationView = {
  id: string;
  label: string;
  type: "candidate" | "constituency" | "topic";
};

export type MachineAnalysisCitationLocatorView = {
  blockIndex: number | null;
  byteEnd: number | null;
  byteStart: number | null;
  characterEnd: number | null;
  characterStart: number | null;
  label: string;
  transcriptEndMilliseconds: number | null;
  transcriptSegmentId: string | null;
  transcriptStartMilliseconds: number | null;
};

/**
 * `publicExcerpt` is deliberately distinct from retained source text. The
 * projection may populate it only when the exact extract is cleared for
 * public display. Private captures and full text never enter this view model.
 */
export type MachineAnalysisCitationView = {
  blockId: string;
  blockHash: string;
  citationId: string;
  documentCaptureId: string;
  excerptHash: string;
  locator: MachineAnalysisCitationLocatorView;
  publicExcerpt: string | null;
  rawContentHash: string;
  readableTextHash: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceSnapshotId: string;
  sourceVersionHash: string;
  sourceVersionId: string;
};

export type MachineAnalysisFindingView = {
  associations: MachineAnalysisAssociationView[];
  citationIds: string[];
  extractionConfidence: number;
  findingId: string;
  kind: "explicit-statement" | "policy-proposal" | "record-fact" | "reported-passage";
  text: string;
};

export type MachineAnalysisProvenanceView = {
  extractorConfigHash: string;
  generatedAt: string;
  modelName: string;
  modelProvider: string;
  modelVersion: string;
  outputSchemaVersion: string;
  promptTemplateHash: string;
  promptTemplateId: string;
  promptTemplateVersion: string;
};

export type MachineAnalysisPublicView = {
  analysisId: string;
  auditFingerprint: string;
  citations: MachineAnalysisCitationView[];
  findings: MachineAnalysisFindingView[];
  overallExtractionConfidence: number;
  provenance: MachineAnalysisProvenanceView;
  publicStatusNote: string | null;
  revisionId: string;
  status: MachineAnalysisPublicationStatus;
  statusChangedAt: string;
  title: string;
};

export type MachineAnalysisAdminView = MachineAnalysisPublicView & {
  currentDecisionId: string | null;
  decisionCount: number;
  sourceName: string;
};

export type MachineAnalysisQueueItemView = {
  analyzerConfigHash: string;
  attemptCount: number;
  createdAt: string;
  documentCaptureId: string;
  failureCode: string | null;
  failureSummary: string | null;
  jobId: string;
  nextAttemptAt: string | null;
  resultId: string | null;
  sourceItemId: string;
  sourceItemVersionId: string;
  sourceName: string;
  sourceTitle: string;
  state: MachineAnalysisQueueState;
  updatedAt: string;
};

export type MachineAnalysisReviewReceiptView = {
  analysisId: string;
  auditEventHash: string;
  auditSequence: number;
  createdAt: string;
  decisionId: string;
  idempotent: boolean;
  status: MachineAnalysisPublicationStatus;
  supersedesDecisionId: string | null;
};

export type MachineAnalysisDashboardView = {
  analyses: MachineAnalysisAdminView[];
  queue: MachineAnalysisQueueItemView[];
  state: "available" | "unavailable";
};

export const machineAnalysisStatusCopy: Record<
  MachineAnalysisPublicationStatus,
  { description: string; label: string }
> = {
  "machine-analysed": {
    description: "Not checked by a person",
    label: "Machine analysed",
  },
  "human-verified": {
    description: "A reviewer checked that the extraction matches its cited source. This is not an independent fact-check.",
    label: "Human verified",
  },
  disputed: {
    description: "The findings are withheld while a recorded challenge is considered.",
    label: "Disputed",
  },
  withdrawn: {
    description: "The findings were removed from public display by an audited decision.",
    label: "Withdrawn",
  },
};

export function machineAnalysisFindingsArePublic(
  status: MachineAnalysisPublicationStatus,
) {
  return status === "machine-analysed" || status === "human-verified";
}

export function machineAnalysisHasCompletePublicCitations(
  analysis: Pick<MachineAnalysisPublicView, "citations" | "findings" | "status">,
) {
  if (!machineAnalysisFindingsArePublic(analysis.status) || analysis.findings.length === 0) {
    return false;
  }
  const citations = new Map(analysis.citations.map((citation) => [citation.citationId, citation]));
  if (citations.size !== analysis.citations.length) return false;
  return analysis.findings.every((finding) => (
    finding.citationIds.length > 0
    && finding.citationIds.every((citationId) => {
      const citation = citations.get(citationId);
      if (!citation || !citation.publicExcerpt?.trim()) return false;
      try {
        const sourceUrl = new URL(citation.sourceUrl);
        return sourceUrl.protocol === "https:"
          && !sourceUrl.username
          && !sourceUrl.password
          && Boolean(
            citation.blockHash
            && citation.excerptHash
            && citation.rawContentHash
            && citation.readableTextHash
            && citation.sourceVersionHash,
          );
      } catch {
        return false;
      }
    })
  ));
}

export function extractionConfidencePercent(value: number) {
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

export function citationLocatorLabel(locator: MachineAnalysisCitationLocatorView) {
  const locations: string[] = [];
  if (locator.label.trim()) locations.push(locator.label.trim());
  if (
    locator.characterStart !== null
    && locator.characterEnd !== null
    && locator.characterStart >= 0
    && locator.characterEnd >= locator.characterStart
  ) {
    locations.push(`characters ${locator.characterStart}–${locator.characterEnd} (end exclusive)`);
  }
  if (
    locator.byteStart !== null
    && locator.byteEnd !== null
    && locator.byteStart >= 0
    && locator.byteEnd >= locator.byteStart
  ) {
    locations.push(`source block bytes ${locator.byteStart}–${locator.byteEnd} (end exclusive)`);
  }
  if (
    locator.transcriptStartMilliseconds !== null
    && locator.transcriptEndMilliseconds !== null
    && locator.transcriptStartMilliseconds >= 0
    && locator.transcriptEndMilliseconds >= locator.transcriptStartMilliseconds
  ) {
    locations.push(
      `transcript ${millisecondsLabel(locator.transcriptStartMilliseconds)}–${millisecondsLabel(locator.transcriptEndMilliseconds)}`,
    );
  }
  return locations.join(" · ") || "Exact source locator unavailable";
}

function millisecondsLabel(value: number) {
  const totalSeconds = Math.floor(value / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
