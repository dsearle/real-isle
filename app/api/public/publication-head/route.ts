import { getPublicPublicationHead } from "../../../lib/evidence/publication-head";

export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

export async function GET() {
  try {
    return Response.json(await getPublicPublicationHead(), {
      headers: RESPONSE_HEADERS,
    });
  } catch {
    return Response.json(
      { state: "unavailable" },
      { status: 503, headers: RESPONSE_HEADERS },
    );
  }
}
