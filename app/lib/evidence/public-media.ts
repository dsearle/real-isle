/**
 * Portrait records remain private until they have their own append-only,
 * exact-content rights review. Candidate identity approval must never release
 * an image by itself.
 */
export async function getPublishableCandidatePortraitsSafe() {
  return {} as Record<string, string>;
}
