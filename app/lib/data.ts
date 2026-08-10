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
  status: "Declared" | "Profile incomplete";
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

export const constituencies = [
  { id: "ayre-michael", name: "Ayre and Michael", short: "A&M", x: 62.43, y: 25.74, declared: "7 declared", candidates: ["tim-johnston", "steve-curphey"] },
  { id: "ramsey", name: "Ramsey", short: "RAM", x: 80.25, y: 25.56, declared: "Monitoring", candidates: [] },
  { id: "garff", name: "Garff", short: "GAR", x: 76.65, y: 45.78, declared: "Monitoring", candidates: [] },
  { id: "onchan", name: "Onchan", short: "ONC", x: 67.78, y: 62.17, declared: "Profiles live", candidates: ["rob-callister", "rachel-glover"] },
  { id: "douglas-north", name: "Douglas North", short: "DN", x: 63.83, y: 62.57, declared: "Monitoring", candidates: [] },
  { id: "douglas-east", name: "Douglas East", short: "DE", x: 65.88, y: 66.18, declared: "Monitoring", candidates: [] },
  { id: "douglas-central", name: "Douglas Central", short: "DC", x: 62.82, y: 67.61, declared: "5 declared", candidates: ["peter-shimmin"] },
  { id: "douglas-south", name: "Douglas South", short: "DS", x: 58.25, y: 67.9, declared: "Profile live", candidates: ["claire-christian"] },
  { id: "middle", name: "Middle", short: "MID", x: 53.52, y: 61.49, declared: "5 declared", candidates: [] },
  { id: "glenfaba-peel", name: "Glenfaba and Peel", short: "G&P", x: 34.48, y: 56.48, declared: "Monitoring", candidates: [] },
  { id: "arbory-castletown-malew", name: "Arbory, Castletown and Malew", short: "ACM", x: 31.92, y: 77.56, declared: "Monitoring", candidates: [] },
  { id: "rushen", name: "Rushen", short: "RUS", x: 14.59, y: 82.56, declared: "Monitoring", candidates: [] },
] as const;

export const candidates: Candidate[] = [
  {
    slug: "claire-christian",
    name: "Claire Christian",
    initials: "CC",
    constituency: "Douglas South",
    affiliation: "Independent",
    status: "Declared",
    summary: "Sitting MHK and Health and Social Care Minister seeking re-election in Douglas South.",
    priorities: ["Sustainable public finances", "Health and social care", "Public-service performance"],
    evidenceCount: 1,
    sources: [{ label: "Manx Radio candidate profile", url: "https://www.manxradio.com/election-2026/election-candidates/claire-christian/", observed: "9 Aug 2026" }],
    positions: {
      manxcare: { label: "Priority identified", detail: "Names health and social care and public-service performance among stated priorities.", state: "partial" },
      wind: { label: "Not found", detail: "No attributable position held in the reviewed source set yet.", state: "missing" },
      housing: { label: "Not found", detail: "No detailed housing position held in the reviewed source set yet.", state: "missing" },
    },
  },
  {
    slug: "rob-callister",
    name: "Rob Callister",
    initials: "RC",
    constituency: "Onchan",
    affiliation: "Independent",
    status: "Declared",
    summary: "Sitting Onchan MHK seeking a third general-election term.",
    priorities: ["Housing delivery", "Patient-centred healthcare", "Public trust"],
    evidenceCount: 1,
    sources: [{ label: "Manx Radio candidate profile", url: "https://www.manxradio.com/election-2026/election-candidates/rob-callister/", observed: "9 Aug 2026" }],
    positions: {
      manxcare: { label: "Reform", detail: "Calls for safe, sustainable and patient-centred health services.", state: "found" },
      wind: { label: "Not found", detail: "No attributable position held in the reviewed source set yet.", state: "missing" },
      housing: { label: "Delivery focus", detail: "Identifies undelivered housing commitments as a priority.", state: "found" },
    },
  },
  {
    slug: "rachel-glover",
    name: "Rachel Glover",
    initials: "RG",
    constituency: "Onchan",
    affiliation: "Independent",
    status: "Declared",
    summary: "Scientist and business founder standing in her first House of Keys general election.",
    priorities: ["Childcare support", "Economic diversification", "Healthcare value"],
    evidenceCount: 1,
    sources: [{ label: "Manx Radio candidate profile", url: "https://www.manxradio.com/election-2026/election-candidates/rachel-glover/", observed: "9 Aug 2026" }],
    positions: {
      manxcare: { label: "Measure value", detail: "Calls for healthcare value to be assessed by measuring delivery.", state: "found" },
      wind: { label: "Not found", detail: "No attributable position held in the reviewed source set yet.", state: "missing" },
      housing: { label: "Issue identified", detail: "Identifies the housing crisis but the reviewed source does not contain a detailed policy.", state: "partial" },
    },
  },
  {
    slug: "peter-shimmin",
    name: "Peter Shimmin",
    initials: "PS",
    constituency: "Douglas Central",
    affiliation: "Independent",
    status: "Declared",
    summary: "Former Public Health implementation officer standing in his first general election.",
    priorities: ["Cost of living", "Young people and families", "Public-service trust"],
    evidenceCount: 1,
    sources: [{ label: "Manx Radio candidate profile", url: "https://www.manxradio.com/election-2026/election-candidates/peter-shimmin/", observed: "9 Aug 2026" }],
    positions: {
      manxcare: { label: "Not found", detail: "No attributable Manx Care position held in the reviewed source set yet.", state: "missing" },
      wind: { label: "Not found", detail: "No attributable position held in the reviewed source set yet.", state: "missing" },
      housing: { label: "Affordability focus", detail: "Names cost of living and support for young people and families as priorities.", state: "partial" },
    },
  },
  {
    slug: "tim-johnston",
    name: "Tim Johnston",
    initials: "TJ",
    constituency: "Ayre and Michael",
    affiliation: "Independent",
    status: "Declared",
    summary: "Sitting MHK and Enterprise Minister seeking re-election.",
    priorities: ["Economy", "Cost of living", "Island self-sufficiency"],
    evidenceCount: 1,
    sources: [{ label: "Manx Radio declaration report", url: "https://www.manxradio.com/news/isle-of-man-news/first-sitting-ayre-and-michael-mhk-announces-re-election-bid/", observed: "9 Aug 2026" }],
    positions: {
      manxcare: { label: "Not found", detail: "No attributable position held in the reviewed source set yet.", state: "missing" },
      wind: { label: "Not found", detail: "No attributable position held in the reviewed source set yet.", state: "missing" },
      housing: { label: "Cost focus", detail: "Cost of living is identified as a priority; detailed housing policy not yet held.", state: "partial" },
    },
  },
  {
    slug: "steve-curphey",
    name: "Steve Curphey",
    initials: "SC",
    constituency: "Ayre and Michael",
    affiliation: "Independent",
    status: "Declared",
    summary: "Chair of Ballaugh Parish Commissioners standing in Ayre and Michael.",
    priorities: ["Government reform", "Fairer taxation", "Health budget control"],
    evidenceCount: 1,
    sources: [{ label: "Manx Radio declaration report", url: "https://www.manxradio.com/news/isle-of-man-news/seventh-candidate-to-stand-for-election-in-ayre-and-michael/", observed: "9 Aug 2026" }],
    positions: {
      manxcare: { label: "Budget control", detail: "Names health-service budgetary control as a priority.", state: "partial" },
      wind: { label: "Not found", detail: "No attributable position held in the reviewed source set yet.", state: "missing" },
      housing: { label: "Not found", detail: "No attributable position held in the reviewed source set yet.", state: "missing" },
    },
  },
];

export const updates: readonly ElectionUpdate[] = [
  {
    date: "09 Aug",
    dateQualifier: "Checked",
    sortDate: "2026-08-09",
    source: "Government",
    state: "Primary source",
    stateClass: "state-primary",
    title: "The distinction that matters: declared is not nominated",
    summary: "The formal nomination period closes at 1pm on 26 August. Until then, profiles carry prospective-candidate status.",
    url: "https://elections.gov.im/house-of-keys-general-election-2026/",
    constituencyIds: [],
    candidateSlugs: [],
  },
  {
    date: "20 Jul",
    dateQualifier: "Published",
    sortDate: "2026-07-20",
    source: "Manx Radio",
    state: "Reviewed report",
    stateClass: "state-reviewed",
    title: "Ayre and Michael field reaches seven declared candidates",
    summary: "Steve Curphey joined six previously declared prospective candidates in the constituency.",
    url: "https://www.manxradio.com/news/isle-of-man-news/seventh-candidate-to-stand-for-election-in-ayre-and-michael/",
    constituencyIds: ["ayre-michael"],
    candidateSlugs: ["steve-curphey"],
  },
  {
    date: "09 Jul",
    dateQualifier: "Published",
    sortDate: "2026-07-09",
    source: "Manx Radio",
    state: "Reviewed report",
    stateClass: "state-reviewed",
    title: "Tim Johnston confirms re-election bid",
    summary: "The sitting MHK named the economy, cost of living and Island self-sufficiency as priorities.",
    url: "https://www.manxradio.com/news/isle-of-man-news/first-sitting-ayre-and-michael-mhk-announces-re-election-bid/",
    constituencyIds: ["ayre-michael"],
    candidateSlugs: ["tim-johnston"],
  },
  {
    date: "09 Aug",
    dateQualifier: "Reviewed",
    sortDate: "2026-08-09",
    source: "Manx Radio",
    state: "Profile reviewed",
    stateClass: "state-profile",
    title: "Douglas South profile records Claire Christian's priorities",
    summary: "Health and social care, public finances and public-service performance are among the stated priorities.",
    url: "https://www.manxradio.com/election-2026/election-candidates/claire-christian/",
    constituencyIds: ["douglas-south"],
    candidateSlugs: ["claire-christian"],
  },
];

export function getCandidate(slug: string) {
  return candidates.find((candidate) => candidate.slug === slug);
}
