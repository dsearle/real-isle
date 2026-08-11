type EvidenceIdentity = {
  canonicalUrl: string;
  contentHash: string;
  versionId: string;
};

export function dedupeCandidateEvidenceForAnalysis<T extends EvidenceIdentity>(
  evidence: T[],
): T[] {
  const unique = new Map<string, T>();
  for (const item of [...evidence].sort((left, right) => {
    const leftKey = `${left.canonicalUrl}\n${left.contentHash}`;
    const rightKey = `${right.canonicalUrl}\n${right.contentHash}`;
    if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
    return left.versionId < right.versionId ? -1 : left.versionId > right.versionId ? 1 : 0;
  })) {
    const key = `${item.canonicalUrl}\n${item.contentHash}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}
