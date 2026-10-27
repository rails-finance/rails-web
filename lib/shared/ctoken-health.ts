// The Compound V2 family's source for the Lifetime flows chart's health view
// (Compound V2, Moonwell on Ethereum and Base; rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 5; the view
// is lib/shared/flows-health.ts).
//
// RULES.
// - A day's health factor is the card's: Σ supply × price × collateral
//   factor ÷ Σ debt × price, a market's supply counting where the account
//   had it entered (getAssetsIn), at the factor Comptroller.markets() gave,
//   both at the end of the block of the day's last event
//   (/api/chain/ctoken-liquidity-at?factors=). One factor per market sets the
//   borrowing limit and the liquidation line alike.
// - Today's factors and entered markets are the card's read.
// - An asset's level is ruling 7's (`basketLevels`): the card states none per
//   collateral. Today's levels are worked from the card's read (`cardLevels`),
//   so they rest on the balances the card states.

import type { FactorRead, HealthLine, HealthSource } from "@/lib/shared/flows-health";
import type { CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";
import type { HealthReader } from "@/hooks/useFlowsHealth";
import { healthRead } from "@/lib/shared/health-reads";

const DAY_S = 86_400;

/** The reader for one account's markets (keyed as the timeline keys them). */
export function ctokenHealthReader(protocol: CTokenProtocol, wallet: string, markets: string[]): HealthReader | null {
  if (markets.length === 0) return null;
  const qs = `protocol=${protocol}&wallet=${wallet.toLowerCase()}&factors=${markets.join(",")}`;
  return {
    key: `ctoken:${qs}`,
    load: (e) =>
      healthRead(`/api/chain/ctoken-liquidity-at?${qs}&block=${e.blockNumber}`, (b) => {
        const a = b as { block?: number; factors?: Record<string, number> } | null;
        return a && typeof a.block === "number" && a.factors ? { block: a.block, factors: a.factors } : null;
      }).then((a) => {
        if (!a) return null;
        const lt: Record<string, number> = {};
        for (const [k, v] of Object.entries(a.factors)) lt[k.toLowerCase()] = v;
        return { day: Math.floor(e.timestamp / DAY_S), block: a.block, lt };
      }),
  };
}

/** The card's read as today's factors: each entered market's collateral
 *  factor, 0 for the rest. */
export function ctokenTodayRead(
  chain: { blockNumber: number; markets: { market: string; collateralFactor: number | null; entered: boolean }[] },
  now: number,
): FactorRead {
  const lt: Record<string, number> = {};
  for (const m of chain.markets) lt[m.market.toLowerCase()] = m.entered ? (m.collateralFactor ?? 0) : 0;
  return { day: Math.floor(now / DAY_S), block: chain.blockNumber, lt };
}

/** The card's read as the view's lines. */
export function ctokenCardLines(chain: {
  markets: {
    market: string;
    supplyUnderlying: number;
    borrowUnderlying: number;
    priceUsd: number | null;
    collateralFactor: number | null;
    entered: boolean;
  }[];
}): HealthLine[] {
  return chain.markets.map((m) => ({
    asset: m.market,
    coll: m.supplyUnderlying,
    debt: m.borrowUnderlying,
    price: m.priceUsd ?? 0,
    lt: m.entered ? (m.collateralFactor ?? 0) : 0,
  }));
}

/** A Comptroller's source. */
export function ctokenHealthSource(chain: number): HealthSource {
  return {
    oracle: "the Comptroller's oracle",
    pool: "the Comptroller",
    chain,
    factor: "collateral factor",
    factors: ["collateral factors", "collateral factors and entered markets"],
    readAt: "on the markets entered as collateral, read at the block of each day's last event",
    live: "the card's read of the Comptroller now: collateral capacity ÷ debt",
  };
}
