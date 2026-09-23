"use client";

// The Dolomite position card's risk slot — both risk reads, always on, riding
// the card's heading-button row. (The Display menu is retired: one framing no
// longer hides behind the other.) Everything it draws is ON the card face and
// inside the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the collateralization runway (the account's own collateralisation
//     against its own requirement — the risk override's line where one is set)
//     — the spatial story, and
//   • the stated margin-ratio lines riding the same strip: the account's ratio vs its
//     requirement, adjusted debt's share of the account's borrow capacity, and
//     the capacity line itself.
//
// The per-market Supply/Borrow APR rows this slot's card used to carry live on
// the market view (/dolomite/markets, dolomite-markets-view.tsx) — pool-wide
// rate context belongs there, not repeated per account.

import { DolomiteRunway } from "@/components/protocol/dolomite/dolomite-runway";
import { DolomiteMarginView } from "@/components/protocol/dolomite/dolomite-margin-card";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import type { DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";

export function DolomiteRiskSlot({ chain }: { chain: DolomiteChainResponse }) {
  return (
    <RiskFooterStrip>
      <DolomiteMarginView chain={chain} />
      <RiskMeter>
        <DolomiteRunway
          compact
          collateralization={chain.collateralization}
          requiredCollateralization={chain.requiredCollateralization}
          overrideActive={chain.override.active}
        />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
