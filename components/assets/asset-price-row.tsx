// A Prices list row (rails-ops reference/asset-key-map.md, "The Prices list";
// row form, Miles 4 Oct 2026): {asset icon}{price-unit mark}{value}, the
// 30-day sparkline and the 30-day change; the whole row is the link to the
// asset's page. No ticker text: the link's name carries it. A price from
// stored rounds carries its "as of" stamp, the checkpoint's time.

import Link from "next/link";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { PriceUnitMark } from "@/components/assets/price-unit-mark";
import { fmtChange, PriceSparkline } from "@/components/assets/price-sparkline";
import type { AssetPriceRow as Row, RowFlag } from "@/lib/shared/asset-prices";
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

export function AssetPriceRow({ row }: { row: Row }) {
  const flag = row.flag ? flagWords(row.flag) : null;
  const name = `${row.symbol}${row.price != null ? `, $${fmtRowPrice(row.price)}` : ", no stored price"}${row.asOf ? ` ${asOfWords(row.asOf)}` : ""}${row.change != null ? `, ${fmtChange(row.change)} over 30 days` : ""}${flag ? `; ${flag.text}` : ""}`;
  return (
    <li data-asset-price-row={`${row.chain}:${row.token}`} data-anatomy="A5.1">
      <Link
        href={row.href}
        aria-label={name}
        title={row.symbol}
        className="flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1 tabular-nums">
          <TokenChipIcon symbol={row.symbol} address={row.token} size={20} filterable={false} untitled />
          {row.price != null ? (
            <>
              <PriceUnitMark unit={row.unit} size={14} />
              <span className="text-sm font-semibold text-foreground">{fmtRowPrice(row.price)}</span>
              {row.asOf && (
                <span
                  className="ml-1 shrink-0 text-[11px] text-rb-500"
                  title={`The stored round in force ${asOfWords(row.asOf)}`}
                  data-asset-price-as-of={row.asOf.block}
                  data-anatomy="A5.3"
                >
                  {asOfMark(row.asOf)}
                </span>
              )}
            </>
          ) : (
            <span className="pl-1 text-sm text-rb-500">–</span>
          )}
          {flag && (
            <span
              className="ml-1.5 truncate rounded border border-[var(--caution)] px-1 text-[11px] leading-4 text-[var(--caution)]"
              title={flag.text}
              data-asset-price-flag={row.flag?.gap ? "gap" : "fixed"}
              data-anatomy="A5.2"
            >
              {flag.mark}
            </span>
          )}
        </span>
        <PriceSparkline points={row.spark} label={`${row.symbol} over 30 days`} className="h-7 w-20 sm:w-28" />
        <span
          className={`w-14 shrink-0 text-right text-xs tabular-nums ${
            row.change == null
              ? "text-rb-500"
              : row.change >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
          }`}
          data-asset-price-change={row.change ?? ""}
        >
          {row.change == null ? "–" : fmtChange(row.change)}
        </span>
      </Link>
    </li>
  );
}
