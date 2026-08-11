import { getEvidenceBindings } from "../../../../../db";
import { getAuthenticatedAdminAccess } from "../../../../lib/admin-auth";
import {
  CollectionPreparationConflictError,
  CollectionPreparationNotFoundError,
  CollectionPreparationValidationError,
  prepareSourceItemVersionForReview,
} from "../../../../lib/evidence/collection-preparation";

export const dynamic = "force-dynamic";

const MAXIMUM_BODY_LENGTH = 1_024;
const HASH = /^[0-9a-f]{64}$/;
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,199}$/;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json({ error: "Cross-origin preparation blocked." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Send the preparation request as JSON." }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_BODY_LENGTH) {
    return json({ error: "The preparation request is too large." }, 413);
  }

  const access = await getAuthenticatedAdminAccess();
  if (!access) return json({ error: "Sign in to prepare evidence for review." }, 401);
  if (!access.allowed) return json({ error: "Admin access has not been granted." }, 403);

  const rawBody = await request.text();
  if (rawBody.length > MAXIMUM_BODY_LENGTH) {
    return json({ error: "The preparation request is too large." }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "The preparation request is not valid JSON." }, 400);
  }
  if (!isRecord(body)) return json({ error: "The preparation request is invalid." }, 400);

  const itemId = body.itemId;
  const expectedVersionId = body.expectedVersionId;
  const expectedContentHash = body.expectedContentHash;
  if (typeof itemId !== "string" || !RECORD_ID.test(itemId)) {
    return json({ error: "The source item identifier is invalid." }, 400);
  }
  if (typeof expectedVersionId !== "string" || !RECORD_ID.test(expectedVersionId)) {
    return json({ error: "The source version identifier is invalid." }, 400);
  }
  if (typeof expectedContentHash !== "string" || !HASH.test(expectedContentHash)) {
    return json({ error: "The expected source content hash is invalid." }, 400);
  }

  try {
    const receipt = await prepareSourceItemVersionForReview(getEvidenceBindings().DB, {
      actorId: access.user.userId,
      expectedContentHash,
      expectedVersionId,
      itemId,
    });
    return json({ receipt });
  } catch (error) {
    if (error instanceof CollectionPreparationValidationError) {
      return json({ error: error.message }, 400);
    }
    if (error instanceof CollectionPreparationNotFoundError) {
      return json({ error: error.message }, 404);
    }
    if (error instanceof CollectionPreparationConflictError) {
      return json({ error: error.message }, 409);
    }
    return json({ error: "The source could not be prepared. Nothing was approved or published." }, 500);
  }
}
