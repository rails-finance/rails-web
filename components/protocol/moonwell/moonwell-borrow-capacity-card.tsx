"use client";

// Stated borrow-capacity readout for the Moonwell position detail — the text
// companion to the always-on liquidation runway in the card's risk slot, the
// Compound-v2 analog of the Aave-family LTV lines. Where the runway answers
// "how far can collateral fall before liquidation?", these lines state where
// current borrowing sits against the capacity line.
//
// Compound v2 has ONE collateral factor per market: the borrow limit and the
// liquidation threshold are the SAME line (the Morpho one-lltv-line shape, not
// Comet's two-factor split). The capacity figure (Σ entered supply × the
// Comptroller's own oracle price × collateral factor) is arithmetic proven
// EXACT against the Comptroller's getAccountLiquidity verdict by
// scripts/verify-moonwell-chain.mjs. The headroom readout is the Comptroller's
// OWN liquidity figure, not ours.
//
// Rendered ON the card face (the risk slot), so its receipts are the card's
// own figures.

import { Prov } from "@/components/shared/provenance";
import { capacityShare } from "@/lib/shared/capacity-share";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { formatUsd } from "@/lib/shared/format-event";
import { moonwellCapacityProv, comptrollerVerdictProv, type MoonwellLane } from "@/lib/moonwell/position-provenance";
import { useMoonwellDeployment } from "@/lib/moonwell/deployment-context";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";

export function MoonwellBorrowCapacityView({ chain }: { chain: MoonwellChainResponse }) {
  // Which Comptroller, through which route, every receipt here names — the
  // surrounding page's deployment (Ethereum's when it mounts no provider).
  const dep = useMoonwellDeployment();
  const lane: MoonwellLane = { comptroller: dep.comptroller, positionRoute: dep.positionRoute };
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
        <Prov info={moonwellCapacityProv("Debt share of the capacity line", "debt value ÷ CF-weighted capacity", lane)}>
          <RiskStrong>{share.text}</RiskStrong>
        </Prov>{" "}
        {share.ofThe} <Prov info={comptrollerVerdictProv("Liquidation line", lane)}>liquidation line</Prov>
      </RiskFigure>
      <RiskFigure>
        <Prov info={comptrollerVerdictProv("Account liquidity", lane)}>{formatUsd(chain.liquidityUsd)}</Prov> more to
        borrow
      </RiskFigure>
      <RiskFigure>
        liquidation at{" "}
        <Prov info={moonwellCapacityProv("Liquidation line", "Σ entered supply × price × collateral factor", lane)}>
          {formatUsd(chain.collateralCapacityUsd)}
        </Prov>{" "}
        debt
      </RiskFigure>
    </>
  );
}
