import { getPublicMonitorSnapshot } from "../../../lib/evidence/public-monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getPublicMonitorSnapshot();
    return Response.json(snapshot, {
      headers: {
        "cache-control": snapshot.state === "active"
          ? "public, max-age=15, s-maxage=30, stale-while-revalidate=60"
          : "no-store",
      },
    });
  } catch {
    return Response.json(
      { state: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
