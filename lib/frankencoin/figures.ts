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

/** "18 Nov 2025, 09:05 UTC". */
export function dateTimeText(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatDate(unix)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
