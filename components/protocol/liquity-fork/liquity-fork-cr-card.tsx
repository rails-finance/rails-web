"use client";

// Branch-context readout for the fork trove detail — the text companion to
// the always-on liquidation runway in the card's risk slot, the fork-shaped
// analog of the Liquity V1 CR lines. The card face already states the
// trove's own collateral ratio and its liquidation price (the shared
// Liquity-family card), so this strip carries only what the face does not:
// the borrowing headroom to the branch MCR, and the branch's own aggregate
// context (TCR vs the CCR borrow gate and the SCR shutdown floor — V2-family
// semantics: CCR gates NEW borrowing branch-wide, it does not liquidate
// existing troves). Rendered ON the card face (the risk slot), so its
// receipts are the card's own figures.

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure } from "@/components/shared/risk-footer-strip";
import { forkLiveVocab, FORK_DEBT_SYMBOL } from "@/lib/shared/liquity-fork-live-provenance";
import { formatCompact } from "@/lib/utils/format";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";

export function LiquityForkCrCard({ chain }: { chain: LiquityForkTroveChainResponse }) {
  // Meaningful only for a trove with live debt and a live price.
  if (
    chain.chainStale ||
    (chain.status !== "active" && chain.status !== "zombie") ||
    chain.entireDebt <= 0 ||
    chain.icr == null ||
    chain.priceUsd == null
  )
    return null;
  const vocab = forkLiveVocab(chain.protocol);
  const debtSymbol = FORK_DEBT_SYMBOL[chain.protocol] ?? "debt";

  const headroom = Math.max(0, (chain.entireColl * chain.priceUsd) / chain.mcr - chain.entireDebt);
  const branchShutdownRisk = chain.branchTcr != null && chain.branchTcr < chain.scr;
  const branchGated = chain.branchTcr != null && chain.branchTcr < chain.ccr;

  // Label-led clusters on the shared risk footer strip (design-grammar rule)
  // — headroom · branch ratio [+ borrow-gate caution]. The rare SCR-shutdown
  // note rides the strip as a basis-full caution line.
  return (
    <>
      <RiskFigure>
        <Prov info={vocab.liqPriceProv(chain.symbol)}>
          {formatCompact(headroom)} {debtSymbol}
        </Prov>{" "}
        more to the {pct(chain.mcr)} minimum
      </RiskFigure>
      {chain.branchTcr != null && (
        <RiskFigure>
          branch ratio <Prov info={vocab.tcrProv(chain.symbol)}>{pct(chain.branchTcr)}</Prov>
          {branchGated && (
            <>
              {" · "}
              <span className="font-semibold text-caution-600 dark:text-caution-400">
                below the {pct(chain.ccr)} borrow gate
              </span>
            </>
          )}
        </RiskFigure>
      )}
      {branchShutdownRisk && (
        <p className="basis-full text-right text-[11px] leading-relaxed font-semibold text-caution-600 dark:text-caution-400">
          The branch ratio sits below its {pct(chain.scr)} shutdown threshold (SCR) — the branch can be shut down and
          wound through urgent redemptions.
        </p>
      )}
    </>
  );
}
