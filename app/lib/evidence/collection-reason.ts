export const COLLECTION_ROUTING_RULE = "collection-routing-v1" as const;

export type CollectionRoute =
  | "evidence-review"
  | "context-monitoring"
  | "broad-monitoring";

export type CollectionSignal = {
  confidence: number;
  id: string;
  label: string;
  matchMethod: string;
  mentionText: string;
};

export type CollectionSourceScope = {
  electionFocused: boolean;
  id: string;
  label: string;
};

export type CollectionReason = {
  candidates: CollectionSignal[];
  constituencies: CollectionSignal[];
  electionSignals: CollectionSignal[];
  reason: string;
  route: CollectionRoute;
  routeLabel: string;
  ruleId: typeof COLLECTION_ROUTING_RULE;
  sourceScope: CollectionSourceScope;
  topics: CollectionSignal[];
};

type CollectionReasonInput = {
  candidates: CollectionSignal[];
  constituencies: CollectionSignal[];
  itemType: string;
  sourceFeedType: string;
  sourceId: string;
  sourceName: string;
  summary: string;
  title: string;
  topics: CollectionSignal[];
};

const ELECTION_TERMS = [
  "general election",
  "house of keys",
  "polling day",
  "manifestos",
  "manifesto",
  "candidates",
  "candidate",
  "elections",
  "election",
  "mhks",
  "mhk",
] as const;

const SOURCE_SCOPES: Record<string, CollectionSourceScope> = {
  "manx-radio-election": {
    electionFocused: true,
    id: "dedicated-election-feed",
    label: "Dedicated election feed",
  },
  "manx-radio-candidates": {
    electionFocused: true,
    id: "candidate-registry",
    label: "Candidate registry",
  },
  "manx-radio-island-news": {
    electionFocused: false,
    id: "island-wide-news",
    label: "Island-wide news monitoring",
  },
  "bbc-isle-of-man": {
    electionFocused: false,
    id: "island-wide-news",
    label: "Island-wide news monitoring",
  },
  "iom-today-news": {
    electionFocused: false,
    id: "island-wide-news",
    label: "Island-wide news monitoring",
  },
  "manx-newscast": {
    electionFocused: false,
    id: "island-wide-interviews",
    label: "Island-wide interview monitoring",
  },
  "manx-radio-youtube": {
    electionFocused: false,
    id: "publisher-video-channel",
    label: "Publisher video-channel monitoring",
  },
  "iom-government-youtube": {
    electionFocused: false,
    id: "official-video-channel",
    label: "Official video-channel monitoring",
  },
  "tynwald-hansard": {
    electionFocused: false,
    id: "official-public-record",
    label: "Official public-record monitoring",
  },
};

function containsTerm(searchableText: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(
    searchableText,
  );
}

function electionSignals(title: string, summary: string): CollectionSignal[] {
  const searchableText = `${title}\n${summary}`.normalize("NFKC");
  return ELECTION_TERMS
    .filter((term) => containsTerm(searchableText, term))
    .map((term) => ({
      confidence: 0.85,
      id: term.replaceAll(" ", "-"),
      label: "Election language",
      matchMethod: "deterministic-election-term-v1",
      mentionText: term,
    }));
}

function sourceScope(sourceId: string, sourceFeedType: string, itemType: string) {
  const configured = SOURCE_SCOPES[sourceId];
  if (configured) return configured;
  if (sourceFeedType === "candidate-directory" || itemType === "candidate-profile") {
    return {
      electionFocused: true,
      id: "candidate-registry",
      label: "Candidate registry",
    } satisfies CollectionSourceScope;
  }
  return {
    electionFocused: false,
    id: "approved-source-monitoring",
    label: "Approved broad-source monitoring",
  } satisfies CollectionSourceScope;
}

function joinedLabels(signals: CollectionSignal[]) {
  return signals.map((signal) => signal.label).join(", ");
}

function canonicalSignals(signals: CollectionSignal[]) {
  return [...signals].sort((left, right) =>
    left.id.localeCompare(right.id)
    || left.mentionText.localeCompare(right.mentionText)
    || left.matchMethod.localeCompare(right.matchMethod)
  );
}

export function projectCollectionReason(input: CollectionReasonInput): CollectionReason {
  const scope = sourceScope(input.sourceId, input.sourceFeedType, input.itemType);
  const detectedElectionSignals = electionSignals(input.title, input.summary);
  const candidates = canonicalSignals(input.candidates);
  const constituencies = canonicalSignals(input.constituencies);
  const topics = canonicalSignals(input.topics);
  const directEvidence = scope.electionFocused
    || candidates.length > 0
    || detectedElectionSignals.length > 0;
  const contextualMatch = topics.length > 0 || constituencies.length > 0;

  if (directEvidence) {
    const reasons = [
      scope.electionFocused ? scope.label : null,
      candidates.length ? `candidate match: ${joinedLabels(candidates)}` : null,
      detectedElectionSignals.length
        ? `election language: ${detectedElectionSignals.map((signal) => `“${signal.mentionText}”`).join(", ")}`
        : null,
    ].filter((reason): reason is string => Boolean(reason));
    return {
      candidates,
      constituencies,
      electionSignals: detectedElectionSignals,
      reason: `Sent to election evidence review because of ${reasons.join("; ")}. This is a collection lead, not a verified claim.`,
      route: "evidence-review",
      routeLabel: "Election review lead",
      ruleId: COLLECTION_ROUTING_RULE,
      sourceScope: scope,
      topics,
    };
  }

  if (contextualMatch) {
    const topicReason = topics.length
      ? `tracked topic: ${joinedLabels(topics)}`
      : null;
    const constituencyReason = constituencies.length
      ? `constituency mention: ${joinedLabels(constituencies)}`
      : null;
    return {
      candidates,
      constituencies,
      electionSignals: detectedElectionSignals,
      reason: `Retained for contextual monitoring because it matched ${[topicReason, constituencyReason].filter(Boolean).join("; ")}. No candidate or election-specific signal was detected, so it is not currently treated as election evidence.`,
      route: "context-monitoring",
      routeLabel: "Context monitoring",
      ruleId: COLLECTION_ROUTING_RULE,
      sourceScope: scope,
      topics,
    };
  }

  return {
    candidates,
    constituencies,
    electionSignals: detectedElectionSignals,
    reason: `Captured because ${input.sourceName} is approved for ${scope.label.toLowerCase()}. No candidate, election term, tracked topic or constituency matched, so this is not currently election evidence and stays outside the priority review queue.`,
    route: "broad-monitoring",
    routeLabel: "Broad monitoring capture",
    ruleId: COLLECTION_ROUTING_RULE,
    sourceScope: scope,
    topics,
  };
}
