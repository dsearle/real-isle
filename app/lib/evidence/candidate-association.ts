import { sha256Hex, stableJson } from "./integrity.ts";

export type CandidateSuggestionFingerprintInput = {
  candidacyId: string;
  confidence: number;
  matchMethod: string;
  mentionText: string;
};

export function fingerprintCandidateSuggestions(
  suggestions: CandidateSuggestionFingerprintInput[],
) {
  const ordered = suggestions
    .map((suggestion) => ({ ...suggestion }))
    .sort((left, right) => left.candidacyId < right.candidacyId ? -1 : left.candidacyId > right.candidacyId ? 1 : 0);
  return sha256Hex(stableJson({
    method: "candidate-suggestion-set-v1",
    suggestions: ordered,
  }));
}
