// How a Morpho token amount is printed. Pure TypeScript with no React, so the
// shared event-prose roundings (lib/shared/event-prose/roundings.ts) and the
// scripts can load it.

/** A token amount on a Morpho event, at the timeline row's precision below
 *  1,000 (the spine's rule): two decimals from 1, four below 1, and a tiny
 *  non-zero amount at three significant digits, never "0". From 1,000 it keeps
 *  two decimals where the row abbreviates ("2.8K"), so a sum of event figures
 *  still adds up. */
export function fmtMorphoAmount(v: number | string | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  if (!Number.isFinite(n) || n === 0) return "0";
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1) return sign + a.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (a >= 0.0001) return sign + String(parseFloat(a.toFixed(4)));
  if (a < 0.000001) return `${sign}<0.000001`;
  return sign + a.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}
