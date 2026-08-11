import { getCandidate, type Candidate } from "../data.ts";
import { dedupeCandidateEvidenceForAnalysis } from "./candidate-evidence-dedupe.ts";
import {
  candidateRecordSentence,
  candidateStatusFromDeclaration,
} from "./candidate-declaration.ts";
import { approvedCandidateProfileBasisSql } from "./candidate-profile-basis.ts";
import { sha256Hex, stableJson } from "./integrity.ts";
import {
  queryPrivateCandidateDossierEvidenceSnapshot,
  queryPublicEvidenceSnapshot,
} from "./public-evidence.ts";

export type CandidateDossierEvidence = {
  associationLabels: string[];
  canonicalUrl: string;
  contentHash: string;
  coverageSummary: string;
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
  identityProvenance: CandidateIdentityProvenance | null;
  overview: CandidateCampaignOverview;
  privateView: boolean;
  publishedOverview: CandidatePublishedOverview | null;
};

export type CandidateIdentityProvenance = {
  basisHash: string;
  directoryVersionId: string;
  reviewId: string;
  reviewedAt: string;
  sourceUrl: string;
};

export type CandidatePublishedOverview = {
  createdAt: string;
  payloadHash: string;
  reviewedThrough: string | null;
  revisionId: string;
  sourceCount: number;
  summary: string;
};

export type CandidateRecord = {
  affiliation: string;
  analysis_state: string | null;
  candidacy_id: string;
  constituency_name: string;
  current_basis_hash: string | null;
  declaration_status: string;
  full_name: string;
  identity_directory_version_id: string | null;
  identity_review_id: string | null;
  identity_reviewed_at: string | null;
  identity_source_url: string | null;
  profile_publication_state: string;
  profile_review_state: string;
  intelligence_publication_state: string | null;
  published_revision_id: string | null;
  slug: string;
};

function identityProvenanceFromRecord(
  record: CandidateRecord,
): CandidateIdentityProvenance | null {
  if (
    !record.current_basis_hash
    || !record.identity_directory_version_id
    || !record.identity_review_id
    || !record.identity_reviewed_at
    || !record.identity_source_url
  ) return null;
  try {
    const sourceUrl = new URL(record.identity_source_url);
    if (sourceUrl.protocol !== "https:" || sourceUrl.username || sourceUrl.password) return null;
    sourceUrl.hash = "";
    return {
      basisHash: record.current_basis_hash,
      directoryVersionId: record.identity_directory_version_id,
      reviewId: record.identity_review_id,
      reviewedAt: record.identity_reviewed_at,
      sourceUrl: sourceUrl.toString(),
    };
  } catch {
    return null;
  }
}

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
  const status = candidateStatusFromDeclaration(record.declaration_status);
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
    status,
    summary: `${candidateRecordSentence({
      constituency: record.constituency_name,
      name: record.full_name,
      status,
    })} A reviewed editorial profile is being prepared.`,
  };
}

export function candidateIdentityForView(
  record: CandidateRecord | null,
  staticCandidate: Candidate | undefined,
  includePrivate: boolean,
): { candidate: Candidate; dataSource: CandidatePageData["dataSource"] } | null {
  if (!record) {
    return includePrivate && staticCandidate
      ? { candidate: staticCandidate, dataSource: "static-fallback" }
      : null;
  }
  return {
    candidate: includePrivate && staticCandidate ? staticCandidate : candidateFromRecord(record),
    dataSource: "live",
  };
}

/**
 * Revalidates the exact identity leaf immediately before a public page is
 * returned. Keeping this as the final database read prevents a concurrent
 * rejection or identity mutation from leaking the identity already read by
 * the earlier page query.
 */
export async function isCurrentPublicCandidateProfile(
  db: Pick<D1Database, "prepare">,
  candidacyId: string,
  basisHash: string | null,
) {
  if (!basisHash) return false;
  const currentIdentity = await db
    .prepare(
      `SELECT profiles.current_basis_hash
         FROM candidate_profiles profiles
         JOIN candidacies ON candidacies.id = profiles.candidacy_id
          AND candidacies.declaration_status != 'source-removed'
        WHERE profiles.candidacy_id = ?
          AND profiles.current_basis_hash = ?
          AND ${approvedCandidateProfileBasisSql("profiles")}`,
    )
    .bind(candidacyId, basisHash)
    .first<{ current_basis_hash: string }>();
  return currentIdentity?.current_basis_hash === basisHash;
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
    ...(founderPreview ? candidate.sources.map((source) => source.url) : []),
    ...analysisEvidence.map((item) => item.canonicalUrl),
  ]);
  const inputHash = await sha256Hex(stableJson({
    editorialPositions: Object.entries(candidate.positions)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([topic, position]) => ({ detail: position.detail, label: position.label, state: position.state, topic })),
    editorialSources: founderPreview ? candidate.sources.map((source) => source.url).sort() : [],
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
    text: `${candidateRecordSentence({
      constituency: candidate.constituency,
      name: candidate.name,
      status: candidate.status,
    })} ${sourceText}${topicSentence} Source approval alone does not establish a candidate position; cited claims must be reviewed separately.`,
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
                profiles.current_basis_hash,
                profiles.review_state AS profile_review_state,
                profiles.publication_state AS profile_publication_state,
                json_extract(directory_observation.payload, '$.candidate.profileUrl')
                  AS identity_source_url,
                identity_review.id AS identity_review_id,
                identity_review.created_at AS identity_reviewed_at,
                json_extract(identity_audit.payload, '$.identityBasis.directoryVersionId')
                  AS identity_directory_version_id,
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
           LEFT JOIN candidate_profile_observations directory_observation
             ON directory_observation.id = profiles.current_directory_observation_id
            AND directory_observation.observation_type = 'directory'
           LEFT JOIN reviews identity_review
             ON identity_review.target_type = 'candidate-profile-version'
            AND identity_review.target_id = profiles.current_basis_hash
            AND identity_review.decision = 'approved'
            AND NOT EXISTS (
              SELECT 1 FROM reviews identity_successor
               WHERE identity_successor.supersedes_review_id = identity_review.id
            )
           LEFT JOIN audit_events identity_audit
             ON identity_audit.action = 'candidate-profile.reviewed'
            AND identity_audit.entity_type = 'candidate-profile'
            AND identity_audit.entity_id = profiles.candidacy_id
            AND json_extract(identity_audit.payload, '$.reviewId') = identity_review.id
            AND json_extract(identity_audit.payload, '$.basisHash') = profiles.current_basis_hash
            AND json_extract(identity_audit.payload, '$.decision') = 'approved'
          WHERE profiles.slug = ?
            AND candidacies.declaration_status != 'source-removed'
            AND (? = 1 OR ${approvedCandidateProfileBasisSql("profiles")})`,
      )
      .bind(slug, options.includePrivate ? 1 : 0)
      .first<CandidateRecord>();
    const candidateIdentity = candidateIdentityForView(record, staticCandidate, options.includePrivate);
    if (!candidateIdentity) return null;
    if (!record) {
      return {
        candidate: candidateIdentity.candidate,
        dataSource: candidateIdentity.dataSource,
        dossierEvidence: [],
        founderPreview: true,
        identityProvenance: null,
        overview: await buildOverview(candidateIdentity.candidate, [], true, "missing"),
        privateView: true,
        publishedOverview: null,
      };
    }
    // Live reviewed identity is authoritative for public pages. Static profile
    // copy is retained only as private founder context while migration continues.
    const candidate = candidateIdentity.candidate;
    const identityProvenance = identityProvenanceFromRecord(record);
    const publicEvidence = options.includePrivate
      ? await queryPrivateCandidateDossierEvidenceSnapshot(db, {
          candidateId: record.candidacy_id,
        })
      : await queryPublicEvidenceSnapshot(db, {
          candidateId: record.candidacy_id,
        });
    const dossierEvidence = publicEvidence.records.map((item) => ({
      associationLabels: item.associations.map((association) => association.label),
      canonicalUrl: item.canonicalUrl,
      contentHash: item.contentHash,
      coverageSummary: item.coverageSummary,
      firstSeenAt: item.firstSeenAt,
      itemId: item.itemId,
      itemType: item.itemType,
      publishedAt: item.publishedAt,
      publicationState: "published",
      reviewId: item.reviewId,
      reviewedAt: item.reviewedAt,
      sourceName: item.sourceName,
      title: item.title,
      versionId: item.versionId,
    }));
    // Generated analysis remains a private founder preview until its payload
    // carries proposition-level citations and the stronger publication method.
    const publishedRevision = options.includePrivate
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
                AND NOT EXISTS (
                  SELECT 1 FROM reviews successor
                   WHERE successor.supersedes_review_id = review.id
                )
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
    if (!options.includePrivate) {
      const currentIdentity = await isCurrentPublicCandidateProfile(
        db,
        record.candidacy_id,
        record.current_basis_hash,
      );
      if (!currentIdentity || !identityProvenance) return null;
    }
    return {
      candidate: {
        ...candidate,
        evidenceCount: options.includePrivate
          ? publishedOverview?.sourceCount ?? overview.sourceCount
          : overview.sourceCount,
      },
      dataSource: "live",
      dossierEvidence,
      founderPreview,
      identityProvenance,
      overview,
      privateView: options.includePrivate,
      publishedOverview: options.includePrivate ? publishedOverview : null,
    };
  } catch {
    // Public candidate pages fail closed. A database outage must never revive
    // stale static copy or a profile that is not currently publishable.
    if (!options.includePrivate || !staticCandidate) return null;
    return {
      candidate: staticCandidate,
      dataSource: "static-fallback",
      dossierEvidence: [],
      founderPreview: true,
      identityProvenance: null,
      overview: await buildOverview(staticCandidate, [], true, "missing"),
      privateView: true,
      publishedOverview: null,
    };
  }
}
