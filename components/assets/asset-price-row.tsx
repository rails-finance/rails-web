// A Prices list row (rails-ops reference/asset-key-map.md, "The Prices list";
// row form, Miles 4 Oct 2026): {asset icon}{price-unit mark}{value}, the
// 30-day sparkline and the 30-day change; the whole row is the link to the
// asset's page. No ticker text: the link's name carries it. A price from
// stored rounds carries its "as of" stamp, the checkpoint's time.

import Link from "next/link";
import type { ReactNode } from "react";
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

const ROW_CLASS = "flex min-h-11 items-center gap-3 py-1.5";

/** The row's frame: the link to the asset page, or on that page a group of the same name. */
function RowLink({
  href,
  name,
  symbol,
  children,
}: {
  href: string | null;
  name: string;
  symbol: string;
  children: ReactNode;
}) {
  if (href == null)
    return (
      <div role="group" aria-label={name} className={ROW_CLASS}>
        {children}
      </div>
    );
  return (
    <Link
      href={href}
      aria-label={name}
      title={symbol}
      className={`${ROW_CLASS} rounded-md px-2 hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]`}
    >
      {children}
    </Link>
  );
}

/** `as="div"` draws the row inside another part (the asset explorer's card,
 *  A5.4). `onPage` draws it on the asset's own page (A1): no link, the
 *  figure larger, the stamp and flag under it. */
export function AssetPriceRow({
  row,
  as: Tag = "li",
  alsoNamed = false,
  onPage = false,
}: {
  row: Row;
  as?: "li" | "div";
  onPage?: boolean;
  /** The list view names the wrappers with no row of their own under the row ("also WETH"). */
  alsoNamed?: boolean;
}) {
  const flag = row.flag ? flagWords(row.flag) : null;
  const name = `${row.symbol}${row.price != null ? `, $${fmtRowPrice(row.price)}` : ", no stored price"}${row.asOf ? ` ${asOfWords(row.asOf)}` : ""}${row.change != null ? `, ${fmtChange(row.change)} over 30 days` : ""}${flag ? `; ${flag.text}` : ""}`;
  const stamp = row.price != null && row.asOf && (
    <span
      className={`shrink-0 text-[11px] text-rb-500 ${onPage ? "" : "ml-1"}`}
      title={`The stored round in force ${asOfWords(row.asOf)}`}
      data-asset-price-as-of={row.asOf.block}
      data-anatomy="A5.3"
    >
      {asOfMark(row.asOf)}
    </span>
  );
  const flagMark = flag && (
    <span
      className={`rounded border border-[var(--caution)] px-1 text-[11px] leading-4 text-[var(--caution)] ${onPage ? "whitespace-nowrap" : "ml-1.5 truncate"}`}
      title={flag.text}
      data-asset-price-flag={row.flag?.gap ? "gap" : "fixed"}
      data-anatomy="A5.2"
    >
      {flag.mark}
    </span>
  );
  const figure =
    row.price != null ? (
      <>
        <PriceUnitMark unit={row.unit} size={onPage ? 18 : 14} />
        <span className={`font-semibold text-foreground ${onPage ? "text-2xl leading-none" : "text-sm"}`}>
          {fmtRowPrice(row.price)}
        </span>
      </>
    ) : (
      <span className="pl-1 text-sm text-rb-500">–</span>
    );
  return (
    <Tag data-asset-price-row={`${row.chain}:${row.token}`} data-anatomy="A5.1">
      <RowLink href={onPage ? null : row.href} name={name} symbol={row.symbol}>
        {onPage ? (
          <span className="flex min-w-0 flex-1 items-center gap-2.5 tabular-nums">
            <TokenChipIcon symbol={row.symbol} address={row.token} size={28} filterable={false} untitled />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1">{figure}</span>
              {(stamp || flagMark) && (
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {stamp}
                  {flagMark}
                </span>
              )}
            </span>
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1 tabular-nums">
            <TokenChipIcon symbol={row.symbol} address={row.token} size={20} filterable={false} untitled />
            {figure}
            {stamp}
            {flagMark}
          </span>
        )}
        <PriceSparkline
          points={row.spark}
          label={`${row.symbol} over 30 days`}
          className={onPage ? "h-10 w-20 sm:w-36" : "h-7 w-20 sm:w-28"}
        />
        <span
          className={`w-14 shrink-0 text-right tabular-nums ${onPage ? "text-sm" : "text-xs"} ${
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
      </RowLink>
      {alsoNamed && row.also && row.also.length > 0 && (
        <p className="-mt-1 pb-1.5 pl-[30px] text-xs text-rb-500" data-asset-price-also="">
          also{" "}
          {row.also.map((a, i) => (
            <span key={a.href}>
              {i > 0 && ", "}
              <Link href={a.href} className="underline decoration-rb-300 underline-offset-2 hover:text-foreground">
                {a.symbol}
              </Link>
            </span>
          ))}
        </p>
      )}
    </Tag>
  );
}
