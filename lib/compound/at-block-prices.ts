// Comet's oracle prices at a block, raw integers → dollars. One conversion for
// both sources of them: the archive read (lib/sources/chain/compound-prices.ts
// cometPricesAtBlock, behind /api/chain/compound/prices-at-block) and the
// stored prices the server keeps for every event block (rails-server mig 372,
// /api/compound/prices-at), so a stored price gives the figure the archive
// read gives. rails-ops reference/compound-prices-at-block.md.

/** Comet `getPrice` answers 8 decimals in the market's quote unit. */
export const COMET_PRICE_SCALE = 1e8;

/** USD per whole token from `getPrice`'s raw answer; an ETH-quoted Comet's
 *  with WETH/USD at the same block (raw, 8 decimals), a USD Comet's with null. */
export function cometUsdOf(raw: bigint | string, quoteUsdRaw: bigint | string | null): number {
  const quote = quoteUsdRaw == null ? 1 : Number(quoteUsdRaw) / COMET_PRICE_SCALE;
  return (Number(raw) / COMET_PRICE_SCALE) * quote;
}

/** One stored block as the server answers it (/api/compound/prices-at). */
export interface StoredCometBlock {
  unit: string;
  quoteUsd: string | null;
  prices: Record<string, string>;
}

/** The stored block's prices for the asked tokens (lowercase, the base among
 *  them), as the archive route answers them: an ETH-quoted Comet with no
 *  WETH/USD, or no token priced, is null (the route's 502). */
export function storedCometPrices(block: StoredCometBlock, tokens: readonly string[]): Record<string, number> | null {
  if (block.unit === "eth" && (block.quoteUsd == null || !(Number(block.quoteUsd) > 0))) return null;
  const quote = block.unit === "eth" ? block.quoteUsd : null;
  const out: Record<string, number> = {};
  for (const t of new Set(tokens.map((x) => x.toLowerCase()))) {
    const raw = block.prices[t];
    if (raw == null) continue;
    const usd = cometUsdOf(raw, quote);
    if (usd > 0) out[t] = usd;
  }
  return Object.keys(out).length > 0 ? out : null;
}
