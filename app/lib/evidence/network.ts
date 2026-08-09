import type { MonitoredSource } from "./catalogue";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;

export type BoundedResponse = {
  bytes: Uint8Array;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
  resolvedUrl: string;
  status: number;
};

function validateSourceUrl(rawUrl: string, source: MonitoredSource) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Only HTTPS source URLs are permitted.");
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Credentials and non-standard ports are not permitted in source URLs.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!source.allowedHosts.some((allowed) => host === allowed.toLowerCase())) {
    throw new Error(`Source redirected to a host that is not allowlisted: ${host}`);
  }
  return url;
}

async function readBoundedBody(response: Response, maximumBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maximumBytes) throw new Error(`Source response exceeds ${maximumBytes} bytes.`);
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("Source response exceeded the configured byte limit.");
      throw new Error(`Source response exceeds ${maximumBytes} bytes.`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function fetchBounded(
  rawUrl: string,
  source: MonitoredSource,
  options: {
    acceptedContentTypes: readonly string[];
    etag?: string | null;
    lastModified?: string | null;
    maximumBytes: number;
  },
): Promise<BoundedResponse | { status: 304; resolvedUrl: string }> {
  let url = validateSourceUrl(rawUrl, source);
  const headers = new Headers({
    accept: options.acceptedContentTypes.join(", "),
    "user-agent": "Real-Isle-Evidence-Monitor/1.0 (+https://realisle.im/methodology)",
  });
  if (options.etag) headers.set("if-none-match", options.etag);
  if (options.lastModified) headers.set("if-modified-since", options.lastModified);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (response.status === 304) return { status: 304, resolvedUrl: url.toString() };
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Source exceeded the redirect limit.");
      url = validateSourceUrl(new URL(location, url).toString(), source);
      continue;
    }
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);

    const contentType = (response.headers.get("content-type") ?? "application/octet-stream")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!options.acceptedContentTypes.includes(contentType)) {
      throw new Error(`Source returned an unsupported content type: ${contentType}`);
    }
    return {
      bytes: await readBoundedBody(response, options.maximumBytes),
      contentType,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      resolvedUrl: url.toString(),
      status: response.status,
    };
  }
  throw new Error("Source redirect handling failed.");
}
