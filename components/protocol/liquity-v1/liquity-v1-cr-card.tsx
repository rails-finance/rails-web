"use client";

// Stated collateral-ratio readout for the Liquity V1 Trove detail — the text
// companion to the always-on liquidation runway in the card's risk slot, the
// Trove-shaped analog of the Aave / Spark LTV lines. Where the runway answers
// "how far can the ETH price fall?", these lines state where current borrowing
// sits against the protocol's ratio lines — the 110% minimum (liquidation)
// and, in recovery mode, the 150% critical ratio.
//
// The headline ratio is not client arithmetic: TroveManager.getCurrentICR
// computes it on the contract itself (<Prov>-traced as a direct chain read).
// Rendered ON the card face (the risk slot), so its receipts are the card's
// own figures.

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { icrProv, ratioConstantProv, borrowHeadroomProv, systemStateProv } from "@/lib/liquity-v1/position-provenance";
import { formatCompact } from "@/lib/utils/format";
import type { LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";
import { DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";

export function LiquityV1CrCard({ chain }: { chain: LiquityV1PositionChainResponse }) {
  // Meaningful only for an active Trove with debt and a live ratio.
  if (chain.chainStale || chain.troveStatus !== "active" || chain.debt <= 0 || chain.icr == null) return null;

  const icr = chain.icr;

  // Headroom to the ACTIVE minimum: 110% normally; while the system is in
  // recovery mode a Trove below 150% is at risk, so that becomes the line.
  const activeRatio = chain.recoveryMode ? chain.ccr : chain.mcr;
  const activeLabel = chain.recoveryMode ? pct(chain.ccr) : pct(chain.mcr);
  const headroomLusd = Math.max(0, (chain.coll * chain.price) / activeRatio - chain.debt);

  // Label-led clusters on the shared risk footer strip (design-grammar rule)
  // — CR/minimum [+ recovery-mode caution] · headroom · system ratio, every
  // <Prov> moved verbatim from the stacked layout: same info builder, same
  // format call, same value text.
  return (
    <>
      <RiskFigure label="Collateral ratio">
        <Prov info={icrProv()}>
          <RiskStrong>{pct(icr)}</RiskStrong>
        </Prov>{" "}
        · minimum <Prov info={ratioConstantProv("Minimum collateral ratio", "MCR")}>{pct(chain.mcr)}</Prov>
        {chain.recoveryMode && (
          <>
            {" · "}
            <span className="font-semibold text-caution-600 dark:text-caution-400">
              recovery mode — at risk below{" "}
              <Prov info={ratioConstantProv("Critical collateral ratio", "CCR")}>{pct(chain.ccr)}</Prov>
            </span>
          </>
        )}
      </RiskFigure>
      <RiskFigure>
        <Prov info={borrowHeadroomProv(activeLabel)}>
          {formatCompact(headroomLusd)} {DEBT_SYMBOL}
        </Prov>{" "}
        more to the {activeLabel} minimum
      </RiskFigure>
      <RiskFigure>
        system ratio <Prov info={systemStateProv("Total collateral ratio", "getTCR(price)")}>{pct(chain.tcr)}</Prov>
      </RiskFigure>
    </>
  );
}
