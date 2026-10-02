"use client";

// The Maker vault card's opened layer under Collateral ratio (ui-jobs 209),
// from the page's live overlay and inside the card's receipts scope: the price
// bar (how far the collateral can fall before the Vat's safety line; the
// card's "Liquidates at" line above it states the price), and the room left to
// borrow before the ilk's minimum ratio (mat). The minimum debt, the ilk's
// debt ceiling and the OSM price are stated in the card's Explanation.
//
// Maker vaults are not redeemable, so there is no redemption axis here
// (unlike the Liquity family).

import { Prov } from "@/components/shared/provenance";
import { RiskFigure } from "@/components/shared/risk-footer-strip";
import { AmountText } from "@/components/shared/amount-text";
import { pct } from "@/components/shared/ratio-bar";
import { matProv, borrowHeadroomProv } from "@/lib/makerdao/event-provenance";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { MakerdaoRunway } from "./makerdao-runway";
import type { MakerVaultView } from "./makerdao-vault-card";

/** A minimum ratio at its own grain: 175%, 145%, 172.5%. */
const pctWhole = (m: number): string => `${Number((m * 100).toFixed(2))}%`;

export function MakerdaoRiskDetail({ v }: { v: MakerVaultView }) {
  // Meaningful only for an open vault with debt and the live overlay landed
  // (the replay summary can't supply mat) — decline, never guess.
  if (
    v.source !== "chain" ||
    v.status !== "open" ||
    v.debtDai == null ||
    v.debtDai <= 0 ||
    v.collateralUsd == null ||
    v.collateralUsd <= 0 ||
    v.matRatio == null
  )
    return null;
  // DAI on CdpManager vaults, USDS on LockStake urns (asset-catalog).
  const dsym = ilkDebtSymbol(v.ilk);
  // Headroom to the mat line: how much more the vault could draw before
  // crossing the ilk's minimum collateralization.
  const headroomDai = Math.max(0, v.collateralUsd / v.matRatio - v.debtDai);
  return (
    <div className="mt-1.5 max-w-72 space-y-1">
      <MakerdaoRunway v={v} />
      <RiskFigure alignStart>
        <Prov info={borrowHeadroomProv(pct(v.matRatio))}>
          <AmountText value={headroomDai} format="compact" /> {dsym}
        </Prov>{" "}
        more to the <Prov info={matProv(v.ilk)}>{pctWhole(v.matRatio)}</Prov> minimum
      </RiskFigure>
    </div>
  );
}
