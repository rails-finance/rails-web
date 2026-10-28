// A pace lane on the Lifetime flows panel (rails-ops
// reference/lifetime-price-chart.md, ruling 11): a protocol-wide daily total
// drawn as thin bars in a lane of its own under the price pane, on its own
// scale, with the cursor's day read in the price tip. Liquity V2's is the
// branch's redemptions (lib/liquity-v2/redemption-pace.ts).
//
// RULES.
// - The series is the days a source reported, ascending; a day it does not
//   list inside the range read is zero, and the lane and the tip say so.
// - A day outside the range read has no figure (null), never a zero.
//
// Pure: tested offline in scripts/verify/verify-redemption-pace.ts.

import type { Provenance } from "@/components/shared/provenance";

/** One UTC day's total: `amount` in the lane's unit, `count` the events. */
export interface PaceDay {
  /** UTC day number (unix seconds ÷ 86,400). */
  day: number;
  amount: number;
  count: number;
}

export interface FlowPace {
  /** The days with a total, ascending; every other day of `from`..`to` is zero. */
  days: PaceDay[];
  /** The range read, UTC day numbers, both inclusive. */
  from: number;
  to: number;
  /** The amount's unit ("BOLD"). */
  unit: string;
  /** The lane's caption, at its top left ("WETH branch redeemed per day"). */
  label: string;
  /** The tip's line label ("Branch"). */
  short: string;
  /** The count's noun, singular and plural ("redemption", "redemptions"). */
  noun: [string, string];
  /** The how-to-read's sentence for the lane. */
  help: string;
  /** The receipt for a day's figure. */
  prov: (at: PaceDay, dayWord: string) => Provenance;
}

/** The day's total, zero where the range read lists none, null outside it. */
export function paceAt(p: FlowPace, day: number): PaceDay | null {
  if (day < p.from || day > p.to) return null;
  let lo = 0;
  let hi = p.days.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const d = p.days[mid].day;
    if (d === day) return p.days[mid];
    if (d < day) lo = mid + 1;
    else hi = mid - 1;
  }
  return { day, amount: 0, count: 0 };
}

/** Every day of `from`..`to` (clipped to the range read), zeros filled. */
export function paceFilled(p: FlowPace, from: number, to: number): PaceDay[] {
  const a = Math.max(from, p.from);
  const b = Math.min(to, p.to);
  const out: PaceDay[] = [];
  const byDay = new Map(p.days.map((d) => [d.day, d]));
  for (let d = a; d <= b; d++) out.push(byDay.get(d) ?? { day: d, amount: 0, count: 0 });
  return out;
}

/** The largest day's amount from `from` to `to`, for the lane's scale. */
export function paceMax(p: FlowPace, from: number, to: number): number {
  let m = 0;
  for (const d of p.days) if (d.day >= from && d.day <= to && d.amount > m) m = d.amount;
  return m;
}

/** "84,211 BOLD · 31 redemptions", "0 BOLD · no redemptions": the tip's
 *  figures, whole units. */
export function paceWords(p: Pick<FlowPace, "unit" | "noun">, at: PaceDay): string {
  const amount = `${Math.round(at.amount).toLocaleString("en-US")} ${p.unit}`;
  const count =
    at.count === 0
      ? `no ${p.noun[1]}`
      : `${at.count.toLocaleString("en-US")} ${at.count === 1 ? p.noun[0] : p.noun[1]}`;
  return `${amount} · ${count}`;
}
