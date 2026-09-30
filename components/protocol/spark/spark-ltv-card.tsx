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
import { RevealTip } from "@/components/shared/reveal-tip";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { fmtUsd } from "@/lib/aave-v4/format";
import { accountDataProv, accountRatioProv, emodeProv } from "@/lib/spark/position-provenance";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";

const CAP_TIP =
  "The most the account may borrow, as a share of its collateral's value: each collateral asset's own limit, weighted by value. A borrow that would pass it is refused.";
const LIQ_LINE_TIP =
  "The loan-to-value at which the account can be liquidated: each collateral asset's liquidation threshold, weighted by value. It sits a little above the cap.";
const EMODE_OFF_TIP =
  "The account uses no e-mode category (Pool.getUserEMode reads 0), so the cap and the liquidation line are each asset's own figures.";

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
        of <Prov info={capProv}>{pct(maxLtv)}</Prov>{" "}
        <RevealTip tip={CAP_TIP} label="cap" focusable>
          cap
        </RevealTip>
      </RiskFigure>
      <RiskFigure>
        <Prov info={availProv}>{fmtUsd(chain.availableBorrowsUsd).display}</Prov> more to borrow
      </RiskFigure>
      <RiskFigure>
        <RevealTip tip={LIQ_LINE_TIP} label="liquidation at" focusable>
          liquidation at
        </RevealTip>{" "}
        <Prov info={liqProv}>{pct(liqThreshold)}</Prov>
      </RiskFigure>
      {chain.emode && chain.emode.id > 0 ? (
        <RiskFigure label="E-mode">
          <Prov info={emodeProv(chain.emode.label ?? `category ${chain.emode.id}`, chain.emode.ltv, chain.emode.lt)}>
            {chain.emode.label ?? `category ${chain.emode.id}`}
          </Prov>
        </RiskFigure>
      ) : chain.emode ? (
        <RiskFigure label="E-mode">
          <RevealTip tip={EMODE_OFF_TIP} label="off" focusable>
            off
          </RevealTip>
        </RiskFigure>
      ) : null}
    </>
  );
}
