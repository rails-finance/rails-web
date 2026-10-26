// A Prices list row (rails-ops reference/asset-key-map.md, "The Prices list";
// row form, Miles 4 Oct 2026): {asset icon}{price-unit mark}{value}, the
// 30-day sparkline and the 30-day change; the whole row is the link to the
// asset's page. No ticker text: the link's name carries it.

import Link from "next/link";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { PriceUnitMark } from "@/components/assets/price-unit-mark";
import { fmtChange, PriceSparkline } from "@/components/assets/price-sparkline";
import type { AssetPriceRow as Row, RowFlag } from "@/lib/shared/asset-prices";
import { fmtSpread } from "@/lib/shared/asset-spread";
import { formatDate } from "@/lib/date";

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
  const name = `${row.symbol}${row.price != null ? `, $${fmtRowPrice(row.price)}` : ", no stored price"}${row.change != null ? `, ${fmtChange(row.change)} over 30 days` : ""}${flag ? `; ${flag.text}` : ""}`;
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
