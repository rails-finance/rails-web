"use client";

// The asset cells a protocol's Assets pages and asset pages draw (rails-ops
// decision 0069, ui-jobs 786; anatomy A5.1 to A5.3, A5.9 to A5.11, A6): a
// line's price on its chain, its 30-day line, a phone's compact row, the
// explorers' marks and a priceless card's figure.
// The cross-protocol /assets list they were first drawn for is retired.

import Link from "next/link";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { memo, useContext } from "react";
import { BoldCardPrice, BoldReadContext, holdsBold } from "@/components/assets/bold-live-price";
import { asOfMark, asOfWords, flagWords, fmtRowPrice } from "@/components/assets/asset-price-row";
import { PriceUnitMark } from "@/components/assets/price-unit-mark";
import { fmtChange, PriceSparkline } from "@/components/assets/price-sparkline";
import { formatCompactTitled } from "@/lib/shared/format-compact";
import { hasProtocolGlyph, ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { DataTableCell } from "@/components/shared/data-table/data-table";
import { type CardLine, type AssetChip, type CardFigure, PRICELESS_WHY } from "@/lib/shared/asset-explorer";
import { chainName } from "@/lib/shared/asset-roster";
import type { ChainId } from "@/lib/shared/chains";
import { MARK_TILE, MARK_TILE_LINK } from "@/lib/shared/ui-grammar";

/** The Explorers cell draws this many marks, then "+N". */
const MARKS_SHOWN = 4;

/** A line's price on its chain (A5.1), with the stored round's mark and the
 *  flag on the row's chain; else BOLD's live read, the card's figure or "No
 *  price". A protocol's Assets pages draw it too (components/assets/assets-by-protocol.tsx). */
export function PriceCell({ line: l, figure }: { line: CardLine; figure: CardFigure | null }) {
  const price = l.price;
  const flag = l.main && l.row?.flag ? flagWords(l.row.flag) : null;
  const boldRead = useContext(BoldReadContext);
  return (
    <DataTableCell data-dt-stack-hidden="" align="right" valign="middle" className="tabular-nums sm:whitespace-nowrap">
      {price && price.price != null && l.row ? (
        // On a phone's stacked row the flag may wrap under the price rather
        // than run over the 30-day line beside it.
        <span
          className="inline-flex flex-wrap items-center justify-end gap-1 sm:flex-nowrap"
          data-asset-price-row={`${l.chain}:${l.token}`}
          data-anatomy="A5.1"
        >
          <PriceUnitMark unit={l.row.unit} size={14} />
          <span className="font-semibold text-foreground">{fmtRowPrice(price.price)}</span>
          {price.asOf && (
            <span
              className="ml-1 text-[11px] text-rb-500"
              title={`The stored round in force ${asOfWords(price.asOf)}`}
              data-asset-price-as-of={price.asOf.block}
              data-anatomy="A5.3"
            >
              {asOfMark(price.asOf)}
            </span>
          )}
          {flag && (
            <span
              className="ml-1.5 rounded border border-[var(--caution)] px-1 text-[11px] leading-4 text-[var(--caution)]"
              title={flag.text}
              data-asset-price-flag={l.row.flag?.gap ? "gap" : "fixed"}
              data-anatomy="A5.2"
            >
              {flag.mark}
            </span>
          )}
        </span>
      ) : boldRead !== undefined && holdsBold([{ chain: l.chain, token: l.token }]) ? (
        <BoldCardPrice read={boldRead} />
      ) : figure ? (
        <FigureRow figure={figure} />
      ) : (
        <span className="text-xs text-rb-500" title={PRICELESS_WHY} data-asset-priceless="" data-anatomy="A5.10">
          No price
        </span>
      )}
    </DataTableCell>
  );
}

/** A line's 30-day line on its chain. */
export function SparkCell({ line: l, symbol }: { line: CardLine; symbol: string }) {
  const price = l.price;
  return (
    <DataTableCell data-dt-stack-hidden="" align="right" valign="middle">
      {price && price.spark.length ? (
        <PriceSparkline
          points={price.spark}
          label={`${symbol} on ${chainName(l.chain)} over 30 days`}
          className="ml-auto h-7 w-24"
        />
      ) : (
        <None />
      )}
    </DataTableCell>
  );
}

/** A line below sm (ui-jobs 781): the group reads as one card, its head once
 *  and a compact row per chain: the chain's mark and name, the price and its
 *  change, a small 30-day line, and the explorers that list it there (nothing
 *  where none does). The table's cells are not drawn below sm. Memoised as
 *  LineFigures is. */
export const PhoneLine = memo(function PhoneLine({
  line: l,
  symbol,
  first,
  chips = l.chips,
  chainNamed = true,
}: {
  line: CardLine;
  symbol: string;
  first: boolean;
  /** The marks at the row's end: the line's explorers, or on a protocol's
   *  Assets page (components/assets/assets-by-protocol.tsx) the other explorers
   *  that use it there. */
  chips?: AssetChip[];
  /** The chain's mark and name lead the row; a protocol's Assets page
   *  (components/assets/assets-by-protocol.tsx), on one chain, leaves them out. */
  chainNamed?: boolean;
}) {
  const price = l.price;
  return (
    <div className={`flex min-w-0 items-center gap-1.5 sm:hidden ${first ? "mt-2" : ""}`} data-phone-line="">
      {chainNamed && (
        <>
          <span className={`${MARK_TILE} text-rb-500`} aria-hidden>
            <ChainGlyph id={l.chain as ChainId} className="h-3.5 w-3.5" />
          </span>
          <span className="w-16 shrink-0 truncate text-sm text-foreground">{chainName(l.chain)}</span>
        </>
      )}
      <span className="min-w-0 shrink truncate text-sm font-semibold text-foreground tabular-nums">
        {price?.price != null && l.row ? (
          fmtRowPrice(price.price)
        ) : (
          <span className="text-xs font-normal text-rb-500">No price</span>
        )}
      </span>
      {price?.change != null && (
        <span
          className={`shrink-0 text-xs tabular-nums ${price.change >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
        >
          {fmtChange(price.change)}
        </span>
      )}
      {price && price.spark.length > 0 && (
        <PriceSparkline
          points={price.spark}
          label={`${symbol} on ${chainName(l.chain)} over 30 days`}
          className="h-5 w-10 shrink-0"
        />
      )}
      {chips.length > 0 && (
        <span className="ml-auto shrink-0">
          <ExplorerMarks symbol={symbol} chips={chips} shown={2} />
        </span>
      )}
    </div>
  );
});

export const None = () => (
  <span className="text-sm text-rb-500">
    <span aria-hidden>–</span>
    <span className="sr-only">no figure</span>
  </span>
);

/** The explorers that list the asset on the line's chain: up to four marks,
 *  each linking where its chip links (A5.9), then "+N"; their names in each
 *  mark's title. */
export function ExplorerMarks({
  symbol,
  chips,
  shown = MARKS_SHOWN,
  empty = "None",
}: {
  symbol: string;
  chips: AssetChip[];
  /** What an empty cell says. */
  empty?: string;
  /** The marks drawn before "+N" (two on a phone's compact row). */
  shown?: number;
}) {
  if (!chips.length) return <span className="text-xs text-rb-500">{empty}</span>;
  const more = chips.length - shown;
  return (
    <span className="flex items-center gap-1" data-asset-chips={chips.length}>
      {chips.slice(0, shown).map((ch) => (
        <Link
          key={ch.explorer}
          href={ch.href}
          title={`${symbol} on ${ch.label}`}
          aria-label={`${symbol} on ${ch.label}, ${chainName(ch.chain)}`}
          className={`${MARK_TILE} ${MARK_TILE_LINK}`}
          data-asset-chip={ch.explorer}
          data-asset-chip-link={ch.link}
          data-anatomy="A5.9"
        >
          {/* A vault no explorer deploys draws its token's icon, unless its
              mark has a monochrome glyph (sBOLD's, ui-jobs 781). */}
          {ch.token && !hasProtocolGlyph(ch.explorer) ? (
            <TokenChipIcon symbol={ch.token.symbol} address={ch.token.address} size={14} filterable={false} untitled />
          ) : (
            <ProtocolIcon id={ch.explorer} className="h-3.5 w-3.5" />
          )}
        </Link>
      ))}
      {more > 0 && (
        <span
          className="pl-0.5 text-xs text-rb-500 tabular-nums"
          title={chips
            .slice(shown)
            .map((ch) => ch.label)
            .join(", ")}
        >
          +{more}
        </span>
      )}
    </span>
  );
}

/** A card without a price's figure (A5.11); the asset page (A1.3) draws it too. */
export function FigureRow({ figure: f, info }: { figure: CardFigure; info?: Provenance }) {
  const v = formatCompactTitled(f.amount);
  const title = `${f.title}${f.asOf ? `, ${asOfWords(f.asOf)}` : ""}: ${v.title} ${f.unit}`;
  return (
    <p
      className="flex items-baseline gap-1.5 text-sm tabular-nums"
      title={title}
      data-asset-card-figure={f.label}
      data-anatomy="A5.11"
    >
      <span className="text-xs text-rb-500">{f.label}</span>
      {info ? (
        <Prov info={info} value={String(f.amount)} symbol={f.unit}>
          <span className="font-semibold text-foreground">
            {v.display} {f.unit}
          </span>
        </Prov>
      ) : (
        <span className="font-semibold text-foreground">
          {v.display} {f.unit}
        </span>
      )}
      {f.asOf && (
        <span className="text-[11px] text-rb-500" data-asset-card-figure-as-of={f.asOf.block}>
          {asOfMark(f.asOf)}
        </span>
      )}
    </p>
  );
}
