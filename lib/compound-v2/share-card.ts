// Compound V2 position → share-card model. The bridge between
// `loadCompoundV2PositionTail`'s `position` row (the same server tail the
// position page itself awaits) and the shared card renderer — no second
// read, no fetched prices of our own.
//
// A Compound V2 account is cross-collateralised across the twenty listed
// markets — many supplies, many borrows, one oracle-USD total per side when
// every contributing market is priced (`compound-v2-position-card.tsx`'s own
// strict guard: null the moment one leg is unpriced). The largest single
// market stands in for a side the card shows no USD total for, reusing the
// Compound V3 mapper's `largestCompoundAsset`.

import type { CompoundV2PositionSummary } from "@/lib/sources/api/compound-v2-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatUsd } from "@/lib/shared/format-event";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import { largestCompoundAsset, type CompoundAssetLike } from "@/lib/compound/share-card";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<CompoundV2PositionSummary["status"], string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
};

/** The figure a supply line asserts — current value (interest included) when
 *  the chain read landed, the replayed principal otherwise. Mirrors
 *  `supplyAmount` in compound-v2-position-card.tsx. */
const supplyAmount = (r: CompoundV2PositionSummary["supplies"][number]): number => r.current ?? r.principal;

/** On-chain oracle USD for one market's line; null when Compound didn't price
 *  it. Mirrors `lineUsd`. */
function lineUsd(position: CompoundV2PositionSummary, market: string, amount: number): number | null {
  const p = position.priceByMarket?.[market];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Total USD across one side, null the moment any contributing market is
 *  unpriced — the same strict guard `totalUsd` applies on the live card. */
function totalUsd(position: CompoundV2PositionSummary, lines: { market: string; amount: number }[]): number | null {
  let sum = 0;
  let any = false;
  for (const l of lines) {
    if (l.amount <= 0) continue;
    const u = lineUsd(position, l.market, l.amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

export function compoundV2ShareCardModel(
  position: CompoundV2PositionSummary | null,
  wallet: string,
): PositionCardModel | null {
  // No row for this wallet — `positionImage` degrades to the static roster
  // card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    const collUsd = totalUsd(
      position,
      position.supplies.map((r) => ({ market: r.market, amount: supplyAmount(r) })),
    );
    if (collUsd != null) {
      stats.push({ label: CARD_VOCAB.collateral, value: formatUsd(collUsd) });
    } else {
      const assets: CompoundAssetLike[] = position.supplies.map((r) => ({ symbol: r.symbol, amount: supplyAmount(r) }));
      const top = largestCompoundAsset(assets);
      if (top) stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }

    const debtUsd = totalUsd(
      position,
      position.borrows.map((r) => ({ market: r.market, amount: r.amount })),
    );
    if (debtUsd != null) {
      stats.push({ label: CARD_VOCAB.debt, value: formatUsd(debtUsd) });
    } else {
      const assets: CompoundAssetLike[] = position.borrows.map((r) => ({ symbol: r.symbol, amount: r.amount }));
      const top = largestCompoundAsset(assets);
      if (top) stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
  } else {
    // Closed/liquidated: no open markets remain — the highest-recorded
    // per-market lines are what `peakSupplies`/`peakBorrows` carry. Token
    // amounts only, no USD, matching the detail card's own closed layout.
    const topSupply = largestCompoundAsset(position.peakSupplies);
    if (topSupply)
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}` });
    const topDebt = largestCompoundAsset(position.peakBorrows);
    if (topDebt)
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(topDebt.amount)} ${topDebt.symbol}` });
  }

  return {
    session: "compound-v2",
    subject: shortSubject(wallet),
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
