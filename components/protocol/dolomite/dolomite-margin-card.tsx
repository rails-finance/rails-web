"use client";

// Stated margin-ratio readout for the Dolomite position card — the text
// companion to the always-on collateralization runway in the card's risk
// slot. Where the runway answers "how close is this account to crossing its
// own line?", these lines state where current borrowing sits against the
// account's own borrow capacity.
//
// Dolomite has ONE margin requirement per account (getMarginRatioForAccount —
// the risk override where one is set, the global ratio otherwise), so the
// borrow limit and the liquidation line coincide: capacity = adjusted supply
// ÷ the requirement. Every figure is the core's own getAdjustedAccountValues /
// getMarginRatioForAccount, read live at head; only the division is ours.
//
// Rendered ON the card face (the risk slot), so its receipts are the card's
// own figures.

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { formatUsd } from "@/lib/shared/format-event";
import {
  dolomiteAdjustedValuesProv,
  dolomiteRequirementProv,
  dolomiteCollateralizationProv,
  dolomiteCapacityProv,
} from "@/lib/dolomite/live-provenance";
import type { DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";

const pct2 = (f: number) => `${(f * 100).toFixed(2)}%`;

export function DolomiteMarginView({ chain }: { chain: DolomiteChainResponse }) {
  // Meaningful only with live debt and a live requirement — otherwise the
  // lines say nothing the stats don't already.
  if (chain.chainStale || chain.adjBorrowValueUsd <= 0 || chain.requiredCollateralization <= 0) return null;

  const capacityUsd =
    chain.requiredCollateralization > 0 ? chain.adjSupplyValueUsd / chain.requiredCollateralization : 0;
  const usedOfCap = capacityUsd > 0 ? chain.adjBorrowValueUsd / capacityUsd : 0;

  // Three label-led clusters on the shared risk footer strip (design-grammar
  // rule) — every <Prov> moved verbatim from the stacked layout: same info
  // builder, same format call, same value text.
  return (
    <>
      {chain.collateralization != null && (
        <RiskFigure label="Margin ratio">
          <Prov info={dolomiteCollateralizationProv()}>
            <RiskStrong>{pct2(chain.collateralization)}</RiskStrong>
          </Prov>{" "}
          · line at{" "}
          <Prov info={dolomiteRequirementProv()}>
            {pct2(chain.requiredCollateralization)}
            {chain.override.active ? " (account override)" : ""}
          </Prov>
        </RiskFigure>
      )}
      <RiskFigure>
        <Prov info={dolomiteAdjustedValuesProv("Adjusted debt", chain.override.active)}>
          {formatUsd(chain.adjBorrowValueUsd)}
        </Prov>{" "}
        ·{" "}
        <Prov
          info={dolomiteCapacityProv(
            "Debt share of the capacity line",
            "adjusted debt ÷ (adjusted supply ÷ requirement)",
          )}
        >
          {pct(usedOfCap)}
        </Prov>{" "}
        of the line
      </RiskFigure>
      <RiskFigure>
        liquidation at{" "}
        <Prov info={dolomiteCapacityProv("Borrow capacity", "adjusted supply ÷ requirement")}>
          {formatUsd(capacityUsd)}
        </Prov>{" "}
        adjusted debt
      </RiskFigure>
    </>
  );
}
