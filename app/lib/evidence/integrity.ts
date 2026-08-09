const encoder = new TextEncoder();

function sortForStableJson(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortForStableJson(entry)]),
    );
  }
  throw new TypeError("Audit payloads may contain only finite JSON values and plain objects.");
}

export function stableJson(value: unknown) {
  return JSON.stringify(sortForStableJson(value));
}

export async function sha256Hex(value: string | ArrayBuffer | Uint8Array) {
  let bytes: Uint8Array<ArrayBuffer>;
  if (typeof value === "string") {
    bytes = encoder.encode(value);
  } else if (value instanceof Uint8Array) {
    bytes = new Uint8Array(value.byteLength);
    bytes.set(value);
  } else {
    bytes = new Uint8Array(value);
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deterministicId(prefix: string, ...parts: string[]) {
  return `${prefix}_${(await sha256Hex(parts.join("\n"))).slice(0, 32)}`;
}

export function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function timingSafeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}
