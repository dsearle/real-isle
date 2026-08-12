import assert from "node:assert/strict";
import test from "node:test";

import { automaticEvidenceReviewDecision } from "../app/lib/evidence/automatic-review.ts";

function reviewItem({
  candidates = [],
  electionFocused = false,
  route = "evidence-review",
} = {}) {
  return {
    candidateAssociations: candidates,
    collectionReason: {
      route,
      sourceScope: { electionFocused },
    },
  };
}

test("automatic triage approves only direct election sources or exact candidate matches", () => {
  assert.equal(
    automaticEvidenceReviewDecision(reviewItem({ electionFocused: true })).decision,
    "approved",
  );
  assert.equal(
    automaticEvidenceReviewDecision(reviewItem({
      candidates: [{ confidence: 1, candidacyId: "candidate-a" }],
    })).decision,
    "approved",
  );
});

test("automatic triage withholds contextual, broad and ambiguous material instead of guessing", () => {
  for (const item of [
    reviewItem({ route: "context-monitoring" }),
    reviewItem({ route: "broad-monitoring" }),
    reviewItem({ candidates: [{ confidence: 0.7, candidacyId: "candidate-a" }] }),
  ]) {
    const decision = automaticEvidenceReviewDecision(item);
    assert.equal(decision.decision, "rejected");
    assert.match(decision.rationale, /withheld.*retained for audit/i);
  }
});
