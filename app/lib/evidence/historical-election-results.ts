export type HistoricalElectionResult = {
  constituencyName: string;
  elected: boolean;
  fullName: string;
  votes: number;
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, raw: string) => {
      const codePoint = raw.startsWith("x") || raw.startsWith("X")
        ? Number.parseInt(raw.slice(1), 16)
        : Number.parseInt(raw, 10);
      return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : " ";
    });
}

function textContent(value: string) {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function canonicalName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Parses the deliberately simple 2021 results-table layout.  It is strict on
 * the essential facts: a result page must have all 12 constituencies, at
 * least two elected candidates in every constituency, and no duplicate
 * person within a constituency.  A layout change is therefore quarantined
 * rather than quietly rewriting election history.
 */
export function parseHistoricalElectionResults(html: string): HistoricalElectionResult[] {
  const sections = [...html.matchAll(
    /<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h2>[\s\S]*?<table\b[^>]*class=["'][^"']*\bresults_table\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi,
  )];
  if (sections.length !== 12) {
    throw new Error(`Expected 12 historical-election result tables, found ${sections.length}.`);
  }

  const results: HistoricalElectionResult[] = [];
  for (const section of sections) {
    const constituencyName = textContent(section[1]);
    const rows = [...section[2].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)];
    const localNames = new Set<string>();
    let electedCount = 0;

    for (const row of rows) {
      const cells = [...row[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textContent(cell[1]));
      if (cells.length < 3) continue;
      const fullName = cells[1];
      const votes = Number.parseInt(cells[2].replace(/[^\d]/g, ""), 10);
      if (!fullName || !Number.isSafeInteger(votes)) continue;
      const key = canonicalName(fullName);
      if (localNames.has(key)) {
        throw new Error(`Duplicate historical candidate ${fullName} in ${constituencyName}.`);
      }
      localNames.add(key);
      const elected = /\belected\b/i.test(row[1]);
      if (elected) electedCount += 1;
      results.push({ constituencyName, elected, fullName, votes });
    }

    if (localNames.size < 2 || electedCount !== 2) {
      throw new Error(`Incomplete or ambiguous result table for ${constituencyName}.`);
    }
  }
  if (results.length < 24) throw new Error("Historical result page has too few candidates.");
  return results;
}

export function historicalPersonSlug(fullName: string) {
  return canonicalName(fullName).replace(/\s+/g, "-");
}

