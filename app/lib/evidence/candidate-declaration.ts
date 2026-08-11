import type { Candidate } from "../data.ts";

export type CandidateStatusLabel = Candidate["status"];

/**
 * Turns the declaration status held in the reviewed identity basis into public
 * copy. Public publication currently permits only `prospective`, but keeping
 * the wording here prevents UI surfaces from silently hard-coding that fact.
 */
export function candidateStatusFromDeclaration(
  declarationStatus: string,
): CandidateStatusLabel {
  if (declarationStatus === "prospective") return "Prospective candidate";
  return "Profile incomplete";
}

export function candidateStatusPhrase(status: CandidateStatusLabel) {
  switch (status) {
    case "Prospective candidate":
      return "a prospective candidate";
    case "Declared":
      return "a declared candidate";
    default:
      return "a candidate whose declaration status is still being checked";
  }
}

export function candidateRecordSentence(input: {
  constituency: string;
  name: string;
  status: CandidateStatusLabel;
}) {
  return `${input.name} is recorded as ${candidateStatusPhrase(input.status)} in ${input.constituency}.`;
}
