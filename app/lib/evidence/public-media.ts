type PublishablePortraitRow = {
  id: string;
  slug: string;
};

export async function getPublishableCandidatePortraitsSafe() {
  try {
    // Keep static/server rendering usable outside Workers; the runtime binding is
    // loaded only when Cloudflare is actually available.
    const { getEvidenceBindings } = await import("../../../db");
    const { DB: db } = getEvidenceBindings();
    const rows = await db
      .prepare(
        `SELECT media.id, profiles.slug
         FROM candidate_media_assets media
         JOIN candidate_profiles profiles ON profiles.candidacy_id = media.candidacy_id
         JOIN candidacies ON candidacies.id = media.candidacy_id
         WHERE media.media_kind = 'portrait'
           AND media.publication_state = 'published'
           AND media.review_state = 'approved'
           AND media.rights_state IN ('candidate-permission', 'redistributable')
           AND media.retention_outcome = 'stored-publishable'
           AND media.content_snapshot_id IS NOT NULL
           AND media.content_hash IS NOT NULL
           AND media.storage_key IS NOT NULL
           AND media.content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
           AND candidacies.declaration_status != 'source-removed'
         ORDER BY profiles.slug,
           CASE media.variant WHEN 'profile-body' THEN 0 WHEN 'profile-og' THEN 1 ELSE 2 END`,
      )
      .all<PublishablePortraitRow>();

    const portraits: Record<string, string> = {};
    for (const row of rows.results) {
      portraits[row.slug] ??= `/api/media/candidate-portrait/${encodeURIComponent(row.id)}`;
    }
    return portraits;
  } catch {
    return {};
  }
}
