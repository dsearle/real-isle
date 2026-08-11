import { getEvidenceBindings } from "../../../../../db";
import { getAuthenticatedAdminAccess } from "../../../../lib/admin-auth";
import {
  CandidateProfileReviewConflictError,
  CandidateProfileReviewNotFoundError,
  CandidateProfileReviewValidationError,
  reviewCandidateProfileVersion,
} from "../../../../lib/evidence/candidate-profile-review";

export const dynamic = "force-dynamic";

const MAXIMUM_BODY_LENGTH = 2_048;
const BASIS_HASH = /^[0-9a-f]{64}$/;
const CANDIDACY_ID = /^[a-z0-9][a-z0-9:-]{0,159}$/;
const REVIEW_ID = /^review_[0-9a-f]{32}$/;

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
  if (!access) return json({ error: "Sign in to review candidate profiles." }, 401);
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

  const candidacyId = body.candidacyId;
  const decision = body.decision;
  const expectedBasisHash = body.expectedBasisHash;
  const expectedPreviousReviewId = body.expectedPreviousReviewId ?? null;
  const rationale = body.rationale;
  if (typeof candidacyId !== "string" || !CANDIDACY_ID.test(candidacyId)) {
    return json({ error: "The candidate identifier is invalid." }, 400);
  }
  if (decision !== "approved" && decision !== "rejected") {
    return json({ error: "Choose approve or reject." }, 400);
  }
  if (typeof expectedBasisHash !== "string" || !BASIS_HASH.test(expectedBasisHash)) {
    return json({ error: "The candidate identity basis is missing or invalid." }, 400);
  }
  if (
    expectedPreviousReviewId !== null
    && (typeof expectedPreviousReviewId !== "string" || !REVIEW_ID.test(expectedPreviousReviewId))
  ) return json({ error: "The current candidate decision is missing or invalid." }, 400);
  if (typeof rationale !== "string") return json({ error: "The review note is invalid." }, 400);

  try {
    const receipt = await reviewCandidateProfileVersion(getEvidenceBindings().DB, {
      candidacyId,
      decision,
      expectedBasisHash,
      expectedPreviousReviewId,
      rationale,
      reviewerId: access.user.userId,
    });
    return json({ receipt });
  } catch (error) {
    if (error instanceof CandidateProfileReviewValidationError) {
      return json({ error: error.message }, 400);
    }
    if (error instanceof CandidateProfileReviewNotFoundError) {
      return json({ error: error.message }, 404);
    }
    if (error instanceof CandidateProfileReviewConflictError) {
      return json({ error: error.message }, 409);
    }
    return json({ error: "The candidate profile review could not be recorded. Nothing was changed." }, 500);
  }
}
