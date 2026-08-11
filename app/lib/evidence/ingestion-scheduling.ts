export function rotateSourceIdsForWindow(
  sourceIds: readonly string[],
  windowNumber: number,
  batchSize = 2,
) {
  if (sourceIds.length < 2) return [...sourceIds];
  const safeWindow = Math.max(0, Math.trunc(windowNumber));
  const safeBatchSize = Math.max(1, Math.trunc(batchSize));
  const offset = (safeWindow * safeBatchSize) % sourceIds.length;
  return [...sourceIds.slice(offset), ...sourceIds.slice(0, offset)];
}
