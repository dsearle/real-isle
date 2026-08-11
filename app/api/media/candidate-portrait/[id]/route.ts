export const dynamic = "force-dynamic";

/** Public portrait delivery is disabled until a dedicated audited rights review exists. */
export async function GET() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
