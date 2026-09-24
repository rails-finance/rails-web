// Typed client over /api/prices — the same route PricesProvider reads from the
// browser, callable from a server render with a `baseUrl` + the hop's signed
// reader headers. The backend wraps DefiLlama and answers
// `{ [addr]: { usd, fetchedAt, source } }`; this returns the address→USD map
// PricesProvider seeds from.

export interface FetchPricesParams {
  tokens: readonly string[];
  /** SSR override — `fetch` in node has no implicit base. */
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries. */
  headers?: HeadersInit;
  signal?: AbortSignal;
}

function coerceUsd(v: unknown): number | null {
  if (typeof v === "number" && v > 0) return v;
  if (v && typeof v === "object" && "usd" in v) {
    const u = (v as { usd: unknown }).usd;
    if (typeof u === "number" && u > 0) return u;
  }
  return null;
}

export async function fetchPrices({
  tokens,
  baseUrl = "",
  headers,
  signal,
}: FetchPricesParams): Promise<Record<string, number>> {
  if (tokens.length === 0) return {};
  const url = `${baseUrl}/api/prices?tokens=${tokens.join(",")}`;
  const res = await fetch(url, { cache: "no-store", headers, signal });
  if (!res.ok) {
    throw new Error(`fetchPrices failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [addr, v] of Object.entries(raw)) {
    const usd = coerceUsd(v);
    if (usd != null) out[addr.toLowerCase()] = usd;
  }
  return out;
}
