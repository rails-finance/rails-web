// Moonwell (Ethereum) position → share-card model. The bridge between
// `loadMoonwellPositionTail`'s `position` row (the same server tail the
// position page itself awaits) and the shared card renderer — no second
// read, no fetched prices of our own; `priceByAddress` already rides the
// row. No health-factor stat: the listing snapshot this row comes from
// carries none (that layer is the detail page's own live Comptroller read,
// see moonwell-position-card.tsx's header comment) — same as the live card.

import type {
  MoonwellPositionSummary,
  MoonwellSupplyAmount,
  MoonwellBorrowAmount,
  MoonwellPeakAmount,
} from "@/lib/sources/api/moonwell-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatUsd } from "@/lib/shared/format-event";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<MoonwellPositionSummary["status"], string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
  // No state recorded for the account yet (0018); never read as closed.
  unread: "Unread",
};

/** The figure a supply line asserts: the current value (interest included)
 *  when the chain read landed, the replayed principal otherwise — matches
 *  the card's own `supplyAmount`. */
function supplyAmount(r: MoonwellSupplyAmount): number {
  return r.current ?? r.principal;
}

/** On-chain oracle USD for one line; null when Moonwell didn't price it —
 *  mirrors the card's own `lineUsd`. */
function lineUsd(position: MoonwellPositionSummary, address: string, amount: number): number | null {
  const p = position.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Strict total — null the moment any contributing line is unpriced, the
 *  same guard the card's own `totalUsd` applies. */
function totalUsd(position: MoonwellPositionSummary, lines: { address: string; amount: number }[]): number | null {
  let sum = 0;
  let any = false;
  for (const l of lines) {
    if (l.amount <= 0) continue;
    const u = lineUsd(position, l.address, l.amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

function largestSupply(lines: MoonwellSupplyAmount[]): { symbol: string; amount: number } | null {
  let best: { symbol: string; amount: number } | null = null;
  for (const r of lines) {
    const amount = supplyAmount(r);
    if (amount > 0 && (!best || amount > best.amount)) best = { symbol: r.symbol, amount };
  }
  return best;
}

function largestPeak(lines: MoonwellPeakAmount[] | MoonwellBorrowAmount[]): { symbol: string; amount: number } | null {
  let best: { symbol: string; amount: number } | null = null;
  for (const r of lines) {
    if (r.amount > 0 && (!best || r.amount > best.amount)) best = { symbol: r.symbol, amount: r.amount };
  }
  return best;
}

export function moonwellShareCardModel(
  position: MoonwellPositionSummary | null,
  wallet: string,
): PositionCardModel | null {
  // No row for this wallet — `positionImage` degrades to the static roster
  // card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    const supplyLines = position.supplies.map((r) => ({ address: r.address, amount: supplyAmount(r) }));
    const collUsd = totalUsd(position, supplyLines);
    if (collUsd != null) {
      stats.push({ label: CARD_VOCAB.collateral, value: formatUsd(collUsd) });
    } else {
      const top = largestSupply(position.supplies);
      if (top) stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
    const debtUsd = totalUsd(position, position.borrows);
    if (debtUsd != null) {
      stats.push({ label: CARD_VOCAB.debt, value: formatUsd(debtUsd) });
    } else {
      const top = largestPeak(position.borrows);
      if (top) stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
  } else {
    // Closed/liquidated: current lines are empty by construction — the
    // highest-recorded per-market amounts are what `peakSupplies`/`peakBorrows`
    // carry.
    const topSupply = largestPeak(position.peakSupplies);
    if (topSupply) {
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}` });
    }
    const topDebt = largestPeak(position.peakBorrows);
    if (topDebt) {
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(topDebt.amount)} ${topDebt.symbol}` });
    }
  }

  return {
    session: "moonwell",
    subject: shortSubject(wallet),
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
