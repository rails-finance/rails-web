// Aave V4's health view on the Lifetime flows chart (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 5): the Aave
// family's view (lib/shared/flows-health.ts) with a spoke's source.
//
// RULES.
// - A day's collateral factors are the spoke's at the end of the block of the
//   day's last event, each reserve's at the dynamic config key the position
//   held (`/api/chain/aave-v4/spoke-position?block=`, the card's read at
//   head). A reserve not switched on as collateral counts 0; two reserves of
//   one token (two hubs) take their factors weighted by the balance supplied.
// - An asset's level is the card's: with one collateral, its price ÷ the
//   health factor ("Liquidates at"); with more, its `assetLiqPrices` entry
//   (lib/aave-v4/utils/position-calculation.ts), the price at which the health
//   factor reaches 1 with every other balance and price held. A collateral the
//   rest already covers has no level; a debt asset has none.
//
// Pure.

import type { AaveHealthSource } from "@/lib/aave-v3/flows-health";
import type { FactorRead, HealthLine } from "@/lib/shared/flows-health";
import type { AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import { calculateAaveV4Position } from "@/lib/aave-v4/utils/position-calculation";

const DAY_S = 86_400;

/** One spoke read's collateral factors, keyed as the flows series keys its
 *  assets (the symbol, lowercase). Null for a stale answer. */
export function aaveV4FactorRead(r: AaveV4SpokePositionChainResponse, timestamp: number): FactorRead | null {
  if (r.chainStale) return null;
  const acc = new Map<string, { w: number; n: number; lt: number }>();
  for (const x of r.reserves) {
    const k = x.symbol.toLowerCase();
    const lt = x.isCollateral ? (x.lt ?? 0) : 0;
    const n = Number(x.supplyBalanceRaw) / 10 ** x.decimals;
    const a = acc.get(k) ?? { w: 0, n: 0, lt };
    a.w += n * lt;
    a.n += n;
    a.lt = Math.max(a.lt, lt);
    acc.set(k, a);
  }
  const lt: Record<string, number> = {};
  for (const [k, a] of acc) lt[k] = a.n > 0 ? a.w / a.n : a.lt;
  return { day: Math.floor(timestamp / DAY_S), block: r.blockNumber, lt };
}

/** The card's levels (`assetLiqPrices`, and price ÷ health factor with one
 *  collateral). */
export function aaveV4Levels(lines: readonly HealthLine[], hf: number): Map<string, number> {
  const supplies = lines
    .filter((l) => l.coll > 0)
    .map((l) => ({ symbol: l.asset, amount: l.coll, price: l.price, lt: l.lt, collateralEnabled: l.lt > 0 }));
  const debts = lines.filter((l) => l.debt > 0).map((l) => ({ symbol: l.asset, amount: l.debt, price: l.price }));
  const out = new Map<string, number>();
  const coll = supplies.filter((s) => s.collateralEnabled);
  if (coll.length === 1) {
    out.set(coll[0].symbol, coll[0].price / hf);
    return out;
  }
  for (const a of calculateAaveV4Position({ supplies, debts }).assetLiqPrices)
    if (a.liqPrice != null && a.liqPrice > 0) out.set(a.symbol, a.liqPrice);
  return out;
}

/** Aave V4 on Ethereum: a spoke basket. */
export const AAVE_V4_HEALTH_SOURCE: AaveHealthSource = {
  oracle: "the spoke's oracle",
  pool: "the spoke",
  chain: 1,
  factor: "collateral factor",
  factors: ["collateral factors", "collateral factors"],
  reader: "aave-v4-spoke",
  levels: {
    of: aaveV4Levels,
    formula:
      "the price at which the health factor reaches 1, every other balance and price held at the day's; with one collateral, its price ÷ the health factor",
  },
};
