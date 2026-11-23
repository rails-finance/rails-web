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
   *  card and the timeline spell differently shows here, as do assets the
   *  card leaves out on purpose. */
  unmatched: string[];
  /** The timeline's events stated a balance on the side for one of the
   *  card's assets: the evidence that the side was held, at a close or
   *  within a day. A day row states the balance after the day's last event,
   *  so a side opened and emptied within a day is stated at 0. */
  stated: boolean;
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** What a side's head states: its peak; no dollar figure, where every day it
 *  held something had an unpriced asset; held within a day, where the
 *  timeline's events state a balance for one of the card's assets on the
 *  side (`SidePeakResult.stated`) but no day's close holds it; or nothing
 *  recorded, where they state none. */
export function peakState(r: SidePeakResult): "peak" | "unpriced" | "within-day" | "not-recorded" {
  if (r.peak) return "peak";
  if (r.unpriced.length > 0) return "unpriced";
  return r.stated ? "within-day" : "not-recorded";
}

/** One asset a closed side lists: its symbol, and its key in the timeline
 *  where the card knows it (a reserve's address, a cToken or Dolomite
 *  market). */
export interface PeakAssetKey {
  symbol: string;
  key?: string | null;
}

/** Which held rows are the card's: by the timeline's key where the card
 *  passes keys, so two markets sharing a symbol stay apart; by symbol where
 *  it passes none. */
export function keepByKey(assets: readonly PeakAssetKey[]): (row: FlowAssetHeld) => boolean {
  const keys = new Set(assets.map((a) => a.key?.toLowerCase()).filter((k): k is string => !!k));
  const symbols = new Set(assets.filter((a) => !a.key).map((a) => a.symbol));
  return (r) => {
    const k = r.asset?.toLowerCase();
    if (k != null && keys.has(k)) return true;
    return symbols.has(r.symbol);
  };
}

/** `heldAt[stop]` is the model's held rows at the end of day `startDay +
 *  stop`. `keep[side]` limits a side to some assets (a card's collateral
 *  without the supplies that back no borrowing); absent, every row counts. */
export function sidePeaks(
  heldAt: readonly (readonly FlowAssetHeld[])[],
  startDay: number,
  keep: Partial<Record<FlowSide, (row: FlowAssetHeld) => boolean>> = {},
  /** The balances the timeline's events stated (its day rows' `balances`),
   *  any amount: a side's evidence of being held. */
  stated: readonly { side: FlowSide; asset: string; symbol: string }[] = [],
): Record<FlowSide, SidePeakResult> {
  const sides: FlowSide[] = ["collateral", "debt"];
  const out: Record<FlowSide, SidePeakResult> = {
    collateral: { peak: null, unpriced: [], unmatched: [], stated: false },
    debt: { peak: null, unpriced: [], unmatched: [], stated: false },
  };
  // A stated balance counts where `keep` takes its asset: one the card
  // leaves out on purpose is no evidence for the side.
  for (const b of stated) {
    const k = keep[b.side];
    if (!out[b.side].stated && (!k || k({ side: b.side, symbol: b.symbol, asset: b.asset, amount: 0, usd: 0 })))
      out[b.side].stated = true;
  }
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
