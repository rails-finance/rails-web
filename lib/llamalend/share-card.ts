// LlamaLend position → share-card model. The bridge between
// `loadLlamalendPositionTail`'s summary row (the same tail the position page
// itself awaits) and the shared card renderer — no second read; the live
// Controller read that carries the soft-liquidation band stays client-side.

import type { LlamalendPositionSummary, LlamalendPositionStatus } from "@/lib/sources/api/llamalend-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatUsd } from "@/lib/shared/format-event";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<LlamalendPositionStatus, string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
};

export function llamalendShareCardModel(
  position: LlamalendPositionSummary | null,
  user: string,
): PositionCardModel | null {
  // No row for this (controller, user) pair — `positionImage` degrades to the
  // static roster card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    // USD only on crvUSD-borrowed markets, same gate the detail card's own
    // headline applies; every other market states its own token stack.
    if (position.collateralUsd != null && position.collateral != null && position.collateral > 0) {
      stats.push({ label: CARD_VOCAB.collateral, value: formatUsd(position.collateralUsd) });
    } else if (position.collateral != null && position.collateral > 0) {
      stats.push({
        label: CARD_VOCAB.collateral,
        value: `${formatCompact(position.collateral)} ${position.collateralSymbol}`,
      });
    }
    // `collateral == null` (the controller's unstated sentinel) and a fully
    // converted holding (0 left as collateral) both draw non-numeric text on
    // the detail card — this card asserts no number there, so it omits the
    // stat rather than restating that text as if it were a figure.

    if (position.debtUsd != null && position.debt > 0) {
      stats.push({ label: CARD_VOCAB.debt, value: formatUsd(position.debtUsd) });
    } else if (position.debt > 0) {
      stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(position.debt)} ${position.borrowedSymbol}` });
    }

    // No health factor here — LlamaLend's card carries no ratio column at
    // all. Its distinctive third column is the soft-liquidation state: the
    // amount the AMM has already converted, present only while it is live.
    if (position.inSoftLiq && position.converted != null && position.converted > 0) {
      stats.push({
        label: "In soft-liquidation",
        value: `${formatCompact(position.converted)} ${position.borrowedSymbol}`,
      });
    }
  } else {
    // Closed/liquidated: the last emitted absolutes, usually back at zero —
    // the API carries no peak figures, so the terminal card never claims
    // "Highest recorded", matching the detail card's own labels.
    if (position.collateral != null && position.collateral > 0) {
      stats.push({
        label: CARD_VOCAB.finalCollateral,
        value: `${formatCompact(position.collateral)} ${position.collateralSymbol}`,
      });
    }
    if (position.debt > 0) {
      stats.push({ label: CARD_VOCAB.finalDebt, value: `${formatCompact(position.debt)} ${position.borrowedSymbol}` });
    }
  }

  return {
    session: "llamalend",
    subject: shortSubject(user),
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
