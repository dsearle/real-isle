export type EvidenceSource = {
  label: string;
  url: string;
  observed: string;
};

export type Candidate = {
  slug: string;
  name: string;
  initials: string;
  constituency: string;
  affiliation: string;
  status: "Declared" | "Profile incomplete" | "Prospective candidate";
  summary: string;
  priorities: string[];
  evidenceCount: number;
  sources: EvidenceSource[];
  positions: Record<string, { label: string; detail: string; state: "found" | "partial" | "missing" }>;
};

export type ElectionUpdate = {
  date: string;
  dateQualifier: "Checked" | "Published" | "Reviewed";
  sortDate: string;
  source: string;
  state: string;
  stateClass: string;
  title: string;
  summary: string;
  url: string;
  constituencyIds: readonly string[];
  candidateSlugs: readonly string[];
};

export const constituencyBoundarySource = {
  layer: "Keys Constituencies",
  method: "Representative point calculated from each official polygon's bounding-box centre; boundaries are not displayed.",
  observed: "2026-08-10",
  url: "https://ppmaps.gov.im/manngispubserver/rest/services/CorporateDynamicServices/PPDemocracy/MapServer/3",
} as const;

// Geographic presentation data is safe to keep in source control. Candidate
// identity, status and policy material is intentionally loaded from the audited
// evidence database instead of being duplicated as unreviewed source fixtures.
export const constituencies = [
  { id: "ayre-michael", name: "Ayre and Michael", short: "A&M", x: 62.43, y: 25.74, declared: "Researching", candidates: [] },
  { id: "ramsey", name: "Ramsey", short: "RAM", x: 80.25, y: 25.56, declared: "Researching", candidates: [] },
  { id: "garff", name: "Garff", short: "GAR", x: 76.65, y: 45.78, declared: "Researching", candidates: [] },
  { id: "onchan", name: "Onchan", short: "ONC", x: 67.78, y: 62.17, declared: "Researching", candidates: [] },
  { id: "douglas-north", name: "Douglas North", short: "DN", x: 63.83, y: 62.57, declared: "Researching", candidates: [] },
  { id: "douglas-east", name: "Douglas East", short: "DE", x: 65.88, y: 66.18, declared: "Researching", candidates: [] },
  { id: "douglas-central", name: "Douglas Central", short: "DC", x: 62.82, y: 67.61, declared: "Researching", candidates: [] },
  { id: "douglas-south", name: "Douglas South", short: "DS", x: 58.25, y: 67.9, declared: "Researching", candidates: [] },
  { id: "middle", name: "Middle", short: "MID", x: 53.52, y: 61.49, declared: "Researching", candidates: [] },
  { id: "glenfaba-peel", name: "Glenfaba and Peel", short: "G&P", x: 34.48, y: 56.48, declared: "Researching", candidates: [] },
  { id: "arbory-castletown-malew", name: "Arbory, Castletown and Malew", short: "ACM", x: 31.92, y: 77.56, declared: "Researching", candidates: [] },
  { id: "rushen", name: "Rushen", short: "RUS", x: 14.59, y: 82.56, declared: "Researching", candidates: [] },
] as const;

// These compatibility exports remain empty so legacy/private components fail
// closed. Reviewed candidates and updates are projected from D1 at request time.
export const candidates: Candidate[] = [];
export const updates: readonly ElectionUpdate[] = [];

export function getCandidate(slug: string) {
  return candidates.find((candidate) => candidate.slug === slug);
}
