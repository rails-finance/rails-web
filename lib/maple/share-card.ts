// Maple position → share-card model. The bridge between
// `loadMaplePositionTail`'s `position` row (the same server tail the position
// page itself awaits) and the shared card renderer — no second read.
//
// A Maple lender carries one axis (pool claim), never a debt/ratio pair — the
// live card's own header comment says so (no liquidation surface, so no
// health column) — so this states `CARD_VOCAB.supply`/`peakSupply` only.
// Pools have no oracle price on this row (`MaplePoolAmount` carries none), so
// the stat states the largest live pool's own asset amount rather than a
// summed USD total, mirroring the largest-reserve fallback the other pooled
// mappers in this batch use when a total can't be priced.

import type { MaplePositionSummary, MaplePoolAmount, MaplePeakAmount } from "@/lib/sources/api/maple-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<MaplePositionSummary["status"], string> = {
  open: "Open",
  closed: "Closed",
};

/** The figure a claim line asserts: the current redeemable value (exit rate,
 *  interest included) when the chain read landed, the replayed principal
 *  otherwise — matches the card's own `claimAmount`. */
function claimAmount(p: MaplePoolAmount): number {
  return p.currentValue ?? p.depositedPrincipal;
}

export function mapleShareCardModel(position: MaplePositionSummary | null, wallet: string): PositionCardModel | null {
  // No row for this wallet — `positionImage` degrades to the static roster
  // card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    let best: { amount: number; symbol: string } | null = null;
    for (const p of position.pools) {
      const amount = claimAmount(p);
      if (amount > 0 && (!best || amount > best.amount)) best = { amount, symbol: p.assetSymbol };
    }
    if (best) stats.push({ label: CARD_VOCAB.supply, value: `${formatCompact(best.amount)} ${best.symbol}` });
  } else {
    // Closed: no live shares remain — the highest recorded PER-POOL share
    // balance is what `peakPools` carries. Stated in the pool's own share
    // token (not the underlying asset): valuing a past holding at today's
    // exit rate would price it at a rate that never applied to it, the same
    // reason the live card's own PeakStack asserts no asset value here.
    let best: MaplePeakAmount | null = null;
    for (const p of position.peakPools) {
      if (p.peakShares > 0 && (!best || p.peakShares > best.peakShares)) best = p;
    }
    if (best) stats.push({ label: CARD_VOCAB.peakSupply, value: `${formatCompact(best.peakShares)} ${best.symbol}` });
  }

  return {
    session: "maple",
    subject: shortSubject(wallet),
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
