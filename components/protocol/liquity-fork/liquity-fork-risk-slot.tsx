"use client";

// The Ebisu / Asymmetry trove card's risk slot — both risk reads, always on,
// riding the card's heading-button row. One shared component for both forks
// (same V2 architecture). (The Display menu is retired: one framing no longer
// hides behind the other.) Everything it draws is ON the card face and inside
// the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the price runway (how far the collateral can fall before the branch
//     MCR) — the spatial story, and
//   • the branch-context lines riding the same strip: borrowing headroom to
//     the MCR and the branch ratio (with the CCR borrow-gate / SCR shutdown
//     notes). The trove's own ratio and liquidation price are NOT restated
//     here — the shared Liquity-family card states both on its face.
//
// The redemption runway rides alongside always: it is an ORTHOGONAL axis
// (queue position by user-set rate, not a reframing of price-fall risk). It
// carries the queue-share receipt; the redemption card's other figures (branch
// debt, the absolute debt-in-front) were branch context, and the trove's own
// rate is already a card stat — so the position card keeps only its own
// redemption exposure. Zombie troves sit outside the queue, so the runway only
// plots for an active trove.

import { LiquityForkRunway } from "@/components/protocol/liquity-fork/liquity-fork-runway";
import { LiquityForkCrCard } from "@/components/protocol/liquity-fork/liquity-fork-cr-card";
import { RedemptionRunway } from "@/components/shared/redemption-runway";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import { forkLiveVocab } from "@/lib/shared/liquity-fork-live-provenance";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";

export function LiquityForkRiskSlot({ chain }: { chain: LiquityForkTroveChainResponse }) {
  // Figures → RedemptionRunway → price runway: the V2 reference order.
  return (
    <RiskFooterStrip>
      <LiquityForkCrCard chain={chain} />
      {/* Redemption runway — the orthogonal queue axis, shown for an active
          trove (debt in front ÷ entire branch debt). */}
      {chain.status === "active" && chain.debtInFront != null && chain.branchDebt != null && chain.branchDebt > 0 && (
        <RiskMeter>
          <RedemptionRunway
            debtInFront={chain.debtInFront}
            queueDebtTotal={chain.branchDebt}
            shareProv={forkLiveVocab(chain.protocol).queueShareProv(chain.symbol)}
            markerTitle="This trove's place in the branch's redemption queue — everything left of the marker is redeemed first"
          />
        </RiskMeter>
      )}
      <RiskMeter>
        <LiquityForkRunway chain={chain} />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
