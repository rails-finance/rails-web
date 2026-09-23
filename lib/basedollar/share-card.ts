// Basedollar Trove → share-card model. The bridge between
// `loadBasedollarTroveTail` (the same server tail the trove page itself
// awaits) and the shared card renderer — no second read, no second source of
// truth for what this trove currently states.
//
// Mirrors `lib/liquity/share-card.ts` (Liquity V2's own mapper): every Trove
// on this branch renders through the SAME shared card
// (components/protocol/liquity-family/liquity-position-card.tsx), so the
// stat choice, units and status words below are literally the ones that
// component draws, not a second reading of them.

import type { ForkTroveTail } from "@/lib/shared/liquity-fork-trove-page-data";
import type { BasedollarTroveSummary } from "@/lib/sources/api/basedollar-troves";
import { DEBT_SYMBOL, shortId } from "@/lib/basedollar/asset-catalog";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatNumber, formatPrice } from "@/lib/utils/format";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<BasedollarTroveSummary["status"], string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
};

export function basedollarShareCardModel(
  tail: ForkTroveTail<BasedollarTroveSummary>,
  params: { collateralType: string; troveId: string },
): PositionCardModel | null {
  const trove = tail.trove;
  // No trove recorded for this (branch, id) — `positionImage` degrades to the
  // explorer's static roster card rather than rendering an empty one.
  if (!trove) return null;

  const stats: PositionCardModel["stats"] = [];

  if (trove.status === "open") {
    stats.push({ label: CARD_VOCAB.debt, value: `${formatPrice(trove.debt)} ${DEBT_SYMBOL}` });
    stats.push({ label: CARD_VOCAB.collateral, value: `${formatNumber(trove.collateral)} ${trove.collateralType}` });
    // The row's own `collateralRatio` is a RATIO (coll×price÷debt), not a
    // percent — the card's `viewFromForkSummary` scales it ×100 before it
    // ever reaches a column, and this mapper does the same rather than
    // reading the raw field as if it already were one.
    if (trove.collateralRatio != null && trove.collateralRatio > 0) {
      stats.push({ label: ratioLabel("cdp"), value: `${(trove.collateralRatio * 100).toFixed(1)}%` });
    }
  } else {
    // Closed/liquidated troves hold nothing current — state the
    // highest-recorded figures over the trove's life instead, the same peak
    // vocabulary the position card itself falls back to.
    stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatPrice(trove.peakDebt)} ${DEBT_SYMBOL}` });
    stats.push({
      label: CARD_VOCAB.peakCollateral,
      value: `${formatNumber(trove.peakCollateral)} ${trove.collateralType}`,
    });
  }

  return {
    session: "basedollar",
    subject: shortId(params.troveId),
    // Matches the page's own `generateMetadata` exactly — the branch symbol
    // alone, not paired with the debt symbol the way V2's "ETH/BOLD" is.
    market: params.collateralType,
    status: STATUS_WORD[trove.status] ?? trove.status,
    stats,
    asOf: new Date(),
  };
}
