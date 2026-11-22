// A closed account's peak value per side (rails-ops ui-jobs 803): the day the
// side's held assets, summed, were worth the most, each valued as the Lifetime
// flows model values that day (`FlowModel.heldAt`: the balance after its last
// event by then, grown by its index, times the day's price as shown, to the
// cent). One day's sum is a portfolio the account held; the per-asset peaks
// stand at different moments. A day on which a held asset has no price has no
// dollar figure (ui-jobs 743), so it is left out; ties keep the earliest day.
// Imports types only, so scripts/test reads it directly.

import type { FlowAssetHeld, FlowSide } from "@/lib/shared/flows-timeline";

export interface SidePeak {
  /** UTC day number (unix seconds / 86400). */
  day: number;
  /** The side's held value that day, to the cent. */
  usd: number;
  /** The side's held rows that day, for the receipt. */
  rows: FlowAssetHeld[];
}

export interface SidePeakResult {
  peak: SidePeak | null;
  /** Assets that left a day with no dollar figure, where any did. */
  unpriced: string[];
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** `heldAt[stop]` is the model's held rows at the end of day `startDay +
 *  stop`. `keep` limits the side to some assets (a card's collateral without
 *  the supplies that back no borrowing), by symbol. */
export function sidePeak(
  heldAt: readonly (readonly FlowAssetHeld[])[],
  startDay: number,
  side: FlowSide,
  keep?: (symbol: string) => boolean,
): SidePeakResult {
  let peak: SidePeak | null = null;
  const unpriced = new Set<string>();
  for (let stop = 0; stop < heldAt.length; stop++) {
    const rows = heldAt[stop].filter((r) => r.side === side && (r.amount ?? 0) > 0 && (!keep || keep(r.symbol)));
    if (rows.length === 0) continue;
    const none = rows.filter((r) => r.priced?.price == null);
    if (none.length > 0) {
      for (const r of none) unpriced.add(r.symbol);
      continue;
    }
    const usd = rows.reduce((s, r) => cents(s + r.usd), 0);
    if (!(usd > 0)) continue;
    if (!peak || usd > peak.usd) peak = { day: startDay + stop, usd, rows };
  }
  return { peak, unpriced: [...unpriced] };
}
