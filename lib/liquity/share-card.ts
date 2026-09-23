// Liquity V2 → share-card models. The bridge between the server reads a page
// already makes and the shared card renderer — no second read, no second source
// of truth for what a trove or a wallet currently states.
//
//   • `liquityShareCardModel` — ONE trove, from `loadTroveTail` (the same tail
//     the trove page itself awaits).
//   • `liquityV2HolderCardModel` — a WALLET, from the holder strip's own
//     adapter (the same one the wallet view mounts above its cards).

import type { TroveTail } from "./trove-page-data";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatNumber, formatPrice } from "@/lib/utils/format";
import type { PositionCardModel } from "@/lib/share/position-card";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";
import { holderCardModel } from "@/lib/share/holder-card";
import { liquityV2HolderStrip } from "@/lib/liquity-v2/holder-strip";
import { positionNounPlural } from "@/lib/shared/protocols";

const STATUS_WORD: Record<string, string> = { open: "Open", closed: "Closed", liquidated: "Liquidated" };

/** Mirrors the trove page's own title truncation (`generateMetadata` in
 *  app/(app)/ethereum/liquity-v2/trove/[collateralType]/[troveId]/page.tsx) —
 *  a trove id is a full uint256, so the card states the same first 8
 *  characters the tab title and the page heading do. Exported so the trove's
 *  `event/[eventId]` route (its own `generateMetadata` and its
 *  `opengraph-image.tsx`) states the same shortened id rather than a third
 *  copy of this rule. */
export function truncateTroveId(troveId: string): string {
  return troveId.length > 8 ? `${troveId.slice(0, 8)}…` : troveId;
}

export function liquityShareCardModel(
  tail: TroveTail,
  params: { collateralType: string; troveId: string },
): PositionCardModel | null {
  const trove = tail.trove;
  // No trove recorded for this id — `positionImage` degrades to the
  // explorer's static roster card rather than rendering an empty one.
  if (!trove) return null;

  // Matches the page title's own display swap (WETH reads as "ETH" there).
  const collateralDisplay = params.collateralType === "WETH" ? "ETH" : params.collateralType;
  const stats: PositionCardModel["stats"] = [];

  if (trove.status === "open") {
    stats.push({ label: CARD_VOCAB.debt, value: `${formatPrice(trove.debt.current)} BOLD` });
    stats.push({
      label: CARD_VOCAB.collateral,
      value: `${formatNumber(trove.collateral.amount)} ${collateralDisplay}`,
    });
    if (trove.metrics.collateralRatio > 0) {
      stats.push({ label: ratioLabel("cdp"), value: `${trove.metrics.collateralRatio.toFixed(1)}%` });
    }
  } else {
    // Closed/liquidated troves hold nothing current — state the
    // highest-recorded figures over the trove's life instead, the same peak
    // vocabulary the position card itself falls back to.
    stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatPrice(trove.debt.peak)} BOLD` });
    stats.push({
      label: CARD_VOCAB.peakCollateral,
      value: `${formatNumber(trove.collateral.peakAmount)} ${collateralDisplay}`,
    });
  }

  return {
    session: "liquity-v2",
    subject: truncateTroveId(params.troveId),
    market: `${collateralDisplay}/BOLD`,
    status: STATUS_WORD[trove.status] ?? trove.status,
    stats,
    asOf: new Date(),
  };
}

/** The WALLET's card — what `/ethereum/liquity-v2?q=<holder>` unfurls as.
 *
 *  Built from the SAME adapter the wallet view mounts above its cards
 *  (`liquityV2HolderStrip`), so the card and the page can never state different
 *  totals: the legs' own value strings are carried across, nothing is re-summed
 *  here, and a wallet holding more than one page states its count and no
 *  totals, exactly as the strip does.
 *
 *  The nearest-floor stat names the BRANCH rather than the trove. On the page
 *  that label is a link a reader follows, so it carries the trove id; on a card
 *  there is nothing to follow, and a 6+4 slice of a uint256 identifies the
 *  trove to nobody while costing the line its width.
 *
 *  `null` — which the share route turns into the static roster card — for a
 *  wallet with no troves, and for an absent price read. The branch feeds are
 *  not an enhancement on this card: the three branches hold three different
 *  tokens, and a read that priced some of them and not the rest would leave the
 *  adapter summing the priced ones alone and labelling that the wallet's whole
 *  collateral. */
export function liquityV2HolderCardModel(
  rows: TroveSummary[],
  total: number,
  prices: OraclePricesData | null,
  perPage: number,
  subject: string,
): PositionCardModel | null {
  if (rows.length === 0 || !prices) return null;
  return holderCardModel(liquityV2HolderStrip(rows, total, prices, perPage), {
    session: "liquity-v2",
    subject,
    total,
    plural: positionNounPlural("liquity-v2"),
    // "rETH 0x1a2b…9f0c" → "rETH".
    nearestLabel: (label) => label.split(" ")[0],
  });
}
