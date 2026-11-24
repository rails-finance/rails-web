// The words of a Prices row (rails-ops reference/asset-key-map.md, "The Prices
// list"): a price's figure, a stored-rounds price's "as of" stamp (the
// checkpoint's time) and a flagged row's mark. The asset cells
// (components/assets/asset-explorer.tsx) and the asset popover draw them.

import type { RowFlag } from "@/lib/shared/asset-prices";
import { fmtSpread } from "@/lib/shared/asset-spread";
import { formatDate } from "@/lib/date";
import { roundTime } from "@/components/assets/round-time";

/** A rounds price's stamp: "10:41 UTC" on the checkpoint's day, else its date. */
export function asOfMark(asOf: { ts: number }, now = Date.now()): string {
  const d = new Date(asOf.ts * 1000);
  if (Math.floor(asOf.ts / 86_400) !== Math.floor(now / 86_400_000)) return formatDate(d);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

/** "as of 26 Oct 2026, 10:41 UTC, block 37,412,006". */
export function asOfWords(asOf: { ts: number; block: number }): string {
  return `as of ${roundTime(asOf.ts)}, block ${asOf.block.toLocaleString("en-US")}`;
}

/** The flag's mark ("2.1 % apart", "fixed price") and its sentence. */
export function flagWords(f: RowFlag): { mark: string; text: string } {
  const parts: string[] = [];
  if (f.gap)
    parts.push(
      `${f.gap.line} ${fmtSpread(f.gap.dev)} ${f.gap.dev > 0 ? "above" : "below"} ${f.gap.main}, ${formatDate(new Date(f.gap.day * 86_400_000))}`,
    );
  if (f.fixed.length) {
    const who = f.fixed.join(", ");
    parts.push(`${who} ${who.includes(", ") ? "read" : "reads"} a fixed price`);
  }
  return { mark: f.gap ? `${fmtSpread(f.gap.dev)} apart` : "fixed price", text: parts.join("; ") };
}

/** "$80,688", "$1.00", "$0.9997". */
export function fmtRowPrice(v: number): string {
  if (v >= 1000) return Math.round(v).toLocaleString("en-US");
  if (v >= 1) return v.toFixed(2);
  return v.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}
