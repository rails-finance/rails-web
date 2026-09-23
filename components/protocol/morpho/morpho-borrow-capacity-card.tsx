"use client";

// Stated borrow-capacity readout for the Morpho position detail — the text
// companion to the always-on liquidation runway in the card's risk slot. Where
// the runway answers "how far can the collateral price fall?", these lines
// state where current borrowing sits against the market's one line.
//
// Unlike Aave (LTV cap under the liquidation threshold) or Compound (borrow
// factor under the liquidate factor), a Morpho market has ONE line: the lltv.
// Borrowing is allowed right up to it and liquidation begins past it — the
// same _isHealthy check gates both (replicated live, verified by
// scripts/verify-morpho-chain.mjs). Readouts are in loan-token units — the
// market oracle's own numeraire; there is no USD.
//
// Rendered ON the card face (the risk slot), so its receipts are the card's
// own figures.

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { capacityShare } from "@/lib/shared/capacity-share";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { formatNumber } from "@/lib/utils/format";
import { capacityProv, lltvProv, type MorphoChainCoords } from "@/lib/morpho/position-provenance";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";

export function MorphoBorrowCapacityView({ chain }: { chain: MorphoChainPositionResponse }) {
  // Meaningful only with live debt and priced collateral — otherwise the
  // lines say nothing the stats don't already.
  if (chain.chainStale || chain.currentDebt <= 0 || chain.maxBorrow <= 0) return null;
  const coords: MorphoChainCoords = {
    marketId: chain.marketId,
    marketLabel: `${chain.loanSymbol} / ${chain.collateralSymbol}`,
  };

  // = LTV ÷ LLTV; past the share ceiling it reads "over 1,000×" — see
  // capacity-share.ts.
  const share = capacityShare(chain.currentDebt, chain.maxBorrow);
  const headroom = Math.max(0, chain.maxBorrow - chain.currentDebt);

  // Three label-led clusters on the shared risk footer strip (design-grammar
  // rule) — every <Prov> moved verbatim from the stacked layout: same info
  // builder, same format call, same value text.
  return (
    <>
      <RiskFigure label="Borrow capacity">
        <Prov info={capacityProv("Debt share of the liquidation line", "debt ÷ (collateral value × lltv)", coords)}>
          <RiskStrong>{share.text}</RiskStrong>
        </Prov>{" "}
        {share.ofThe} <Prov info={lltvProv(coords)}>LLTV {pct(chain.lltv)}</Prov> line
      </RiskFigure>
      <RiskFigure>
        <Prov info={capacityProv("Available to borrow", "collateral value × lltv − live debt", coords)}>
          {formatNumber(headroom)} {chain.loanSymbol}
        </Prov>{" "}
        more to borrow
      </RiskFigure>
      <RiskFigure>
        liquidation at{" "}
        <Prov info={capacityProv("Liquidation line", "collateral value × lltv", coords)}>
          {formatNumber(chain.maxBorrow)} {chain.loanSymbol}
        </Prov>{" "}
        debt
      </RiskFigure>
    </>
  );
}
