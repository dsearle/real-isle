export const candidateDirectoryStatesSql = `SELECT profiles.slug, profiles.candidacy_id,
              profiles.current_profile_observation_id,
              profiles.current_basis_hash,
              candidacies.affiliation,
              candidacies.constituency_id,
              canonical_constituency.name AS constituency_name,
              candidacies.declaration_status,
              candidacies.verification_state,
              people.full_name,
              candidacies.person_id,
              people.profile_state AS people_profile_state,
              observations.payload_hash AS directory_payload_hash,
              COALESCE(
                (
                  SELECT versions.id
                  FROM source_item_versions versions
                  WHERE versions.source_item_id = observations.source_item_id
                    AND versions.payload_hash = observations.payload_hash
                    AND versions.parser_version = 'candidate-directory-v1'
                    AND versions.observed_at <= observations.observed_at
                    AND versions.snapshot_id = observations.snapshot_id
                  ORDER BY versions.observed_at DESC, versions.created_at DESC
                  LIMIT 1
                ),
                (
                  SELECT versions.id
                  FROM source_item_versions versions
                  WHERE versions.source_item_id = observations.source_item_id
                    AND versions.payload_hash = observations.payload_hash
                    AND versions.parser_version = 'candidate-directory-v1'
                    AND versions.observed_at <= observations.observed_at
                  ORDER BY versions.observed_at DESC, versions.created_at DESC
                  LIMIT 1
                )
              ) AS current_directory_version_id,
              profile_observations.payload AS current_profile_payload,
              profile_observations.payload_hash AS current_profile_payload_hash,
              profile_observations.snapshot_id AS current_profile_snapshot_id
       FROM candidate_profiles profiles
       JOIN candidacies ON candidacies.id = profiles.candidacy_id
       JOIN people ON people.id = candidacies.person_id
       JOIN constituencies canonical_constituency
         ON canonical_constituency.id = candidacies.constituency_id
       JOIN candidate_profile_observations observations
         ON observations.id = profiles.current_directory_observation_id
       LEFT JOIN candidate_profile_observations profile_observations
         ON profile_observations.id = profiles.current_profile_observation_id`;
