// Dolomite position → share-card model. The bridge between
// `loadDolomitePositionTail`'s summary row (the same tail the position page
// itself awaits) and the shared card renderer — no second read; the live
// per-account core read (the risk layer) stays client-side.

import type {
  DolomitePositionSummary,
  DolomitePositionStatus,
  DolomiteBalanceAmount,
  DolomitePeakAmount,
} from "@/lib/sources/api/dolomite-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatUsd } from "@/lib/shared/format-event";
import { formatCompact } from "@/lib/utils/format";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<DolomitePositionStatus, string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
};

const legAmount = (r: DolomiteBalanceAmount): number => r.current ?? r.par;

/** Oracle USD across one side, with the detail card's own strict guard: null
 *  the moment any contributing market is unpriced, so a partial total is
 *  never asserted. Mirrors `totalUsd` in dolomite-position-card.tsx. */
function totalUsd(lines: DolomiteBalanceAmount[], priceByMarket: Record<string, number>): number | null {
  let sum = 0;
  let any = false;
  for (const l of lines) {
    const amount = legAmount(l);
    if (amount <= 0) continue;
    const price = priceByMarket[String(l.marketId)];
    if (typeof price !== "number" || price <= 0) return null;
    sum += amount * price;
    any = true;
  }
  return any ? sum : null;
}

/** The single largest leg on a side, in token units — this card states one
 *  line per side rather than the detail card's per-market stack, so an
 *  unpriced side falls back to its biggest holding, the same judgement the
 *  aave-v3 mapper makes for a multi-reserve wallet. */
function largestLeg(lines: DolomiteBalanceAmount[]): { symbol: string; amount: number } | null {
  let best: { symbol: string; amount: number } | null = null;
  for (const l of lines) {
    const amount = legAmount(l);
    if (amount <= 0) continue;
    if (!best || amount > best.amount) best = { symbol: l.symbol, amount };
  }
  return best;
}

function largestPeak(lines: DolomitePeakAmount[]): { symbol: string; amount: number } | null {
  let best: { symbol: string; amount: number } | null = null;
  for (const l of lines) {
    if (l.amount <= 0) continue;
    if (!best || l.amount > best.amount) best = { symbol: l.symbol, amount: l.amount };
  }
  return best;
}

export function dolomiteShareCardModel(
  position: DolomitePositionSummary | null,
  subject: string,
): PositionCardModel | null {
  // No row for this (owner, accountNumber) pair — `positionImage` degrades to
  // the static roster card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    // No health column here either — Dolomite's card carries none: the risk
    // layer rides the detail page's live core read (runway + margin card),
    // never the snapshot this tail carries.
    const collUsd = totalUsd(position.supplies, position.priceByMarket);
    if (collUsd != null) {
      stats.push({ label: CARD_VOCAB.collateral, value: formatUsd(collUsd) });
    } else {
      const top = largestLeg(position.supplies);
      if (top) stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
    const debtUsd = totalUsd(position.borrows, position.priceByMarket);
    if (debtUsd != null) {
      stats.push({ label: CARD_VOCAB.debt, value: formatUsd(debtUsd) });
    } else {
      const top = largestLeg(position.borrows);
      if (top) stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
  } else {
    // Closed/liquidated: every par is back at zero — the highest recorded
    // per-market par is the headline instead, the same terminal frame the
    // detail card draws (no USD: the oracle prices the present, not history).
    const topSupply = largestPeak(position.peakSupplies);
    if (topSupply) {
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}` });
    }
    const topBorrow = largestPeak(position.peakBorrows);
    if (topBorrow) {
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(topBorrow.amount)} ${topBorrow.symbol}` });
    }
  }

  return {
    session: "dolomite",
    subject,
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
