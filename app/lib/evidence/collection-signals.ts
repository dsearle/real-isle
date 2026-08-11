import { constituencyCatalogue, policyTopicCatalogue } from "./catalogue.ts";
import type { CollectionSignal } from "./collection-reason.ts";

type CandidateSignalSource = {
  id: string;
  label: string;
};

export const deleteCurrentKeywordSignalsSql = `DELETE FROM item_entities
 WHERE item_id = ?
   AND match_method = 'deterministic-keyword-v1'
   AND EXISTS (
     SELECT 1 FROM source_items current_item
      WHERE current_item.id = ? AND current_item.latest_version_id = ?
   )`;

export const insertCurrentKeywordSignalSql = `INSERT OR IGNORE INTO item_entities (
  item_id, entity_type, entity_id, mention_text, match_method, confidence
)
SELECT ?, ?, ?, ?, 'deterministic-keyword-v1', ?
 WHERE EXISTS (
   SELECT 1 FROM source_items current_item
    WHERE current_item.id = ? AND current_item.latest_version_id = ?
 )`;

function containsTerm(searchableText: string, term: string) {
  const escaped = term
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(
    searchableText,
  );
}

export function projectKeywordCollectionSignals(
  searchableText: string,
  candidateSources: CandidateSignalSource[],
) {
  const normalized = searchableText.normalize("NFKC").toLowerCase();
  const candidates: CollectionSignal[] = candidateSources
    .filter((candidate) => containsTerm(normalized, candidate.label))
    .map((candidate) => ({
      confidence: 0.98,
      id: candidate.id,
      label: candidate.label,
      matchMethod: "deterministic-keyword-v1",
      mentionText: candidate.label,
    }));
  const constituencies: CollectionSignal[] = constituencyCatalogue.flatMap((constituency) => {
    const terms = constituency.name === "Middle"
      ? ["constituency of middle", "middle constituency"]
      : [constituency.name];
    return terms.some((term) => containsTerm(normalized, term))
      ? [{
          confidence: 0.9,
          id: constituency.id,
          label: constituency.name,
          matchMethod: "deterministic-keyword-v1",
          mentionText: constituency.name,
        }]
      : [];
  });
  const topics: CollectionSignal[] = policyTopicCatalogue.flatMap((topic) => {
    const keyword = topic.keywords.find((candidate) => containsTerm(normalized, candidate));
    return keyword
      ? [{
          confidence: 0.7,
          id: topic.id,
          label: topic.name,
          matchMethod: "deterministic-keyword-v1",
          mentionText: keyword,
        }]
      : [];
  });
  return { candidates, constituencies, topics };
}
