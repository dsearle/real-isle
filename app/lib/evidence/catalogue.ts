import { candidates, constituencies } from "../data.ts";

export type MonitoredSource = {
  active: boolean;
  allowedHosts: readonly string[];
  feedType: "rss" | "atom" | "youtube" | "candidate-directory";
  feedUrl: string;
  homepageUrl: string;
  id: string;
  itemType: "audio" | "candidate-profile" | "news" | "official" | "video";
  name: string;
  pollIntervalMinutes: number;
  publisher: string;
  rightsState: "restricted-copy" | "metadata-only" | "public-record";
  sourceTier: 1 | 2 | 3 | 4 | 5;
  storeFullContent: boolean;
};

export const election = {
  id: "hok-2026",
  name: "2026 House of Keys General Election",
};

export const policyTopicCatalogue = [
  { id: "economy", name: "Economy", keywords: ["economy", "economic", "growth", "business"] },
  { id: "public-spending", name: "Government spending", keywords: ["public spending", "government spending", "budget", "deficit"] },
  { id: "taxation", name: "Taxation", keywords: ["tax", "taxation", "income tax", "national insurance"] },
  { id: "housing", name: "Housing", keywords: ["housing", "homes", "rent", "mortgage"] },
  { id: "health", name: "Health and Manx Care", keywords: ["manx care", "manxcare", "health", "hospital", "patient"] },
  { id: "education", name: "Education", keywords: ["education", "school", "teacher", "student"] },
  { id: "energy", name: "Energy", keywords: ["energy", "electricity", "power station"] },
  { id: "wind", name: "Offshore wind", keywords: ["wind farm", "wind farms", "wind-farm", "windfarm", "windfarms", "offshore wind", "wind energy", "turbine", "mooir vannin"] },
  { id: "environment", name: "Environment", keywords: ["environment", "climate", "biodiversity", "emissions"] },
  { id: "infrastructure", name: "Infrastructure", keywords: ["infrastructure", "sewerage", "broadband", "utilities"] },
  { id: "transport", name: "Transport", keywords: ["transport", "bus", "ferry", "airport", "roads"] },
  { id: "planning", name: "Planning", keywords: ["planning", "development plan", "planning application"] },
  { id: "population", name: "Population and immigration", keywords: ["population", "immigration", "work permit"] },
  { id: "digital-government", name: "Digital government", keywords: ["digital government", "digital services", "online services"] },
  { id: "financial-services", name: "Financial services", keywords: ["financial services", "finance sector", "banking"] },
  { id: "technology", name: "Technology", keywords: ["technology", "artificial intelligence", "data centre", "telecom"] },
  { id: "tourism", name: "Tourism", keywords: ["tourism", "visitor", "hospitality"] },
  { id: "agriculture", name: "Agriculture", keywords: ["agriculture", "farming", "farmer", "food security"] },
  { id: "local-government", name: "Local government", keywords: ["local authority", "local government", "commissioners"] },
  { id: "constitutional", name: "Constitutional issues", keywords: ["constitution", "crown dependency", "westminster", "sovereignty"] },
  { id: "public-service-reform", name: "Public-sector reform", keywords: ["public service", "civil service", "government reform"] },
  { id: "cost-of-living", name: "Cost of living", keywords: ["cost of living", "affordability", "household bills"] },
  { id: "social-policy", name: "Social policy", keywords: ["childcare", "benefits", "poverty", "social care"] },
] as const;

// Feed URLs are verified before activation. Sources can remain in the catalogue
// with active=false until their publisher exposes a stable machine-readable feed.
export const monitoredSources: MonitoredSource[] = [
  {
    id: "manx-radio-election",
    name: "Manx Radio election news",
    publisher: "Radio Manx Ltd",
    homepageUrl: "https://www.manxradio.com/election-2026/",
    feedUrl: "https://www.manxradio.com/news/general-election-2026/feed.xml",
    feedType: "rss",
    itemType: "news",
    sourceTier: 3,
    active: true,
    allowedHosts: ["www.manxradio.com", "manxradio.com"],
    pollIntervalMinutes: 10,
    rightsState: "restricted-copy",
    storeFullContent: false,
  },
  {
    id: "manx-radio-candidates",
    name: "Manx Radio candidate directory",
    publisher: "Radio Manx Ltd",
    homepageUrl: "https://www.manxradio.com/election-2026/election-candidates/",
    feedUrl: "https://www.manxradio.com/election-2026/election-candidates/",
    feedType: "candidate-directory",
    itemType: "candidate-profile",
    sourceTier: 3,
    active: true,
    allowedHosts: ["www.manxradio.com", "manxradio.com"],
    pollIntervalMinutes: 10,
    rightsState: "restricted-copy",
    storeFullContent: false,
  },
  {
    id: "manx-radio-island-news",
    name: "Manx Radio island news",
    publisher: "Radio Manx Ltd",
    homepageUrl: "https://www.manxradio.com/news/isle-of-man-news/",
    feedUrl: "https://www.manxradio.com/news/isle-of-man-news/feed.xml",
    feedType: "rss",
    itemType: "news",
    sourceTier: 3,
    active: true,
    allowedHosts: ["www.manxradio.com", "manxradio.com"],
    pollIntervalMinutes: 15,
    rightsState: "restricted-copy",
    storeFullContent: false,
  },
  {
    id: "bbc-isle-of-man",
    name: "BBC Isle of Man",
    publisher: "BBC News",
    homepageUrl: "https://www.bbc.co.uk/news/world/europe/isle_of_man",
    feedUrl: "https://feeds.bbci.co.uk/news/world/europe/isle_of_man/rss.xml",
    feedType: "rss",
    itemType: "news",
    sourceTier: 3,
    active: true,
    allowedHosts: ["feeds.bbci.co.uk", "www.bbc.co.uk", "bbc.co.uk"],
    pollIntervalMinutes: 15,
    rightsState: "metadata-only",
    storeFullContent: false,
  },
  {
    id: "iom-today-news",
    name: "Isle of Man Today",
    publisher: "Isle of Man Today",
    homepageUrl: "https://www.iomtoday.co.im/news/",
    feedUrl: "https://www.iomtoday.co.im/news/rss",
    feedType: "rss",
    itemType: "news",
    sourceTier: 3,
    active: true,
    allowedHosts: ["www.iomtoday.co.im", "iomtoday.co.im"],
    pollIntervalMinutes: 15,
    rightsState: "metadata-only",
    storeFullContent: false,
  },
  {
    id: "manx-newscast",
    name: "Manx Newscast interviews",
    publisher: "Radio Manx Ltd",
    homepageUrl: "https://www.manxradio.com/podcasts/manx-newscast/",
    feedUrl: "https://feeds.captivate.fm/manx-newscast/",
    feedType: "rss",
    itemType: "audio",
    sourceTier: 3,
    active: true,
    allowedHosts: ["feeds.captivate.fm", "www.manxradio.com", "manxradio.com"],
    pollIntervalMinutes: 30,
    rightsState: "metadata-only",
    storeFullContent: false,
  },
  {
    id: "manx-radio-youtube",
    name: "Manx Radio YouTube",
    publisher: "Radio Manx Ltd",
    homepageUrl: "https://www.youtube.com/channel/UCG4nB2TvNY2At0WYeF0jDzg",
    feedUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCG4nB2TvNY2At0WYeF0jDzg",
    feedType: "youtube",
    itemType: "video",
    sourceTier: 2,
    active: true,
    allowedHosts: ["www.youtube.com", "youtube.com"],
    pollIntervalMinutes: 15,
    rightsState: "metadata-only",
    storeFullContent: false,
  },
  {
    id: "iom-government-youtube",
    name: "Isle of Man Government YouTube",
    publisher: "Isle of Man Government",
    homepageUrl: "https://www.youtube.com/channel/UCAJ6-lntI73xR8ioRI5i-OA",
    feedUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCAJ6-lntI73xR8ioRI5i-OA",
    feedType: "youtube",
    itemType: "video",
    sourceTier: 1,
    active: true,
    allowedHosts: ["www.youtube.com", "youtube.com"],
    pollIntervalMinutes: 60,
    rightsState: "metadata-only",
    storeFullContent: false,
  },
  {
    id: "tynwald-hansard",
    name: "Tynwald Hansard",
    publisher: "Tynwald Parliament",
    homepageUrl: "https://tynwald.org.im/business/hansard",
    feedUrl: "https://tynwald.org.im/rss?list=2020-2040&site=%2Fbusiness%2Fhansard",
    feedType: "rss",
    itemType: "official",
    sourceTier: 1,
    active: true,
    allowedHosts: ["tynwald.org.im", "www.tynwald.org.im"],
    pollIntervalMinutes: 1_440,
    rightsState: "public-record",
    storeFullContent: false,
  },
];

export const candidateCatalogue = candidates.map((candidate) => ({
  affiliation: candidate.affiliation,
  constituencyId:
    constituencies.find((constituency) => constituency.name === candidate.constituency)?.id ?? "unknown",
  fullName: candidate.name,
  id: candidate.slug,
}));

export const constituencyCatalogue = constituencies.map((constituency) => ({
  id: constituency.id,
  name: constituency.name,
  seats: 2,
}));
