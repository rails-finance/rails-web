"use client";

// Stated borrow-capacity readout for the Compound V2 position detail — the
// text companion to the always-on liquidation runway in the card's risk slot.
// Where the runway answers "how far can collateral fall before liquidation?",
// these lines state where current borrowing sits against the capacity line.
//
// Compound V2 has ONE collateral factor per market: the borrow limit and the
// liquidation threshold are the SAME line (the Morpho one-lltv-line shape, not
// Comet's two-factor split). The capacity figure (Σ entered supply × the
// Comptroller's own oracle price × collateral factor) is a REPLICA of the
// Comptroller's hypothetical-liquidity walk, labeled as such; the headroom
// readout beside it is the Comptroller's OWN liquidity figure (the chain
// fact), not ours.
//
// Rendered ON the card face (the risk slot), so its receipts are the card's
// own figures.

import { Prov } from "@/components/shared/provenance";
import { capacityShare } from "@/lib/shared/capacity-share";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { formatUsd } from "@/lib/shared/format-event";
import { compoundV2CapacityProv, comptrollerVerdictProv } from "@/lib/compound-v2/position-provenance";
import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";

export function CompoundV2BorrowCapacityView({ chain }: { chain: CompoundV2ChainResponse }) {
  // Meaningful only with both debt and CF-weighted capacity — otherwise the
  // lines say nothing the stats don't already.
  if (chain.debtValueUsd <= 0 || chain.collateralCapacityUsd <= 0) return null;

  // Past the share ceiling this reads "over 1,000×" — see capacity-share.ts.
  const share = capacityShare(chain.debtValueUsd, chain.collateralCapacityUsd);

  // Three label-led clusters on the shared risk footer strip (design-grammar
  // rule) — every <Prov> moved verbatim from the stacked layout: same info
  // builder, same format call, same value text.
  return (
    <>
      <RiskFigure label="Borrow capacity">
        <Prov
          info={compoundV2CapacityProv(
            "Debt share of the capacity line",
            "debt value ÷ CF-weighted capacity (replica)",
          )}
        >
          <RiskStrong>{share.text}</RiskStrong>
        </Prov>{" "}
        {share.ofThe} <Prov info={comptrollerVerdictProv("Liquidation line")}>liquidation line</Prov>
      </RiskFigure>
      <RiskFigure>
        <Prov info={comptrollerVerdictProv("Account liquidity")}>{formatUsd(chain.liquidityUsd)}</Prov> more to borrow
      </RiskFigure>
      <RiskFigure>
        liquidation at{" "}
        <Prov
          info={compoundV2CapacityProv("Liquidation line", "Σ entered supply × price × collateral factor (replica)")}
        >
          {formatUsd(chain.collateralCapacityUsd)}
        </Prov>{" "}
        debt
      </RiskFigure>
    </>
  );
}
