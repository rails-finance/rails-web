// Strict on-chain valuation of an Aave V4 position's headline totals. Each
// total is Σ(chain-state balance × the asset's on-chain oracle price) and is
// null when ANY contributing reserve lacks an oracle price — a partial total
// isn't the on-chain record, so it must middot (via the DefiLlama figure) rather
// than assert an incomplete number. This is the chain-state counterpart of the
// DefiLlama-priced totals the card already shows; same balances (from the
// spoke-position chain read), on-chain oracle price instead of DefiLlama.

import { scaleChainBalance, type AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import type { OraclePriceMap } from "@/lib/aave-v4/use-oracle-prices";

export interface OnchainUsdTotals {
  collateral: number | null;
  debt: number | null;
  supply: number | null;
}

export function computeOnchainUsd(
  chain: AaveV4SpokePositionChainResponse | null | undefined,
  oracle: OraclePriceMap | null | undefined,
): OnchainUsdTotals | undefined {
  if (!chain || chain.chainStale || !oracle) return undefined;

  const priceOf = (addr: string): number | null => oracle[addr.toLowerCase()]?.usd ?? null;

  // Sum balances × oracle price over reserves; bail to null the moment a
  // contributing reserve (balance > 0) has no oracle price.
  const total = (balanceOf: (r: AaveV4SpokePositionChainResponse["reserves"][number]) => number): number | null => {
    let sum = 0;
    for (const r of chain.reserves) {
      const amount = balanceOf(r);
      if (amount <= 0) continue;
      const price = priceOf(r.address);
      if (price == null) return null;
      sum += amount * price;
    }
    return sum;
  };

  return {
    collateral: total((r) => (r.isCollateral ? scaleChainBalance(r.supplyBalanceRaw, r.decimals) : 0)),
    debt: total((r) => scaleChainBalance(r.debtBalanceRaw, r.decimals)),
    supply: total((r) => scaleChainBalance(r.supplyBalanceRaw, r.decimals)),
  };
}
