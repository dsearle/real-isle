import { approvedCandidateProfileBasisSql } from "./candidate-profile-basis.ts";
import {
  candidateStatusFromDeclaration,
  type CandidateStatusLabel,
} from "./candidate-declaration.ts";

export type PublicEvidenceAssociation = {
  id: string;
  label: string;
  slug: string | null;
  type: "candidate" | "constituency" | "topic";
};

export type PublicEvidenceRecord = {
  associations: PublicEvidenceAssociation[];
  auditFingerprint: string;
  canonicalUrl: string;
  contentHash: string;
  coverageSummary: string;
  firstSeenAt: string;
  itemId: string;
  itemType: string;
  publishedAt: string | null;
  reviewId: string;
  reviewedAt: string;
  sourceName: string;
  title: string;
  versionId: string;
};

export type PublicEvidenceSnapshot = {
  generatedAt: string;
  records: PublicEvidenceRecord[];
  state: "available" | "empty" | "unavailable";
};

export type PublicCandidateDirectoryEntry = {
  candidacyId: string;
  constituencyId: string;
  constituencyName: string;
  evidenceCount: number;
  initials: string;
  name: string;
  slug: string;
  status: CandidateStatusLabel;
};

type PublicEvidenceDatabase = Pick<D1Database, "prepare">;

type PublicEvidenceItemRow = {
  canonical_url: string;
  content_hash: string;
  first_seen_at: string;
  item_id: string;
  item_type: string;
  publication_state: string;
  published_at: string | null;
  review_decision: string;
  review_id: string;
  review_state: string;
  reviewed_at: string;
  source_name: string;
  title: string;
  version_id: string;
};

type PublicEvidenceAssociationRow = {
  candidate_constituency_id: string | null;
  candidate_constituency_name: string | null;
  candidate_slug: string | null;
  entity_id: string | null;
  entity_label: string | null;
  entity_type: string | null;
  source_item_version_id: string;
};

type PublicEvidenceQueryRow = PublicEvidenceItemRow & PublicEvidenceAssociationRow;

type PublicCandidateDirectoryRow = {
  candidacy_id: string;
  constituency_id: string;
  constituency_name: string;
  declaration_status: string;
  evidence_count: number;
  full_name: string;
  slug: string;
};

const MAXIMUM_EXPLICIT_PUBLIC_EVIDENCE_LIMIT = 200;

// A source item is not public merely because it was approved at some point.
// This CTE resolves the append-only review chain to its current leaf and then
// verifies the materialized publication state, exact content version and audit.
const publicEvidenceCtes = `
  WITH current_source_reviews AS (
    SELECT review.id, review.target_id, review.decision, review.created_at,
           review.supersedes_review_id
      FROM reviews review
     WHERE review.target_type = 'source-item-version'
       AND NOT EXISTS (
         SELECT 1
           FROM reviews successor
          WHERE successor.supersedes_review_id = review.id
       )
  ),
  eligible_public_items AS (
    SELECT items.id AS item_id,
           CASE versions.parser_version
             WHEN 'feed-v1' THEN json_extract(versions.payload, '$.title')
             WHEN 'candidate-directory-v1' THEN json_extract(versions.payload, '$.candidate.fullName')
             WHEN 'candidate-profile-v1' THEN json_extract(versions.payload, '$.candidateName')
             ELSE NULL
           END AS title,
           CASE versions.parser_version
             WHEN 'feed-v1' THEN json_extract(versions.payload, '$.canonicalUrl')
             WHEN 'candidate-directory-v1' THEN json_extract(versions.payload, '$.candidate.profileUrl')
             WHEN 'candidate-profile-v1' THEN json_extract(versions.payload, '$.profileUrl')
             ELSE NULL
           END AS canonical_url,
           CASE versions.parser_version
             WHEN 'feed-v1' THEN COALESCE(json_extract(versions.payload, '$.itemType'), 'source')
             WHEN 'candidate-directory-v1' THEN 'candidate-profile'
             WHEN 'candidate-profile-v1' THEN 'candidate-profile'
             ELSE 'source'
           END AS item_type,
           CASE versions.parser_version
             WHEN 'feed-v1' THEN json_extract(versions.payload, '$.publishedAt')
             ELSE NULL
           END AS published_at,
           versions.observed_at AS first_seen_at,
           versions.payload_hash AS content_hash,
           versions.parser_version,
           items.review_state, items.publication_state,
           versions.id AS version_id, sources.name AS source_name,
           current_review.id AS review_id,
           current_review.decision AS review_decision,
           current_review.supersedes_review_id AS source_review_supersedes_review_id,
           current_review.created_at AS reviewed_at
      FROM source_items items
      JOIN source_item_versions versions
        ON versions.id = items.latest_version_id
       AND versions.source_item_id = items.id
       AND versions.payload_hash = items.content_hash
      JOIN sources ON sources.id = items.source_id
      JOIN current_source_reviews current_review
        ON current_review.target_id = versions.id
       AND current_review.decision = 'approved'
     WHERE json_valid(versions.payload) = 1
       AND items.review_state = 'approved'
       AND items.publication_state = 'published'
       AND sources.rights_state IN ('restricted-copy', 'metadata-only', 'public-record')
       AND EXISTS (
         SELECT 1
           FROM audit_events audit
          WHERE audit.action = 'source-item.reviewed'
            AND audit.entity_type = 'source-item-version'
            AND audit.entity_id = versions.id
            AND json_extract(audit.payload, '$.reviewId') = current_review.id
            AND json_extract(audit.payload, '$.decision') = 'approved'
       )
  )
`;

function candidateAssociationEligibility(alias: string, publicItemAlias: string) {
  return `(
    ${alias}.review_id = ${publicItemAlias}.review_id
    OR (
      ${publicItemAlias}.source_review_supersedes_review_id IS NULL
      AND EXISTS (
      SELECT 1
        FROM reviews assignment_review
       WHERE assignment_review.id = ${alias}.review_id
         AND assignment_review.target_type = 'source-item-version-assignment'
         AND assignment_review.target_id = ${publicItemAlias}.version_id
         AND assignment_review.decision = 'approved'
         AND NOT EXISTS (
           SELECT 1
             FROM reviews assignment_successor
            WHERE assignment_successor.supersedes_review_id = assignment_review.id
         )
         AND EXISTS (
           SELECT 1
             FROM audit_events assignment_audit
            WHERE assignment_audit.action = 'source-item.candidate-assignment-reviewed'
              AND assignment_audit.entity_type = 'source-item-version'
              AND assignment_audit.entity_id = ${publicItemAlias}.version_id
              AND json_extract(assignment_audit.payload, '$.reviewId') = assignment_review.id
              AND json_extract(assignment_audit.payload, '$.decision') = 'approved'
         )
      )
    )
  )`;
}

const candidateEligibility = candidateAssociationEligibility("candidate_binding", "public_item");

function candidateFilterSql(privateCandidateDossier: boolean) {
  return `WHERE EXISTS (
       SELECT 1
         FROM source_item_version_entities candidate_binding
         JOIN candidate_profiles dossier_profile
           ON dossier_profile.candidacy_id = candidate_binding.entity_id
          ${privateCandidateDossier ? "" : `AND ${approvedCandidateProfileBasisSql("dossier_profile")}`}
         JOIN candidacies dossier_candidacy
           ON dossier_candidacy.id = candidate_binding.entity_id
          AND dossier_candidacy.declaration_status != 'source-removed'
        WHERE candidate_binding.source_item_version_id = public_item.version_id
          AND candidate_binding.entity_type = 'candidacy'
          AND candidate_binding.entity_id = ?
          AND candidate_binding.confirmation_state = 'confirmed'
          AND ${candidateEligibility}
     )`;
}

/**
 * Candidate bindings can otherwise disappear in the public LEFT JOIN while
 * their source metadata remains visible. Every effective confirmed candidacy
 * binding must therefore have an independently approved, published and
 * audit-backed profile basis. Candidate parser payloads are stricter because
 * their identity fields are intrinsic: they must resolve to exactly one such
 * candidacy, while an ordinary topic-only source may have none.
 */
function candidateBindingPublicationEligibilitySql(publicItemAlias: string) {
  const identityBindingEligibility = candidateAssociationEligibility(
    "identity_binding",
    publicItemAlias,
  );
  return `(
    1 = (
      SELECT CASE
               WHEN COUNT(DISTINCT identity_binding.entity_id)
                      = COUNT(DISTINCT identity_profile.candidacy_id)
                AND (
                  ${publicItemAlias}.parser_version NOT IN ('candidate-directory-v1', 'candidate-profile-v1')
                  OR COUNT(DISTINCT identity_binding.entity_id) = 1
                )
               THEN 1 ELSE 0
             END
        FROM source_item_version_entities identity_binding
        LEFT JOIN candidate_profiles identity_profile
          ON identity_profile.candidacy_id = identity_binding.entity_id
         AND ${approvedCandidateProfileBasisSql("identity_profile")}
       WHERE identity_binding.source_item_version_id = ${publicItemAlias}.version_id
         AND identity_binding.entity_type = 'candidacy'
         AND identity_binding.confirmation_state = 'confirmed'
         AND ${identityBindingEligibility}
    )
  )`;
}

const frozenEligibility = candidateAssociationEligibility("binding", "public_item");

function publicEvidenceRowsSql(
  candidateOnly: boolean,
  privateCandidateDossier = false,
  limited = false,
) {
  return `${publicEvidenceCtes},
  selected_public_items AS (
    SELECT public_item.*
      FROM eligible_public_items public_item
     ${candidateOnly ? candidateFilterSql(privateCandidateDossier) : ""}
     ${privateCandidateDossier
       ? ""
       : `${candidateOnly ? "AND" : "WHERE"} ${candidateBindingPublicationEligibilitySql("public_item")}`}
     ORDER BY COALESCE(public_item.published_at, public_item.first_seen_at) DESC,
              public_item.item_id
     ${limited ? "LIMIT ?" : ""}
  ),
  public_associations AS (
    SELECT binding.source_item_version_id, binding.entity_type, binding.entity_id,
           CASE
             WHEN binding.entity_type = 'candidacy' THEN candidate_people.full_name
             WHEN binding.entity_type = 'constituency' THEN direct_constituency.name
             WHEN binding.entity_type = 'topic' THEN topic.name
             ELSE NULL
           END AS entity_label,
           CASE WHEN binding.entity_type = 'candidacy' THEN candidate_profile.slug ELSE NULL END AS candidate_slug,
           CASE WHEN binding.entity_type = 'candidacy' THEN candidate_constituency.id ELSE NULL END AS candidate_constituency_id,
           CASE WHEN binding.entity_type = 'candidacy' THEN candidate_constituency.name ELSE NULL END AS candidate_constituency_name
      FROM selected_public_items public_item
      JOIN source_item_version_entities binding
        ON binding.source_item_version_id = public_item.version_id
       AND binding.confirmation_state = 'confirmed'
      LEFT JOIN candidate_profiles candidate_profile
       ON binding.entity_type = 'candidacy'
       AND candidate_profile.candidacy_id = binding.entity_id
       ${privateCandidateDossier ? "" : `AND ${approvedCandidateProfileBasisSql("candidate_profile")}`}
      LEFT JOIN candidacies candidate_candidacy
        ON binding.entity_type = 'candidacy'
       AND candidate_candidacy.id = binding.entity_id
       AND candidate_candidacy.declaration_status != 'source-removed'
      LEFT JOIN people candidate_people
        ON candidate_people.id = candidate_candidacy.person_id
       AND candidate_profile.candidacy_id IS NOT NULL
      LEFT JOIN constituencies candidate_constituency
        ON candidate_constituency.id = candidate_candidacy.constituency_id
       AND candidate_profile.candidacy_id IS NOT NULL
      LEFT JOIN constituencies direct_constituency
        ON binding.entity_type = 'constituency'
       AND direct_constituency.id = binding.entity_id
      LEFT JOIN policy_topics topic
        ON binding.entity_type = 'topic'
       AND topic.id = binding.entity_id
       AND topic.active = 1
     WHERE binding.entity_type IN ('candidacy', 'constituency', 'topic')
       AND ${frozenEligibility}
       AND (
         binding.entity_type != 'candidacy'
         OR candidate_profile.candidacy_id IS NOT NULL
       )
       AND (
         binding.entity_type != 'topic'
         OR topic.id IS NOT NULL
       )
  )
  SELECT public_item.*,
         public_item.version_id AS source_item_version_id,
         association.entity_type, association.entity_id, association.entity_label,
         association.candidate_slug, association.candidate_constituency_id,
         association.candidate_constituency_name
    FROM selected_public_items public_item
    LEFT JOIN public_associations association
      ON association.source_item_version_id = public_item.version_id
   ORDER BY COALESCE(public_item.published_at, public_item.first_seen_at) DESC,
            public_item.item_id, association.entity_type, association.entity_label`;
}

function cleanText(value: unknown, fallback: string, maximumLength: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maximumLength) : fallback;
}

function cleanTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function cleanHttpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function associationType(value: string | null): PublicEvidenceAssociation["type"] | null {
  if (value === "candidacy") return "candidate";
  if (value === "constituency" || value === "topic") return value;
  return null;
}

function associationKey(value: PublicEvidenceAssociation) {
  return `${value.type}:${value.id}`;
}

function labelList(values: readonly string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

export function neutralCoverageSummary(associations: readonly PublicEvidenceAssociation[]) {
  const candidates = associations.filter((entry) => entry.type === "candidate").map((entry) => entry.label);
  const topics = associations.filter((entry) => entry.type === "topic").map((entry) => entry.label);
  const constituencies = associations.filter((entry) => entry.type === "constituency").map((entry) => entry.label);
  const parts = [
    candidates.length ? `${labelList(candidates)} as ${candidates.length === 1 ? "a candidate" : "candidates"}` : "",
    topics.length ? labelList(topics) : "",
    constituencies.length ? labelList(constituencies) : "",
  ].filter(Boolean);
  return parts.length
    ? `Editorial review linked this source to ${labelList(parts)}. This association does not establish a candidate position.`
    : "Editorial review approved this for the public election source library. No public candidate, constituency or topic association is displayed, and no candidate position is inferred.";
}

export function buildPublicEvidenceSnapshot(input: {
  associationRows: readonly PublicEvidenceAssociationRow[];
  generatedAt: string;
  itemRows: readonly PublicEvidenceItemRow[];
}): PublicEvidenceSnapshot {
  const generatedAt = cleanTimestamp(input.generatedAt) ?? new Date(0).toISOString();
  const associationsByVersion = new Map<string, PublicEvidenceAssociation[]>();

  for (const row of input.associationRows) {
    const type = associationType(row.entity_type);
    const label = cleanText(row.entity_label, "", 120);
    if (!type || !label) continue;
    const associations = associationsByVersion.get(row.source_item_version_id) ?? [];
    const directAssociation: PublicEvidenceAssociation = {
      id: cleanText(row.entity_id, "", 160),
      label,
      slug: type === "candidate" ? cleanText(row.candidate_slug, "", 160) || null : null,
      type,
    };
    if (directAssociation.id && !associations.some((entry) => associationKey(entry) === associationKey(directAssociation))) {
      associations.push(directAssociation);
    }
    if (type === "candidate" && row.candidate_constituency_id && row.candidate_constituency_name) {
      const constituencyAssociation: PublicEvidenceAssociation = {
        id: cleanText(row.candidate_constituency_id, "", 160),
        label: cleanText(row.candidate_constituency_name, "", 120),
        slug: null,
        type: "constituency",
      };
      if (
        constituencyAssociation.id
        && constituencyAssociation.label
        && !associations.some((entry) => associationKey(entry) === associationKey(constituencyAssociation))
      ) {
        associations.push(constituencyAssociation);
      }
    }
    associationsByVersion.set(row.source_item_version_id, associations);
  }

  const records = input.itemRows.flatMap((row): PublicEvidenceRecord[] => {
    const canonicalUrl = cleanHttpsUrl(row.canonical_url);
    const reviewedAt = cleanTimestamp(row.reviewed_at);
    const firstSeenAt = cleanTimestamp(row.first_seen_at);
    if (
      !canonicalUrl
      || !reviewedAt
      || !firstSeenAt
      || row.review_decision !== "approved"
      || row.review_state !== "approved"
      || row.publication_state !== "published"
    ) return [];
    const contentHash = cleanText(row.content_hash, "", 128);
    const versionId = cleanText(row.version_id, "", 180);
    const reviewId = cleanText(row.review_id, "", 180);
    const itemId = cleanText(row.item_id, "", 180);
    const title = cleanText(row.title, "", 240);
    if (!contentHash || !versionId || !reviewId || !itemId || !title) return [];
    const associations = (associationsByVersion.get(versionId) ?? [])
      .toSorted((left, right) => associationKey(left).localeCompare(associationKey(right)));
    return [{
      associations,
      auditFingerprint: contentHash.slice(0, 12),
      canonicalUrl,
      contentHash,
      coverageSummary: neutralCoverageSummary(associations),
      firstSeenAt,
      itemId,
      itemType: cleanText(row.item_type, "source", 40),
      publishedAt: cleanTimestamp(row.published_at),
      reviewId,
      reviewedAt,
      sourceName: cleanText(row.source_name, "Source publisher", 120),
      title,
      versionId,
    }];
  });

  return {
    generatedAt,
    records,
    state: records.length ? "available" : "empty",
  };
}

export function emptyPublicEvidenceSnapshot(now = new Date(), unavailable = false): PublicEvidenceSnapshot {
  return {
    generatedAt: now.toISOString(),
    records: [],
    state: unavailable ? "unavailable" : "empty",
  };
}

function publicCandidateDirectorySql() {
  return `${publicEvidenceCtes}
  SELECT profiles.candidacy_id, profiles.slug, people.full_name,
         constituencies.id AS constituency_id,
         constituencies.name AS constituency_name,
         candidacies.declaration_status,
         (
           SELECT COUNT(DISTINCT public_item.version_id)
             FROM eligible_public_items public_item
             JOIN source_item_version_entities candidate_binding
               ON candidate_binding.source_item_version_id = public_item.version_id
              AND candidate_binding.entity_type = 'candidacy'
              AND candidate_binding.entity_id = profiles.candidacy_id
              AND candidate_binding.confirmation_state = 'confirmed'
            WHERE ${candidateEligibility}
              AND ${candidateBindingPublicationEligibilitySql("public_item")}
         ) AS evidence_count
    FROM candidate_profiles profiles
    JOIN candidacies
      ON candidacies.id = profiles.candidacy_id
     AND candidacies.declaration_status != 'source-removed'
    JOIN people ON people.id = candidacies.person_id
    JOIN constituencies ON constituencies.id = candidacies.constituency_id
   WHERE ${approvedCandidateProfileBasisSql("profiles")}
   ORDER BY constituencies.name COLLATE NOCASE,
            people.sort_name COLLATE NOCASE, profiles.slug`;
}

function candidateInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function buildPublicCandidateDirectory(
  rows: readonly PublicCandidateDirectoryRow[],
): PublicCandidateDirectoryEntry[] {
  return rows.flatMap((row): PublicCandidateDirectoryEntry[] => {
    const candidacyId = cleanText(row.candidacy_id, "", 160);
    const constituencyId = cleanText(row.constituency_id, "", 160);
    const constituencyName = cleanText(row.constituency_name, "", 120);
    const name = cleanText(row.full_name, "", 160);
    const slug = cleanText(row.slug, "", 160);
    if (
      !candidacyId
      || !constituencyId
      || !constituencyName
      || !name
      || row.declaration_status !== "prospective"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ) return [];
    const parsedEvidenceCount = Number(row.evidence_count);
    return [{
      candidacyId,
      constituencyId,
      constituencyName,
      evidenceCount: Number.isFinite(parsedEvidenceCount)
        ? Math.max(0, Math.trunc(parsedEvidenceCount))
        : 0,
      initials: candidateInitials(name),
      name,
      slug,
      status: candidateStatusFromDeclaration(row.declaration_status),
    }];
  });
}

export async function queryPublicCandidateDirectory(db: PublicEvidenceDatabase) {
  const rows = await db.prepare(publicCandidateDirectorySql()).all<PublicCandidateDirectoryRow>();
  return buildPublicCandidateDirectory(rows.results);
}

export async function getPublicCandidateDirectorySafe() {
  try {
    const { getEvidenceBindings } = await import("../../../db");
    return await queryPublicCandidateDirectory(getEvidenceBindings().DB);
  } catch {
    return [];
  }
}

async function queryEvidenceSnapshot(
  db: PublicEvidenceDatabase,
  options: {
    candidateId?: string;
    limit?: number;
    now?: Date;
    privateCandidateDossier?: boolean;
  } = {},
) {
  const limit = options.limit === undefined
    ? null
    : Math.max(
        1,
        Math.min(MAXIMUM_EXPLICIT_PUBLIC_EVIDENCE_LIMIT, Math.trunc(options.limit)),
      );
  const candidateId = options.candidateId?.trim() || null;
  if (options.privateCandidateDossier && !candidateId) {
    throw new Error("A private candidate dossier projection requires a candidate ID.");
  }
  const statement = db.prepare(
    publicEvidenceRowsSql(Boolean(candidateId), options.privateCandidateDossier, limit !== null),
  );
  const rows = candidateId
    ? limit === null
      ? await statement.bind(candidateId).all<PublicEvidenceQueryRow>()
      : await statement.bind(candidateId, limit).all<PublicEvidenceQueryRow>()
    : limit === null
      ? await statement.all<PublicEvidenceQueryRow>()
      : await statement.bind(limit).all<PublicEvidenceQueryRow>();
  const itemRows = new Map<string, PublicEvidenceItemRow>();
  const associationRows: PublicEvidenceAssociationRow[] = [];
  for (const row of rows.results) {
    if (!itemRows.has(row.version_id)) itemRows.set(row.version_id, row);
    if (row.entity_type && row.entity_id && row.entity_label) associationRows.push(row);
  }
  const snapshot = buildPublicEvidenceSnapshot({
    associationRows,
    generatedAt: (options.now ?? new Date()).toISOString(),
    itemRows: [...itemRows.values()],
  });
  if (!candidateId) return snapshot;
  const records = snapshot.records.filter((record) => record.associations.some(
    (association) => association.type === "candidate" && association.id === candidateId,
  ));
  return {
    ...snapshot,
    records,
    state: records.length ? "available" as const : "empty" as const,
  };
}

export async function queryPublicEvidenceSnapshot(
  db: PublicEvidenceDatabase,
  options: { candidateId?: string; limit?: number; now?: Date } = {},
) {
  return queryEvidenceSnapshot(db, options);
}

export async function queryPrivateCandidateDossierEvidenceSnapshot(
  db: PublicEvidenceDatabase,
  options: { candidateId: string; limit?: number; now?: Date },
) {
  return queryEvidenceSnapshot(db, { ...options, privateCandidateDossier: true });
}

export async function getPublicEvidenceSnapshot(
  options: { candidateId?: string; limit?: number; now?: Date } = {},
) {
  const { getEvidenceBindings } = await import("../../../db");
  return queryPublicEvidenceSnapshot(getEvidenceBindings().DB, options);
}

export async function getPublicEvidenceSnapshotSafe(
  options: { candidateId?: string; limit?: number; now?: Date } = {},
) {
  try {
    return await getPublicEvidenceSnapshot(options);
  } catch {
    return emptyPublicEvidenceSnapshot(options.now, true);
  }
}
