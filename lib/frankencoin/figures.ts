// Frankencoin figure formats, one per unit, shared by the opened card's grid and
// its explanation so the two state a figure the same way: ZCHF at two places, a
// declared price at up to two, collateral at up to eight (a WBTC amount to the
// satoshi).

import { formatTinyNonZero } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

export const fmtZchf = (n: number): string =>
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtFcPrice = (n: number): string =>
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const fmtFcColl = (n: number): string => {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 8 });
  return n !== 0 && Number(s.replace(/,/g, "")) === 0 ? formatTinyNonZero(Math.abs(n)) : s;
};

export const fmtFcPct = (ratio: number): string =>
  `${(ratio * 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;

/** "33.1 days", "358 days" — the term a mint's interest covered. */
export const termText = (days: number): string =>
  days >= 100 ? `${Math.round(days)} days` : `${days.toFixed(1)} days`;

/** "19 min", "3 h 5 min", "1 day 2 h" — a span stated to the minute. */
export function spanText(seconds: number): string {
  const m = Math.max(0, Math.round(seconds / 60));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} day${d === 1 ? "" : "s"}`);
  if (h > 0) parts.push(`${h} h`);
  if (min > 0 || parts.length === 0) parts.push(`${min} min`);
  return parts.slice(0, 2).join(" ");
}

/** A phase length: "1 day", "2 days", "12 h". */
export function phaseText(seconds: number): string {
  if (seconds % 86400 === 0) {
    const d = seconds / 86400;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  return spanText(seconds);
}

/** "12 s", else spanText: a gap between two blocks can be seconds. */
export const gapText = (seconds: number): string =>
  seconds < 60 ? `${Math.max(0, Math.round(seconds))} s` : spanText(seconds);

/** Where a forced sale's price stood on MintingHubV2.expiredPurchasePrice's
 *  curve: 10× the declared price at expiry, 1× one challenge period later,
 *  zero after a second. */
export interface ForcedCurvePoint {
  /** Seconds from expiry to the sale. */
  since: number;
  period: number;
  stage: "first" | "second" | "zero";
  /** The price paid over the declared price (null when none was declared). */
  multiple: number | null;
}

export function forcedCurvePoint(
  at: number,
  expiration: number,
  period: number,
  unit: number,
  declared: number | null,
): ForcedCurvePoint {
  const since = at - expiration;
  const stage = since <= period ? "first" : since < 2 * period ? "second" : "zero";
  return { since, period, stage, multiple: declared != null && declared > 0 ? unit / declared : null };
}

/** "first day", "second 2-day period": a challenge period named by its place
 *  after expiry. */
export const periodAfterExpiry = (which: "first" | "second", period: number): string =>
  period === 86400
    ? `${which} day`
    : period % 86400 === 0
      ? `${which} ${period / 86400}-day period`
      : `${which} period of ${phaseText(period)}`;

/** An exact decimal string with its whole part grouped: "2,322.994071369077767177". */
export const groupExact = (s: string): string => {
  const [whole, frac] = s.split(".");
  const g = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${g}.${frac}` : g;
};

/** "1.13×". */
export const fmtMultiple = (m: number): string =>
  `${m.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}×`;

/** "18 Nov 2025, 09:05 UTC". */
export function dateTimeText(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatDate(unix)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
