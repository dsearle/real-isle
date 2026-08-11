import { sha256Hex, stableJson } from "./integrity.ts";

export const READABLE_HTML_EXTRACTOR_VERSION = "deterministic-html-v1";
const EXTRACTOR_CONFIG = {
  blockTags: ["blockquote", "dd", "dt", "figcaption", "h1-h6", "li", "p", "pre"],
  excludedTags: ["aside", "dialog", "footer", "form", "header", "nav", "noscript", "script", "style", "svg", "template"],
  normalization: "nfkc-collapsed-whitespace-v1",
  offsetUnits: { raw: "utf8-byte", text: "utf16-code-unit" },
  preferredRoots: ["article", "main", "body"],
  schema: "peoples-isle.readable-html-config.v1",
} as const;

export type ReadableBlock = {
  hash: string;
  id: string;
  index: number;
  kind: string;
  rawByteEnd: number;
  rawByteStart: number;
  text: string;
  textEnd: number;
  textStart: number;
};

export type ExtractedReadableHtml = {
  accessBarrier: "login" | "paywall" | null;
  blocks: ReadableBlock[];
  extractorConfigHash: string;
  language: string | null;
  metadata: {
    byline: string | null;
    publishedAt: string | null;
    title: string | null;
  };
  text: string;
  textHash: string;
};

const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  raquo: "»",
  rdquo: "”",
  rsquo: "’",
};

function decodeEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (entity, body: string) => {
    if (/^#x/i.test(body)) {
      const codePoint = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    if (body.startsWith("#")) {
      const codePoint = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return namedEntities[body.toLowerCase()] ?? entity;
  });
}

function normalizedText(value: string) {
  return decodeEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(?:script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|template)\s*>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .normalize("NFKC")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attribute(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeEntities(match[2]).trim() : "";
}

function metaContent(html: string, keys: readonly string[]) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attribute(tag, "property") || attribute(tag, "name")).toLowerCase();
    if (keys.includes(key)) return normalizedText(attribute(tag, "content")) || null;
  }
  return null;
}

function rootRange(html: string) {
  for (const tag of ["article", "main", "body"] as const) {
    const open = new RegExp(`<${tag}\\b[^>]*>`, "i").exec(html);
    if (!open || open.index === undefined) continue;
    const close = new RegExp(`</${tag}\\s*>`, "i").exec(html.slice(open.index + open[0].length));
    const end = close
      ? open.index + open[0].length + close.index + close[0].length
      : html.length;
    return { end, start: open.index };
  }
  return { end: html.length, start: 0 };
}

function excludedRanges(html: string) {
  const ranges: Array<{ end: number; start: number }> = [];
  const pattern = /<(script|style|noscript|svg|template|header|nav|footer|aside|form|dialog)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    if (match.index !== undefined) ranges.push({ end: match.index + match[0].length, start: match.index });
  }
  return ranges;
}

function insideExcludedRange(index: number, ranges: readonly { end: number; start: number }[]) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function sourceByteOffsets(html: string, offsets: readonly number[]) {
  const encoder = new TextEncoder();
  const unique = [...new Set(offsets)].sort((left, right) => left - right);
  const result = new Map<number, number>();
  let previous = 0;
  let bytes = 0;
  for (const offset of unique) {
    bytes += encoder.encode(html.slice(previous, offset)).byteLength;
    result.set(offset, bytes);
    previous = offset;
  }
  return result;
}

export function classifyHtmlAccessBarrier(html: string, readableText: string) {
  const lowerHtml = html.toLowerCase();
  const lowerText = readableText.toLowerCase();
  const explicitPaidContent = /["']isaccessibleforfree["']\s*:\s*(?:false|["']false["'])/i.test(html);
  const paywallMarkup = /\b(?:paywall|metered[-_ ]?content|subscription[-_ ]?wall)\b/i.test(html);
  const paywallLanguage = /(?:subscribe|subscription)\s+(?:to|in order to)\s+(?:continue|read|view)|already\s+(?:a\s+)?subscriber/i.test(readableText);
  if (explicitPaidContent || (paywallMarkup && paywallLanguage)) return "paywall" as const;

  const passwordForm = /<input\b[^>]*\btype\s*=\s*(["'])password\1/i.test(html);
  const loginLanguage = /(?:sign|log)\s+in\s+to\s+(?:continue|read|view)/i.test(readableText);
  if (passwordForm && loginLanguage) return "login" as const;
  if (lowerHtml.includes("access denied") && lowerText.length < 800) return "login" as const;
  return null;
}

function normalizedPublishedAt(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export async function extractReadableHtml(html: string): Promise<ExtractedReadableHtml> {
  const root = rootRange(html);
  const ranges = excludedRanges(html);
  const candidates: Array<{
    end: number;
    kind: string;
    start: number;
    text: string;
  }> = [];
  const body = html.slice(root.start, root.end);
  const pattern = /<(h[1-6]|p|li|blockquote|pre|figcaption|dt|dd)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of body.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const start = root.start + match.index;
    if (insideExcludedRange(start, ranges)) continue;
    if (/\bhidden\b/i.test(match[2]) || /aria-hidden\s*=\s*(["'])true\1/i.test(match[2])) continue;
    if (/style\s*=\s*(["'])[^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(match[2])) continue;
    const text = normalizedText(match[3]);
    if (!text) continue;
    if (candidates.at(-1)?.text === text) continue;
    candidates.push({
      end: start + match[0].length,
      kind: match[1].toLowerCase(),
      start,
      text,
    });
  }

  if (candidates.length === 0) {
    const text = normalizedText(body);
    if (text) candidates.push({ end: root.end, kind: "section", start: root.start, text });
  }

  const byteOffsets = sourceByteOffsets(
    html,
    candidates.flatMap((candidate) => [candidate.start, candidate.end]),
  );
  const blocks: ReadableBlock[] = [];
  let text = "";
  for (const [index, candidate] of candidates.entries()) {
    if (text) text += "\n\n";
    const textStart = text.length;
    text += candidate.text;
    const rawByteStart = byteOffsets.get(candidate.start) ?? 0;
    const rawByteEnd = byteOffsets.get(candidate.end) ?? rawByteStart;
    const hash = await sha256Hex(stableJson({
      kind: candidate.kind,
      rawByteEnd,
      rawByteStart,
      text: candidate.text,
    }));
    blocks.push({
      hash,
      id: `block:${index}:${hash.slice(0, 16)}`,
      index,
      kind: candidate.kind,
      rawByteEnd,
      rawByteStart,
      text: candidate.text,
      textEnd: text.length,
      textStart,
    });
  }

  const firstHeading = blocks.find((block) => /^h[1-6]$/.test(block.kind))?.text ?? null;
  const documentTitle = normalizedText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "") || null;
  const timeTag = html.match(/<time\b[^>]*\bdatetime\s*=\s*(["'])([\s\S]*?)\1[^>]*>/i);
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  return {
    accessBarrier: classifyHtmlAccessBarrier(html, text),
    blocks,
    extractorConfigHash: await sha256Hex(stableJson(EXTRACTOR_CONFIG)),
    language: attribute(htmlTag, "lang").toLowerCase() || null,
    metadata: {
      byline: metaContent(html, ["author", "article:author", "byl"]),
      publishedAt: normalizedPublishedAt(
        metaContent(html, ["article:published_time", "date", "datepublished"]) ||
          (timeTag ? decodeEntities(timeTag[2]).trim() : null),
      ),
      title: metaContent(html, ["og:title", "twitter:title"]) || firstHeading || documentTitle,
    },
    text,
    textHash: await sha256Hex(text),
  };
}
