// Client for /api/chain/compound-v2/prices-at — Compound V2's oracle price at
// each (block, market) pair a position's rows touch. A failed or partial read
// leaves pairs out; the flows panel then values those rows at today's price
// and says so.

const ROUTE = "/api/chain/compound-v2/prices-at";
/** The most (block, market) pairs one read prices; the route refuses more. */
export const PRICE_PAIR_LIMIT = 400;
const MAX_PAIRS = PRICE_PAIR_LIMIT;

export async function fetchCompoundV2PricesAt(
  pairs: string[],
  signal?: AbortSignal,
): Promise<Map<string, number> | null> {
  if (pairs.length === 0) return new Map();
  if (pairs.length > MAX_PAIRS) return null;
  const res = await fetch(ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairs }),
    signal,
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { prices?: Record<string, number> };
  return new Map(Object.entries(body.prices ?? {}));
}
