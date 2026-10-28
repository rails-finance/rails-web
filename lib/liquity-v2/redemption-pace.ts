// Liquity V2's redemption pace: BOLD redeemed on a branch per UTC day, from
// rails-server's /api/liquity-v2/redemption-pace (the web's proxy of the same
// path), drawn as the Trove chart's pace lane (lib/shared/flows-pace.ts;
// rails-ops reference/lifetime-price-chart.md, ruling 11; ui-jobs 328 step 9).
//
// RULES.
// - The answer lists the days with a redemption; every other day of the range
//   read is zero. `bold` is the BOLD burned before the fee.
// - The branch is the Trove's collateral (WETH, wstETH, rETH): the pace is every
//   Trove's on that branch, this one's included.
// - The range read runs from the life's first day to its last (today, or the
//   close), at most the route's cap of 1,100 days, the newest kept.
//
// Pure: tested offline in scripts/verify/verify-redemption-pace.ts.

import type { FlowPace, PaceDay } from "@/lib/shared/flows-pace";

export type PaceBranch = "WETH" | "wstETH" | "rETH";

/** The route's answer. */
export interface RedemptionPaceAnswer {
  collateralType: string;
  from: string;
  to: string;
  days: { day: string; bold: number; count: number }[];
}

/** The route's range cap, in days. */
export const PACE_MAX_DAYS = 1100;

const DAY_MS = 86_400_000;

/** A UTC day number as the route's YYYY-MM-DD. */
export const isoDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** A YYYY-MM-DD as a UTC day number, or null. */
export function dayOfIso(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(ms) ? ms / DAY_MS : null;
}

/** The branch a Trove's collateral symbol stands on, or null (a fork's). */
export function paceBranch(collSymbol: string | null | undefined): PaceBranch | null {
  const s = (collSymbol ?? "").toLowerCase();
  return s === "weth" ? "WETH" : s === "wsteth" ? "wstETH" : s === "reth" ? "rETH" : null;
}

/** The range to read for a life from `first` to `last` (UTC day numbers):
 *  the whole life, or its newest PACE_MAX_DAYS. */
export function paceRange(first: number, last: number): { from: number; to: number } {
  const to = Math.max(first, last);
  return { from: Math.max(first, to - PACE_MAX_DAYS + 1), to };
}

/** The answer's days, or null where it is not one. */
export function paceDays(body: unknown): { from: number; to: number; days: PaceDay[] } | null {
  const b = body as RedemptionPaceAnswer | null;
  if (!b || !Array.isArray(b.days)) return null;
  const from = dayOfIso(b.from);
  const to = dayOfIso(b.to);
  if (from == null || to == null) return null;
  const days: PaceDay[] = [];
  for (const d of b.days) {
    const day = dayOfIso(d.day);
    const amount = Number(d.bold);
    const count = Number(d.count);
    if (day == null || !Number.isFinite(amount) || !Number.isFinite(count)) return null;
    days.push({ day, amount, count });
  }
  days.sort((a, b2) => a.day - b2.day);
  return { from, to, days };
}

/** The Trove chart's pace lane for a branch's answer. */
export function redemptionPace(branch: PaceBranch, body: unknown): FlowPace | null {
  const read = paceDays(body);
  if (!read) return null;
  const via = `rails-server redemption_events · /api/liquity-v2/redemption-pace?branch=${branch}`;
  return {
    ...read,
    unit: "BOLD",
    label: `${branch} branch, BOLD redeemed a day`,
    short: "Branch",
    noun: ["redemption", "redemptions"],
    help: `under the price, BOLD redeemed on the ${branch} branch each day, every Trove on the branch, this one included, on a separate scale. Redemptions take the Troves with the lowest interest rates first, so a run of tall bars marks a stretch of redemption pressure on the branch; read it against this Trove's interest rate and any redemption that reached it, an orange triangle on the events row. The tip reads the cursor's day: the BOLD redeemed and the number of redemptions.`,
    prov: (at, dayWord) => ({
      kind: "chain-derived",
      pclass: "indexed",
      summary:
        at.count === 0
          ? `No redemption reached the ${branch} branch on ${dayWord} (UTC): the day has no Redemption log in the index.`
          : `BOLD redeemed on the ${branch} branch on ${dayWord} (UTC), across every Trove on the branch: the sum of the ${at.count.toLocaleString("en-US")} TroveManager Redemption ${at.count === 1 ? "log's" : "logs'"} _actualBoldAmount, the BOLD burned before the redemption fee.`,
      formula: "Σ _actualBoldAmount ÷ 10¹⁸ over the day's Redemption logs",
      via,
    }),
  };
}
