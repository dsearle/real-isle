import type { ReadableDocumentV1 } from "./document-acquisition.ts";
import { appendAuditEventWithStatements } from "./audit.ts";
import { policyTopicCatalogue } from "./catalogue.ts";
import { approvedCandidateProfileBasisSql } from "./candidate-profile-basis.ts";
import { readVerifiedCollectionReason } from "./collection-assessment.ts";
import { deterministicId, sha256Hex, stableJson } from "./integrity.ts";

const INPUT_SCHEMA_VERSION = "peoples-isle.machine-analysis-input.v1";
const RESULT_SCHEMA_VERSION = "peoples-isle.machine-analysis-result.v1";
const METHOD = "deterministic-extractive-v1";
const PROVIDER = "local";
const MODEL = "deterministic-extractive";
const MODEL_VERSION = "1";
const PROMPT_ID = "extractive-no-stance";
const PROMPT_VERSION = "1";
const AUTO_REVIEWER_ID = "machine-analysis:auto:v1";
const MATCHER_VERSION = "unicode-boundary-exact-v2";
const MAX_PUBLIC_RECORD_CHARACTERS = 500;
const MAX_PUBLIC_RECORD_WORDS = 80;
const MAX_RESTRICTED_CHARACTERS = 280;
const MAX_RESTRICTED_WORDS = 25;
const MAX_PUBLIC_BLOCKS = 3;

export type MachineAnalysisPublicationStatus =
  | "machine-analysed"
  | "human-verified"
  | "disputed";

export type MachineAnalysisJobStatus =
  | "queued"
  | "running"
  | "retrying"
  | "succeeded"
  | "failed"
  | "quarantined";

export type MachineAnalysisReceipt = {
  auditEventHash: string;
  auditSequence: number;
  gateCode: string;
  gateStatus: "eligible" | "held";
  idempotent: boolean;
  inputId: string;
  publicationState: "published" | "withheld";
  resultId: string;
  reviewId: string | null;
};

export type MachineAnalysisReviewReceipt = {
  auditEventHash: string;
  auditSequence: number;
  createdAt: string;
  decision: "approved" | "rejected";
  idempotent: boolean;
  publicationState: "published" | "withheld";
  resultId: string;
  reviewId: string;
  supersedesReviewId: string;
};

export type MachineAnalysisVerificationReceipt = {
  auditEventHash: string;
  auditSequence: number;
  createdAt: string;
  idempotent: boolean;
  resultId: string;
  reviewId: string;
  verificationId: string;
};

export type PublicMachineAnalysisEntity = {
  associationKind: "mentioned" | "subject" | "context";
  blockHash: string;
  blockId: string;
  confidence: number;
  entityId: string;
  entityType: "candidacy" | "topic" | "constituency";
  id: string;
  mentionHash: string;
  mentionText: string;
  rawBlockEnd: number;
  rawBlockStart: number;
  textEnd: number;
  textStart: number;
};

export type PublicMachineAnalysisFinding = {
  blockHash: string;
  blockId: string;
  candidacyId: string | null;
  confidence: number;
  constituencyId: string | null;
  findingKind: "reported-passage";
  id: string;
  propositionKey: string;
  propositionText: string;
  quote: string;
  quoteHash: string;
  rawBlockEnd: number;
  rawBlockStart: number;
  stance: null;
  stanceBasis: "none";
  textEnd: number;
  textStart: number;
  topicId: string;
};

export type PublicMachineAnalysis = {
  auditEventHash: string;
  documentCaptureId: string;
  entities: PublicMachineAnalysisEntity[];
  findings: PublicMachineAnalysisFinding[];
  generatedAt: string;
  inputId: string;
  overallConfidence: number;
  provenance: {
    extractorConfigHash: string;
    method: string;
    model: string;
    modelVersion: string;
    promptHash: string;
    promptId: string;
    promptVersion: string;
    provider: string;
    schemaVersion: string;
  };
  resultId: string;
  source: {
    name: string;
    rightsState: "restricted-copy" | "metadata-only" | "public-record";
    title: string;
    url: string;
  };
  sourceItemId: string;
  sourceItemVersionId: string;
  sourceSnapshotId: string;
  status: MachineAnalysisPublicationStatus;
};

export type MachineAnalysisQueueTelemetry = {
  counts: Record<MachineAnalysisJobStatus, number>;
  lastSucceededAt: string | null;
  oldestPendingAt: string | null;
  recentFailures: Array<{
    errorCode: string | null;
    errorSummary: string | null;
    jobId: string;
    sourceItemId: string;
    status: "failed" | "quarantined";
    updatedAt: string;
  }>;
};

type AnalysisActor = {
  id: string;
  type: "admin" | "system";
};

type AnalysisContext = {
  actor: AnalysisActor;
};

type AnalysisSourceRow = {
  canonical_reason_hash: string;
  canonical_reason_json: string;
  capture_url: string;
  capture_config_hash: string;
  capture_rights_state: "restricted-copy" | "metadata-only" | "public-record";
  collection_route: string;
  collection_ruleset_id: string;
  current_capture_id: string | null;
  extraction_manifest_hash: string;
  extraction_manifest_json: string;
  item_content_hash: string | null;
  item_title: string;
  latest_version_id: string | null;
  raw_content_hash: string;
  readable_text_hash: string;
  resolved_url: string;
  snapshot_id: string;
  source_active: number;
  source_id: string;
  source_item_id: string;
  source_name: string;
  source_rights_state: "restricted-copy" | "metadata-only" | "public-record";
  source_tier: number;
  source_version_hash: string;
  source_version_id: string;
  source_version_parser: string;
  source_version_payload: string;
};

type CandidateSignalSource = {
  basisHash: string;
  candidacyId: string;
  constituencyId: string;
  constituencyName: string;
  fullName: string;
  publicIdentity: boolean;
};

type TopicSignalSource = {
  id: string;
  name: string;
};

type FrozenSignal = {
  associationKind: "mentioned" | "subject" | "context";
  blockHash: string;
  blockId: string;
  confidence: number;
  entityId: string;
  entityType: "candidacy" | "topic" | "constituency";
  mentionHash: string;
  mentionText: string;
  rawBlockEnd: number;
  rawBlockStart: number;
  signalBasisHash: string;
  signalSource: "collection-assessment" | "deterministic-text-match";
  textEnd: number;
  textStart: number;
};

type ExtractedFinding = {
  blockHash: string;
  blockId: string;
  candidacyId: string | null;
  confidence: number;
  constituencyId: string | null;
  findingKind: "reported-passage";
  propositionKey: string;
  propositionText: string;
  quote: string;
  quoteHash: string;
  rawBlockEnd: number;
  rawBlockStart: number;
  stance: null;
  stanceBasis: "none";
  textEnd: number;
  textStart: number;
  topicId: string;
};

type ExistingAnalysisRow = {
  audit_event_hash: string;
  audit_sequence: number;
  gate_code: string;
  gate_status: "eligible" | "held";
  input_id: string;
  publication_state: "published" | "withheld";
  result_id: string;
  review_id: string | null;
};

export class MachineAnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MachineAnalysisValidationError";
  }
}

export class MachineAnalysisConflictError extends Error {
  constructor(message = "The machine-analysis decision changed. Refresh and try again.") {
    super(message);
    this.name = "MachineAnalysisConflictError";
  }
}

function wordCount(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function escapedPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactMatches(text: string, needle: string) {
  const normalizedNeedle = needle.trim();
  if (!normalizedNeedle) return [] as Array<{ end: number; start: number; text: string }>;
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escapedPattern(normalizedNeedle)})(?=$|[^\\p{L}\\p{N}])`,
    "giu",
  );
  return [...text.matchAll(pattern)].map((match) => {
    const prefixLength = match[1]?.length ?? 0;
    const start = (match.index ?? 0) + prefixLength;
    const matched = match[2];
    return { end: start + matched.length, start, text: matched };
  });
}

function boundedPublicQuote(
  rightsState: AnalysisSourceRow["source_rights_state"],
  value: string,
) {
  const maxCharacters = rightsState === "public-record"
    ? MAX_PUBLIC_RECORD_CHARACTERS
    : MAX_RESTRICTED_CHARACTERS;
  const maxWords = rightsState === "public-record"
    ? MAX_PUBLIC_RECORD_WORDS
    : MAX_RESTRICTED_WORDS;
  return value.length <= maxCharacters && wordCount(value) <= maxWords;
}

async function promptHash() {
  return sha256Hex(stableJson({
    adjacencyRule: "skip-immediately-adjacent-selected-blocks-v1",
    instruction: "Extract exact source passages by deterministic topic match. Never infer candidate stance from a mention.",
    matcherVersion: MATCHER_VERSION,
    maxPublicBlocks: MAX_PUBLIC_BLOCKS,
    publicRecordLimits: {
      characters: MAX_PUBLIC_RECORD_CHARACTERS,
      words: MAX_PUBLIC_RECORD_WORDS,
    },
    promptId: PROMPT_ID,
    promptVersion: PROMPT_VERSION,
    restrictedCopyLimits: {
      characters: MAX_RESTRICTED_CHARACTERS,
      words: MAX_RESTRICTED_WORDS,
    },
    schemaVersion: RESULT_SCHEMA_VERSION,
    topicCatalogue: policyTopicCatalogue.map((topic) => ({
      id: topic.id,
      keywords: [...topic.keywords],
      name: topic.name,
    })),
  }));
}

async function analyzerConfigHash() {
  return sha256Hex(stableJson({
    inputSchemaVersion: INPUT_SCHEMA_VERSION,
    method: METHOD,
    model: MODEL,
    modelVersion: MODEL_VERSION,
    matcherVersion: MATCHER_VERSION,
    maxPublicBlocks: MAX_PUBLIC_BLOCKS,
    promptHash: await promptHash(),
    provider: PROVIDER,
    publicRecordLimits: [MAX_PUBLIC_RECORD_CHARACTERS, MAX_PUBLIC_RECORD_WORDS],
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    restrictedCopyLimits: [MAX_RESTRICTED_CHARACTERS, MAX_RESTRICTED_WORDS],
    topicCatalogue: policyTopicCatalogue.map((topic) => ({
      id: topic.id,
      keywords: [...topic.keywords],
      name: topic.name,
    })),
  }));
}

async function sourceForAnalysis(db: D1Database, document: ReadableDocumentV1) {
  const row = await db
    .prepare(
      `SELECT item.id AS source_item_id, item.source_id, item.title AS item_title,
              item.latest_version_id,
              item.content_hash AS item_content_hash,
              version.id AS source_version_id,
              version.payload AS source_version_payload,
              version.payload_hash AS source_version_hash,
              version.parser_version AS source_version_parser,
              capture.id AS current_capture_id,
              capture.snapshot_id, capture.extractor_config_hash AS capture_config_hash,
              capture.extraction_manifest_json, capture.extraction_manifest_hash,
              capture.readable_text_hash, capture.rights_state AS capture_rights_state,
              snapshot.capture_url, snapshot.resolved_url,
              snapshot.content_hash AS raw_content_hash,
              source.name AS source_name, source.active AS source_active,
              source.source_tier, source.rights_state AS source_rights_state,
              assessment.route AS collection_route,
              assessment.ruleset_id AS collection_ruleset_id,
              assessment.canonical_reason_json,
              assessment.canonical_reason_hash
         FROM source_document_captures capture
         JOIN source_document_heads document_head
           ON document_head.source_item_id = capture.source_item_id
          AND document_head.current_capture_id = capture.id
         JOIN source_item_versions version ON version.id = capture.source_item_version_id
         JOIN source_items item ON item.id = version.source_item_id
         JOIN source_snapshots snapshot ON snapshot.id = capture.snapshot_id
         JOIN sources source ON source.id = item.source_id
         JOIN source_item_version_collection_assessments assessment
           ON assessment.source_item_version_id = version.id
         JOIN audit_events relevance_audit
           ON relevance_audit.id = assessment.created_by_audit_event_id
          AND relevance_audit.action = 'source-item.relevance-assessed'
          AND relevance_audit.entity_type = 'source-item-version'
          AND relevance_audit.entity_id = version.id
          AND json_extract(relevance_audit.payload, '$.sourceItemId') = item.id
          AND json_extract(relevance_audit.payload, '$.collectionReasonHash') = assessment.canonical_reason_hash
          AND json_extract(relevance_audit.payload, '$.collectionRoute') = assessment.route
          AND json_extract(relevance_audit.payload, '$.collectionRuleset') = assessment.ruleset_id
        WHERE capture.id = ?
          AND capture.source_item_id = ?
          AND capture.source_item_version_id = ?
          AND capture.snapshot_id = ?`,
    )
    .bind(
      document.documentCaptureId,
      document.sourceItemId,
      document.sourceItemVersionId,
      document.snapshotId,
    )
    .first<AnalysisSourceRow>();
  if (!row) throw new MachineAnalysisValidationError("The readable document provenance is missing.");
  return row;
}

async function candidateDetectionUniverse(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT candidacy.id AS candidacy_id, people.full_name,
              candidacy.constituency_id, constituency.name AS constituency_name,
              profile.current_basis_hash,
              CASE WHEN ${approvedCandidateProfileBasisSql("profile")} THEN 1 ELSE 0 END
                AS public_identity
         FROM candidacies candidacy
         JOIN people ON people.id = candidacy.person_id
         JOIN constituencies constituency ON constituency.id = candidacy.constituency_id
         LEFT JOIN candidate_profiles profile ON profile.candidacy_id = candidacy.id
        WHERE candidacy.declaration_status != 'source-removed'
        ORDER BY people.full_name, candidacy.id`,
    )
    .all<{
      candidacy_id: string;
      constituency_id: string;
      constituency_name: string;
      current_basis_hash: string | null;
      full_name: string;
      public_identity: number;
    }>();
  return rows.results.map((row) => ({
    basisHash: row.current_basis_hash ?? "",
    candidacyId: row.candidacy_id,
    constituencyId: row.constituency_id,
    constituencyName: row.constituency_name,
    fullName: row.full_name,
    publicIdentity: row.public_identity === 1,
  } satisfies CandidateSignalSource));
}

async function publicCandidates(db: D1Database) {
  return (await candidateDetectionUniverse(db)).filter((candidate) => candidate.publicIdentity);
}

async function activeTopics(db: D1Database) {
  const rows = await db
    .prepare("SELECT id, name FROM policy_topics WHERE active = 1 ORDER BY id")
    .all<TopicSignalSource>();
  return rows.results;
}

async function validateReadableDocument(
  document: ReadableDocumentV1,
  source: AnalysisSourceRow,
) {
  if (document.schema !== "peoples-isle.readable-document.v1") {
    throw new MachineAnalysisValidationError("The readable document schema is not supported.");
  }
  if (document.offsetUnits.text !== "utf16-code-unit" || document.offsetUnits.raw !== "utf8-byte") {
    throw new MachineAnalysisValidationError("The readable document offset units are not supported.");
  }
  if (
    document.sourceId !== source.source_id
    || document.sourceItemId !== source.source_item_id
    || document.sourceItemVersionId !== source.source_version_id
    || document.documentCaptureId !== source.current_capture_id
    || document.snapshotId !== source.snapshot_id
    || document.rawContentHash !== source.raw_content_hash
    || document.textHash !== source.readable_text_hash
    || document.extractor.configHash !== source.capture_config_hash
  ) {
    throw new MachineAnalysisValidationError("The readable document no longer matches its current capture.");
  }
  if (
    source.latest_version_id !== source.source_version_id
    || source.item_content_hash !== source.source_version_hash
  ) {
    throw new MachineAnalysisValidationError("The source item changed before analysis could complete.");
  }
  if (
    source.source_active !== 1
    || source.source_tier < 1
    || source.source_tier > 3
    || source.capture_rights_state !== source.source_rights_state
    || !["restricted-copy", "metadata-only", "public-record"].includes(source.source_rights_state)
    || !isSafeHttpsUrl(source.capture_url)
    || !isSafeHttpsUrl(source.resolved_url)
    || document.requestedUrl !== source.capture_url
    || document.resolvedUrl !== source.resolved_url
  ) {
    throw new MachineAnalysisValidationError("The source is not eligible for automatic analysis.");
  }
  if (source.collection_route !== "evidence-review" && source.collection_route !== "context-monitoring") {
    throw new MachineAnalysisValidationError("Broad-monitoring material cannot be automatically published.");
  }
  const collectionReason = await readVerifiedCollectionReason({
    canonical_reason_hash: source.canonical_reason_hash,
    canonical_reason_json: source.canonical_reason_json,
    collection_route: source.collection_route,
    collection_ruleset_id: source.collection_ruleset_id,
  });
  if (!collectionReason) {
    throw new MachineAnalysisValidationError("The collection assessment could not be verified.");
  }
  if (document.text.normalize("NFKC") !== document.text || document.text.includes("\r")) {
    throw new MachineAnalysisValidationError("The readable document text is not canonically normalised.");
  }
  if (await sha256Hex(document.text) !== document.textHash) {
    throw new MachineAnalysisValidationError("The readable document text hash does not match.");
  }
  if (await sha256Hex(source.extraction_manifest_json) !== source.extraction_manifest_hash) {
    throw new MachineAnalysisValidationError("The persisted extraction manifest hash does not match.");
  }
  let persistedManifest: unknown;
  try {
    persistedManifest = JSON.parse(source.extraction_manifest_json);
  } catch {
    throw new MachineAnalysisValidationError("The persisted extraction manifest is not valid JSON.");
  }
  if (
    !persistedManifest
    || typeof persistedManifest !== "object"
    || Array.isArray(persistedManifest)
    || !Array.isArray((persistedManifest as Record<string, unknown>).blocks)
  ) {
    throw new MachineAnalysisValidationError("The persisted extraction manifest has no block list.");
  }
  const persistedBlocks = (persistedManifest as { blocks: unknown[] }).blocks;
  const callbackBlockManifest = document.blocks.map(
    ({ hash, id, index, kind, rawByteEnd, rawByteStart, textEnd, textStart }) => ({
      hash,
      id,
      index,
      kind,
      rawByteEnd,
      rawByteStart,
      textEnd,
      textStart,
    }),
  );
  if (stableJson(persistedBlocks) !== stableJson(callbackBlockManifest)) {
    throw new MachineAnalysisValidationError("The callback block boundaries do not match the captured manifest.");
  }
  const seenBlockIds = new Set<string>();
  let previousTextEnd = -1;
  for (const block of [...document.blocks].sort((left, right) => left.index - right.index)) {
    if (seenBlockIds.has(block.id)) {
      throw new MachineAnalysisValidationError("Readable block identifiers must be unique.");
    }
    seenBlockIds.add(block.id);
    if (
      !Number.isInteger(block.index)
      || !Number.isInteger(block.textStart)
      || !Number.isInteger(block.textEnd)
      || !Number.isInteger(block.rawByteStart)
      || !Number.isInteger(block.rawByteEnd)
      || block.textStart < 0
      || block.textEnd <= block.textStart
      || block.textStart < previousTextEnd
      || block.rawByteStart < 0
      || block.rawByteEnd <= block.rawByteStart
      || document.text.slice(block.textStart, block.textEnd) !== block.text
      || await sha256Hex(stableJson({
        kind: block.kind,
        rawByteEnd: block.rawByteEnd,
        rawByteStart: block.rawByteStart,
        text: block.text,
      })) !== block.hash
    ) {
      throw new MachineAnalysisValidationError("A readable block failed its offset or hash check.");
    }
    previousTextEnd = block.textEnd;
  }
  return collectionReason;
}

function topicTerms(topic: TopicSignalSource) {
  const catalogue = policyTopicCatalogue.find((entry) => entry.id === topic.id);
  return [...new Set([
    topic.name,
    ...(catalogue?.keywords ?? []),
  ].map((term) => term.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
}

async function frozenSignal(
  input: Omit<FrozenSignal, "mentionHash" | "signalBasisHash">,
) {
  const mentionHash = await sha256Hex(input.mentionText);
  const signalBasisHash = await sha256Hex(stableJson({
    associationKind: input.associationKind,
    blockHash: input.blockHash,
    blockId: input.blockId,
    confidence: input.confidence,
    entityId: input.entityId,
    entityType: input.entityType,
    mentionHash,
    rawBlockEnd: input.rawBlockEnd,
    rawBlockStart: input.rawBlockStart,
    schema: "peoples-isle.machine-association-signal.v1",
    signalSource: input.signalSource,
    textEnd: input.textEnd,
    textStart: input.textStart,
  }));
  return { ...input, mentionHash, signalBasisHash } satisfies FrozenSignal;
}

async function extractDeterministically(
  document: ReadableDocumentV1,
  source: AnalysisSourceRow,
  collectionReason: Awaited<ReturnType<typeof readVerifiedCollectionReason>>,
  candidates: CandidateSignalSource[],
  topics: TopicSignalSource[],
) {
  if (!collectionReason) throw new MachineAnalysisValidationError("Collection reason is missing.");
  const candidateMatches = new Map<string, Array<{
    block: ReadableDocumentV1["blocks"][number];
    candidate: CandidateSignalSource;
    end: number;
    start: number;
    text: string;
  }>>();
  for (const candidate of candidates) {
    for (const block of document.blocks) {
      for (const match of exactMatches(block.text, candidate.fullName)) {
        const matches = candidateMatches.get(candidate.candidacyId) ?? [];
        matches.push({ block, candidate, ...match });
        candidateMatches.set(candidate.candidacyId, matches);
      }
    }
  }
  const unambiguousCandidateId = candidateMatches.size === 1
    ? [...candidateMatches.keys()][0]
    : null;

  const collectionCandidateIds = new Set(collectionReason.candidates.map((signal) => signal.id));
  const publicCandidateIds = new Set(
    candidates.filter((candidate) => candidate.publicIdentity).map((candidate) => candidate.candidacyId),
  );
  const hasNonPublicCandidateMatch = [...candidateMatches.values()]
    .flat()
    .some((match) => !match.candidate.publicIdentity);
  const hasNonPublicCandidateSignal = [...collectionCandidateIds].some(
    (candidateId) => !publicCandidateIds.has(candidateId),
  );
  const collectionTopicIds = new Set(collectionReason.topics.map((signal) => signal.id));
  const topicMatchesByBlock = new Map<string, Array<{
    end: number;
    start: number;
    text: string;
    topic: TopicSignalSource;
  }>>();
  for (const topic of topics) {
    for (const block of document.blocks) {
      let firstMatch: { end: number; start: number; text: string } | null = null;
      for (const term of topicTerms(topic)) {
        const match = exactMatches(block.text, term)[0];
        if (match && (!firstMatch || match.start < firstMatch.start)) firstMatch = match;
      }
      if (firstMatch) {
        const matches = topicMatchesByBlock.get(block.id) ?? [];
        matches.push({ ...firstMatch, topic });
        topicMatchesByBlock.set(block.id, matches);
      }
    }
  }

  const sortedBlocks = [...document.blocks].sort((left, right) => left.index - right.index);
  const selectedBlocks: typeof sortedBlocks = [];
  let previousSelectedIndex: number | null = null;
  for (const block of sortedBlocks) {
    if (!topicMatchesByBlock.has(block.id) || !boundedPublicQuote(source.source_rights_state, block.text)) {
      continue;
    }
    // Never publish adjacent extracts that could be concatenated into a source
    // reconstruction. One complete deterministic block is one citation.
    if (previousSelectedIndex !== null && block.index === previousSelectedIndex + 1) continue;
    selectedBlocks.push(block);
    previousSelectedIndex = block.index;
    if (selectedBlocks.length >= MAX_PUBLIC_BLOCKS) break;
  }

  const signals: FrozenSignal[] = [];
  const findings: ExtractedFinding[] = [];
  const subjectMatch = unambiguousCandidateId
    && collectionCandidateIds.has(unambiguousCandidateId)
    && candidateMatches.get(unambiguousCandidateId)?.[0]?.candidate.publicIdentity
    ? candidateMatches.get(unambiguousCandidateId)?.sort(
        (left, right) => left.block.index - right.block.index || left.start - right.start,
      )[0] ?? null
    : null;
  if (subjectMatch) {
    signals.push(await frozenSignal({
      associationKind: "subject",
      blockHash: subjectMatch.block.hash,
      blockId: subjectMatch.block.id,
      confidence: 1,
      entityId: subjectMatch.candidate.candidacyId,
      entityType: "candidacy",
      mentionText: subjectMatch.text,
      rawBlockEnd: subjectMatch.block.rawByteEnd,
      rawBlockStart: subjectMatch.block.rawByteStart,
      signalSource: "collection-assessment",
      textEnd: subjectMatch.block.textStart + subjectMatch.end,
      textStart: subjectMatch.block.textStart + subjectMatch.start,
    }));
    signals.push(await frozenSignal({
      associationKind: "context",
      blockHash: subjectMatch.block.hash,
      blockId: subjectMatch.block.id,
      confidence: 1,
      entityId: subjectMatch.candidate.constituencyId,
      entityType: "constituency",
      mentionText: subjectMatch.text,
      rawBlockEnd: subjectMatch.block.rawByteEnd,
      rawBlockStart: subjectMatch.block.rawByteStart,
      signalSource: "collection-assessment",
      textEnd: subjectMatch.block.textStart + subjectMatch.end,
      textStart: subjectMatch.block.textStart + subjectMatch.start,
    }));
  }
  for (const block of selectedBlocks) {
    const candidateMatch = unambiguousCandidateId
      ? candidateMatches.get(unambiguousCandidateId)?.find((match) => match.block.id === block.id) ?? null
      : null;
    const isSubjectSpan = Boolean(
      subjectMatch
      && subjectMatch.block.id === block.id
      && subjectMatch.start === candidateMatch?.start,
    );
    if (candidateMatch?.candidate.publicIdentity && !isSubjectSpan) {
      const candidateSignal = await frozenSignal({
        associationKind: "mentioned",
        blockHash: block.hash,
        blockId: block.id,
        confidence: 1,
        entityId: candidateMatch.candidate.candidacyId,
        entityType: "candidacy",
        mentionText: candidateMatch.text,
        rawBlockEnd: block.rawByteEnd,
        rawBlockStart: block.rawByteStart,
        signalSource: collectionCandidateIds.has(candidateMatch.candidate.candidacyId)
          ? "collection-assessment"
          : "deterministic-text-match",
        textEnd: block.textStart + candidateMatch.end,
        textStart: block.textStart + candidateMatch.start,
      });
      signals.push(candidateSignal);
      signals.push(await frozenSignal({
        associationKind: "context",
        blockHash: block.hash,
        blockId: block.id,
        confidence: 1,
        entityId: candidateMatch.candidate.constituencyId,
        entityType: "constituency",
        mentionText: candidateMatch.text,
        rawBlockEnd: block.rawByteEnd,
        rawBlockStart: block.rawByteStart,
        signalSource: "deterministic-text-match",
        textEnd: block.textStart + candidateMatch.end,
        textStart: block.textStart + candidateMatch.start,
      }));
    }

    const topicMatches = (topicMatchesByBlock.get(block.id) ?? [])
      .sort((left, right) => left.topic.id.localeCompare(right.topic.id));
    for (const match of topicMatches) {
      signals.push(await frozenSignal({
        associationKind: "mentioned",
        blockHash: block.hash,
        blockId: block.id,
        confidence: 1,
        entityId: match.topic.id,
        entityType: "topic",
        mentionText: match.text,
        rawBlockEnd: block.rawByteEnd,
        rawBlockStart: block.rawByteStart,
        signalSource: collectionTopicIds.has(match.topic.id)
          ? "collection-assessment"
          : "deterministic-text-match",
        textEnd: block.textStart + match.end,
        textStart: block.textStart + match.start,
      }));
      findings.push({
        blockHash: block.hash,
        blockId: block.id,
        candidacyId: (candidateMatch?.candidate.publicIdentity ? candidateMatch : subjectMatch)?.candidate.candidacyId ?? null,
        confidence: 1,
        constituencyId: (candidateMatch?.candidate.publicIdentity ? candidateMatch : subjectMatch)?.candidate.constituencyId ?? null,
        findingKind: "reported-passage",
        propositionKey: `${match.topic.id}:${block.hash.slice(0, 20)}`,
        propositionText: `Reported source passage associated with “${match.topic.name}”; no candidate stance has been inferred.`,
        quote: block.text,
        quoteHash: await sha256Hex(block.text),
        rawBlockEnd: block.rawByteEnd,
        rawBlockStart: block.rawByteStart,
        stance: null,
        stanceBasis: "none",
        textEnd: block.textEnd,
        textStart: block.textStart,
        topicId: match.topic.id,
      });
    }
  }

  const dedupedSignals = [...new Map(
    signals.map((signal) => [
      [signal.entityType, signal.entityId, signal.blockId, signal.textStart, signal.textEnd].join(":"),
      signal,
    ]),
  ).values()].sort((left, right) =>
    left.blockId.localeCompare(right.blockId)
    || left.entityType.localeCompare(right.entityType)
    || left.entityId.localeCompare(right.entityId)
    || left.textStart - right.textStart
  );
  const dedupedFindings = [...new Map(
    findings.map((finding) => [finding.propositionKey, finding]),
  ).values()].sort((left, right) => left.propositionKey.localeCompare(right.propositionKey));
  return {
    candidateAmbiguous: candidateMatches.size > 1,
    candidateGateCode: hasNonPublicCandidateMatch || hasNonPublicCandidateSignal
      ? "unpublished-candidate-signal"
      : ["candidate-directory-v1", "candidate-profile-v1"].includes(source.source_version_parser)
          && (!subjectMatch || candidateMatches.size !== 1)
        ? "candidate-profile-identity-not-public"
        : candidateMatches.size > 1
      ? "ambiguous-candidate-signal"
      : candidateMatches.size === 1 && !subjectMatch
        ? "candidate-assessment-mismatch"
        : null,
    findings: dedupedFindings,
    signals: dedupedSignals,
  };
}

async function existingAnalysisReceipt(db: D1Database, resultId: string) {
  const row = await db
    .prepare(
      `SELECT result.id AS result_id, result.input_id, result.gate_status,
              result.gate_code, head.publication_state,
              review.id AS review_id,
              audit.sequence AS audit_sequence, audit.event_hash AS audit_event_hash
         FROM machine_analysis_results result
         JOIN machine_analysis_heads head ON head.latest_result_id = result.id
         JOIN audit_events audit ON audit.id = result.created_by_audit_event_id
         LEFT JOIN reviews review
           ON review.target_type = 'machine-analysis-result'
          AND review.target_id = result.id
          AND NOT EXISTS (
            SELECT 1 FROM reviews successor WHERE successor.supersedes_review_id = review.id
          )
        WHERE result.id = ?`,
    )
    .bind(resultId)
    .first<ExistingAnalysisRow>();
  return row
    ? {
        auditEventHash: row.audit_event_hash,
        auditSequence: row.audit_sequence,
        gateCode: row.gate_code,
        gateStatus: row.gate_status,
        idempotent: true,
        inputId: row.input_id,
        publicationState: row.publication_state,
        resultId: row.result_id,
        reviewId: row.review_id,
      } satisfies MachineAnalysisReceipt
    : null;
}

function boundedError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 900);
}

export async function analyzeReadableDocument(
  db: D1Database,
  document: ReadableDocumentV1,
  context: AnalysisContext,
): Promise<MachineAnalysisReceipt> {
  const configHash = await analyzerConfigHash();
  const jobId = await deterministicId("analysis-job", document.documentCaptureId, configHash);
  await db
    .prepare(
      `INSERT INTO machine_analysis_jobs (
         id, source_item_id, source_item_version_id, document_capture_id,
         analyzer_config_hash, status, attempt_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'running', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(document_capture_id, analyzer_config_hash) DO UPDATE SET
         status = CASE
           WHEN machine_analysis_jobs.status = 'succeeded' THEN 'succeeded'
           ELSE 'running'
         END,
         attempt_count = CASE
           WHEN machine_analysis_jobs.status = 'succeeded' THEN machine_analysis_jobs.attempt_count
           ELSE machine_analysis_jobs.attempt_count + 1
         END,
         lease_token = NULL,
         lease_expires_at = NULL,
         last_error_code = NULL,
         last_error_summary = NULL,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      jobId,
      document.sourceItemId,
      document.sourceItemVersionId,
      document.documentCaptureId,
      configHash,
    )
    .run();

  try {
    const source = await sourceForAnalysis(db, document);
    const collectionReason = await validateReadableDocument(document, source);
    const [candidates, topics] = await Promise.all([
      candidateDetectionUniverse(db),
      activeTopics(db),
    ]);
    const extracted = await extractDeterministically(
      document,
      source,
      collectionReason,
      candidates,
      topics,
    );
    const blockManifest = await Promise.all([...document.blocks]
      .sort((left, right) => left.index - right.index)
      .map(async (block) => ({
        hash: block.hash,
        id: block.id,
        index: block.index,
        kind: block.kind,
        rawEnd: block.rawByteEnd,
        rawStart: block.rawByteStart,
        textEnd: block.textEnd,
        textHash: await sha256Hex(block.text),
        textStart: block.textStart,
      })));
    const blockManifestJson = stableJson(blockManifest);
    const blockManifestHash = await sha256Hex(blockManifestJson);
    const associationBasisJson = stableJson({
      candidateAmbiguous: extracted.candidateAmbiguous,
      collectionReasonHash: source.canonical_reason_hash,
      collectionRoute: source.collection_route,
      collectionRuleset: source.collection_ruleset_id,
      schema: "peoples-isle.machine-association-basis.v1",
      signals: extracted.signals,
    });
    const associationBasisHash = await sha256Hex(associationBasisJson);
    const inputId = await deterministicId(
      "analysis-input",
      document.documentCaptureId,
      document.textHash,
      blockManifestHash,
      associationBasisHash,
      INPUT_SCHEMA_VERSION,
    );
    const resultId = await deterministicId("analysis-result", inputId, configHash);
    const priorResult = await db
      .prepare(
        `SELECT prior.id, prior.result_version
           FROM machine_analysis_results prior
          WHERE prior.input_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM machine_analysis_results successor
               WHERE successor.supersedes_result_id = prior.id
            )
          ORDER BY prior.result_version DESC
          LIMIT 1`,
      )
      .bind(inputId)
      .first<{ id: string; result_version: number }>();
    const resultVersion = (priorResult?.result_version ?? 0) + 1;
    const supersedesResultId = priorResult?.id ?? null;
    const entityRows = await Promise.all(extracted.signals.map(async (signal) => ({
      ...signal,
      id: await deterministicId(
        "analysis-entity",
        resultId,
        signal.entityType,
        signal.entityId,
        signal.blockId,
        String(signal.textStart),
        String(signal.textEnd),
      ),
    })));
    const findingRows = await Promise.all(extracted.findings.map(async (finding) => ({
      ...finding,
      id: await deterministicId("analysis-finding", resultId, finding.propositionKey),
    })));
    const gateStatus = findingRows.length > 0 && !extracted.candidateGateCode
      ? "eligible"
      : "held";
    const gateCode = extracted.candidateGateCode ?? (findingRows.length > 0
      ? "eligible-deterministic-extractive-v1"
      : "no-safe-extractive-finding");
    const computedPromptHash = await promptHash();
    const resultJson = stableJson({
      associationBasisHash,
      entities: entityRows,
      findings: findingRows,
      inputId,
      method: METHOD,
      noMentionImpliesStance: true,
      resultId,
      schema: RESULT_SCHEMA_VERSION,
    });
    const resultHash = await sha256Hex(resultJson);
    const reviewId = gateStatus === "eligible"
      ? await deterministicId("analysis-review", resultId, "automatic-approved")
      : null;
    const publicationState = gateStatus === "eligible" ? "published" : "withheld";

    const replay = await existingAnalysisReceipt(db, resultId);
    if (replay) {
      await db
        .prepare(
          `UPDATE machine_analysis_jobs
              SET status = 'succeeded', result_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        )
        .bind(resultId, jobId)
        .run();
      return replay;
    }

    try {
      const audit = await appendAuditEventWithStatements(
        db,
        {
          action: "machine-analysis.completed",
          actorId: context.actor.id,
          actorType: context.actor.type,
          entityId: resultId,
          entityType: "machine-analysis-result",
          payload: {
            associationBasisHash,
            blockManifestHash,
            documentCaptureId: document.documentCaptureId,
            gateStatus,
            headPublicationState: publicationState,
            inputId,
            latestResultId: resultId,
            publishedResultId: gateStatus === "eligible" ? resultId : null,
            resultVersion,
            resultHash,
            resultId,
            reviewId,
            sourceItemId: document.sourceItemId,
            sourceItemVersionId: document.sourceItemVersionId,
          },
        },
        () => [],
        (event) => {
          const statements: D1PreparedStatement[] = [
            db
              .prepare(
                `INSERT INTO machine_analysis_inputs (
                   id, source_item_id, source_item_version_id, document_capture_id,
                   source_snapshot_id, raw_content_hash, text_hash,
                   extractor_config_hash, input_schema_version,
                   block_manifest_json, block_manifest_hash,
                   association_basis_json, association_basis_hash,
                   collection_reason_hash, collection_ruleset_id, collection_route,
                   created_by_audit_event_id, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO NOTHING`,
              )
              .bind(
                inputId,
                document.sourceItemId,
                document.sourceItemVersionId,
                document.documentCaptureId,
                document.snapshotId,
                document.rawContentHash,
                document.textHash,
                document.extractor.configHash,
                INPUT_SCHEMA_VERSION,
                blockManifestJson,
                blockManifestHash,
                associationBasisJson,
                associationBasisHash,
                source.canonical_reason_hash,
                source.collection_ruleset_id,
                source.collection_route,
                event.id,
                event.createdAt,
              ),
            db
              .prepare(
                `INSERT INTO machine_analysis_results (
                   id, input_id, result_version, supersedes_result_id,
                   provider, model, model_version, method,
                   prompt_id, prompt_version, prompt_hash, schema_version,
                   result_json, result_hash, overall_confidence,
                   gate_status, gate_code, machine_label,
                   created_by_audit_event_id, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                resultId,
                inputId,
                resultVersion,
                supersedesResultId,
                PROVIDER,
                MODEL,
                MODEL_VERSION,
                METHOD,
                PROMPT_ID,
                PROMPT_VERSION,
                computedPromptHash,
                RESULT_SCHEMA_VERSION,
                resultJson,
                resultHash,
                findingRows.length > 0 ? 1 : 0,
                gateStatus,
                gateCode,
                "automatic-extractive",
                event.id,
                event.createdAt,
              ),
          ];
          for (const entity of entityRows) {
            statements.push(
              db
                .prepare(
                  `INSERT INTO machine_analysis_entities (
                     id, result_id, entity_type, entity_id, association_kind,
                     mention_text, mention_hash, block_id, block_hash,
                     text_start_offset, text_end_offset,
                     raw_start_offset, raw_end_offset, confidence,
                     signal_source, signal_basis_hash, created_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(
                  entity.id,
                  resultId,
                  entity.entityType,
                  entity.entityId,
                  entity.associationKind,
                  entity.mentionText,
                  entity.mentionHash,
                  entity.blockId,
                  entity.blockHash,
                  entity.textStart,
                  entity.textEnd,
                  entity.rawBlockStart,
                  entity.rawBlockEnd,
                  entity.confidence,
                  entity.signalSource,
                  entity.signalBasisHash,
                  event.createdAt,
                ),
            );
          }
          for (const finding of findingRows) {
            statements.push(
              db
                .prepare(
                  `INSERT INTO machine_analysis_findings (
                     id, result_id, proposition_key, finding_kind,
                     candidacy_id, topic_id, constituency_id,
                     proposition_text, stance, stance_basis,
                     quote, quote_hash, block_id, block_hash,
                     text_start_offset, text_end_offset,
                     raw_start_offset, raw_end_offset, confidence, created_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'none', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(
                  finding.id,
                  resultId,
                  finding.propositionKey,
                  finding.findingKind,
                  finding.candidacyId,
                  finding.topicId,
                  finding.constituencyId,
                  finding.propositionText,
                  finding.quote,
                  finding.quoteHash,
                  finding.blockId,
                  finding.blockHash,
                  finding.textStart,
                  finding.textEnd,
                  finding.rawBlockStart,
                  finding.rawBlockEnd,
                  finding.confidence,
                  event.createdAt,
                ),
            );
          }
          if (reviewId) {
            statements.push(
              db
                .prepare(
                  `INSERT INTO reviews (
                     id, target_type, target_id, decision, rationale,
                     reviewer_id, supersedes_review_id, created_at
                   ) VALUES (?, 'machine-analysis-result', ?, 'approved', ?, ?, NULL, ?)`,
                )
                .bind(
                  reviewId,
                  resultId,
                  "Automatically published after all deterministic extractive gates passed.",
                  AUTO_REVIEWER_ID,
                  event.createdAt,
                ),
            );
          }
          statements.push(
            db
              .prepare(
                `INSERT INTO machine_analysis_heads (
                   source_item_id, current_input_id, latest_result_id,
                   published_result_id, analysis_state, publication_state,
                   updated_by_audit_event_id, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(source_item_id) DO UPDATE SET
                   current_input_id = excluded.current_input_id,
                   latest_result_id = excluded.latest_result_id,
                   published_result_id = excluded.published_result_id,
                   analysis_state = excluded.analysis_state,
                   publication_state = excluded.publication_state,
                   updated_by_audit_event_id = excluded.updated_by_audit_event_id,
                   updated_at = excluded.updated_at`,
              )
              .bind(
                document.sourceItemId,
                inputId,
                resultId,
                gateStatus === "eligible" ? resultId : null,
                gateStatus === "eligible" ? "ready" : "held",
                publicationState,
                event.id,
                event.createdAt,
              ),
            db
              .prepare(
                `UPDATE machine_analysis_jobs
                    SET status = 'succeeded', result_id = ?,
                        lease_token = NULL, lease_expires_at = NULL,
                        last_error_code = NULL, last_error_summary = NULL,
                        updated_at = ?
                  WHERE id = ?`,
              )
              .bind(resultId, event.createdAt, jobId),
          );
          return statements;
        },
      );
      return {
        auditEventHash: audit.eventHash,
        auditSequence: audit.sequence,
        gateCode,
        gateStatus,
        idempotent: false,
        inputId,
        publicationState,
        resultId,
        reviewId,
      };
    } catch (error) {
      const winner = await existingAnalysisReceipt(db, resultId);
      if (winner) return winner;
      throw error;
    }
  } catch (error) {
    const validation = error instanceof MachineAnalysisValidationError;
    await db
      .prepare(
        `UPDATE machine_analysis_jobs
            SET status = ?, last_error_code = ?, last_error_summary = ?,
                lease_token = NULL, lease_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status != 'succeeded'`,
      )
      .bind(
        validation ? "quarantined" : "failed",
        validation ? "validation-failed" : "analysis-failed",
        boundedError(error),
        jobId,
      )
      .run();
    throw error;
  }
}

type CurrentAnalysisDecision = {
  current_input_id: string;
  current_review_decision: "approved" | "rejected";
  current_review_id: string;
  latest_result_id: string;
  publication_state: "published" | "withheld";
  published_result_id: string | null;
  source_item_id: string;
};

async function currentAnalysisDecision(db: D1Database, resultId: string) {
  return db
    .prepare(
      `SELECT head.source_item_id, head.current_input_id, head.latest_result_id,
              head.published_result_id, head.publication_state,
              review.id AS current_review_id,
              review.decision AS current_review_decision
         FROM machine_analysis_heads head
         JOIN reviews review
           ON review.target_type = 'machine-analysis-result'
          AND review.target_id = head.latest_result_id
          AND NOT EXISTS (
            SELECT 1 FROM reviews successor WHERE successor.supersedes_review_id = review.id
          )
        WHERE head.latest_result_id = ?`,
    )
    .bind(resultId)
    .first<CurrentAnalysisDecision>();
}

function normalizedRationale(value: string) {
  const rationale = value.trim().replace(/\s+/gu, " ");
  if (rationale.length < 8 || rationale.length > 2_000) {
    throw new MachineAnalysisValidationError("A review rationale must be between 8 and 2,000 characters.");
  }
  return rationale;
}

async function existingReviewReceipt(db: D1Database, reviewId: string) {
  const row = await db
    .prepare(
      `SELECT review.id, review.target_id, review.decision,
              review.supersedes_review_id, review.created_at,
              head.publication_state,
              audit.sequence, audit.event_hash
         FROM reviews review
         JOIN machine_analysis_heads head ON head.latest_result_id = review.target_id
         JOIN audit_events audit
           ON audit.action = 'machine-analysis.reviewed'
          AND audit.entity_type = 'machine-analysis-result'
          AND audit.entity_id = review.target_id
          AND json_extract(audit.payload, '$.reviewId') = review.id
        WHERE review.id = ?
          AND review.target_type = 'machine-analysis-result'`,
    )
    .bind(reviewId)
    .first<{
      created_at: string;
      decision: "approved" | "rejected";
      event_hash: string;
      id: string;
      publication_state: "published" | "withheld";
      sequence: number;
      supersedes_review_id: string;
      target_id: string;
    }>();
  return row
    ? {
        auditEventHash: row.event_hash,
        auditSequence: row.sequence,
        createdAt: row.created_at,
        decision: row.decision,
        idempotent: true,
        publicationState: row.publication_state,
        resultId: row.target_id,
        reviewId: row.id,
        supersedesReviewId: row.supersedes_review_id,
      } satisfies MachineAnalysisReviewReceipt
    : null;
}

export async function reviewMachineAnalysisResult(
  db: D1Database,
  input: {
    decision: "approved" | "rejected";
    expectedReviewId: string;
    rationale: string;
    resultId: string;
    reviewerId: string;
  },
): Promise<MachineAnalysisReviewReceipt> {
  if (!input.resultId || !input.expectedReviewId || !input.reviewerId.trim()) {
    throw new MachineAnalysisValidationError("The review identity is incomplete.");
  }
  const rationale = normalizedRationale(input.rationale);
  const rationaleHash = await sha256Hex(rationale);
  const reviewId = await deterministicId(
    "analysis-review",
    input.resultId,
    input.expectedReviewId,
    input.decision,
    input.reviewerId,
    rationaleHash,
  );
  const replay = await existingReviewReceipt(db, reviewId);
  if (replay) return replay;

  const current = await currentAnalysisDecision(db, input.resultId);
  if (
    !current
    || current.latest_result_id !== input.resultId
    || current.current_review_id !== input.expectedReviewId
    || current.current_review_decision === input.decision
    || (input.decision === "rejected" && current.published_result_id !== input.resultId)
    || (input.decision === "approved" && current.published_result_id !== null)
  ) {
    throw new MachineAnalysisConflictError();
  }
  const publicationState = input.decision === "approved" ? "published" : "withheld";
  const publishedResultId = input.decision === "approved" ? input.resultId : null;

  try {
    const audit = await appendAuditEventWithStatements(
      db,
      {
        action: "machine-analysis.reviewed",
        actorId: input.reviewerId,
        actorType: "admin",
        entityId: input.resultId,
        entityType: "machine-analysis-result",
        payload: {
          decision: input.decision,
          headPublicationState: publicationState,
          inputId: current.current_input_id,
          latestResultId: input.resultId,
          previousPublishedResultId: current.published_result_id,
          publishedResultId,
          rationaleHash,
          resultId: input.resultId,
          reviewId,
          sourceItemId: current.source_item_id,
          supersedesReviewId: input.expectedReviewId,
        },
      },
      () => [],
      (event) => [
        db
          .prepare(
            `INSERT INTO reviews (
               id, target_type, target_id, decision, rationale,
               reviewer_id, supersedes_review_id, created_at
             ) VALUES (?, 'machine-analysis-result', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            reviewId,
            input.resultId,
            input.decision,
            rationale,
            input.reviewerId,
            input.expectedReviewId,
            event.createdAt,
          ),
        db
          .prepare(
            `UPDATE machine_analysis_heads SET
               published_result_id = ?,
               analysis_state = 'ready',
               publication_state = ?,
               updated_by_audit_event_id = ?,
               updated_at = ?
             WHERE source_item_id = ?
               AND current_input_id = ?
               AND latest_result_id = ?
               AND published_result_id IS ?
               AND publication_state = ?`,
          )
          .bind(
            publishedResultId,
            publicationState,
            event.id,
            event.createdAt,
            current.source_item_id,
            current.current_input_id,
            input.resultId,
            current.published_result_id,
            current.publication_state,
          ),
      ],
    );
    return {
      auditEventHash: audit.eventHash,
      auditSequence: audit.sequence,
      createdAt: audit.createdAt,
      decision: input.decision,
      idempotent: false,
      publicationState,
      resultId: input.resultId,
      reviewId,
      supersedesReviewId: input.expectedReviewId,
    };
  } catch (error) {
    const winner = await existingReviewReceipt(db, reviewId);
    if (winner) return winner;
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("supersession")
      || message.includes("decision head")
      || message.includes("UNIQUE constraint failed")
      || message.includes("machine analysis human decision")
    ) throw new MachineAnalysisConflictError();
    throw error;
  }
}

async function existingVerificationReceipt(db: D1Database, verificationId: string) {
  const row = await db
    .prepare(
      `SELECT verification.id, verification.result_id, verification.review_id,
              verification.created_at, audit.sequence, audit.event_hash
         FROM machine_analysis_verifications verification
         JOIN audit_events audit ON audit.id = verification.created_by_audit_event_id
        WHERE verification.id = ?`,
    )
    .bind(verificationId)
    .first<{
      created_at: string;
      event_hash: string;
      id: string;
      result_id: string;
      review_id: string;
      sequence: number;
    }>();
  return row
    ? {
        auditEventHash: row.event_hash,
        auditSequence: row.sequence,
        createdAt: row.created_at,
        idempotent: true,
        resultId: row.result_id,
        reviewId: row.review_id,
        verificationId: row.id,
      } satisfies MachineAnalysisVerificationReceipt
    : null;
}

export async function verifyMachineAnalysisResult(
  db: D1Database,
  input: {
    expectedReviewId: string;
    rationale: string;
    resultId: string;
    verifierId: string;
  },
): Promise<MachineAnalysisVerificationReceipt> {
  const rationale = normalizedRationale(input.rationale);
  const rationaleHash = await sha256Hex(rationale);
  const verificationId = await deterministicId(
    "analysis-verification",
    input.resultId,
    input.expectedReviewId,
    input.verifierId,
    rationaleHash,
  );
  const replay = await existingVerificationReceipt(db, verificationId);
  if (replay) return replay;
  const current = await currentAnalysisDecision(db, input.resultId);
  if (
    !current
    || current.current_review_id !== input.expectedReviewId
    || current.current_review_decision !== "approved"
    || current.published_result_id !== input.resultId
    || current.publication_state !== "published"
  ) throw new MachineAnalysisConflictError();

  try {
    const audit = await appendAuditEventWithStatements(
      db,
      {
        action: "machine-analysis.verified",
        actorId: input.verifierId,
        actorType: "admin",
        entityId: input.resultId,
        entityType: "machine-analysis-result",
        payload: {
          rationaleHash,
          resultId: input.resultId,
          reviewId: input.expectedReviewId,
          verificationId,
        },
      },
      () => [],
      (event) => [
        db
          .prepare(
            `INSERT INTO machine_analysis_verifications (
               id, result_id, review_id, verifier_id, rationale,
               rationale_hash, created_by_audit_event_id, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            verificationId,
            input.resultId,
            input.expectedReviewId,
            input.verifierId,
            rationale,
            rationaleHash,
            event.id,
            event.createdAt,
          ),
      ],
    );
    return {
      auditEventHash: audit.eventHash,
      auditSequence: audit.sequence,
      createdAt: audit.createdAt,
      idempotent: false,
      resultId: input.resultId,
      reviewId: input.expectedReviewId,
      verificationId,
    };
  } catch (error) {
    const winner = await existingVerificationReceipt(db, verificationId);
    if (winner) return winner;
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("currently published") || message.includes("UNIQUE constraint failed")) {
      throw new MachineAnalysisConflictError();
    }
    throw error;
  }
}

type PublicAnalysisBaseRow = {
  association_basis_hash: string;
  association_basis_json: string;
  audit_event_hash: string;
  block_manifest_hash: string;
  block_manifest_json: string;
  canonical_reason_hash: string;
  canonical_reason_json: string;
  collection_route: string;
  collection_ruleset_id: string;
  created_at: string;
  document_capture_id: string;
  extractor_config_hash: string;
  has_current_verification: number;
  has_open_dispute: number;
  input_id: string;
  method: string;
  model: string;
  model_version: string;
  overall_confidence: number;
  parser_version: string;
  payload: string;
  payload_hash: string;
  prompt_hash: string;
  prompt_id: string;
  prompt_version: string;
  provider: string;
  raw_content_hash: string;
  resolved_url: string;
  result_hash: string;
  result_id: string;
  result_json: string;
  review_id: string;
  rights_state: "restricted-copy" | "metadata-only" | "public-record";
  schema_version: string;
  snapshot_id: string;
  source_item_id: string;
  source_name: string;
  source_version_id: string;
  text_hash: string;
};

type PublicEntityRow = {
  association_kind: PublicMachineAnalysisEntity["associationKind"];
  block_hash: string;
  block_id: string;
  confidence: number;
  entity_id: string;
  entity_type: PublicMachineAnalysisEntity["entityType"];
  id: string;
  mention_hash: string;
  mention_text: string;
  raw_end_offset: number;
  raw_start_offset: number;
  result_id: string;
  signal_basis_hash: string;
  text_end_offset: number;
  text_start_offset: number;
};

type PublicFindingRow = {
  block_hash: string;
  block_id: string;
  candidacy_id: string | null;
  confidence: number;
  constituency_id: string | null;
  finding_kind: string;
  id: string;
  proposition_key: string;
  proposition_text: string;
  quote: string;
  quote_hash: string;
  raw_end_offset: number;
  raw_start_offset: number;
  result_id: string;
  stance: string | null;
  stance_basis: string;
  text_end_offset: number;
  text_start_offset: number;
  topic_id: string;
};

function immutableSourceMetadata(row: PublicAnalysisBaseRow) {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  let title: string | null = null;
  let canonicalUrl: string | null = null;
  if (row.parser_version === "feed-v1") {
    title = typeof record.title === "string" ? record.title.trim() : null;
    canonicalUrl = typeof record.canonicalUrl === "string" ? record.canonicalUrl : null;
  } else if (
    row.parser_version === "candidate-directory-v1"
    || row.parser_version === "candidate-profile-v1"
  ) {
    const candidate = record.candidate;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const candidateRecord = candidate as Record<string, unknown>;
      title = typeof candidateRecord.fullName === "string"
        ? candidateRecord.fullName.trim()
        : null;
      canonicalUrl = typeof candidateRecord.profileUrl === "string"
        ? candidateRecord.profileUrl
        : null;
    }
  }
  if (
    !title
    || title.length > 300
    || !canonicalUrl
    || !isSafeHttpsUrl(canonicalUrl)
    || !isSafeHttpsUrl(row.resolved_url)
  ) return null;
  return { title, url: canonicalUrl };
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

export async function queryPublicMachineAnalysisSnapshot(
  db: D1Database,
  filters: {
    candidacyId?: string;
    constituencyId?: string;
    limit?: number;
    topicId?: string;
  } = {},
): Promise<PublicMachineAnalysis[]> {
  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit ?? 30)));
  const baseRows = await db
    .prepare(
      `SELECT result.id AS result_id, result.input_id, result.provider,
              result.model, result.model_version, result.method,
              result.prompt_id, result.prompt_version, result.prompt_hash,
              result.schema_version, result.result_json, result.result_hash,
              result.overall_confidence, result.created_at,
              input.source_item_id, input.source_item_version_id AS source_version_id,
              input.document_capture_id, input.source_snapshot_id AS snapshot_id,
              input.raw_content_hash, input.text_hash, input.extractor_config_hash,
              input.block_manifest_json, input.block_manifest_hash,
              input.association_basis_json, input.association_basis_hash,
              input.collection_reason_hash AS canonical_reason_hash,
              input.collection_ruleset_id, input.collection_route,
              version.payload, version.payload_hash, version.parser_version,
              snapshot.resolved_url, source.name AS source_name,
              source.rights_state, review.id AS review_id,
              audit.event_hash AS audit_event_hash,
              assessment.canonical_reason_json,
              EXISTS (
                SELECT 1 FROM machine_analysis_verifications verification
                 WHERE verification.result_id = result.id
                   AND verification.review_id = review.id
              ) AS has_current_verification,
              EXISTS (
                SELECT 1 FROM disputes dispute
                 WHERE dispute.target_type = 'machine-analysis-result'
                   AND dispute.target_id = result.id
                   AND dispute.status = 'open'
              ) AS has_open_dispute
         FROM machine_analysis_heads head
         JOIN machine_analysis_results result
           ON result.id = head.latest_result_id
          AND result.id = head.published_result_id
          AND result.gate_status = 'eligible'
          AND result.machine_label = 'automatic-extractive'
          AND result.method = 'deterministic-extractive-v1'
         JOIN machine_analysis_inputs input
           ON input.id = head.current_input_id
          AND input.id = result.input_id
          AND input.collection_route IN ('evidence-review', 'context-monitoring')
         JOIN source_document_heads document_head
           ON document_head.source_item_id = input.source_item_id
          AND document_head.current_capture_id = input.document_capture_id
         JOIN source_document_captures capture
           ON capture.id = input.document_capture_id
          AND capture.source_item_id = input.source_item_id
          AND capture.source_item_version_id = input.source_item_version_id
          AND capture.snapshot_id = input.source_snapshot_id
          AND capture.readable_text_hash = input.text_hash
          AND capture.extractor_config_hash = input.extractor_config_hash
         JOIN source_items item
           ON item.id = input.source_item_id
          AND item.latest_version_id = input.source_item_version_id
         JOIN source_item_versions version
           ON version.id = input.source_item_version_id
          AND version.source_item_id = item.id
          AND item.content_hash = version.payload_hash
         JOIN source_snapshots snapshot
           ON snapshot.id = input.source_snapshot_id
          AND snapshot.item_id = item.id
          AND snapshot.content_hash = input.raw_content_hash
         JOIN sources source
           ON source.id = item.source_id
          AND source.active = 1
          AND source.source_tier BETWEEN 1 AND 3
          AND source.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
          AND source.rights_state = capture.rights_state
         JOIN source_item_version_collection_assessments assessment
           ON assessment.source_item_version_id = version.id
          AND assessment.route = input.collection_route
          AND assessment.ruleset_id = input.collection_ruleset_id
          AND assessment.canonical_reason_hash = input.collection_reason_hash
         JOIN audit_events relevance_audit
           ON relevance_audit.id = assessment.created_by_audit_event_id
          AND relevance_audit.action = 'source-item.relevance-assessed'
          AND relevance_audit.entity_type = 'source-item-version'
          AND relevance_audit.entity_id = version.id
          AND json_extract(relevance_audit.payload, '$.sourceItemId') = item.id
          AND json_extract(relevance_audit.payload, '$.collectionReasonHash') = assessment.canonical_reason_hash
          AND json_extract(relevance_audit.payload, '$.collectionRoute') = assessment.route
          AND json_extract(relevance_audit.payload, '$.collectionRuleset') = assessment.ruleset_id
         JOIN reviews review
           ON review.target_type = 'machine-analysis-result'
          AND review.target_id = result.id
          AND review.decision = 'approved'
          AND NOT EXISTS (
            SELECT 1 FROM reviews successor WHERE successor.supersedes_review_id = review.id
          )
         JOIN audit_events audit ON audit.id = result.created_by_audit_event_id
        WHERE head.analysis_state = 'ready'
          AND head.publication_state = 'published'
          AND (
            (
              audit.action = 'machine-analysis.completed'
              AND json_extract(audit.payload, '$.reviewId') = review.id
            )
            OR EXISTS (
              SELECT 1 FROM audit_events review_audit
               WHERE review_audit.action = 'machine-analysis.reviewed'
                 AND review_audit.entity_type = 'machine-analysis-result'
                 AND review_audit.entity_id = result.id
                 AND json_extract(review_audit.payload, '$.reviewId') = review.id
                 AND json_extract(review_audit.payload, '$.decision') = 'approved'
            )
          )
        ORDER BY result.created_at DESC, result.id
        LIMIT ?`,
    )
    .bind(Math.max(limit * 4, 100))
    .all<PublicAnalysisBaseRow>();
  if (baseRows.results.length === 0) return [];
  const resultIds = baseRows.results.map((row) => row.result_id);
  const [entityRows, findingRows, currentPublicCandidates] = await Promise.all([
    db
      .prepare(
        `SELECT id, result_id, entity_type, entity_id, association_kind,
                mention_text, mention_hash, block_id, block_hash,
                text_start_offset, text_end_offset,
                raw_start_offset, raw_end_offset, confidence, signal_basis_hash
           FROM machine_analysis_entities
          WHERE result_id IN (${placeholders(resultIds.length)})
          ORDER BY result_id, block_id, entity_type, entity_id, text_start_offset`,
      )
      .bind(...resultIds)
      .all<PublicEntityRow>(),
    db
      .prepare(
        `SELECT id, result_id, proposition_key, finding_kind,
                candidacy_id, topic_id, constituency_id, proposition_text,
                stance, stance_basis, quote, quote_hash, block_id, block_hash,
                text_start_offset, text_end_offset,
                raw_start_offset, raw_end_offset, confidence
           FROM machine_analysis_findings
          WHERE result_id IN (${placeholders(resultIds.length)})
          ORDER BY result_id, proposition_key`,
      )
      .bind(...resultIds)
      .all<PublicFindingRow>(),
    publicCandidates(db),
  ]);
  const publicCandidateIds = new Set(currentPublicCandidates.map((candidate) => candidate.candidacyId));
  const entitiesByResult = Map.groupBy(entityRows.results, (row) => row.result_id);
  const findingsByResult = Map.groupBy(findingRows.results, (row) => row.result_id);
  const output: PublicMachineAnalysis[] = [];

  for (const row of baseRows.results) {
    if (output.length >= limit) break;
    const metadata = immutableSourceMetadata(row);
    if (!metadata || await sha256Hex(row.payload) !== row.payload_hash) continue;
    if (await sha256Hex(row.result_json) !== row.result_hash) continue;
    if (
      await sha256Hex(row.block_manifest_json) !== row.block_manifest_hash
      || await sha256Hex(row.association_basis_json) !== row.association_basis_hash
    ) continue;
    const collectionReason = await readVerifiedCollectionReason({
      canonical_reason_hash: row.canonical_reason_hash,
      canonical_reason_json: row.canonical_reason_json,
      collection_route: row.collection_route,
      collection_ruleset_id: row.collection_ruleset_id,
    });
    if (!collectionReason) continue;
    const assessedCandidateIds = new Set(collectionReason.candidates.map((signal) => signal.id));
    if ([...assessedCandidateIds].some((candidateId) => !publicCandidateIds.has(candidateId))) continue;

    let blockManifest: Array<{
      hash: string;
      id: string;
      index: number;
      rawEnd: number;
      rawStart: number;
      textEnd: number;
      textHash: string;
      textStart: number;
    }>;
    let associationBasis: { signals?: Array<{ signalBasisHash?: string }> };
    try {
      blockManifest = JSON.parse(row.block_manifest_json);
      associationBasis = JSON.parse(row.association_basis_json);
    } catch {
      continue;
    }
    if (!Array.isArray(blockManifest) || !Array.isArray(associationBasis.signals)) continue;
    const blocks = new Map(blockManifest.map((block) => [block.id, block]));
    const allowedSignalHashes = new Set(
      associationBasis.signals
        .map((signal) => signal.signalBasisHash)
        .filter((value): value is string => typeof value === "string"),
    );
    const rawEntities = entitiesByResult.get(row.result_id) ?? [];
    const rawFindings = findingsByResult.get(row.result_id) ?? [];
    if (rawFindings.length === 0 || rawFindings.length > 100) continue;
    if (
      rawEntities.some((entity) =>
        !allowedSignalHashes.has(entity.signal_basis_hash)
        || (entity.entity_type === "candidacy" && !publicCandidateIds.has(entity.entity_id))
      )
    ) continue;
    if (
      (row.parser_version === "candidate-directory-v1" || row.parser_version === "candidate-profile-v1")
      && (
        assessedCandidateIds.size !== 1
        || !rawEntities.some((entity) =>
          entity.entity_type === "candidacy"
          && entity.association_kind === "subject"
          && assessedCandidateIds.has(entity.entity_id)
        )
      )
    ) continue;

    const publicFindings: PublicMachineAnalysisFinding[] = [];
    let findingsValid = true;
    for (const finding of rawFindings) {
      const block = blocks.get(finding.block_id);
      if (
        !block
        || finding.finding_kind !== "reported-passage"
        || finding.stance !== null
        || finding.stance_basis !== "none"
        || finding.block_hash !== block.hash
        || finding.quote_hash !== block.textHash
        || await sha256Hex(finding.quote) !== finding.quote_hash
        || finding.text_start_offset !== block.textStart
        || finding.text_end_offset !== block.textEnd
        || finding.raw_start_offset !== block.rawStart
        || finding.raw_end_offset !== block.rawEnd
        || !boundedPublicQuote(row.rights_state, finding.quote)
        || (finding.candidacy_id !== null && !publicCandidateIds.has(finding.candidacy_id))
      ) {
        findingsValid = false;
        break;
      }
      publicFindings.push({
        blockHash: finding.block_hash,
        blockId: finding.block_id,
        candidacyId: finding.candidacy_id,
        confidence: finding.confidence,
        constituencyId: finding.constituency_id,
        findingKind: "reported-passage",
        id: finding.id,
        propositionKey: finding.proposition_key,
        propositionText: finding.proposition_text,
        quote: finding.quote,
        quoteHash: finding.quote_hash,
        rawBlockEnd: finding.raw_end_offset,
        rawBlockStart: finding.raw_start_offset,
        stance: null,
        stanceBasis: "none",
        textEnd: finding.text_end_offset,
        textStart: finding.text_start_offset,
        topicId: finding.topic_id,
      });
    }
    if (!findingsValid) continue;
    const selectedBlockIndexes = [...new Set(publicFindings.map(
      (finding) => blocks.get(finding.blockId)?.index,
    ).filter((value): value is number => typeof value === "number"))].sort((left, right) => left - right);
    if (
      selectedBlockIndexes.length > MAX_PUBLIC_BLOCKS
      || selectedBlockIndexes.some((value, index) => index > 0 && value === selectedBlockIndexes[index - 1] + 1)
    ) continue;

    const publicEntities: PublicMachineAnalysisEntity[] = rawEntities.map((entity) => ({
      associationKind: entity.association_kind,
      blockHash: entity.block_hash,
      blockId: entity.block_id,
      confidence: entity.confidence,
      entityId: entity.entity_id,
      entityType: entity.entity_type,
      id: entity.id,
      mentionHash: entity.mention_hash,
      mentionText: entity.mention_text,
      rawBlockEnd: entity.raw_end_offset,
      rawBlockStart: entity.raw_start_offset,
      textEnd: entity.text_end_offset,
      textStart: entity.text_start_offset,
    }));
    if (
      filters.candidacyId
      && !publicEntities.some((entity) =>
        entity.entityType === "candidacy" && entity.entityId === filters.candidacyId
      )
    ) continue;
    if (
      filters.topicId
      && !publicFindings.some((finding) => finding.topicId === filters.topicId)
    ) continue;
    if (
      filters.constituencyId
      && !publicEntities.some((entity) =>
        entity.entityType === "constituency" && entity.entityId === filters.constituencyId
      )
    ) continue;

    const status: MachineAnalysisPublicationStatus = row.has_open_dispute
      ? "disputed"
      : row.has_current_verification ? "human-verified" : "machine-analysed";
    output.push({
      auditEventHash: row.audit_event_hash,
      documentCaptureId: row.document_capture_id,
      entities: status === "disputed" ? [] : publicEntities,
      findings: status === "disputed" ? [] : publicFindings,
      generatedAt: row.created_at,
      inputId: row.input_id,
      overallConfidence: row.overall_confidence,
      provenance: {
        extractorConfigHash: row.extractor_config_hash,
        method: row.method,
        model: row.model,
        modelVersion: row.model_version,
        promptHash: row.prompt_hash,
        promptId: row.prompt_id,
        promptVersion: row.prompt_version,
        provider: row.provider,
        schemaVersion: row.schema_version,
      },
      resultId: row.result_id,
      source: {
        name: row.source_name,
        rightsState: row.rights_state,
        title: metadata.title,
        url: metadata.url,
      },
      sourceItemId: row.source_item_id,
      sourceItemVersionId: row.source_version_id,
      sourceSnapshotId: row.snapshot_id,
      status,
    });
  }
  return output;
}

export async function getMachineAnalysisQueueTelemetry(
  db: D1Database,
): Promise<MachineAnalysisQueueTelemetry> {
  const counts = {
    failed: 0,
    quarantined: 0,
    queued: 0,
    retrying: 0,
    running: 0,
    succeeded: 0,
  } satisfies Record<MachineAnalysisJobStatus, number>;
  const [countRows, summary, failures] = await Promise.all([
    db
      .prepare("SELECT status, count(*) AS count FROM machine_analysis_jobs GROUP BY status")
      .all<{ count: number; status: MachineAnalysisJobStatus }>(),
    db
      .prepare(
        `SELECT min(CASE WHEN status IN ('queued', 'retrying') THEN created_at END) AS oldest_pending_at,
                max(CASE WHEN status = 'succeeded' THEN updated_at END) AS last_succeeded_at
           FROM machine_analysis_jobs`,
      )
      .first<{ last_succeeded_at: string | null; oldest_pending_at: string | null }>(),
    db
      .prepare(
        `SELECT id, source_item_id, status, last_error_code,
                last_error_summary, updated_at
           FROM machine_analysis_jobs
          WHERE status IN ('failed', 'quarantined')
          ORDER BY updated_at DESC, id
          LIMIT 20`,
      )
      .all<{
        id: string;
        last_error_code: string | null;
        last_error_summary: string | null;
        source_item_id: string;
        status: "failed" | "quarantined";
        updated_at: string;
      }>(),
  ]);
  for (const row of countRows.results) counts[row.status] = Number(row.count);
  return {
    counts,
    lastSucceededAt: summary?.last_succeeded_at ?? null,
    oldestPendingAt: summary?.oldest_pending_at ?? null,
    recentFailures: failures.results.map((row) => ({
      errorCode: row.last_error_code,
      errorSummary: row.last_error_summary,
      jobId: row.id,
      sourceItemId: row.source_item_id,
      status: row.status,
      updatedAt: row.updated_at,
    })),
  };
}
