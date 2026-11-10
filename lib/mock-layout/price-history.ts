// The layout mock's share price history (Miles, 10 Nov 2026): fixed windows
// back from the latest stored read of the daily store. Pure.

import type { VaultYieldRead } from "@/lib/vaults/yield";

export interface PriceHistoryRow {
  id: string;
  label: string;
  /** The stored read the row names; null where the store holds none that far back. */
  read: VaultYieldRead | null;
  /** `latest / read − 1`, a fraction; null on the latest row or with no read. */
  change: number | null;
}

const WINDOWS = [
  { id: "1d", label: "1 day", days: 1 },
  { id: "1w", label: "1 week", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
] as const;

const SCALE = BigInt(10) ** BigInt(18);

const ratio = (from: VaultYieldRead, to: VaultYieldRead) =>
  Number((BigInt(to.raw) * SCALE) / BigInt(from.raw)) / Number(SCALE);

/** Latest, then each window: the newest read on or before `latest.day − days`.
 *  Empty where the series holds no read. `reads` is oldest first. */
export function priceHistoryRows(reads: readonly VaultYieldRead[]): PriceHistoryRow[] {
  if (reads.length === 0) return [];
  const latest = reads[reads.length - 1];
  const rows: PriceHistoryRow[] = [{ id: "latest", label: "Latest", read: latest, change: null }];
  for (const w of WINDOWS) {
    const target = latest.day - w.days;
    let read: VaultYieldRead | null = null;
    for (const r of reads) {
      if (r.day > target) break;
      read = r;
    }
    const change = read && BigInt(read.raw) > BigInt(0) ? ratio(read, latest) - 1 : null;
    rows.push({ id: w.id, label: w.label, read, change });
  }
  return rows;
}
