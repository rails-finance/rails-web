// f(x) Protocol position → share-card model. The bridge between
// `loadFxPositionTail`'s summary row (the same tail the position page itself
// awaits) and the shared card renderer — no second read, no oracle price of
// our own.

import type { FxPositionSummary } from "@/lib/sources/api/fx-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import type { PositionCardModel } from "@/lib/share/position-card";

export function fxShareCardModel(position: FxPositionSummary | null, subject: string): PositionCardModel | null {
  // No summary row for this pool/id — `positionImage` degrades to the static
  // roster card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "closed") {
    // The settled lane has emptied and the summary carries no peak aggregate
    // — the detail card's own terminal frame states the LAST settled read,
    // not a lifetime high, so this card does the same.
    if (position.settled.colls != null) {
      stats.push({
        label: CARD_VOCAB.finalCollateral,
        value: `${formatCompact(position.settled.colls)} ${position.normalizedSymbol}`,
      });
    }
    if (position.settled.debts != null) {
      stats.push({ label: CARD_VOCAB.finalDebt, value: `${formatCompact(position.settled.debts)} fxUSD` });
    }
  } else {
    // Settled getPosition read — rate-normalized units, labeled with the
    // normalized symbol, mirroring the detail card's own headline (the
    // deposit-token amount never appears here).
    if (position.settled.colls != null) {
      stats.push({
        label: CARD_VOCAB.collateral,
        value: `${formatCompact(position.settled.colls)} ${position.normalizedSymbol}`,
      });
    }
    if (position.settled.debts != null) {
      stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(position.settled.debts)} fxUSD` });
    }
    // f(x)'s own risk figure is a debt ratio, not a collateral ratio — the
    // detail card keeps its own label rather than borrowing the shared CDP
    // one, and this card matches it verbatim.
    if (position.settled.debtRatio != null) {
      stats.push({ label: "Debt ratio", value: `${(position.settled.debtRatio * 100).toFixed(1)}%` });
    }
  }

  const status =
    position.status === "closed"
      ? position.everLiquidated
        ? "Liquidated"
        : "Closed"
      : position.status === "open"
        ? "Open"
        : "Unsettled";

  return {
    // No `market` here — the page's own `generateMetadata` doesn't pass one
    // either, and the pool already rides the subject slug ("wsteth-416").
    session: "fx",
    subject,
    status,
    stats,
    asOf: new Date(),
  };
}
