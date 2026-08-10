import { getEvidenceBindings } from "../../../../../db";

export const dynamic = "force-dynamic";

type PortraitAsset = {
  content_hash: string;
  content_type: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  storage_key: string;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { DB: db, SNAPSHOTS: bucket } = getEvidenceBindings();
  const asset = await db
    .prepare(
      `SELECT storage_key, content_type, content_hash
       FROM candidate_media_assets
       WHERE id = ?
         AND media_kind = 'portrait'
         AND publication_state = 'published'
         AND review_state = 'approved'
         AND rights_state IN ('candidate-permission', 'redistributable')
         AND retention_outcome = 'stored-publishable'
         AND content_snapshot_id IS NOT NULL
         AND content_hash IS NOT NULL
         AND storage_key IS NOT NULL
         AND content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')`,
    )
    .bind(id)
    .first<PortraitAsset>();
  if (!asset) return new Response("Not found", { status: 404 });

  const object = await bucket.get(asset.storage_key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": asset.content_type,
    "x-content-type-options": "nosniff",
  });
  headers.set("etag", `"${asset.content_hash}"`);
  return new Response(object.body, { headers });
}
