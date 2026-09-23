// The Moonwell Base listing's roster — the rails route's own `marketState`,
// shaped for the shared builder.
// ----------------------------------------------------------------------------
// The Base catalog writes no market down (lib/moonwell-base/asset-catalog.ts
// says why), so the listing cannot resolve a row against a file. It resolves
// against what travelled with the rows: rails-server's /api/moonwell-base/
// positions ships every market the sweep read at the tick's pinned block —
// identity, exchange rate, the Comptroller's own oracle price, both rates —
// keyed by mToken address, the only key that is unique on this deployment
// (two markets answer "mUSDC"). So a row's `current` and USD are figures at a
// named block, and the proxy makes no chain call of its own.

import type { MoonwellListingMarket, MoonwellListingRoster } from "@/lib/sources/api/moonwell-positions";
import { annualizePerTimestamp } from "@/lib/sources/chain/moonwell-market-state";
import { MTOKEN_DECIMALS } from "@/lib/moonwell/asset-catalog";

/** One market's state as the rails route ships it beside the rows. */
export interface RawMoonwellBaseMarketState {
  /** The mToken address, lowercased — the key. */
  market: string;
  symbol: string;
  mSymbol: string;
  underlying: string;
  decimals: number;
  /** The Base block the state was read at. */
  block: number;
  /** exchangeRateStored, raw (scale 1e(18 + decimals − 8)); null if unread. */
  exchangeRateRaw: string | null;
  /** The Comptroller's oracle getUnderlyingPrice, raw (scale 1e(36 − decimals)); null if unread. */
  priceRaw: string | null;
  /** Per-second rates, 1e18 mantissa; null if unread. */
  borrowRatePerTimestamp: string | null;
  supplyRatePerTimestamp: string | null;
  refreshedAt: string;
}

function ratio(raw: string | null, exp: number): number | null {
  if (raw == null || raw === "") return null;
  try {
    const v = Number(BigInt(raw.split(".")[0])) / 10 ** exp;
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function apr(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  try {
    return annualizePerTimestamp(raw.split(".")[0]);
  } catch {
    return null;
  }
}

/** The route's market state as the builder's roster. */
export function rosterFromMarketState(state: RawMoonwellBaseMarketState[] | null | undefined): MoonwellListingRoster {
  const roster: MoonwellListingRoster = new Map();
  for (const m of state ?? []) {
    const key = m.market.toLowerCase();
    const entry: MoonwellListingMarket = {
      key,
      symbol: m.symbol,
      mSymbol: m.mSymbol,
      underlying: m.underlying.toLowerCase(),
      decimals: m.decimals,
      exchangeRate: ratio(m.exchangeRateRaw, 18 + m.decimals - MTOKEN_DECIMALS),
      priceUsd: ratio(m.priceRaw, 36 - m.decimals),
      borrowApr: apr(m.borrowRatePerTimestamp),
      supplyApr: apr(m.supplyRatePerTimestamp),
    };
    roster.set(key, entry);
  }
  return roster;
}
