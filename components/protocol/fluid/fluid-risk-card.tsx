"use client";

// The Fluid position card's footer figures, in the engine's own space (the
// vault oracle prices the collateral IN THE DEBT TOKEN; no USD feed): the
// headroom to the vault's borrow limit (collateralFactor, where operate stops
// lending) and the vault's current borrow rate. The ratio and the liquidation
// line are the card's third column; the penalty and the full-absorption limit
// are in the card's Explanation. Every figure is a same-block resolver read or
// arithmetic over them, each in the provenance that names its basis.

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { vaultConfigProv, fluidLiqPriceProv, liveBorrowRateProv } from "@/lib/fluid/live-provenance";
import { formatCompact } from "@/lib/utils/format";
import { poolShareLabel } from "@/lib/fluid/asset-catalog";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";

export function FluidRiskView({ chain, pair }: { chain: FluidPositionChainResponse; pair: string }) {
  // Meaningful only for a live borrowing position with a live oracle price.
  if (
    chain.chainStale ||
    !chain.found ||
    chain.isEmpty ||
    chain.borrow <= 0 ||
    chain.supply <= 0 ||
    chain.ratio == null ||
    chain.oraclePriceLiquidateDebtPerCol == null
  )
    return null;
  // A smart leg has no token symbol, but the same chain read names its pool —
  // say what the shares are shares OF rather than the blank "DEX shares".
  const colSym = chain.supplySymbol ?? poolShareLabel(chain.supplyPoolPair) ?? "DEX shares";
  const debtSym = chain.borrowSymbol ?? poolShareLabel(chain.borrowPoolPair) ?? "DEX shares";

  // Headroom to the borrow gate, in the debt leg's own unit (token or shares —
  // dimensionally sound either way: price is debt-leg per col-leg).
  const headroom = Math.max(
    0,
    chain.supply * chain.oraclePriceLiquidateDebtPerCol * chain.collateralFactor - chain.borrow,
  );

  // Label-led clusters on the shared risk footer strip (design-grammar rule):
  // headroom to the borrow limit, then the borrow rate where the vault states
  // one for this leg.
  return (
    <>
      <RiskFigure>
        <Prov info={fluidLiqPriceProv(colSym, debtSym, chain.vault, pair)}>
          {formatCompact(headroom)} {debtSym}
        </Prov>{" "}
        more to the{" "}
        <Prov info={vaultConfigProv("Collateral factor (borrow gate)", "collateralFactor", chain.vault, pair)}>
          {pct(chain.collateralFactor)}
        </Prov>{" "}
        borrow limit
      </RiskFigure>
      {chain.borrowRatePct != null && (
        <RiskFigure label="Borrow rate">
          <Prov info={liveBorrowRateProv(chain.vault, pair)}>
            <RiskStrong>{chain.borrowRatePct.toFixed(2)}%</RiskStrong>
          </Prov>
        </RiskFigure>
      )}
    </>
  );
}
