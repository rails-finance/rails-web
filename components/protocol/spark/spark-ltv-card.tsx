"use client";

// Stated loan-to-value readout for the SparkLend position card — the text
// companion to the always-on liquidation runway in the card's risk slot.
// Near-clone of aave-v3-ltv-card.tsx (SparkLend is an Aave V3 fork): where the
// runway answers "how far can collateral fall before liquidation?", these
// lines state the complementary capacity read: where current borrowing sits
// between the borrow cap and the liquidation threshold.
//
// Every figure is read straight from Pool.getUserAccountData @ head — the max LTV
// (`ltv`), the blended liquidation threshold (`avgLiquidationThreshold`),
// available borrows (`availableBorrowsUsd`), and the oracle-priced USD totals
// the current ratio is derived from. No client-side simulation, so each value
// is <Prov>-traced straight to that one read. Rendered ON the card face (the
// risk slot), so its receipts are the card's own figures.
//
// One fixed framing: loan-to-value, the term the getter speaks. (The former
// Display-menu bar view and its CR reframing are retired — both risk reads now
// show at once, nothing hides behind a toggle.)

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { fmtUsd } from "@/lib/aave-v4/format";
import { accountDataProv, accountRatioProv } from "@/lib/spark/position-provenance";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";

export function SparkLtvView({ chain }: { chain: SparkPositionChainResponse }) {
  // Meaningful only with both debt and collateral priced — otherwise the
  // current ratio is 0/undefined and the lines say nothing the stats don't
  // already.
  if (chain.totalDebtUsd <= 0 || chain.totalCollateralUsd <= 0) return null;

  const currentLtv = chain.totalDebtUsd / chain.totalCollateralUsd; // debt ÷ collateral
  const maxLtv = chain.ltv; // borrow cap (weighted max LTV), a 0..1 fraction
  const liqThreshold = chain.avgLiquidationThreshold; // blended LT, a 0..1 fraction

  const currentProv = accountRatioProv("Current loan-to-value", "total debt (USD) ÷ total collateral (USD)");
  const capProv = accountDataProv("Max loan-to-value (borrow cap)", "ltv");
  const liqProv = accountDataProv("Liquidation threshold", "currentLiquidationThreshold");
  const availProv = accountDataProv("Available to borrow", "availableBorrowsBase");

  // Three label-led clusters on the shared risk footer strip (design-grammar
  // rule) — every <Prov> moved verbatim from the stacked layout: same info
  // builder, same format call, same value text.
  return (
    <>
      <RiskFigure label="Loan-to-value">
        <Prov info={currentProv}>
          <RiskStrong>{pct(currentLtv)}</RiskStrong>
        </Prov>{" "}
        of <Prov info={capProv}>{pct(maxLtv)}</Prov> cap
      </RiskFigure>
      <RiskFigure>
        <Prov info={availProv}>{fmtUsd(chain.availableBorrowsUsd).display}</Prov> more to borrow
      </RiskFigure>
      <RiskFigure>
        liquidation at <Prov info={liqProv}>{pct(liqThreshold)}</Prov>
      </RiskFigure>
    </>
  );
}
