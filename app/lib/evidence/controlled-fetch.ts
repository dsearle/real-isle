const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;

export const CIVIC_CRAWLER_PRODUCT_TOKEN = "PeoplesIsleBot";
export const CIVIC_CRAWLER_USER_AGENT =
  "PeoplesIsleBot/1.0 (+https://realisle.im/methodology)";

export type ControlledResponse = {
  bytes: Uint8Array;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  resolvedUrl: string;
  retryAfter: string | null;
  status: number;
};

export class ControlledFetchError extends Error {
  readonly code:
    | "invalid-url"
    | "host-not-allowed"
    | "redirect-limit"
    | "response-too-large"
    | "unsupported-content-type";

  constructor(
    code:
      | "invalid-url"
      | "host-not-allowed"
      | "redirect-limit"
      | "response-too-large"
      | "unsupported-content-type",
    message: string,
  ) {
    super(message);
    this.name = "ControlledFetchError";
    this.code = code;
  }
}

function normalizedHost(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function isIpLiteral(hostname: string) {
  const host = normalizedHost(hostname).replace(/^\[|\]$/g, "");
  return host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

export function validateExactSourceUrl(rawUrl: string, allowedHosts: readonly string[]) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ControlledFetchError("invalid-url", "The source URL is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new ControlledFetchError(
      "invalid-url",
      "Only credential-free HTTPS source URLs on port 443 are permitted.",
    );
  }
  const host = normalizedHost(url.hostname);
  if (host === "localhost" || host.endsWith(".localhost") || isIpLiteral(host)) {
    throw new ControlledFetchError("host-not-allowed", "IP and local source hosts are not permitted.");
  }
  const normalizedAllowlist = allowedHosts.map(normalizedHost);
  if (!normalizedAllowlist.includes(host)) {
    throw new ControlledFetchError(
      "host-not-allowed",
      `The exact source host is not allowlisted: ${host}`,
    );
  }
  url.hash = "";
  return url;
}

async function readBoundedBody(response: Response, maximumBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ControlledFetchError(
      "response-too-large",
      `The source response exceeds ${maximumBytes} bytes.`,
    );
  }
  if (!response.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("Response exceeded the configured byte limit.");
      throw new ControlledFetchError(
        "response-too-large",
        `The source response exceeds ${maximumBytes} bytes.`,
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchControlled(
  rawUrl: string,
  options: {
    acceptedContentTypes: readonly string[];
    allowedHosts: readonly string[];
    etag?: string | null;
    fetchImpl?: typeof fetch;
    lastModified?: string | null;
    maximumBytes: number;
    timeoutMs?: number;
  },
): Promise<ControlledResponse> {
  if (options.allowedHosts.length === 0) {
    throw new ControlledFetchError("host-not-allowed", "This source has no document hosts enabled.");
  }
  let url = validateExactSourceUrl(rawUrl, options.allowedHosts);
  const initialHost = normalizedHost(url.hostname);
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = new Headers({
    accept: options.acceptedContentTypes.join(", "),
    "user-agent": CIVIC_CRAWLER_USER_AGENT,
  });
  if (options.etag) headers.set("if-none-match", options.etag);
  if (options.lastModified) headers.set("if-modified-since", options.lastModified);
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(url, {
      cache: "no-store",
      credentials: "omit",
      headers,
      redirect: "manual",
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new ControlledFetchError("redirect-limit", "The source exceeded the redirect limit.");
      }
      const redirected = validateExactSourceUrl(
        new URL(location, url).toString(),
        options.allowedHosts,
      );
      if (normalizedHost(redirected.hostname) !== initialHost) {
        throw new ControlledFetchError(
          "host-not-allowed",
          "Cross-host source redirects are not permitted.",
        );
      }
      url = redirected;
      continue;
    }

    const rawContentType = response.headers.get("content-type");
    const contentType = rawContentType?.split(";", 1)[0]?.trim().toLowerCase() || null;
    const shouldReadBody = response.status >= 200 && response.status < 300 && response.status !== 204;
    if (shouldReadBody && (!contentType || !options.acceptedContentTypes.includes(contentType))) {
      throw new ControlledFetchError(
        "unsupported-content-type",
        `The source returned an unsupported content type: ${contentType ?? "missing"}`,
      );
    }
    return {
      bytes: shouldReadBody ? await readBoundedBody(response, options.maximumBytes) : new Uint8Array(),
      contentType,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      resolvedUrl: url.toString(),
      retryAfter: response.headers.get("retry-after"),
      status: response.status,
    };
  }
  throw new ControlledFetchError("redirect-limit", "The source redirect could not be resolved.");
}
