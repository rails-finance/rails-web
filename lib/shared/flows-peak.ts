// A closed account's peak value per side (rails-ops ui-jobs 803): the day the
// side's held assets, summed, were worth the most, each valued as the Lifetime
// flows model values that day (`FlowModel.heldAt`: the balance after its last
// event by then, grown by its index, times the day's price as shown, to the
// cent). One day's sum is a portfolio the account held; the per-asset peaks
// stand at different moments. A day on which a held asset has no price has no
// dollar figure (ui-jobs 743), so it is left out; ties keep the earliest day.
// Both sides come from one pass over the days. Imports types only, so
// scripts/test reads it directly.

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
  /** Held rows of the side that `keep` matched none of, by symbol: a key the
   *  card and the timeline spell differently shows here. */
  unmatched: string[];
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** `heldAt[stop]` is the model's held rows at the end of day `startDay +
 *  stop`. `keep[side]` limits a side to some assets (a card's collateral
 *  without the supplies that back no borrowing); absent, every row counts. */
export function sidePeaks(
  heldAt: readonly (readonly FlowAssetHeld[])[],
  startDay: number,
  keep: Partial<Record<FlowSide, (row: FlowAssetHeld) => boolean>> = {},
): Record<FlowSide, SidePeakResult> {
  const sides: FlowSide[] = ["collateral", "debt"];
  const out: Record<FlowSide, SidePeakResult> = {
    collateral: { peak: null, unpriced: [], unmatched: [] },
    debt: { peak: null, unpriced: [], unmatched: [] },
  };
  const unpriced = { collateral: new Set<string>(), debt: new Set<string>() };
  const unmatched = { collateral: new Set<string>(), debt: new Set<string>() };
  for (let stop = 0; stop < heldAt.length; stop++) {
    const rows: Record<FlowSide, FlowAssetHeld[]> = { collateral: [], debt: [] };
    let none: Record<FlowSide, boolean> = { collateral: false, debt: false };
    for (const r of heldAt[stop]) {
      if (!((r.amount ?? 0) > 0)) continue;
      const k = keep[r.side];
      if (k && !k(r)) {
        unmatched[r.side].add(r.symbol);
        continue;
      }
      rows[r.side].push(r);
      if (r.priced?.price == null) {
        none = { ...none, [r.side]: true };
        unpriced[r.side].add(r.symbol);
      }
    }
    for (const side of sides) {
      if (rows[side].length === 0 || none[side]) continue;
      const usd = rows[side].reduce((s, r) => cents(s + r.usd), 0);
      const best = out[side].peak;
      if (usd > 0 && (!best || usd > best.usd)) out[side].peak = { day: startDay + stop, usd, rows: rows[side] };
    }
  }
  for (const side of sides) {
    out[side].unpriced = [...unpriced[side]];
    out[side].unmatched = out[side].peak ? [] : [...unmatched[side]];
  }
  return out;
}
