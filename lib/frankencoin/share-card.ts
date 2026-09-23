// Frankencoin position → share-card model. The bridge between
// `loadFrankencoinPositionTail`'s indexed summary (the same tail the position
// page itself awaits) and the shared card renderer — no second read, no
// chain-lane numbers of our own.

import type { FrankencoinPositionSummary, FrankencoinPositionStatus } from "@/lib/sources/api/frankencoin-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<FrankencoinPositionStatus, string> = {
  open: "Open",
  closed: "Closed",
  denied: "Denied",
};

export function frankencoinShareCardModel(position: FrankencoinPositionSummary | null): PositionCardModel | null {
  // No indexed row for this contract — `positionImage` degrades to the
  // static roster card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    // No ratio column, matching the detail card's own stance: Frankencoin
    // carries no health factor and none is invented here either — the
    // challenge count and the declared liquidation price are its risk
    // grammar, not a third stat on this card.
    if (position.collateral != null && position.collateral > 0) {
      stats.push({
        label: CARD_VOCAB.collateral,
        value: `${formatCompact(position.collateral)} ${position.collateralSymbol}`,
      });
    }
    // Minted ZCHF IS the debt — the card states it under the shared Debt
    // label, same as the detail card.
    if (position.minted > 0) {
      stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(position.minted)} ZCHF` });
    }
  } else {
    // Closed/denied: the latest absolutes are back at zero (or never existed
    // for a denied challenge) — the lifetime maxima the index carries are the
    // headline instead, the same terminal frame the detail card draws.
    if (position.peakCollateral != null && position.peakCollateral > 0) {
      stats.push({
        label: CARD_VOCAB.peakCollateral,
        value: `${formatCompact(position.peakCollateral)} ${position.collateralSymbol}`,
      });
    }
    if (position.peakMinted != null && position.peakMinted > 0) {
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(position.peakMinted)} ZCHF` });
    }
  }

  return {
    session: "frankencoin",
    subject: shortSubject(position.position),
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
