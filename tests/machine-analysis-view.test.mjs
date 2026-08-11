import assert from "node:assert/strict";
import test from "node:test";

import {
  citationLocatorLabel,
  extractionConfidencePercent,
  machineAnalysisFindingsArePublic,
  machineAnalysisHasCompletePublicCitations,
  machineAnalysisStatusCopy,
} from "../app/lib/evidence/machine-analysis-view.ts";

test("machine analysis states use explicit human-verification language", () => {
  assert.deepEqual(machineAnalysisStatusCopy["machine-analysed"], {
    description: "Not checked by a person",
    label: "Machine analysed",
  });
  assert.match(machineAnalysisStatusCopy["human-verified"].description, /not an independent fact-check/i);
  assert.equal(machineAnalysisFindingsArePublic("machine-analysed"), true);
  assert.equal(machineAnalysisFindingsArePublic("human-verified"), true);
  assert.equal(machineAnalysisFindingsArePublic("disputed"), false);
  assert.equal(machineAnalysisFindingsArePublic("withdrawn"), false);
});

test("confidence is bounded and described only as extraction or citation confidence", () => {
  assert.equal(extractionConfidencePercent(0.824), 82);
  assert.equal(extractionConfidencePercent(-0.3), 0);
  assert.equal(extractionConfidencePercent(1.4), 100);
  assert.equal(extractionConfidencePercent(Number.NaN), null);
});

test("citation locators preserve half-open document offsets and transcript time", () => {
  assert.equal(citationLocatorLabel({
    blockIndex: 7,
    byteEnd: 270,
    byteStart: 210,
    characterEnd: 160,
    characterStart: 100,
    label: "Manifesto paragraph 8",
    transcriptEndMilliseconds: 83_400,
    transcriptSegmentId: "segment-8",
    transcriptStartMilliseconds: 65_000,
  }), "Manifesto paragraph 8 · characters 100–160 (end exclusive) · source block bytes 210–270 (end exclusive) · transcript 1:05–1:23");
});

test("invalid locators fail closed instead of inventing an exact location", () => {
  assert.equal(citationLocatorLabel({
    blockIndex: null,
    byteEnd: 10,
    byteStart: 20,
    characterEnd: null,
    characterStart: null,
    label: "",
    transcriptEndMilliseconds: null,
    transcriptSegmentId: null,
    transcriptStartMilliseconds: null,
  }), "Exact source locator unavailable");
});

test("public findings fail closed unless every finding has an exact cleared HTTPS citation", () => {
  const citation = {
    blockHash: "b".repeat(64),
    blockId: "block-1",
    citationId: "citation-1",
    documentCaptureId: "capture-1",
    excerptHash: "e".repeat(64),
    locator: {
      blockIndex: 0,
      byteEnd: 80,
      byteStart: 10,
      characterEnd: 70,
      characterStart: 0,
      label: "Paragraph 1",
      transcriptEndMilliseconds: null,
      transcriptSegmentId: null,
      transcriptStartMilliseconds: null,
    },
    publicExcerpt: "An exact, rights-cleared extract.",
    rawContentHash: "r".repeat(64),
    readableTextHash: "t".repeat(64),
    sourceSnapshotId: "snapshot-1",
    sourceTitle: "Election source",
    sourceUrl: "https://publisher.example/election",
    sourceVersionHash: "v".repeat(64),
    sourceVersionId: "version-1",
  };
  const finding = {
    associations: [],
    citationIds: [citation.citationId],
    extractionConfidence: 0.92,
    findingId: "finding-1",
    kind: "source-summary",
    text: "The source discusses a policy topic.",
  };
  assert.equal(machineAnalysisHasCompletePublicCitations({
    citations: [citation],
    findings: [finding],
    status: "machine-analysed",
  }), true);
  assert.equal(machineAnalysisHasCompletePublicCitations({
    citations: [{ ...citation, publicExcerpt: null }],
    findings: [finding],
    status: "machine-analysed",
  }), false);
  assert.equal(machineAnalysisHasCompletePublicCitations({
    citations: [citation],
    findings: [{ ...finding, citationIds: ["missing"] }],
    status: "machine-analysed",
  }), false);
  assert.equal(machineAnalysisHasCompletePublicCitations({
    citations: [citation],
    findings: [finding],
    status: "withdrawn",
  }), false);
});
