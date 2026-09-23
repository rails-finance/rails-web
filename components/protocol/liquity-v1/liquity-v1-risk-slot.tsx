"use client";

// The Liquity V1 Trove card's risk slot — both risk reads, always on, riding
// the card's heading-button row. (The Display menu is retired: one framing no
// longer hides behind the other.) Everything it draws is ON the card face and
// inside the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the price runway (how far ETH can fall before the 110% minimum), with
//     its liquidation-price / oracle-price caption traced — the spatial story,
//     and
//   • the stated collateral-ratio lines riding the same strip: the contract's own
//     getCurrentICR against the MCR (and CCR in recovery mode), borrowing
//     headroom, and the system ratio. Liquity is CR-native — collateral ratio
//     IS its own framing.
//
// The redemption runway rides alongside always: it is an ORTHOGONAL axis
// (queue position, not a reframing of price-fall risk). It carries the
// queue-share receipt; the redemption card's other figures (fees, the absolute
// debt-in-front) were protocol-wide context and live on the system view — the
// position card keeps only its own redemption exposure.

import { LiquityV1Runway } from "@/components/protocol/liquity-v1/liquity-v1-runway";
import { LiquityV1CrCard } from "@/components/protocol/liquity-v1/liquity-v1-cr-card";
import { RedemptionRunway } from "@/components/shared/redemption-runway";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import { queueShareProv } from "@/lib/liquity-v1/position-provenance";
import type { LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";

export function LiquityV1RiskSlot({ chain }: { chain: LiquityV1PositionChainResponse }) {
  // Figures → RedemptionRunway → price runway: the V2 reference order.
  return (
    <RiskFooterStrip>
      <LiquityV1CrCard chain={chain} />
      {/* Redemption runway — the orthogonal queue axis, always shown (debt in
          front ÷ the sorted list's total). */}
      {chain.debtInFront != null && chain.queueDebtTotal != null && chain.queueDebtTotal > 0 && (
        <RiskMeter>
          <RedemptionRunway
            debtInFront={chain.debtInFront}
            queueDebtTotal={chain.queueDebtTotal}
            shareProv={queueShareProv()}
            markerTitle="This Trove's place in the redemption queue — everything left of the marker is redeemed first"
          />
        </RiskMeter>
      )}
      <RiskMeter>
        <LiquityV1Runway chain={chain} slot />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
