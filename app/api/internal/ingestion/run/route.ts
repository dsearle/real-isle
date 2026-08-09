import { getEvidenceBindings } from "../../../../../db";
import { monitoredSources } from "../../../../lib/evidence/catalogue";
import { runEvidenceIngestion } from "../../../../lib/evidence/ingest";
import { randomId, timingSafeEqual } from "../../../../lib/evidence/integrity";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const bindings = getEvidenceBindings();
  if (!bindings.INGESTION_SECRET) return json({ error: "Ingestion is not configured." }, 503);
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!timingSafeEqual(supplied, bindings.INGESTION_SECRET)) {
    return json({ error: "Not authorised." }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as {
    force?: boolean;
    limit?: number;
    sourceIds?: unknown;
  };
  const knownSourceIds = new Set(monitoredSources.map((source) => source.id));
  const sourceIds = Array.isArray(body.sourceIds)
    ? body.sourceIds.filter(
        (sourceId): sourceId is string => typeof sourceId === "string" && knownSourceIds.has(sourceId),
      )
    : undefined;
  const idempotencyKey = request.headers.get("idempotency-key") ?? randomId("manual");
  const result = await runEvidenceIngestion(bindings, {
    actor: { id: "authenticated-ingestion-client", type: "system" },
    force: Boolean(body.force),
    idempotencyKey,
    limit: body.limit,
    sourceIds,
    trigger: request.headers.get("x-real-isle-trigger") === "scheduler" ? "scheduler" : "manual",
  });
  const unsuccessful = result.runs.some((run) => run.status === "failed" || run.status === "partial");
  return json(result, unsuccessful ? 502 : 200);
}
