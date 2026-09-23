// Fluid position → share-card model. The bridge between
// `loadFluidPositionTail`'s summary row (the same tail the position page
// itself awaits) and the shared card renderer — no second read, no live
// resolver call of our own (that lane stays client-side; see the loader's
// header comment).

import type { FluidPositionSummary } from "@/lib/sources/api/fluid-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { poolShareLabel } from "@/lib/fluid/asset-catalog";
import type { PositionCardModel } from "@/lib/share/position-card";

/** A leg's display name off the tail alone — the symbol when the roster names
 *  one, else the pool pair a smart leg's shares are of, else bare shares.
 *  Mirrors `fluidLegName` with no chain arm (this route has none). */
function legName(symbol: string | null, poolPair: [string, string] | null): string {
  return symbol ?? poolShareLabel(poolPair) ?? "DEX shares";
}

/** A leg's headline figure: the worker's settled overlay when it has landed,
 *  else the Σ replay — the same fallback `LegValue` applies without a live
 *  chain read. `null` when neither lane holds a positive amount, so the
 *  mapper omits the stat rather than asserting a zero. */
function legAmount(settled: string | null | undefined, sigma: string): number | null {
  const raw = settled ?? sigma;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function fluidShareCardModel(position: FluidPositionSummary | null, nftId: string): PositionCardModel | null {
  // No indexed row for this token id — `positionImage` degrades to the
  // static roster card rather than rendering an empty one.
  if (!position) return null;

  const supplyName = legName(position.supplySymbol, position.supplyPoolPair);
  const borrowName = legName(position.borrowSymbol, position.borrowPoolPair);
  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    // No ratio/health column here either, matching the detail card's own
    // stance: Fluid's risk figure gets its own strip (FluidRiskCard) rather
    // than a third column on this two-figure card.
    const supply = legAmount(position.settled?.supply, position.colNet);
    if (supply != null) stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(supply)} ${supplyName}` });
    const borrow = legAmount(position.settled?.borrow, position.debtNet);
    if (borrow != null) stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(borrow)} ${borrowName}` });
  } else {
    // Closed: the settled figures went to zero — the headline is each leg's
    // replayed lifetime peak, the same terminal frame the detail card draws.
    const peakCol = Number(position.peakCol);
    if (Number.isFinite(peakCol) && peakCol > 0) {
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(peakCol)} ${supplyName}` });
    }
    const peakDebt = Number(position.peakDebt);
    if (Number.isFinite(peakDebt) && peakDebt > 0) {
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(peakDebt)} ${borrowName}` });
    }
  }

  return {
    session: "fluid",
    subject: `#${nftId}`,
    status: position.status === "closed" ? (position.wasLiquidated ? "Liquidated" : "Closed") : "Open",
    stats,
    asOf: new Date(),
  };
}
