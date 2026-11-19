// Comet's oracle prices at a block, raw integers → dollars. One conversion for
// both sources of them: the archive read (lib/sources/chain/compound-prices.ts
// cometPricesAtBlock, behind /api/chain/compound/prices-at-block) and the
// stored prices the server keeps for every event block (rails-server mig 372,
// /api/compound/prices-at), so a stored price gives the figure the archive
// read gives. rails-ops reference/compound-prices-at-block.md.

import { shownComposedPrice } from "@/lib/shared/shown-usd";

/** Comet `getPrice` answers 8 decimals in the market's quote unit. */
export const COMET_PRICE_SCALE = 1e8;

/** An ETH-quoted Comet's two factors: getPrice in ETH and WETH in dollars. */
export interface CometFactor {
  price: number;
  ethUsd: number;
}

/** USD per whole token from `getPrice`'s raw answer: a USD Comet's as read;
 *  an ETH-quoted Comet's composed with WETH/USD at the same block (raw, 8
 *  decimals), each factor as shown, as the card composes it
 *  (lib/compound/comet-usd.ts cometUsdPrice). */
export function cometUsdOf(raw: bigint | string, quoteUsdRaw: bigint | string | null): number {
  const f = cometEthFactorOf(raw, quoteUsdRaw);
  return f ? shownComposedPrice(f.price, f.ethUsd) : Number(raw) / COMET_PRICE_SCALE;
}

/** An ETH-quoted Comet's factors from the raw reads; null for a USD Comet. */
export function cometEthFactorOf(raw: bigint | string, quoteUsdRaw: bigint | string | null): CometFactor | null {
  if (quoteUsdRaw == null) return null;
  return { price: Number(raw) / COMET_PRICE_SCALE, ethUsd: Number(quoteUsdRaw) / COMET_PRICE_SCALE };
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

/** The stored block's ETH factors for the asked tokens, where the Comet
 *  quotes in ETH. */
export function storedCometFactors(block: StoredCometBlock, tokens: readonly string[]): Record<string, CometFactor> {
  const out: Record<string, CometFactor> = {};
  if (block.unit !== "eth" || block.quoteUsd == null) return out;
  for (const t of new Set(tokens.map((x) => x.toLowerCase()))) {
    const raw = block.prices[t];
    const f = raw != null ? cometEthFactorOf(raw, block.quoteUsd) : null;
    if (f && f.price > 0 && f.ethUsd > 0) out[t] = f;
  }
  return out;
}
