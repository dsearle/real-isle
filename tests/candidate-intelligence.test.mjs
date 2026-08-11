import assert from "node:assert/strict";
import test from "node:test";

import { dedupeCandidateEvidenceForAnalysis } from "../app/lib/evidence/candidate-evidence-dedupe.ts";
import { candidateIdentityForView } from "../app/lib/evidence/candidate-intelligence.ts";

function evidence(overrides = {}) {
  return {
    canonicalUrl: "https://publisher.example/election/candidate-interview",
    contentHash: "a".repeat(64),
    firstSeenAt: "2026-08-11T10:00:00.000Z",
    itemId: "item-a",
    itemType: "news",
    publishedAt: "2026-08-11T09:00:00.000Z",
    publicationState: "private",
    reviewId: "review-a",
    reviewedAt: "2026-08-11T11:00:00.000Z",
    sourceName: "Election feed",
    title: "Candidate interview",
    versionId: "version-a",
    ...overrides,
  };
}

test("candidate analysis counts identical URL and content captures once", () => {
  const unique = dedupeCandidateEvidenceForAnalysis([
    evidence(),
    evidence({ itemId: "item-b", reviewId: "review-b", sourceName: "Island feed", versionId: "version-b" }),
  ]);

  assert.equal(unique.length, 1);
  assert.equal(unique[0]?.versionId, "version-a");
});

test("candidate analysis preserves changed content and distinct media URLs", () => {
  const unique = dedupeCandidateEvidenceForAnalysis([
    evidence(),
    evidence({ contentHash: "b".repeat(64), itemId: "item-b", versionId: "version-b" }),
    evidence({ canonicalUrl: "https://video.example/watch/123", itemId: "item-c", itemType: "video", versionId: "version-c" }),
  ]);

  assert.deepEqual(unique.map((item) => item.versionId), ["version-a", "version-b", "version-c"]);
});

test("public candidate identity fails closed and never prefers static profile copy", () => {
  const staticCandidate = {
    affiliation: "Independent",
    constituency: "Static constituency",
    evidenceCount: 9,
    initials: "ST",
    name: "Static Candidate",
    positions: {},
    priorities: ["Static claim"],
    slug: "candidate-a",
    sources: [{ label: "Static source", observed: "Yesterday", url: "https://static.example/item" }],
    status: "Declared",
    summary: "Static profile copy",
  };
  const liveRecord = {
    affiliation: "Unconfirmed",
    analysis_state: null,
    candidacy_id: "candidacy-a",
    constituency_name: "Live constituency",
    declaration_status: "prospective",
    full_name: "Live Candidate",
    intelligence_publication_state: null,
    profile_publication_state: "published",
    profile_review_state: "approved",
    published_revision_id: null,
    slug: "candidate-a",
  };

  assert.equal(candidateIdentityForView(null, staticCandidate, false), null);
  const publicIdentity = candidateIdentityForView(liveRecord, staticCandidate, false);
  assert.equal(publicIdentity?.dataSource, "live");
  assert.equal(publicIdentity?.candidate.name, "Live Candidate");
  assert.equal(publicIdentity?.candidate.status, "Prospective candidate");
  assert.match(publicIdentity?.candidate.summary ?? "", /recorded as a prospective candidate/);
  assert.deepEqual(publicIdentity?.candidate.priorities, []);
  assert.deepEqual(publicIdentity?.candidate.sources, []);

  const privateIdentity = candidateIdentityForView(liveRecord, staticCandidate, true);
  assert.equal(privateIdentity?.candidate.name, "Static Candidate");
});
