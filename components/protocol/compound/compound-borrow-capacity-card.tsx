"use client";

// Stated borrowing-limit readout for the Compound V3 position detail — the
// text companion to the always-on liquidation runway in the card's risk slot,
// the Comet analog of the Aave-family LTV lines. Where the runway answers "how
// far can collateral fall before liquidation?", these lines state where
// current borrowing sits against the borrow cap and the liquidation line.
//
// Comet has no aggregate LTV getter, so both lines are the derived aggregates
// of the live per-asset reads (Σ collateral × the market's own oracle price ×
// factor) — verified against the contract's own isBorrowCollateralized /
// isLiquidatable verdicts by scripts/verify-compound-v3-chain.mjs. Readouts
// are in base-token terms (value ÷ base price), which is unit-safe in every
// market — the WETH market's feeds quote in ETH, not USD.
//
// Rendered ON the card face (the risk slot), so its receipts are the card's
// own figures.

import { Prov } from "@/components/shared/provenance";
import { capacityShare } from "@/lib/shared/capacity-share";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { capacityProv, contractVerdictProv } from "@/lib/compound/position-provenance";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CompoundCoords } from "@/lib/compound/event-provenance";
import { AmountText } from "@/components/shared/amount-text";

export function CompoundBorrowCapacityView({ chain }: { chain: CompoundMarketChainResponse }) {
  // Meaningful only with both debt and liquidation-weighted collateral —
  // otherwise the lines say nothing the stats don't already.
  if (chain.debtValue <= 0 || chain.liquidationCapacity <= 0) return null;
  const coords: CompoundCoords = { comet: chain.comet, marketLabel: `c${chain.baseSymbol}v3` };

  // debt ÷ liquidation capacity; past the share ceiling it reads "over
  // 1,000×" — see capacity-share.ts.
  const share = capacityShare(chain.debtValue, chain.liquidationCapacity);
  // Base-token readouts (value ÷ base price ≈ base tokens; base price ≈ 1 in the
  // market's own quote unit, verified on-chain).
  const toBase = (v: number) => (chain.basePrice > 0 ? v / chain.basePrice : v);
  const headroomBase = Math.max(0, toBase(chain.borrowCapacity - chain.debtValue));
  const liqAtBase = toBase(chain.liquidationCapacity);

  // Three label-led clusters on the shared risk footer strip (design-grammar
  // rule) — every <Prov> moved verbatim from the stacked layout: same info
  // builder, same format call, same value text.
  return (
    <>
      {chain.borrowCapacity > 0 && (
        <RiskFigure label="Borrowing limit">
          <Prov info={capacityProv("Share of the borrowing limit used", "debt value ÷ borrow capacity", coords)}>
            <RiskStrong>{capacityShare(chain.debtValue, chain.borrowCapacity).text}</RiskStrong>
          </Prov>{" "}
          used
        </RiskFigure>
      )}
      <RiskFigure label="Can borrow">
        <Prov
          info={capacityProv(
            "Available to borrow",
            "(Σ collateral × price × borrow factor − debt value) ÷ base price",
            coords,
          )}
        >
          <AmountText value={headroomBase} /> {chain.baseSymbol}
        </Prov>{" "}
        more
      </RiskFigure>
      <RiskFigure label="Absorbed at">
        <Prov info={capacityProv("Liquidation line", "Σ collateral × price × liquidate factor ÷ base price", coords)}>
          <AmountText value={liqAtBase} /> {chain.baseSymbol}
        </Prov>{" "}
        of debt, {share.beyond ? "debt " : ""}
        <Prov info={capacityProv("Debt share of the liquidation line", "debt value ÷ liquidation capacity", coords)}>
          <RiskStrong>{share.text}</RiskStrong>
        </Prov>{" "}
        <Prov info={contractVerdictProv("Liquidation line", "isLiquidatable", coords)}>
          {share.beyond ? "it" : "reached"}
        </Prov>
      </RiskFigure>
    </>
  );
}
