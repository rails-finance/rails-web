// Aave V3 position → share-card model. The bridge between
// `loadAaveV3PositionTail`'s `position` row (the same server tail the
// position page itself awaits) and the shared card renderer — no second
// read, no fetched prices of our own.

import type { AaveV3PositionRow, AaveV3ReserveSummary } from "@/lib/api/fetch-aave-v3-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<AaveV3PositionRow["status"], string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
  // No state recorded for the account yet (0018); never read as closed.
  unread: "Unread",
};

/** The single largest reserve on one side, in display units — the card's
 *  headline. A listing row carries no USD totals or health factor (0018), so
 *  the card states the token amount. */
function largestReserve(
  reserves: AaveV3ReserveSummary[],
  raw: (r: AaveV3ReserveSummary) => string,
): { symbol: string; amount: number } | null {
  let best: { symbol: string; amount: number } | null = null;
  for (const r of reserves) {
    const rawValue = raw(r);
    if (!rawValue || rawValue === "0") continue;
    let wei: bigint;
    try {
      wei = BigInt(rawValue.split(".")[0]);
    } catch {
      continue;
    }
    const amount = Number(wei) / 10 ** r.decimals;
    if (amount <= 0) continue;
    if (!best || amount > best.amount) best = { symbol: r.symbol, amount };
  }
  return best;
}

export function aaveV3ShareCardModel(position: AaveV3PositionRow | null, wallet: string): PositionCardModel | null {
  // No row for this (wallet, market) — `positionImage` degrades to the
  // static roster card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    const topSupply = largestReserve(position.reserves, (r) => r.supplyBalanceRaw);
    if (topSupply) {
      stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}` });
    }
    const topDebt = largestReserve(position.reserves, (r) => r.debtBalanceRaw);
    if (topDebt) stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(topDebt.amount)} ${topDebt.symbol}` });
  } else {
    // Closed/liquidated: current reserves are empty by construction — the
    // highest-recorded per-reserve amounts are what `peakReserves` carries.
    const topSupply = largestReserve(position.peakReserves, (r) => r.supplyBalanceRaw);
    if (topSupply) {
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}` });
    }
    const topDebt = largestReserve(position.peakReserves, (r) => r.debtBalanceRaw);
    if (topDebt) {
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(topDebt.amount)} ${topDebt.symbol}` });
    }
  }

  return {
    session: "aave-v3",
    subject: shortSubject(wallet),
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
