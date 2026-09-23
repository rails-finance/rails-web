// SparkLend position → share-card model. The bridge between
// `loadSparkPositionTail`'s `position` row (the same server tail the position
// page itself awaits) and the shared card renderer — no second read, no
// fetched prices of our own; `priceByAddress` already rides the row.

import type { SparkPositionSummary, SparkReserveAmount } from "@/lib/sources/api/spark-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatUsd } from "@/lib/shared/format-event";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<SparkPositionSummary["status"], string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
};

/** On-chain oracle USD for one reserve; null when SparkLend didn't price it —
 *  mirrors the card's own `reserveUsd`. */
function reserveUsd(position: SparkPositionSummary, address: string, amount: number): number | null {
  const p = position.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Strict total — null the moment any contributing reserve is unpriced, the
 *  same guard the card's own `totalUsd` applies (a partial total is never
 *  asserted). */
function totalUsd(position: SparkPositionSummary, reserves: SparkReserveAmount[]): number | null {
  let sum = 0;
  let any = false;
  for (const r of reserves) {
    if (r.amount <= 0) continue;
    const u = reserveUsd(position, r.address, r.amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

function largest(reserves: SparkReserveAmount[]): SparkReserveAmount | null {
  let best: SparkReserveAmount | null = null;
  for (const r of reserves) {
    if (r.amount > 0 && (!best || r.amount > best.amount)) best = r;
  }
  return best;
}

export function sparkShareCardModel(position: SparkPositionSummary | null, wallet: string): PositionCardModel | null {
  // No row for this wallet — `positionImage` degrades to the static roster
  // card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    const collUsd = totalUsd(position, position.supplies);
    if (collUsd != null) {
      stats.push({ label: CARD_VOCAB.collateral, value: formatUsd(collUsd) });
    } else {
      const top = largest(position.supplies);
      if (top) stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
    const debtUsd = totalUsd(position, position.borrows);
    if (debtUsd != null) {
      stats.push({ label: CARD_VOCAB.debt, value: formatUsd(debtUsd) });
    } else {
      const top = largest(position.borrows);
      if (top) stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
    // No health factor on the card: a listing row carries none (0018).
  } else {
    // Closed/liquidated: current reserves are empty by construction — the
    // highest-recorded per-reserve amounts are what `peakSupplies`/`peakBorrows`
    // carry.
    const topSupply = largest(position.peakSupplies);
    if (topSupply) {
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}` });
    }
    const topDebt = largest(position.peakBorrows);
    if (topDebt) {
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(topDebt.amount)} ${topDebt.symbol}` });
    }
  }

  return {
    session: "spark",
    subject: shortSubject(wallet),
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
