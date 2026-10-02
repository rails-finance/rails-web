"use client";

// The Fluid position card's opened layer under Debt (ui-jobs 209), in the
// engine's own space (the vault oracle prices the collateral IN THE DEBT
// TOKEN; no USD feed): the vault's current borrow rate and the headroom to the
// vault's borrow limit (collateralFactor, where operate stops lending). The
// ratio, the liquidation line and the runway are the card's third headline;
// the penalty and the full-absorption limit are in the card's Explanation.
// Every figure is a same-block resolver read or arithmetic over them, each in
// the provenance that names its basis.

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure } from "@/components/shared/risk-footer-strip";
import { vaultConfigProv, fluidLiqPriceProv, liveBorrowRateProv } from "@/lib/fluid/live-provenance";
import { poolShareLabel } from "@/lib/fluid/asset-catalog";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";
import { AmountText } from "@/components/shared/amount-text";

export function FluidDebtDetail({ chain, pair }: { chain: FluidPositionChainResponse; pair: string }) {
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

  // The borrow rate where the vault states one for this leg, then the
  // headroom to the borrow limit.
  return (
    <div className="mt-0.5">
      {chain.borrowRatePct != null && (
        <RiskFigure alignStart>
          <Prov info={liveBorrowRateProv(chain.vault, pair)}>{chain.borrowRatePct.toFixed(2)}%</Prov> borrow rate
        </RiskFigure>
      )}
      <RiskFigure alignStart>
        <Prov info={fluidLiqPriceProv(colSym, debtSym, chain.vault, pair)}>
          <AmountText value={headroom} format="compact" /> {debtSym}
        </Prov>{" "}
        more to the{" "}
        <Prov info={vaultConfigProv("Collateral factor (borrow gate)", "collateralFactor", chain.vault, pair)}>
          {pct(chain.collateralFactor)}
        </Prov>{" "}
        borrow limit
      </RiskFigure>
    </div>
  );
}
