import { getPublicMonitorSnapshot } from "../../../lib/evidence/public-monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getPublicMonitorSnapshot();
    return Response.json(
      {
        counts: snapshot.counts,
        generatedAt: snapshot.generatedAt,
        sources: snapshot.sources,
        state: snapshot.state,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { state: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
