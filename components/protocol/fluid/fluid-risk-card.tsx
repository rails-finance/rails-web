"use client";

// Stated position-ratio readout for the Fluid position card — the text
// companion to the always-on liquidation runway in the card's risk slot. In
// the engine's OWN space: Fluid judges a position by ratio = debt ÷
// (collateral × the vault oracle's liquidate price), where the oracle prices
// the collateral IN THE DEBT TOKEN (the protocol has no USD feed). The vault's
// lines are stated alongside:
//
//   • collateralFactor — the borrow gate (operate reverts past it).
//   • liquidationThreshold — above it anyone can liquidate (partially — Fluid
//     sweeps only enough to restore health).
//   • liquidationMaxLimit — above it the position can be fully absorbed.
//
// Every figure is a same-block resolver read (or arithmetic over them), each
// wrapped in the provenance that names its basis. Rendered ON the card face
// (the risk slot), so its receipts are the card's own figures.

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { fluidRatioProv, vaultConfigProv, fluidLiqPriceProv } from "@/lib/fluid/live-provenance";
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

  // Three label-led clusters on the shared risk footer strip (design-grammar
  // rule) — ratio/threshold · headroom/borrow-limit · penalty/absorbable,
  // every <Prov> moved verbatim from the stacked layout: same info builder,
  // same format call, same value text. A long composition wraps BETWEEN
  // clusters — still the grammar.
  return (
    <>
      <RiskFigure label="Position ratio">
        <Prov info={fluidRatioProv(colSym, debtSym, chain.vault, pair)}>
          <RiskStrong>{pct(chain.ratio)}</RiskStrong>
        </Prov>{" "}
        · liquidation above{" "}
        <Prov info={vaultConfigProv("Liquidation threshold", "liquidationThreshold", chain.vault, pair)}>
          {pct(chain.liquidationThreshold)}
        </Prov>
      </RiskFigure>
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
      <RiskFigure>
        <Prov info={vaultConfigProv("Liquidation penalty", "liquidationPenalty", chain.vault, pair)}>
          {pct(chain.liquidationPenalty)}
        </Prov>{" "}
        penalty · fully absorbable above{" "}
        <Prov info={vaultConfigProv("Liquidation max limit", "liquidationMaxLimit", chain.vault, pair)}>
          {pct(chain.liquidationMaxLimit)}
        </Prov>
      </RiskFigure>
    </>
  );
}
