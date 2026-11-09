// A holding's worth over time (rails-ops ui-jobs 553, door 1): one point a day,
// the holder's balance at each stored day's block times the vault's share price
// stored for that day, in the vault's asset. The balance is the replay of the
// holder's own transfers (the Lifetime flows rows, lib/vaults/vault-flows.ts),
// the price the daily store's `vault:<chain>:<address>` series
// (reference/daily-prices.md): one observation a day, a missing day left
// missing. The last point is the claim at the page's block. Drawn only where
// the replay equals `balanceOf` (the caller passes `replayed`). Imports nothing
// at runtime, so scripts/test reads it.

import type { VaultHolderEvent } from "@/lib/shared/vault-holder-timeline";
import type { VaultYieldRead } from "@/lib/vaults/yield";
import type { VaultHoldingHistory } from "@/lib/vaults/earned";

/** One day of the line: the worth at that day's stored block, raw asset units. */
export interface HoldingWorthPoint {
  day: number;
  block: number;
  raw: string;
}

/** The line and what its receipt names. `points` is empty where nothing can
 *  be drawn; `storeDay` is the series' first stored day. */
export interface HoldingWorthLine {
  key: string;
  points: HoldingWorthPoint[];
  storeDay: number | null;
}

/** The plain card's history: Earned and First seen, and the worth line; the
 *  line is null where the replay failed or the store did not answer. */
export interface PlainHoldingHistory extends VaultHoldingHistory {
  worth: HoldingWorthLine | null;
}

export function holdingWorthPoints(
  events: readonly VaultHolderEvent[],
  reads: readonly VaultYieldRead[],
  o: { shareDecimals: number; now: { day: number; block: number; claimRaw: string } | null },
): HoldingWorthPoint[] {
  const rows = [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  if (rows.length === 0) return [];
  const unit = BigInt(10) ** BigInt(o.shareDecimals);
  const points: HoldingWorthPoint[] = [];
  let i = -1;
  for (const r of [...reads].sort((a, b) => a.day - b.day)) {
    if (r.block < rows[0].blockNumber) continue;
    if (o.now && r.block > o.now.block) break;
    while (i + 1 < rows.length && rows[i + 1].blockNumber <= r.block) i++;
    const balance = BigInt(rows[i].balanceAfter);
    points.push({ day: r.day, block: r.block, raw: ((balance * BigInt(r.raw)) / unit).toString() });
  }
  if (o.now) {
    const last = points[points.length - 1];
    const today = { day: o.now.day, block: o.now.block, raw: o.now.claimRaw };
    if (last && last.day >= o.now.day) points[points.length - 1] = today;
    else points.push(today);
  }
  return points;
}
