"use client";

// The Maker vault card's panel (ui-jobs 322): the stability fee and the ilk's
// minimum ratio on the left; where the live overlay landed, the price the
// Vat's safety line is crossed at, the room left to borrow before the minimum,
// and a switched-off auction contract on the right. Every row is a label and a
// value with its "?" tip; the price bar the card used to draw leaves, and its
// figure stays as "Liquidates at".
//
// Maker vaults are not redeemable, so there is no redemption row (unlike the
// Liquity family).

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import type { PositionPanelColumns, PositionPanelRow } from "@/components/shared/position-card";
import { usdPrice } from "@/lib/makerdao/price-format";
import {
  matProv,
  borrowHeadroomProv,
  liquidationPriceProv,
  stabilityFeeAprProv,
} from "@/lib/makerdao/event-provenance";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { formatExact, formatNumber } from "@/lib/utils/format";
import { formatCompact, formatCompactUsd } from "@/lib/shared/format-compact";
import type { MakerVaultView } from "./makerdao-vault-card";

/** A minimum ratio at its own grain: 175%, 145%, 172.5%. */
const pctWhole = (m: number): string => `${Number((m * 100).toFixed(2))}%`;

/** The Clipper's breaker in one sentence. */
const auctionsOffTip = (v: MakerVaultView): string =>
  `Governance has switched ${v.ilk}'s auctions off: its auction contract refuses new auctions` +
  `${(v.auction?.stopped ?? 0) >= 3 ? " and bids" : ""}, so for now a vault under the minimum is not sold.`;

/** The panel's rows for an open vault. The live overlay supplies every row;
 *  on the replay summary alone the panel is empty and draws nothing. */
export function makerdaoPanelColumns(v: MakerVaultView): PositionPanelColumns {
  // DAI on CdpManager vaults, USDS on LockStake urns (asset-catalog).
  const dsym = ilkDebtSymbol(v.ilk);
  const left: PositionPanelRow[] = [];
  const right: PositionPanelRow[] = [];

  if (v.stabilityFeeApr != null)
    left.push({
      id: "stability-fee",
      label: "Stability fee",
      value: <Prov info={stabilityFeeAprProv(v.ilk)}>{(v.stabilityFeeApr * 100).toFixed(2)}%</Prov>,
      tip: `The yearly rate ${v.ilk} debt grows at: the Jug's per-second fee, read from the chain at the latest block and compounded over a year. Governance can change it.`,
    });
  if (v.matRatio != null)
    left.push({
      id: "minimum-ratio",
      label: "Minimum ratio",
      value: <Prov info={matProv(v.ilk)}>{pctWhole(v.matRatio)}</Prov>,
      tip: `The collateral ratio ${v.ilk} vaults must keep: the Spotter's liquidation ratio for the collateral type, read from the chain. Below it the vault can be liquidated.`,
    });

  if (v.liquidationPriceUsd != null && v.liquidationPriceUsd > 0)
    right.push({
      id: "liquidates-at",
      label: "Liquidates at",
      value: (
        <Prov
          info={liquidationPriceProv(
            v.debtDai != null ? `${formatNumber(v.debtDai)} ${dsym}` : "—",
            v.matRatio != null ? `${(v.matRatio * 100).toFixed(0)}%` : "—",
            `${formatNumber(v.ink)} ${v.collateralSymbol}`,
          )}
        >
          {usdPrice(v.liquidationPriceUsd, formatCompactUsd)}
        </Prov>
      ),
      tip: `The ${v.collateralSymbol} price at which the vault crosses the Vat's safety line: its debt times the minimum ratio, divided by its collateral. Below it the vault can be liquidated.`,
    });

  // Meaningful only for an open vault with debt and the live overlay landed.
  if (
    v.source === "chain" &&
    v.status === "open" &&
    v.debtDai != null &&
    v.debtDai > 0 &&
    v.collateralUsd != null &&
    v.collateralUsd > 0 &&
    v.matRatio != null
  ) {
    // How much more the vault could draw before crossing the ilk's minimum.
    const headroom = Math.max(0, v.collateralUsd / v.matRatio - v.debtDai);
    right.push({
      id: "room-to-borrow",
      label: "Room to borrow",
      value: <Prov info={borrowHeadroomProv(pct(v.matRatio))}>{formatCompact(headroom)}</Prov>,
      asset: { symbol: dsym, figure: `${formatExact(headroom)} ${dsym}` },
      tip: `The ${dsym} the vault could still draw before its collateral ratio falls to the ${pctWhole(v.matRatio)} minimum: the collateral's value divided by the minimum, less the debt.`,
    });
  }

  if (v.auction != null && v.auction.stopped > 0)
    right.push({
      id: "auctions",
      label: "Auctions",
      value: "Off",
      tip: auctionsOffTip(v),
    });

  return [left, right];
}
