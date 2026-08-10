import { getEvidenceBindings } from "../../../../../db";
import { getAuthenticatedAdminAccess } from "../../../../lib/admin-auth";
import {
  reviewSourceItemVersion,
  SourceItemReviewConflictError,
  SourceItemReviewNotFoundError,
  SourceItemReviewValidationError,
} from "../../../../lib/evidence/review";

export const dynamic = "force-dynamic";

const MAXIMUM_BODY_LENGTH = 4_096;
const CONTENT_HASH = /^[0-9a-f]{64}$/;
const ITEM_ID = /^item_[0-9a-f]{32}$/;
const VERSION_ID = /^itemversion_[0-9a-f]{32}$/;

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
  if (!isSameOriginRequest(request)) return json({ error: "Cross-origin review blocked." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Send the review as JSON." }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_BODY_LENGTH) {
    return json({ error: "The review request is too large." }, 413);
  }

  const access = await getAuthenticatedAdminAccess();
  if (!access) return json({ error: "Sign in to review evidence." }, 401);
  if (!access.allowed) return json({ error: "Admin access has not been granted." }, 403);

  const rawBody = await request.text();
  if (rawBody.length > MAXIMUM_BODY_LENGTH) {
    return json({ error: "The review request is too large." }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "The review request is not valid JSON." }, 400);
  }
  if (!isRecord(body)) return json({ error: "The review request is invalid." }, 400);

  const decision = body.decision;
  const itemId = body.itemId;
  const expectedVersionId = body.expectedVersionId;
  const expectedContentHash = body.expectedContentHash;
  const rationale = body.rationale;
  if (decision !== "approved" && decision !== "rejected") {
    return json({ error: "Choose approve or reject." }, 400);
  }
  if (typeof itemId !== "string" || !ITEM_ID.test(itemId)) {
    return json({ error: "The source record identifier is invalid." }, 400);
  }
  if (typeof expectedVersionId !== "string" || !VERSION_ID.test(expectedVersionId)) {
    return json({ error: "The source version identifier is invalid." }, 400);
  }
  if (typeof expectedContentHash !== "string" || !CONTENT_HASH.test(expectedContentHash)) {
    return json({ error: "The source content hash is invalid." }, 400);
  }
  if (typeof rationale !== "string") {
    return json({ error: "The review note is invalid." }, 400);
  }

  try {
    const receipt = await reviewSourceItemVersion(getEvidenceBindings().DB, {
      decision,
      expectedContentHash,
      expectedVersionId,
      itemId,
      rationale,
      reviewerId: access.user.userId,
    });
    return json({ receipt });
  } catch (error) {
    if (error instanceof SourceItemReviewValidationError) {
      return json({ error: error.message }, 400);
    }
    if (error instanceof SourceItemReviewNotFoundError) {
      return json({ error: error.message }, 404);
    }
    if (error instanceof SourceItemReviewConflictError) {
      return json({ error: error.message }, 409);
    }
    return json({ error: "The review could not be recorded. Nothing was changed." }, 500);
  }
}
