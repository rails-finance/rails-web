"use client";

// The Maker vault card's risk slot — both risk reads, always on, riding the
// card's heading-button row. (The Display menu is retired: one framing no
// longer hides behind the other.) Everything it draws is ON the card face and
// inside the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the price runway (how far the collateral can fall before the Vat's
//     safety line), with its liquidation-price / OSM-price caption traced —
//     the spatial story, and
//   • the stated collateral-ratio lines riding the same strip: collateral USD ÷ DAI debt
//     against the ilk's mat, borrowing headroom (with the dust floor), and the
//     ilk debt-ceiling context. Maker is CR-native — the ratio is collateral
//     USD ÷ DAI debt, and the ilk parameter it liquidates against (mat) IS a
//     collateral ratio.
//
// Maker vaults are not redeemable, so there is no redemption axis here
// (unlike the Liquity family).

import { MakerdaoRunway } from "@/components/protocol/makerdao/makerdao-runway";
import { MakerdaoCrCard } from "@/components/protocol/makerdao/makerdao-cr-card";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import type { MakerVaultView } from "@/components/protocol/makerdao/makerdao-vault-card";

export function MakerdaoRiskSlot({ v }: { v: MakerVaultView }) {
  return (
    <RiskFooterStrip>
      <MakerdaoCrCard v={v} />
      <RiskMeter>
        <MakerdaoRunway v={v} slot />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
