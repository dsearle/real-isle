import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTION_ROUTING_RULE,
  projectCollectionReason,
} from "../app/lib/evidence/collection-reason.ts";

const baseInput = {
  candidates: [],
  constituencies: [],
  itemType: "news",
  sourceFeedType: "rss",
  sourceId: "manx-radio-island-news",
  sourceName: "Manx Radio island news",
  summary: "A general Island update.",
  title: "Community update",
  topics: [],
};

test("dedicated election sources route to evidence review without inventing a match", () => {
  const reason = projectCollectionReason({
    ...baseInput,
    sourceId: "manx-radio-election",
    sourceName: "Manx Radio election news",
  });

  assert.equal(reason.route, "evidence-review");
  assert.equal(reason.ruleId, COLLECTION_ROUTING_RULE);
  assert.equal(reason.sourceScope.id, "dedicated-election-feed");
  assert.deepEqual(reason.candidates, []);
  assert.match(reason.reason, /collection lead, not a verified claim/i);
});

test("candidate matches expose the name, matched text and deterministic method", () => {
  const reason = projectCollectionReason({
    ...baseInput,
    candidates: [{
      confidence: 0.98,
      id: "hok-2026:claire-christian",
      label: "Claire Christian",
      matchMethod: "deterministic-keyword-v1",
      mentionText: "Claire Christian",
    }],
  });

  assert.equal(reason.route, "evidence-review");
  assert.equal(reason.candidates[0]?.label, "Claire Christian");
  assert.equal(reason.candidates[0]?.mentionText, "Claire Christian");
  assert.equal(reason.candidates[0]?.matchMethod, "deterministic-keyword-v1");
});

test("topic-only island news is context, not election evidence", () => {
  const reason = projectCollectionReason({
    ...baseInput,
    summary: "Hospital waiting times were discussed.",
    title: "Health service update",
    topics: [{
      confidence: 0.7,
      id: "health",
      label: "Health and Manx Care",
      matchMethod: "deterministic-keyword-v1",
      mentionText: "health",
    }],
  });

  assert.equal(reason.route, "context-monitoring");
  assert.match(reason.reason, /not currently treated as election evidence/i);
  assert.equal(reason.topics[0]?.mentionText, "health");
});

test("unmatched items remain captured but stay outside the priority queue", () => {
  const reason = projectCollectionReason(baseInput);

  assert.equal(reason.route, "broad-monitoring");
  assert.equal(reason.sourceScope.label, "Island-wide news monitoring");
  assert.match(reason.reason, /stays outside the priority review queue/i);
  assert.deepEqual(reason.electionSignals, []);
});

test("explicit election language routes a broad-source item to review", () => {
  const reason = projectCollectionReason({
    ...baseInput,
    summary: "The document sets out priorities for polling day.",
    title: "Candidate publishes manifesto",
  });

  assert.equal(reason.route, "evidence-review");
  assert.ok(reason.electionSignals.some((signal) => signal.mentionText === "manifesto"));
  assert.ok(reason.electionSignals.every(
    (signal) => signal.matchMethod === "deterministic-election-term-v1",
  ));
});
