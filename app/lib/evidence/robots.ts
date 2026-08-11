export type RobotsRule = {
  directive: "allow" | "disallow";
  pattern: string;
};

export type ParsedRobotsPolicy = {
  crawlDelayMs: number;
  rules: RobotsRule[];
};

type RobotsGroup = {
  agents: string[];
  crawlDelays: number[];
  hasRule: boolean;
  rules: RobotsRule[];
};

const MAX_CRAWL_DELAY_MS = 86_400_000;
const UNRESERVED = /^[A-Za-z0-9._~-]$/;

function emptyGroup(): RobotsGroup {
  return { agents: [], crawlDelays: [], hasRule: false, rules: [] };
}

function commentFreeLine(line: string) {
  const comment = line.indexOf("#");
  return (comment < 0 ? line : line.slice(0, comment)).trim();
}

function parsedCrawlDelay(value: string) {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const milliseconds = Math.ceil(Number(value) * 1_000);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  return Math.min(milliseconds, MAX_CRAWL_DELAY_MS);
}

export function parseRobotsTxt(body: string, productToken: string): ParsedRobotsPolicy {
  const groups: RobotsGroup[] = [];
  let group = emptyGroup();

  const finishGroup = () => {
    if (group.agents.length > 0) groups.push(group);
    group = emptyGroup();
  };

  for (const sourceLine of body.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    const line = commentFreeLine(sourceLine);
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (group.hasRule) finishGroup();
      if (value) group.agents.push(value.toLowerCase());
      continue;
    }
    if (group.agents.length === 0) continue;
    if (key === "allow" || key === "disallow") {
      group.hasRule = true;
      if (value) group.rules.push({ directive: key, pattern: value });
      continue;
    }
    if (key === "crawl-delay") {
      group.hasRule = true;
      const delay = parsedCrawlDelay(value);
      if (delay !== null) group.crawlDelays.push(delay);
    }
  }
  finishGroup();

  const token = productToken.toLowerCase();
  const explicitlyMatched = groups.filter((candidate) => candidate.agents.includes(token));
  const selected = explicitlyMatched.length > 0
    ? explicitlyMatched
    : groups.filter((candidate) => candidate.agents.includes("*"));
  return {
    crawlDelayMs: selected.reduce(
      (maximum, candidate) => Math.max(maximum, ...candidate.crawlDelays, 0),
      0,
    ),
    rules: selected.flatMap((candidate) => candidate.rules),
  };
}

function normalizePercentEncoding(value: string) {
  let normalized = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "%" && /^[\dA-Fa-f]{2}$/.test(value.slice(index + 1, index + 3))) {
      const byte = Number.parseInt(value.slice(index + 1, index + 3), 16);
      const decoded = String.fromCharCode(byte);
      normalized += UNRESERVED.test(decoded)
        ? decoded
        : `%${value.slice(index + 1, index + 3).toUpperCase()}`;
      index += 2;
      continue;
    }
    if ((character.codePointAt(0) ?? 0) > 0x7f) {
      normalized += [...new TextEncoder().encode(character)]
        .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
      continue;
    }
    normalized += character;
  }
  return normalized;
}

function escapedRegex(value: string) {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function ruleMatch(path: string, rule: RobotsRule) {
  const normalizedPattern = normalizePercentEncoding(rule.pattern);
  const anchored = normalizedPattern.endsWith("$");
  const body = anchored ? normalizedPattern.slice(0, -1) : normalizedPattern;
  const expression = body
    .split("*")
    .map(escapedRegex)
    .join(".*");
  if (!new RegExp(`^${expression}${anchored ? "$" : ""}`).test(path)) return null;
  return new TextEncoder().encode(body.replace(/\*/g, "")).byteLength;
}

export function robotsAllowsUrl(rules: readonly RobotsRule[], rawUrl: string) {
  const url = new URL(rawUrl);
  const path = normalizePercentEncoding(`${url.pathname}${url.search}`);
  let decision: { allowed: boolean; specificity: number } | null = null;

  for (const rule of rules) {
    const specificity = ruleMatch(path, rule);
    if (specificity === null) continue;
    const allowed = rule.directive === "allow";
    if (
      !decision ||
      specificity > decision.specificity ||
      (specificity === decision.specificity && allowed)
    ) {
      decision = { allowed, specificity };
    }
  }
  return decision?.allowed ?? true;
}
