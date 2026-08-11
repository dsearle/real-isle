import { sha256Hex, stableJson } from "./integrity.ts";

const CANDIDATE_PROFILE_BASIS_SCHEMA = "real-isle.candidate-profile-identity-basis.v1";

export type CandidateProfileIdentityBasis = {
  affiliation: string;
  candidacyId: string;
  constituencyId: string;
  constituencyName: string;
  declarationStatus: string;
  directoryPayloadHash: string;
  directoryVersionId: string;
  fullName: string;
  observedConstituencyId: string;
  personId: string;
  profileUrlHash: string;
  slug: string;
};

export type CandidateProfileBasisRow = {
  affiliation: string;
  candidacy_id: string;
  constituency_id: string;
  constituency_name: string;
  current_basis_hash: string | null;
  declaration_status: string;
  directory_payload_hash: string;
  directory_version_id: string | null;
  full_name: string;
  observed_constituency_id: string;
  person_id: string;
  profile_url_hash: string;
  publication_state: string;
  review_state: string;
  slug: string;
};

function canonicalText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function canonicalCandidateProfileBasis(
  input: CandidateProfileIdentityBasis,
): CandidateProfileIdentityBasis {
  return {
    affiliation: canonicalText(input.affiliation),
    candidacyId: input.candidacyId,
    constituencyId: input.constituencyId,
    constituencyName: canonicalText(input.constituencyName),
    declarationStatus: input.declarationStatus,
    directoryPayloadHash: input.directoryPayloadHash,
    directoryVersionId: input.directoryVersionId,
    fullName: canonicalText(input.fullName),
    observedConstituencyId: input.observedConstituencyId,
    personId: input.personId,
    profileUrlHash: input.profileUrlHash,
    slug: input.slug,
  };
}

export function candidateProfileBasisFromRow(
  row: CandidateProfileBasisRow,
): CandidateProfileIdentityBasis {
  return canonicalCandidateProfileBasis({
    affiliation: row.affiliation,
    candidacyId: row.candidacy_id,
    constituencyId: row.constituency_id,
    constituencyName: row.constituency_name,
    declarationStatus: row.declaration_status,
    directoryPayloadHash: row.directory_payload_hash,
    directoryVersionId: row.directory_version_id ?? "",
    fullName: row.full_name,
    observedConstituencyId: row.observed_constituency_id,
    personId: row.person_id,
    profileUrlHash: row.profile_url_hash,
    slug: row.slug,
  });
}

export const candidateProfileBasisRowSql = `SELECT
  candidacies.affiliation,
  profiles.candidacy_id,
  candidacies.constituency_id,
  constituencies.name AS constituency_name,
  profiles.current_basis_hash,
  candidacies.declaration_status,
  directory_observation.payload_hash AS directory_payload_hash,
  COALESCE(
    (
      SELECT versions.id
        FROM source_item_versions versions
       WHERE versions.source_item_id = directory_observation.source_item_id
         AND versions.snapshot_id = directory_observation.snapshot_id
         AND versions.payload_hash = directory_observation.payload_hash
         AND versions.parser_version = 'candidate-directory-v1'
       ORDER BY versions.observed_at DESC, versions.created_at DESC
       LIMIT 1
    ),
    (
      SELECT versions.id
        FROM source_item_versions versions
       WHERE versions.source_item_id = directory_observation.source_item_id
         AND versions.payload_hash = directory_observation.payload_hash
         AND versions.parser_version = 'candidate-directory-v1'
         AND versions.observed_at <= directory_observation.observed_at
       ORDER BY versions.observed_at DESC, versions.created_at DESC
       LIMIT 1
    )
  ) AS directory_version_id,
  people.full_name,
  profiles.observed_constituency_id,
  candidacies.person_id,
  profiles.profile_url_hash,
  profiles.publication_state,
  profiles.review_state,
  profiles.slug
FROM candidate_profiles profiles
JOIN candidacies ON candidacies.id = profiles.candidacy_id
JOIN people ON people.id = candidacies.person_id
JOIN constituencies ON constituencies.id = candidacies.constituency_id
JOIN candidate_profile_observations directory_observation
  ON directory_observation.id = profiles.current_directory_observation_id
 AND directory_observation.observation_type = 'directory'`;

/**
 * Fingerprints only the identity fields that can appear on public candidate
 * surfaces. Biography, contact, link, document and portrait records all keep
 * their own private review and rights lifecycles.
 */
export function fingerprintCandidateProfileBasis(input: CandidateProfileIdentityBasis) {
  const canonical = canonicalCandidateProfileBasis(input);
  return sha256Hex(stableJson({
    affiliation: canonical.affiliation,
    candidacyId: canonical.candidacyId,
    constituencyId: canonical.constituencyId,
    constituencyName: canonical.constituencyName,
    declarationStatus: canonical.declarationStatus,
    directoryPayloadHash: canonical.directoryPayloadHash,
    directoryVersionId: canonical.directoryVersionId,
    fullName: canonical.fullName,
    observedConstituencyId: canonical.observedConstituencyId,
    personId: canonical.personId,
    profileUrlHash: canonical.profileUrlHash,
    schema: CANDIDATE_PROFILE_BASIS_SCHEMA,
    slug: canonical.slug,
  }));
}

export async function backfillCandidateProfileBasisHashes(db: D1Database) {
  const rows = await db
    .prepare(
      `${candidateProfileBasisRowSql}
       WHERE candidacies.declaration_status != 'source-removed'
       ORDER BY profiles.candidacy_id`,
    )
    .all<CandidateProfileBasisRow>();
  let updated = 0;
  for (const row of rows.results) {
    if (!row.directory_version_id) continue;
    const hash = await fingerprintCandidateProfileBasis(candidateProfileBasisFromRow(row));
    if (row.current_basis_hash === hash) continue;
    const result = await db
      .prepare(
        `UPDATE candidate_profiles SET
           current_basis_hash = ?,
           publication_state = CASE WHEN publication_state = 'published' THEN 'withheld' ELSE publication_state END,
           review_state = CASE WHEN review_state IN ('approved', 'rejected') THEN 'needs-update' ELSE review_state END,
           updated_at = CURRENT_TIMESTAMP
         WHERE candidacy_id = ? AND current_basis_hash IS ?`,
      )
      .bind(hash, row.candidacy_id, row.current_basis_hash)
      .run();
    updated += Number(result.meta?.changes ?? 0);
  }
  return updated;
}

export function approvedCandidateProfileBasisSql(profileAlias: string) {
  return `(
    ${profileAlias}.current_basis_hash IS NOT NULL
    AND ${profileAlias}.review_state = 'approved'
    AND ${profileAlias}.publication_state = 'published'
    AND EXISTS (
      SELECT 1 FROM candidacies publishable_candidacy
       WHERE publishable_candidacy.id = ${profileAlias}.candidacy_id
         AND publishable_candidacy.declaration_status = 'prospective'
    )
    AND EXISTS (
      SELECT 1
        FROM reviews candidate_profile_review
       WHERE candidate_profile_review.target_type = 'candidate-profile-version'
         AND candidate_profile_review.target_id = ${profileAlias}.current_basis_hash
         AND candidate_profile_review.decision = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM reviews candidate_profile_successor
            WHERE candidate_profile_successor.supersedes_review_id = candidate_profile_review.id
         )
         AND EXISTS (
           SELECT 1
             FROM audit_events candidate_profile_audit
            WHERE candidate_profile_audit.action = 'candidate-profile.reviewed'
              AND candidate_profile_audit.entity_type = 'candidate-profile'
              AND candidate_profile_audit.entity_id = ${profileAlias}.candidacy_id
              AND json_extract(candidate_profile_audit.payload, '$.reviewId') = candidate_profile_review.id
              AND json_extract(candidate_profile_audit.payload, '$.basisHash') = ${profileAlias}.current_basis_hash
              AND json_extract(candidate_profile_audit.payload, '$.decision') = 'approved'
         )
    )
  )`;
}
