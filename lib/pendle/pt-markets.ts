// Each Pendle PT's market, for the PT chips on the Morpho and Aave V4 pages:
// read once per page load from /api/pendle/pt-markets (the roster's tokens).
// Only a Pendle PT on Ethereum asks; a Spectra PT is in no Pendle roster, so
// it gets no market.

import { PT_UNDERLYING_MAINNET } from "@/lib/shared/pt-underlying";

export interface PtMarket {
  market: string;
  name: string | null;
}

let pending: Promise<Record<string, PtMarket>> | null = null;

function load(): Promise<Record<string, PtMarket>> {
  pending ??= fetch("/api/pendle/pt-markets")
    .then((r) => (r.ok ? r.json() : { markets: {} }))
    .then((b: { markets?: Record<string, PtMarket> }) => b.markets ?? {})
    .catch(() => {
      pending = null;
      return {};
    });
  return pending;
}

/** The market of a PT on chain `chainId`, or null where it is no Pendle PT the roster names. */
export async function pendleMarketOfPt(chainId: number, address: string): Promise<PtMarket | null> {
  const a = address.toLowerCase();
  if (chainId !== 1 || !PT_UNDERLYING_MAINNET[a]) return null;
  return (await load())[a] ?? null;
}
