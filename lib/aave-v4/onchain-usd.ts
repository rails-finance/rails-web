// An Aave V4 position's headline dollars (ui-jobs 743): per side, each
// reserve's balance from the spoke-position chain read × its on-chain price
// from the oracle read, as the receipt's rows show them, each product to the
// cent, the figure their sum (lib/aave-v4/usd-receipt.ts). A side holding an
// asset with no on-chain price draws no figure and names the asset. Where the
// balance read and the oracle read stand at different blocks, the receipt
// names both.

import { scaleChainBalance, type AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import type { OracleRead } from "@/lib/aave-v4/use-oracle-prices";
import { aaveV4UsdReceipt, type AaveV4UsdResult, type AaveV4UsdRow } from "@/lib/aave-v4/usd-receipt";
import type { AaveV4Face } from "@/lib/aave-v4/price-notes";

export type OnchainSide = "collateral" | "debt" | "supply" | "nonCollateral";

export interface OnchainUsdTotals {
  collateral: AaveV4UsdResult | null;
  debt: AaveV4UsdResult | null;
  supply: AaveV4UsdResult | null;
  /** The supplies not enabled as collateral. */
  nonCollateral: AaveV4UsdResult | null;
}

/** One side's rows from the chain read, priced from the oracle read. */
export function onchainRows(
  chain: AaveV4SpokePositionChainResponse,
  oracle: OracleRead,
  side: OnchainSide,
): AaveV4UsdRow[] {
  return chain.reserves.flatMap((r): AaveV4UsdRow[] => {
    const amount =
      side === "debt"
        ? scaleChainBalance(r.debtBalanceRaw, r.decimals)
        : (side === "collateral" && !r.isCollateral) || (side === "nonCollateral" && r.isCollateral)
          ? 0
          : scaleChainBalance(r.supplyBalanceRaw, r.decimals);
    if (!(amount > 0)) return [];
    const p = oracle.prices[r.address.toLowerCase()];
    return [
      {
        symbol: r.symbol,
        address: r.address,
        amount,
        amountNote: `the spoke's ${side === "debt" ? "getUserTotalDebt" : "getUserSuppliedAssets"} for this reserve at block ${chain.blockNumber.toLocaleString("en-US")}`,
        price: p && p.usd > 0 ? { usd: p.usd, source: p.source, block: oracle.blockNumber } : null,
      },
    ];
  });
}

const WHAT: Record<OnchainSide, string> = {
  collateral: "Current collateral in USD",
  debt: "Current debt in USD",
  supply: "Currently supplied in USD",
  nonCollateral: "Supplied, not collateral, in USD",
};

export function computeOnchainUsd(
  chain: AaveV4SpokePositionChainResponse | null | undefined,
  oracle: OracleRead | null | undefined,
  /** How the card shows each side: one asset in cents, several compact. */
  faceOf: (side: OnchainSide, count: number) => AaveV4Face = (_s, n) => (n === 1 ? "cents" : "compact"),
): OnchainUsdTotals | undefined {
  if (!chain || chain.chainStale || !oracle) return undefined;
  const side = (s: OnchainSide): AaveV4UsdResult | null => {
    const rows = onchainRows(chain, oracle, s);
    return aaveV4UsdReceipt({
      what: WHAT[s],
      rows,
      face: faceOf(s, rows.length),
      via: "spoke-position chain read × the oracle map (/api/oracle/aave-v4)",
      balanceBlock: chain.blockNumber,
    });
  };
  return {
    collateral: side("collateral"),
    debt: side("debt"),
    supply: side("supply"),
    nonCollateral: side("nonCollateral"),
  };
}
