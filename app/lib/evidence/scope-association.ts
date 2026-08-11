import { sha256Hex, stableJson } from "./integrity.ts";

export type ScopeSuggestionFingerprintInput = {
  confidence: number;
  entityType: "constituency" | "topic";
  id: string;
  matchMethod: string;
  mentionText: string;
};

export function fingerprintScopeSuggestions(
  suggestions: ScopeSuggestionFingerprintInput[],
) {
  const ordered = suggestions
    .map((suggestion) => ({ ...suggestion }))
    .sort((left, right) => {
      if (left.entityType !== right.entityType) {
        return left.entityType < right.entityType ? -1 : 1;
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  return sha256Hex(stableJson({
    method: "collection-scope-suggestion-set-v1",
    suggestions: ordered,
  }));
}
