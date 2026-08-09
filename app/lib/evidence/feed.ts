import { XMLParser } from "fast-xml-parser";

export type NormalizedFeedItem = {
  author: string | null;
  externalId: string | null;
  publishedAt: string | null;
  summary: string;
  title: string;
  url: string;
};

const parser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseTagValue: false,
  processEntities: false,
  textNodeName: "#text",
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return textValue(record["#text"] ?? record._ ?? record.value ?? "");
}

function plainText(value: unknown) {
  return textValue(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value: unknown) {
  const raw = textValue(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function atomLink(value: unknown) {
  const links = asArray(value as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const preferred = links.find((link) => !link["@_rel"] || link["@_rel"] === "alternate") ?? links[0];
  return preferred ? textValue(preferred["@_href"] ?? preferred) : "";
}

function normalizeUrl(value: string, feedUrl: string) {
  try {
    const url = new URL(value, feedUrl);
    if (url.protocol !== "https:") return "";
    url.hash = "";
    for (const parameter of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      url.searchParams.delete(parameter);
    }
    return url.toString();
  } catch {
    return "";
  }
}

export function parseFeed(xml: string, feedUrl: string): NormalizedFeedItem[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const hasRssRoot = Object.prototype.hasOwnProperty.call(parsed, "rss");
  const hasAtomRoot = Object.prototype.hasOwnProperty.call(parsed, "feed");
  const rssChannelValue = (parsed.rss as Record<string, unknown> | undefined)?.channel;
  const rssChannel = hasRssRoot
    ? rssChannelValue && typeof rssChannelValue === "object"
      ? (rssChannelValue as Record<string, unknown>)
      : {}
    : undefined;
  const atomFeed = hasAtomRoot && parsed.feed && typeof parsed.feed === "object"
    ? (parsed.feed as Record<string, unknown>)
    : hasAtomRoot
      ? {}
      : undefined;

  if (!rssChannel && !atomFeed) {
    throw new Error("The response is not a supported RSS or Atom feed.");
  }

  const entries = rssChannel
    ? asArray(rssChannel.item as Record<string, unknown> | Record<string, unknown>[] | undefined)
    : asArray(atomFeed?.entry as Record<string, unknown> | Record<string, unknown>[] | undefined);

  if (entries.length === 0) {
    throw new Error("The feed contains no entries; the source may be blocked or malformed.");
  }

  const normalized = entries
    .map((entry): NormalizedFeedItem | null => {
      const isAtom = Boolean(atomFeed);
      const url = normalizeUrl(
        isAtom ? atomLink(entry.link) : textValue(entry.link ?? entry.guid),
        feedUrl,
      );
      const title = plainText(entry.title);
      if (!url || !title) return null;

      return {
        author: plainText(entry.author ?? entry["dc:creator"]) || null,
        externalId: textValue(entry.guid ?? entry.id) || null,
        publishedAt: isoDate(entry.pubDate ?? entry.published ?? entry.updated),
        summary: plainText(entry.description ?? entry.summary ?? entry.content),
        title,
        url,
      };
    })
    .filter((entry): entry is NormalizedFeedItem => entry !== null);

  if (normalized.length === 0) {
    throw new Error("The feed contains no usable HTTPS entries.");
  }
  return normalized;
}
