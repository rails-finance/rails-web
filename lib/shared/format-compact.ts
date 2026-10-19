// The compact figure (rails-ops ui-jobs 377; Liquity V2's Debt is the
// benchmark). One definition for every position card, and for every other
// surface that states a figure compact:
//
//   from 1,000   one decimal with K, M or B: "277.8K", "2.1M", "905.0K", "1.3B"
//   below 1,000  two decimals: "932.59", "3.00", "0.40"
//   under 0.01   three significant digits, "<0.000001" below that ("0.00512"),
//                so a non-zero balance never reads as "0.00"
//
// A negative takes an ASCII minus (`withRealMinus` swaps it). The exact value
// belongs in the figure's receipt or tooltip.

import { formatTinyNonZero, isHighValueUnit } from "@/lib/utils/format";

const UNITS: readonly (readonly [number, string])[] = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

const oneDecimal = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  for (let i = 0; i < UNITS.length; i++) {
    const [size, suffix] = UNITS[i];
    if (abs < size) continue;
    const scaled = Math.round((abs / size) * 10) / 10;
    // 999,960 rounds to 1,000.0K: it reads as the next unit up.
    if (scaled >= 1000 && i > 0) return `${sign}${oneDecimal(abs / UNITS[i - 1][0])}${UNITS[i - 1][1]}`;
    return `${sign}${oneDecimal(scaled)}${suffix}`;
  }
  if (abs > 0 && abs < 0.01) return formatTinyNonZero(value);
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A dollar figure in the compact form: "$82.0M", "$932.59"; "< $0.01" for a
 *  positive amount under a cent. */
export function formatCompactUsd(value: number): string {
  if (value > 0 && value < 0.01) return "< $0.01";
  return `${value < 0 ? "-" : ""}$${formatCompact(Math.abs(value))}`;
}

/** The compact figure with its full value for a `title` or tooltip:
 *  `display` is `formatCompact`; `title` is grouped at `decimals` (default
 *  2 from 100, 4 from 1, 6 below). */
export function formatCompactTitled(n: number, opts?: { decimals?: number }): { display: string; title: string } {
  const decimals = opts?.decimals ?? (Math.abs(n) >= 100 ? 2 : Math.abs(n) >= 1 ? 4 : 6);
  const title = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return { display: formatCompact(n), title };
}

/** A timeline headline's amount (the collapsed header, the share card's flow
 *  line): a magnitude below 0.01 reads "<0.01", except a BTC-class, ETH-class
 *  or gold token (`isHighValueUnit`), which keeps its significant digits
 *  ("0.00512") so no material amount hides behind "<0.01". */
export function formatHeadlineAmount(value: number, symbol?: string | null): string {
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01 && !isHighValueUnit(symbol)) return "<0.01";
  return formatCompact(value);
}
