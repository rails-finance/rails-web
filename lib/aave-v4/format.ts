// Shared number formatters for Aave V4 position surfaces. Lifted out of
// components/protocol/aave-v4/aave-v4-spoke-card.tsx so the listing card
// (AaveV4PositionListingCard) renders identical values to the detail card —
// same "$575.4K" cutoff, same "< $1" rule, same HF rounding, same liq-price
// magnitude scaling. Single source of truth.

import { formatCompact } from "@/lib/shared/format-event";

// Sub-$1 values use 2 decimals ("$0.40") so a $2.48-of-which-$0.40-debt test
// position stays legible. Only collapse to "< $0.01" for true dust where the
// cents-rounding would lie ("$0.00" is worse than "< $0.01").
export function fmtUsd(n: number): { display: string; title: string } {
  if (n < 0.01) return { display: "< $0.01", title: "< $0.01" };
  const c = formatCompact(n, { decimals: 2 });
  return { display: `$${c.display}`, title: `$${c.title}` };
}

// Signed USD for P&L-style figures (net interest carry). Unlike fmtUsd this
// keeps the sign and never collapses a negative to "< $0.01" (fmtUsd's `n <
// 0.01` guard would mis-handle −$46). Near-zero reads as "$0.00" so a dust
// position doesn't flash a misleading "+$0". Intentionally NOT color-coded —
// the sign carries the meaning (see hfColorClass rationale).
export function fmtSignedUsd(n: number): { display: string; title: string } {
  if (Math.abs(n) < 0.005) return { display: "$0.00", title: "$0.00" };
  const sign = n < 0 ? "−" : "+";
  const c = formatCompact(Math.abs(n), { decimals: 2 });
  return { display: `${sign}$${c.display}`, title: `${sign}$${c.title}` };
}

// Compact token amount for interest figures — scales decimals to the magnitude
// so sub-unit interest (0.0312 ETH, 0.00041 WBTC) stays legible without
// underflowing to "0". Returns the bare number; callers append the symbol/icon.
export function fmtTokenAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  if (abs >= 1_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const decimals = Math.min(8, Math.ceil(-Math.log10(abs)) + 2);
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export function hfLabel(hf: number | null): string {
  if (hf == null || hf >= 100) return "∞";
  return hf.toFixed(2);
}

/** A health factor at or above this reads as a capped figure (">100"). */
export const HF_CAP = 100;

/** The Aave V4 health-factor label: a third decimal below 1.1, so a position
 *  at 1.004 does not read as 1.00, the liquidation line. `hfLabel` stays two
 *  decimals for the other explorers that import it. RULE: "∞" only where no
 *  debt remains (null); a finite factor however large is capped at ">100". */
export function hfLabelV4(hf: number | null): string {
  if (hf == null) return "∞";
  if (hf >= HF_CAP) return `>${HF_CAP}`;
  // Below 1 round down, so a liquidatable 0.9997 never reads 1.000.
  if (hf < 1) return (Math.floor(hf * 1000) / 1000).toFixed(3);
  return hf < 1.1 ? hf.toFixed(3) : hf.toFixed(2);
}

/** The health factor in a sentence: "over 100" where the label reads ">100". */
export function hfProseV4(hf: number | null): string {
  return hf != null && hf >= HF_CAP ? `over ${HF_CAP}` : hfLabelV4(hf);
}

/** A per-unit asset price at the precision its value needs: four decimals
 *  below $10 (sUSDe at $1.2437, USDT at $0.9997), whole dollars from $100. */
export function fmtUnitPrice(p: number): string {
  if (!isFinite(p) || p <= 0) return "–";
  if (p < 0.0001) return "< $0.0001";
  if (p < 10) return "$" + p.toFixed(4);
  if (p < 100) return "$" + p.toFixed(2);
  return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** A health factor this close above 1 (under 1% of collateral value to spare)
 *  is at the liquidation line: the runway rounds to 0%. */
export const AT_LINE_HF = 1.01;

/** A token amount on an Aave V4 event (T2 rows and the T3 prose), at the
 *  timeline header's precision: whole units from 1,000, four decimals from
 *  0.0001 up, more below that down to 0.000001, and "<0.000001" under it,
 *  never "0" for a non-zero amount. */
export function fmtV4Amount(v: string | number | undefined): string {
  if (v == null || v === "") return "0";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs < 0.000001) return n < 0 ? "−<0.000001" : "<0.000001";
  if (abs >= 1_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const decimals = abs >= 0.0001 ? 4 : Math.min(6, Math.ceil(-Math.log10(abs)) + 1);
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

// Health-factor value color. Intentionally neutral at every level — Rails
// doesn't color-code risk valence (green=safe / red=danger); the numeric HF
// and the headroom readout carry the meaning. Kept as a function so call sites
// don't need to change.
export function hfColorClass(_hf: number | null): string {
  return "text-foreground/80";
}

// Liq prices vary wildly: BTC at $100k vs USDC at $1. Scale formatting to the
// magnitude so we don't get either "$100,000.00" or "$0".
export function fmtLiqPrice(p: number): string {
  if (p < 0.01) return "< $0.01";
  if (p < 1) return "$" + p.toFixed(3);
  if (p < 100) return "$" + p.toFixed(2);
  if (p < 1_000) return "$" + p.toFixed(0);
  if (p < 1_000_000) return "$" + (p / 1000).toFixed(p < 10_000 ? 2 : 1) + "K";
  return "$" + (p / 1_000_000).toFixed(2) + "M";
}

/** A yearly interest cost in tokens: two decimals from 1 (Liquity V2's
 *  "~282.08 BOLD/year"), the event amount's precision below. */
export function fmtYearly(n: number): string {
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return fmtV4Amount(n);
}
