import { getEvidenceDashboardSafe } from "../../../lib/evidence/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const dashboard = await getEvidenceDashboardSafe();
  if (!dashboard) {
    return Response.json(
      { state: "initialising" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    {
      audit: {
        headHash: dashboard.auditHeadHash,
        sequence: dashboard.auditSequence,
      },
      counts: dashboard.counts,
      sources: dashboard.sources.map((source) => ({
        id: source.id,
        lastSuccessAt: source.last_success_at,
        name: source.name,
        sourceTier: source.source_tier,
      })),
      state: "active",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
