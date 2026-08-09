export type CandidateDirectoryEntry = {
  constituencyName: string;
  name: string;
  portraitUrl: string;
  profileUrl: string;
  slug: string;
};

export type CandidateProfileLink = {
  kind:
    | "email"
    | "facebook"
    | "instagram"
    | "interview-audio"
    | "interview-video"
    | "linkedin"
    | "other"
    | "phone"
    | "website"
    | "x"
    | "youtube";
  label: string;
  url: string;
};

export type CandidateProfileDocument = {
  kind: "manifesto" | "other" | "statement" | "transcript";
  title: string;
  url: string;
};

export type CandidateProfilePortrait = {
  contentType: string | null;
  height: number | null;
  url: string;
  variant: "profile-body" | "profile-og";
  width: number | null;
};

export type ParsedCandidateProfile = {
  biographyParagraphs: string[];
  contactText: string[];
  documents: CandidateProfileDocument[];
  links: CandidateProfileLink[];
  name: string;
  portraits: CandidateProfilePortrait[];
};

const MANX_RADIO_ORIGIN = "https://www.manxradio.com";

function normalizedIdentity(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function candidateProfileMatchesExpectedIdentity(input: {
  expectedName: string;
  expectedSlug: string;
  expectedUrl: string;
  observedName: string;
  resolvedUrl: string;
}) {
  let expected: URL;
  let resolved: URL;
  try {
    expected = new URL(input.expectedUrl);
    resolved = new URL(input.resolvedUrl);
  } catch {
    return false;
  }
  const expectedPath = expected.pathname.replace(/\/+$/, "");
  const resolvedPath = resolved.pathname.replace(/\/+$/, "");
  const resolvedSlug = resolvedPath.split("/").filter(Boolean).at(-1) ?? "";
  return (
    expected.hostname === resolved.hostname &&
    expectedPath === resolvedPath &&
    normalizedIdentity(input.expectedSlug) === normalizedIdentity(resolvedSlug) &&
    normalizedIdentity(input.expectedName) === normalizedIdentity(input.observedName)
  );
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const codePoint = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    if (body.startsWith("#")) {
      const codePoint = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return named[body.toLowerCase()] ?? entity;
  });
}

function plainText(value: string) {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>|<\/(?:div|li|p|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function attribute(tag: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeEntities(match[2]).trim() : "";
}

function httpsUrl(value: string, baseUrl = MANX_RADIO_ORIGIN) {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function contactUrl(value: string) {
  const trimmed = decodeEntities(value).trim();
  if (/^mailto:/i.test(trimmed)) {
    const email = trimmed.slice(trimmed.indexOf(":") + 1).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : "";
  }
  if (/^tel:/i.test(trimmed)) {
    const phone = trimmed.slice(trimmed.indexOf(":") + 1).replace(/[^+\d]/g, "");
    return phone.length >= 6 ? `tel:${phone}` : "";
  }
  return "";
}

function linkKind(urlValue: string): CandidateProfileLink["kind"] {
  if (urlValue.startsWith("mailto:")) return "email";
  if (urlValue.startsWith("tel:")) return "phone";
  const host = new URL(urlValue).hostname.toLowerCase().replace(/^www\./, "");
  if (host === "facebook.com" || host.endsWith(".facebook.com")) return "facebook";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com") return "x";
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
    return "youtube";
  }
  if (host === "player.captivate.fm" || host.endsWith(".captivate.fm")) {
    return "interview-audio";
  }
  return "website";
}

function isManxRadioUrl(urlValue: string) {
  if (!urlValue.startsWith("http")) return false;
  const host = new URL(urlValue).hostname.toLowerCase();
  return host === "manxradio.com" || host.endsWith(".manxradio.com");
}

function documentKind(label: string, urlValue: string): CandidateProfileDocument["kind"] | null {
  const searchable = `${label} ${urlValue}`.toLowerCase();
  const isDocument = /\.(?:docx?|odt|pdf)(?:$|[?#])/i.test(urlValue);
  if (/manifesto/.test(searchable)) return "manifesto";
  if (/transcript/.test(searchable)) return "transcript";
  if (/statement|questionnaire|leaflet/.test(searchable)) return "statement";
  return isDocument ? "other" : null;
}

function deduplicateByUrl<T extends { url: string }>(values: T[]) {
  return values.filter(
    (value, index, all) => all.findIndex((candidate) => candidate.url === value.url) === index,
  );
}

export function parseCandidateDirectory(html: string, directoryUrl: string): CandidateDirectoryEntry[] {
  const headings: Array<{ index: number; name: string }> = [];
  const headingPattern = /<a\b[^>]*href\s*=\s*(["'])([^"']*\/election-2026\/election-constituencies\/[^"'/?#]+\/?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(headingPattern)) {
    const name = plainText(match[3]);
    if (name && match.index !== undefined) headings.push({ index: match.index, name });
  }

  const entries: CandidateDirectoryEntry[] = [];
  const cardPattern = /<a\b([^>]*\bclass\s*=\s*(["'])[^"']*\bgm-sec-title\b[^"']*\2[^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(cardPattern)) {
    const openingTag = `<a ${match[1]}>`;
    const href = attribute(openingTag, "href");
    if (!/\/election-2026\/election-candidates\//i.test(href)) continue;
    const profileUrl = httpsUrl(href, directoryUrl);
    if (!profileUrl || new URL(profileUrl).hostname !== "www.manxradio.com") continue;

    const description = match[3].match(
      /<p\b[^>]*class\s*=\s*(["'])[^"']*\bgm-sec-description\b[^"']*\1[^>]*>([\s\S]*?)<\/p>/i,
    );
    const name = plainText(description?.[2] ?? match[3]);
    const imageTag = match[3].match(
      /<img\b[^>]*class\s*=\s*(["'])[^"']*\bgm-sec-img\b[^"']*\1[^>]*>/i,
    )?.[0];
    const portraitUrl = imageTag ? httpsUrl(attribute(imageTag, "src"), directoryUrl) : "";
    const constituencyName = headings
      .filter((heading) => heading.index < (match.index ?? 0))
      .at(-1)?.name;
    const slug = new URL(profileUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (!name || !constituencyName || !slug || !portraitUrl) continue;
    entries.push({ constituencyName, name, portraitUrl, profileUrl, slug });
  }

  return entries
    .filter(
      (entry, index, all) =>
        all.findIndex((candidate) => candidate.profileUrl === entry.profileUrl) === index,
    )
    .sort((left, right) =>
      left.profileUrl < right.profileUrl ? -1 : left.profileUrl > right.profileUrl ? 1 : 0,
    );
}

function metadata(html: string, key: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (attribute(tag, "property").toLowerCase() === key.toLowerCase()) {
      return attribute(tag, "content");
    }
  }
  return "";
}

function nullablePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseCandidateProfile(html: string, profileUrl: string): ParsedCandidateProfile {
  const start = html.search(/<div\b[^>]*class\s*=\s*(["'])[^"']*\bs-page\b[^"']*\1[^>]*>/i);
  if (start < 0) throw new Error("The candidate profile does not contain the expected main content.");
  const contentBlock = html.slice(start).search(/<div\b[^>]*class\s*=\s*(["'])[^"']*\bo-content-block\b[^"']*\1/i);
  const end = contentBlock < 0 ? Math.min(html.length, start + 200_000) : start + contentBlock;
  const body = html.slice(start, end);
  const heading = body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const name = plainText(heading?.[1] ?? "");
  if (!name) throw new Error("The candidate profile has no candidate heading.");

  const paragraphEntries = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => ({ index: match.index, text: plainText(match[1]) }))
    .filter((entry) => Boolean(entry.text));
  const paragraphs = paragraphEntries.map((entry) => entry.text);
  const contactIndex = paragraphs.findIndex((paragraph) => /^contact\s+details\s*:?$/i.test(paragraph));
  const mediaIndex = paragraphs.findIndex((paragraph) => /^candidate\s+media\s*:?$/i.test(paragraph));
  const biographyEnd = [contactIndex, mediaIndex]
    .filter((index) => index >= 0)
    .reduce((minimum, index) => Math.min(minimum, index), paragraphs.length);
  const biographyParagraphs = paragraphs
    .slice(0, biographyEnd)
    .filter(
      (paragraph) =>
        paragraph.normalize("NFKC").toLowerCase() !== name.normalize("NFKC").toLowerCase(),
    );
  const contactEnd = mediaIndex > contactIndex ? mediaIndex : paragraphs.length;
  const contactText = contactIndex >= 0 ? paragraphs.slice(contactIndex + 1, contactEnd) : [];
  const contactSectionStart =
    contactIndex >= 0 ? paragraphEntries[contactIndex]?.index ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;

  const links: CandidateProfileLink[] = [];
  const documents: CandidateProfileDocument[] = [];
  for (const match of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attribute(`<a ${match[1]}>`, "href");
    const urlValue = contactUrl(href) || httpsUrl(href, profileUrl);
    if (!urlValue) continue;
    const label = plainText(match[2]) || urlValue;
    const kind = urlValue.startsWith("http") ? documentKind(label, urlValue) : null;
    if (kind) {
      documents.push({ kind, title: label, url: urlValue });
      continue;
    }
    if (isManxRadioUrl(urlValue)) continue;

    const classifiedKind = linkKind(urlValue);
    const isRecognizedMedia = classifiedKind === "youtube" || classifiedKind === "interview-audio";
    if (!isRecognizedMedia && (match.index ?? -1) <= contactSectionStart) continue;
    links.push({ kind: classifiedKind, label, url: urlValue });
  }
  for (const match of body.matchAll(/<iframe\b[^>]*>/gi)) {
    const urlValue = httpsUrl(attribute(match[0], "src"), profileUrl);
    if (!urlValue) continue;
    const kind = linkKind(urlValue);
    if (kind !== "youtube" && kind !== "interview-audio") continue;
    links.push({
      kind: kind === "youtube" ? "interview-video" : kind,
      label: kind === "interview-audio" ? "Candidate audio" : "Candidate video",
      url: urlValue,
    });
  }
  for (const line of contactText) {
    const match = line.match(/^(?:p|phone|tel(?:ephone)?)\s*:\s*(.+)$/i);
    if (!match) continue;
    const phone = match[1].replace(/[^+\d]/g, "");
    if (phone.length >= 6) links.push({ kind: "phone", label: match[1].trim(), url: `tel:${phone}` });
  }

  const portraits: CandidateProfilePortrait[] = [];
  const ogImage = httpsUrl(metadata(html, "og:image:url") || metadata(html, "og:image"), profileUrl);
  if (ogImage) {
    portraits.push({
      contentType: metadata(html, "og:image:type") || null,
      height: nullablePositiveInteger(metadata(html, "og:image:height")),
      url: ogImage,
      variant: "profile-og",
      width: nullablePositiveInteger(metadata(html, "og:image:width")),
    });
  }
  const bodyImageTag = body.match(/<img\b[^>]*>/i)?.[0];
  const bodyImage = bodyImageTag ? httpsUrl(attribute(bodyImageTag, "src"), profileUrl) : "";
  if (bodyImage) {
    portraits.push({
      contentType: null,
      height: null,
      url: bodyImage,
      variant: "profile-body",
      width: null,
    });
  }

  return {
    biographyParagraphs,
    contactText,
    documents: deduplicateByUrl(documents),
    links: deduplicateByUrl(links),
    name,
    portraits: deduplicateByUrl(portraits),
  };
}
