import { getEvidenceBindings } from "../../../../../db";
import { getAuthenticatedAdminAccess } from "../../../../lib/admin-auth";
import { automaticallyReviewEvidenceLibrary } from "../../../../lib/evidence/automatic-review";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || (fetchSite && fetchSite !== "same-origin")) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json({ error: "Cross-origin automatic review blocked." }, 403);
  const access = await getAuthenticatedAdminAccess();
  if (!access) return json({ error: "Sign in to run automatic review." }, 401);
  if (!access.allowed) return json({ error: "Admin access has not been granted." }, 403);

  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const limit = typeof body.limit === "number" && Number.isInteger(body.limit)
    ? Math.max(1, Math.min(body.limit, 120))
    : 120;
  try {
    return json({ summary: await automaticallyReviewEvidenceLibrary(getEvidenceBindings().DB, { limit }) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Automatic review could not be completed." },
      500,
    );
  }
}
