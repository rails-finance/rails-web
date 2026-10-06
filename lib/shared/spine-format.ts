// The compact figures the timeline's spine and the event headers print
// ("2.2K", "0.4974"), as plain functions so the event prose generator
// (lib/liquity/event-prose.ts) and the export script read the same text the
// header renders.

import { formatTinyNonZero, isHighValueUnit } from "@/lib/utils/format";

/** Compact number for flanking values beside the spine icons */
export function fmtSpine(v: string | number | undefined, full = false): string {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  if (!n || !isFinite(n)) return "";
  const a = Math.abs(n);
  // Opt-in: whole units up to a million, so 8,750 and 8,745 do not read as
  // 8.8K and 8.7K beside each other.
  if (full && a >= 1_000 && a < 1_000_000) return Math.round(a).toLocaleString("en-US");
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) {
    const k = a / 1_000;
    return a >= 10_000 ? `${Math.round(k)}K` : `${parseFloat(k.toFixed(1))}K`;
  }
  if (a >= 1) return a.toLocaleString("en-US", { maximumFractionDigits: 2 });
  // Trim trailing zeros so sub-1 amounts read like the card header (0.2, not
  // 0.2000) while still capping precision at 4 decimals.
  const s = parseFloat(a.toFixed(4)).toString();
  // Strict chain-state: a non-zero magnitude below 4-dp must not read as "0".
  if (parseFloat(s) === 0) return formatTinyNonZero(a);
  return s;
}

/** Format a change magnitude for an event-card header. The header mirrors the
 *  spine's compact form (`fmtSpine`: "1.2M") so the two never disagree (the
 *  exact, byte-precise figure rides the provenance trace, not the header).
 *  Callers pass the magnitude (`Math.abs(...)`) and add their own +/− sign.
 *
 *  Below 0.01 this reads "<0.01" instead of `fmtSpine`'s digits — the same
 *  headline rule as `formatHeadlineAmount` in lib/utils/format.ts, kept as its
 *  own guard rather than a call to that helper: `fmtSpine`'s own compact
 *  rounding (1dp above 1M) stays intact for every other magnitude, so the
 *  header still never disagrees with the spine it mirrors. A BTC-class or gold
 *  `symbol` (`isHighValueUnit`) keeps `fmtSpine`'s digits below 0.01, since
 *  "<0.01" there could hide hundreds of dollars. The exact figure rides the
 *  tooltip (<ExactTip>) and the provenance trace.
 *
 *  A genuine zero states "0" rather than `fmtSpine`'s empty string: `fmtSpine`
 *  is written for the spine's flanking cells, where a blank cell is right,
 *  but a header has no such cell to fall back to — a blank there reads as a
 *  figure the page could not obtain, which is the one confusion a chain-truth
 *  surface cannot afford (rails-ops TO-DO-ui-jobs item 74). An unmeasurable
 *  value (`NaN`) still falls through to `fmtSpine` and reads blank, so that
 *  distinction is kept. */
export function fmtHeaderMagnitude(n: number, symbol?: string | null): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.01 && !isHighValueUnit(symbol)) return "<0.01";
  return fmtSpine(n);
}
