// The Size panel's source line (chain truth charter S3: a USD figure names its
// price source and block). The listing's USD ranges are valued on the server
// at each market's latest indexed polaris_oracle_at_block row; this names that
// row's block, once when both markets share it, per market when they differ,
// and names a market with no row, whose CDPs a range leaves out.

import { POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import type { PolarisUsdValuation } from "@/lib/sources/api/polaris-positions";

const n = (v: number) => v.toLocaleString("en-US");

/** Null until the valuation has been read. */
export function polarisUsdSourceNote(usd: PolarisUsdValuation | null): string | null {
  if (!usd) return null;
  const symbol = (m: keyof typeof POLARIS_MARKET_CONFIG) => POLARIS_MARKET_CONFIG[m].stable.symbol;
  const blocks = [...new Set(usd.prices.map((p) => p.block))];
  let line: string;
  if (usd.prices.length === 0) line = "No Polaris oracle price is indexed yet.";
  else if (blocks.length === 1) line = `At the Polaris oracle, block ${n(blocks[0])}.`;
  else line = `At the Polaris oracle: ${usd.prices.map((p) => `${symbol(p.market)} block ${n(p.block)}`).join(", ")}.`;
  for (const m of usd.unpricedMarkets) {
    if (usd.prices.length > 0) line += ` ${symbol(m)} has no price yet, so a range leaves its CDPs out.`;
  }
  return line;
}
