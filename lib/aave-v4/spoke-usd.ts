// A spoke card's dollars by side (ui-jobs 743): the chain read × the oracle
// read where both have landed (`spoke.onchainUsd`), else the side's event
// legs at the oracle map's prices, each row naming its source and block. A
// side holding an asset with no on-chain price draws no figure and names it.
// One place, so the card, its Explanation and the markdown export quote the
// same figure.

import type { AaveSpokeCardInfo } from "@/lib/aave-v4/spoke-cards";
import { aaveV4UsdReceipt, type AaveV4UsdResult } from "@/lib/aave-v4/usd-receipt";

export type AaveV4SpokeSide = "supply" | "collateral" | "debt" | "nonCollateral";

const WHAT: Record<AaveV4SpokeSide, string> = {
  supply: "Currently supplied in USD",
  collateral: "Current collateral in USD",
  debt: "Current debt in USD",
  nonCollateral: "Supplied, not collateral, in USD",
};

/** One side's figure and receipt; null where the side holds nothing. */
export function aaveV4SpokeSideUsd(spoke: AaveSpokeCardInfo, side: AaveV4SpokeSide): AaveV4UsdResult | null {
  if (spoke.onchainUsd !== undefined) return spoke.onchainUsd[side];
  // Before the oracle read lands, or once it has failed, no price stands: a
  // side holding anything draws no figure, and says which.
  const read = spoke.oracleRead ?? null;
  if (!read || read.failed) {
    // The not-collateral line waits for the read with the headline above it.
    if (side === "nonCollateral") return null;
    const held =
      side === "debt"
        ? spoke.borrowingSymbols
        : side === "collateral"
          ? spoke.supplyBreakdown.collateralSymbols.length > 0
            ? spoke.supplyBreakdown.collateralSymbols
            : spoke.supplyingSymbols
          : spoke.supplyingSymbols;
    return held.length > 0 ? { prov: null, usd: null, missing: [...held], state: read ? "failed" : "pending" } : null;
  }
  const supply = (spoke.supplyLegs ?? []).filter((l) => l.amount > 0);
  const legs =
    side === "debt"
      ? (spoke.debtLegs ?? []).filter((l) => l.amount > 0)
      : side === "collateral"
        ? supply.filter((l) => l.collateralEnabled)
        : side === "nonCollateral"
          ? supply.filter((l) => !l.collateralEnabled)
          : supply;
  const unpriced = (spoke.unpricedHoldings ?? [])
    .filter((h) =>
      side === "debt"
        ? h.side === "debt"
        : h.side === "supply" &&
          (side === "supply" || (side === "collateral" ? h.collateralEnabled : !h.collateralEnabled)),
    )
    .map((h) => h.symbol);
  if (unpriced.length > 0) return { prov: null, usd: null, missing: [...new Set(unpriced)] };
  const entryOf = (symbol: string) => Object.values(read?.prices ?? {}).find((p) => p.symbol === symbol);
  return aaveV4UsdReceipt({
    what: WHAT[side],
    rows: legs.map((l) => ({
      symbol: l.symbol,
      amount: l.amount,
      amountNote: "the position's balance from its events, the live read having not answered",
      price: { usd: l.price, source: entryOf(l.symbol)?.source ?? null, block: read?.blockNumber ?? null },
    })),
    face: legs.length === 1 ? "cents" : "compact",
    via: "event balances × the oracle map (/api/oracle/aave-v4)",
  });
}
