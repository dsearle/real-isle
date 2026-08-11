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
const REVIEW_ID = /^review_[0-9a-f]{32}$/;
const CANDIDACY_ID = /^[a-z0-9][a-z0-9:-]{0,99}$/;
const RULESET_ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/;

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
  const expectedPreviousReviewId = body.expectedPreviousReviewId ?? null;
  const expectedCollectionReasonHash = body.expectedCollectionReasonHash;
  const expectedCollectionRuleset = body.expectedCollectionRuleset;
  const rationale = body.rationale;
  const candidateIds = body.candidateIds;
  const candidateSuggestionFingerprint = body.candidateSuggestionFingerprint;
  const constituencyIds = body.constituencyIds;
  const reviewKind = body.reviewKind;
  const scopeSuggestionFingerprint = body.scopeSuggestionFingerprint;
  const topicIds = body.topicIds;
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
  if (
    expectedPreviousReviewId !== null
    && (typeof expectedPreviousReviewId !== "string" || !REVIEW_ID.test(expectedPreviousReviewId))
  ) {
    return json({ error: "The current editorial decision is missing or invalid." }, 400);
  }
  if (
    typeof expectedCollectionReasonHash !== "string"
    || !CONTENT_HASH.test(expectedCollectionReasonHash)
  ) {
    return json({ error: "The frozen collection assessment is missing or invalid." }, 400);
  }
  if (
    typeof expectedCollectionRuleset !== "string"
    || !RULESET_ID.test(expectedCollectionRuleset)
  ) {
    return json({ error: "The collection assessment ruleset is missing or invalid." }, 400);
  }
  if (typeof rationale !== "string") {
    return json({ error: "The review note is invalid." }, 400);
  }
  if (reviewKind !== "source-version" && reviewKind !== "candidate-assignment") {
    return json({ error: "The review workflow is invalid." }, 400);
  }
  if (
    typeof candidateSuggestionFingerprint !== "string"
    || !CONTENT_HASH.test(candidateSuggestionFingerprint)
  ) {
    return json({ error: "The candidate suggestion set is stale or invalid." }, 400);
  }
  if (
    !Array.isArray(candidateIds) ||
    candidateIds.length > 20 ||
    candidateIds.some((candidateId) => typeof candidateId !== "string" || !CANDIDACY_ID.test(candidateId))
  ) {
    return json({ error: "The candidate dossier selection is invalid." }, 400);
  }
  const normalizedCandidateIds = [...new Set(candidateIds)].sort();
  if (
    typeof scopeSuggestionFingerprint !== "string"
    || !CONTENT_HASH.test(scopeSuggestionFingerprint)
  ) {
    return json({ error: "The topic and constituency suggestion set is stale or invalid." }, 400);
  }
  if (
    !Array.isArray(topicIds)
    || topicIds.length > 50
    || topicIds.some((topicId) => typeof topicId !== "string" || !CANDIDACY_ID.test(topicId))
  ) {
    return json({ error: "The topic selection is invalid." }, 400);
  }
  if (
    !Array.isArray(constituencyIds)
    || constituencyIds.length > 20
    || constituencyIds.some((constituencyId) => (
      typeof constituencyId !== "string" || !CANDIDACY_ID.test(constituencyId)
    ))
  ) {
    return json({ error: "The constituency selection is invalid." }, 400);
  }
  const normalizedTopicIds = [...new Set(topicIds)].sort();
  const normalizedConstituencyIds = [...new Set(constituencyIds)].sort();
  if (
    decision === "rejected"
    && (
      normalizedCandidateIds.length > 0
      || normalizedTopicIds.length > 0
      || normalizedConstituencyIds.length > 0
    )
  ) {
    return json({ error: "Rejected evidence cannot be routed to a public evidence section." }, 400);
  }
  if (
    reviewKind === "candidate-assignment"
    && (normalizedTopicIds.length > 0 || normalizedConstituencyIds.length > 0)
  ) {
    return json({ error: "Candidate filing decisions cannot change source routing." }, 400);
  }

  try {
    const receipt = await reviewSourceItemVersion(getEvidenceBindings().DB, {
      decision,
      candidateIds: normalizedCandidateIds,
      candidateSuggestionFingerprint,
      constituencyIds: normalizedConstituencyIds,
      expectedCollectionReasonHash,
      expectedCollectionRuleset,
      expectedContentHash,
      expectedPreviousReviewId,
      expectedVersionId,
      itemId,
      rationale,
      reviewKind,
      reviewerId: access.user.userId,
      scopeSuggestionFingerprint,
      topicIds: normalizedTopicIds,
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
