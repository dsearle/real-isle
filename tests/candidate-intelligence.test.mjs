import assert from "node:assert/strict";
import test from "node:test";

import { dedupeCandidateEvidenceForAnalysis } from "../app/lib/evidence/candidate-evidence-dedupe.ts";

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
