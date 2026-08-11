import { getCandidate, type Candidate } from "../data";
import { dedupeCandidateEvidenceForAnalysis } from "./candidate-evidence-dedupe";
import { sha256Hex, stableJson } from "./integrity";

export type CandidateDossierEvidence = {
  canonicalUrl: string;
  contentHash: string;
  firstSeenAt: string;
  itemId: string;
  itemType: string;
  publishedAt: string | null;
  publicationState: string;
  reviewId: string;
  reviewedAt: string;
  sourceName: string;
  title: string;
  versionId: string;
};

export type CandidateCampaignOverview = {
  analysisState: string;
  caveat: string;
  inputHash: string;
  latestReviewedAt: string | null;
  sourceCount: number;
  state: "private-research-draft" | "preparing" | "public-evidence-only";
  text: string;
};

export type CandidatePageData = {
  candidate: Candidate;
  dataSource: "live" | "static-fallback";
  dossierEvidence: CandidateDossierEvidence[];
  founderPreview: boolean;
  overview: CandidateCampaignOverview;
  privateView: boolean;
  publishedOverview: CandidatePublishedOverview | null;
};

export type CandidatePublishedOverview = {
  createdAt: string;
  payloadHash: string;
  reviewedThrough: string | null;
  revisionId: string;
  sourceCount: number;
  summary: string;
};

type CandidateRecord = {
  affiliation: string;
  analysis_state: string | null;
  candidacy_id: string;
  constituency_name: string;
  declaration_status: string;
  full_name: string;
  profile_publication_state: string;
  profile_review_state: string;
  intelligence_publication_state: string | null;
  published_revision_id: string | null;
  slug: string;
};

type EvidenceRecord = {
  canonical_url: string;
  content_hash: string;
  first_seen_at: string;
  item_id: string;
  item_type: string;
  published_at: string | null;
  publication_state: string;
  review_id: string;
  reviewed_at: string;
  source_name: string;
  title: string;
  version_id: string;
};

type PublishedRevisionRecord = {
  created_at: string;
  id: string;
  payload: string;
  payload_hash: string;
};

function parsePublishedOverview(
  revision: PublishedRevisionRecord | null,
): CandidatePublishedOverview | null {
  if (!revision) return null;
  try {
    const payload = JSON.parse(revision.payload) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    if (
      record.method !== "candidate-campaign-record-v1"
      || typeof record.summary !== "string"
      || !record.summary.trim()
      || record.summary.length > 2_000
      || typeof record.sourceCount !== "number"
      || !Number.isInteger(record.sourceCount)
      || record.sourceCount < 0
      || record.sourceCount > 1_000
      || (record.reviewedThrough !== undefined && typeof record.reviewedThrough !== "string")
      || Number.isNaN(Date.parse(revision.created_at))
    ) return null;
    return {
      createdAt: revision.created_at,
      payloadHash: revision.payload_hash,
      reviewedThrough: typeof record.reviewedThrough === "string"
        ? record.reviewedThrough.slice(0, 100)
        : null,
      revisionId: revision.id,
      sourceCount: record.sourceCount,
      summary: record.summary.trim(),
    };
  } catch {
    return null;
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function emptyPositions(): Candidate["positions"] {
  return {
    housing: {
      detail: "This question has not yet been reviewed for this candidate.",
      label: "Not assessed",
      state: "missing",
    },
    manxcare: {
      detail: "This question has not yet been reviewed for this candidate.",
      label: "Not assessed",
      state: "missing",
    },
    wind: {
      detail: "This question has not yet been reviewed for this candidate.",
      label: "Not assessed",
      state: "missing",
    },
  };
}

function candidateFromRecord(record: CandidateRecord): Candidate {
  return {
    affiliation: record.affiliation === "Unconfirmed" ? "Affiliation unconfirmed" : record.affiliation,
    constituency: record.constituency_name,
    evidenceCount: 0,
    initials: initials(record.full_name),
    name: record.full_name,
    positions: emptyPositions(),
    priorities: [],
    slug: record.slug,
    sources: [],
    status: record.declaration_status === "prospective" ? "Declared" : "Profile incomplete",
    summary: `${record.full_name} is recorded as a prospective candidate in ${record.constituency_name}. A reviewed editorial profile is being prepared.`,
  };
}

function reviewedStaticTopics(candidate: Candidate) {
  const labels: Record<string, string> = {
    housing: "Housing and affordability",
    manxcare: "Health and Manx Care",
    wind: "Offshore wind",
  };
  return Object.entries(candidate.positions)
    .filter(([, position]) => position.state !== "missing")
    .map(([topic]) => labels[topic] ?? topic)
    .sort();
}

async function buildOverview(
  candidate: Candidate,
  evidence: CandidateDossierEvidence[],
  founderPreview: boolean,
  analysisState: string,
) {
  const analysisEvidence = dedupeCandidateEvidenceForAnalysis(evidence);
  const reviewedSourceUrls = new Set([
    ...candidate.sources.map((source) => source.url),
    ...analysisEvidence.map((item) => item.canonicalUrl),
  ]);
  const inputHash = await sha256Hex(stableJson({
    editorialPositions: Object.entries(candidate.positions)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([topic, position]) => ({ detail: position.detail, label: position.label, state: position.state, topic })),
    editorialSources: candidate.sources.map((source) => source.url).sort(),
    evidenceVersions: analysisEvidence
      .map((item) => ({ contentHash: item.contentHash, reviewId: item.reviewId, versionId: item.versionId }))
      .sort((left, right) => left.versionId < right.versionId ? -1 : left.versionId > right.versionId ? 1 : 0),
    method: "candidate-campaign-record-v1",
  }));
  const latestReviewedAt = evidence.reduce<string | null>(
    (latest, item) => !latest || item.reviewedAt > latest ? item.reviewedAt : latest,
    null,
  );
  const reviewedTopics = reviewedStaticTopics(candidate);
  const topicSentence = reviewedTopics.length
    ? ` Existing reviewed issue material covers ${reviewedTopics.join(", ")}.`
    : " No proposition-level policy position has yet completed review.";
  const sourceText = analysisEvidence.length
    ? `${analysisEvidence.length} unique approved source record${analysisEvidence.length === 1 ? " is" : "s are"} assigned to the ${founderPreview ? "private" : "public"} evidence record. Duplicate captures with the same URL and content hash are counted once.`
    : "No approved live source version is currently assigned to this evidence record.";

  return {
    analysisState,
    caveat: "This describes the candidate’s reviewed public record—not how they are doing. It is not a measure of popularity, momentum or likelihood of election.",
    inputHash,
    latestReviewedAt,
    sourceCount: reviewedSourceUrls.size,
    state: analysisEvidence.length
      ? founderPreview ? "private-research-draft" : "public-evidence-only"
      : "preparing",
    text: `${candidate.name} is recorded as a prospective candidate in ${candidate.constituency}. ${sourceText}${topicSentence} Source approval alone does not establish a candidate position; cited claims must be reviewed separately.`,
  } satisfies CandidateCampaignOverview;
}

export async function getCandidatePageData(
  slug: string,
  options: { includePrivate: boolean },
): Promise<CandidatePageData | null> {
  const staticCandidate = getCandidate(slug);
  try {
    const { getEvidenceBindings } = await import("../../../db");
    const { DB: db } = getEvidenceBindings();
    const record = await db
      .prepare(
        `SELECT profiles.candidacy_id, profiles.slug,
                profiles.review_state AS profile_review_state,
                profiles.publication_state AS profile_publication_state,
                people.full_name, constituencies.name AS constituency_name,
                candidacies.affiliation, candidacies.declaration_status,
                intelligence.analysis_state,
                intelligence.publication_state AS intelligence_publication_state,
                intelligence.published_revision_id
           FROM candidate_profiles profiles
           JOIN candidacies ON candidacies.id = profiles.candidacy_id
           JOIN people ON people.id = candidacies.person_id
           JOIN constituencies ON constituencies.id = candidacies.constituency_id
           LEFT JOIN candidate_intelligence_heads intelligence
             ON intelligence.candidacy_id = profiles.candidacy_id
          WHERE profiles.slug = ?
            AND candidacies.declaration_status != 'source-removed'
            AND (? = 1 OR (
              profiles.review_state = 'approved'
              AND profiles.publication_state = 'published'
            ))`,
      )
      .bind(slug, options.includePrivate ? 1 : 0)
      .first<CandidateRecord>();
    if (!record && !staticCandidate) return null;
    const candidate = staticCandidate ?? candidateFromRecord(record!);
    const evidenceRows = record
      ? await db
          .prepare(
            `SELECT items.id AS item_id, versions.id AS version_id,
                    items.title, items.canonical_url, items.item_type,
                    items.published_at, items.first_seen_at,
                    items.publication_state, items.content_hash,
                    sources.name AS source_name,
                    reviews.id AS review_id, reviews.created_at AS reviewed_at
               FROM source_item_version_entities frozen
               JOIN source_item_versions versions
                 ON versions.id = frozen.source_item_version_id
               JOIN source_items items
                 ON items.id = versions.source_item_id
                AND items.latest_version_id = versions.id
                AND items.content_hash = versions.payload_hash
               JOIN reviews
                 ON reviews.id = frozen.review_id
                AND reviews.target_type IN ('source-item-version', 'source-item-version-assignment')
                AND reviews.target_id = versions.id
                AND reviews.decision = 'approved'
               JOIN sources ON sources.id = items.source_id
              WHERE frozen.entity_type = 'candidacy'
                AND frozen.entity_id = ?
                AND frozen.confirmation_state = 'confirmed'
                AND items.review_state = 'approved'
                AND (? = 1 OR items.publication_state = 'published')
              ORDER BY COALESCE(items.published_at, items.first_seen_at) DESC, items.id
              LIMIT 80`,
          )
          .bind(record.candidacy_id, options.includePrivate ? 1 : 0)
          .all<EvidenceRecord>()
      : { results: [] as EvidenceRecord[] };
    const dossierEvidence = evidenceRows.results.map((item) => ({
      canonicalUrl: item.canonical_url,
      contentHash: item.content_hash,
      firstSeenAt: item.first_seen_at,
      itemId: item.item_id,
      itemType: item.item_type,
      publishedAt: item.published_at,
      publicationState: item.publication_state,
      reviewId: item.review_id,
      reviewedAt: item.reviewed_at,
      sourceName: item.source_name,
      title: item.title,
      versionId: item.version_id,
    }));
    const publishedRevision = record
      && record.analysis_state === "approved"
      && record.intelligence_publication_state === "published"
      && record.published_revision_id
      ? await db
          .prepare(
            `SELECT revisions.id, revisions.payload, revisions.payload_hash,
                    revisions.created_at
               FROM revisions
               JOIN reviews review
                 ON review.target_type = 'candidate-analysis-revision'
                AND review.target_id = revisions.id
                AND review.decision = 'approved'
               JOIN audit_events audit
                 ON audit.action = 'candidate-analysis.reviewed'
                AND audit.entity_type = 'candidate-analysis-revision'
                AND audit.entity_id = revisions.id
                AND json_extract(audit.payload, '$.reviewId') = review.id
              WHERE revisions.id = ?
                AND revisions.entity_type = 'candidate-analysis'
                AND revisions.entity_id = ?`,
          )
          .bind(record.published_revision_id, record.candidacy_id)
          .first<PublishedRevisionRecord>()
      : null;
    const publishedOverview = parsePublishedOverview(publishedRevision);
    const founderPreview = options.includePrivate && Boolean(
      dossierEvidence.some((item) => item.publicationState !== "published")
      || (record && (
        record.profile_review_state !== "approved"
        || record.profile_publication_state !== "published"
        || record.intelligence_publication_state !== "published"
        || !record.published_revision_id
      )),
    );
    const overview = await buildOverview(
      candidate,
      dossierEvidence,
      options.includePrivate,
      options.includePrivate ? record?.analysis_state ?? "missing" : "preparing",
    );
    return {
      candidate: {
        ...candidate,
        evidenceCount: publishedOverview?.sourceCount ?? overview.sourceCount,
      },
      dataSource: record ? "live" : "static-fallback",
      dossierEvidence,
      founderPreview,
      overview,
      privateView: options.includePrivate,
      publishedOverview,
    };
  } catch {
    if (!staticCandidate) return null;
    return {
      candidate: staticCandidate,
      dataSource: "static-fallback",
      dossierEvidence: [],
      founderPreview: false,
      overview: await buildOverview(staticCandidate, [], false, "missing"),
      privateView: options.includePrivate,
      publishedOverview: null,
    };
  }
}
