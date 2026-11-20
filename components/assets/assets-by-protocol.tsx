"use client";

// A protocol's Assets table (rails-ops decision 0069, ui-jobs 786; anatomy
// A6.1, A6.2): the assets one explorer uses on its chain, one line each, under
// the protocol's heading. The listings' toolbar (search by symbol or address;
// Category, `?cat=`, written to the URL in place), then the house table:
// Asset, Category, Price, 30 days, "In <protocol>" (what the asset is there,
// each a link to the protocol's page for it) and "Also used in" (the other
// explorers on the chain, each opening its page for the asset). Below sm a
// line reads as a card. Held to the focus as every list is.

import Link from "next/link";
import { useMemo, useState } from "react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { ExplorerMarks, PhoneLine, PriceCell, SparkCell } from "@/components/assets/asset-explorer";
import { BoldReadContext } from "@/components/assets/bold-live-price";
import type { BoldPriceRead } from "@/lib/liquity-v2/bold-price";
import { ASSET_CATEGORY_LABELS, ASSET_CATEGORY_ORDER, type AssetCategory } from "@/lib/shared/asset-categories";
import { assetKey } from "@/lib/shared/asset-family";
import { chainName } from "@/lib/shared/asset-roster";
import type { ProtocolAssetLine } from "@/lib/shared/assets-by-protocol";
import type { ChainId } from "@/lib/shared/chains";
import { ChainProvider } from "@/lib/shared/chain-context";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import { notifyUrlChanged } from "@/lib/shared/use-url-search-params";
import { INDEX_FIRST_COL, INLINE_LINK } from "@/lib/shared/ui-grammar";

const CATEGORY_NOTE = "Rails’ classification of the asset";
const n = (v: number) => v.toLocaleString("en-US");

interface Filters extends BaseListFilters {
  cats: string[];
}

export function ProtocolAssets({
  lines: all,
  protocol,
  chain,
  initialCats,
  boldRead,
}: {
  lines: ProtocolAssetLine[];
  /** The protocol's name: "In Aave V3". */
  protocol: string;
  chain: number;
  initialCats: string[];
  boldRead?: BoldPriceRead | null;
}) {
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<string[]>(initialCats);
  const scoped = useScopedRows(all, (r) => [assetKey(r.line.chain, r.line.token)]);
  const rows = scoped.rows;

  const state: Filters = { q: query, cats, sortBy: "read", sortOrder: "desc" };
  const passes = (s: Filters) => {
    const want = s.q.trim().toLowerCase();
    return (r: ProtocolAssetLine) =>
      (s.cats.length === 0 || s.cats.includes(r.card.category)) &&
      (want === "" || r.card.symbol.toLowerCase().includes(want) || r.line.token.toLowerCase().includes(want));
  };
  const shown = useMemo(() => rows.filter(passes(state)), [rows, query, cats]); // eslint-disable-line react-hooks/exhaustive-deps

  const dimensions = useMemo<FilterDimension<Filters>[]>(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.card.category, (m.get(r.card.category) ?? 0) + 1);
    return [
      {
        id: "cats",
        label: "Category",
        group: "Category",
        cardinality: "multi",
        options: ASSET_CATEGORY_ORDER.filter((c) => m.has(c)).map((c) => ({
          value: c,
          label: ASSET_CATEGORY_LABELS[c],
          meta: n(m.get(c) ?? 0),
        })),
        get: (s) => s.cats,
        set: (s, v) => ({ ...s, cats: v }),
      },
    ];
  }, [rows]);

  const onToolbar = (next: Filters) => {
    if (next.q !== query) setQuery(next.q);
    setCats(next.cats);
    const p = new URLSearchParams(window.location.search);
    if (next.cats.length) p.set("cat", next.cats.join(","));
    else p.delete("cat");
    const qs = p.toString().replace(/%2C/gi, ",");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    notifyUrlChanged();
  };

  const filtering = query.trim() !== "" || cats.length > 0;
  const noun = (k: number) => (k === 1 ? "asset" : "assets");
  const where = chainName(chain);
  return (
    <BoldReadContext.Provider value={boldRead}>
      <ScopeNote scoped={scoped} noun={["asset", "assets"]} className="mb-3" />
      <div {...scoped.listProps} data-anatomy="A6">
        <ListToolbar
          dimensions={dimensions}
          filters={state}
          onChange={onToolbar}
          sortOptions={[]}
          searchPlaceholder="Symbol or address"
          countNode={
            <span className="text-xs text-rb-500 tabular-nums" data-asset-count={shown.length}>
              {filtering
                ? `${n(shown.length)} of ${n(rows.length)} ${noun(rows.length)}`
                : `${n(rows.length)} ${noun(rows.length)}`}
            </span>
          }
          sheetCount={{ total: shown.length, noun: "assets" }}
          countFor={(draft) => rows.filter(passes(draft)).length}
          skel="protocol-assets-toolbar"
        />
        {shown.length === 0 ? (
          <p className="text-[13px] text-rb-500">No asset matches.</p>
        ) : (
          <DataTable
            caption={`The assets ${protocol} uses on ${where}, with each one's price at the day's close, what it is in ${protocol}, and the other explorers that use it there`}
            tableClassName="min-w-[900px] text-sm"
            stacked
            rowHeight="one"
            data-asset-table="protocol"
          >
            <DataTableHead>
              <DataTableHeader label="Asset" />
              <DataTableHeader label="Category" />
              <DataTableHeader label="Price" align="right" />
              <DataTableHeader label="30 days" align="right" />
              <DataTableHeader label={`In ${protocol}`} />
              <DataTableHeader label="Also used in" />
            </DataTableHead>
            <DataTableBody>
              {shown.map((r) => (
                <ProtocolAssetRow key={r.card.id} row={r} />
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </div>
    </BoldReadContext.Provider>
  );
}

/** One asset (A6.1): the whole line opens its page under the protocol (D4). */
function ProtocolAssetRow({ row: { card: c, line: l, markets, also } }: { row: ProtocolAssetLine }) {
  const href = l.href ?? undefined;
  const name = (
    <span className="min-w-0 truncate text-sm font-semibold" title={c.symbol} data-asset-name="">
      {c.symbol}
    </span>
  );
  return (
    <DataTableRow
      href={href}
      data-asset-card={c.id}
      data-asset-line={`${l.chain}:${l.token}`}
      data-asset-category={c.category}
      data-anatomy="A6.1"
    >
      <DataTableCell rowHeader valign="middle" className={INDEX_FIRST_COL}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0" data-prov-exempt>
            <ChainProvider chainId={l.chain as ChainId}>
              <TokenChipIcon symbol={c.symbol} address={l.token} size={28} filterable={false} untitled />
            </ChainProvider>
          </span>
          {href ? (
            <DataTableRowLink href={href} aria-label={c.symbol} className="flex min-w-0 items-baseline gap-1.5">
              {name}
            </DataTableRowLink>
          ) : (
            name
          )}
          {c.short && <span className="shrink-0 font-mono text-[11px] text-rb-500">{c.short}</span>}
          <span className="ml-auto shrink-0 text-xs text-rb-500 sm:hidden" aria-hidden>
            {ASSET_CATEGORY_LABELS[c.category as AssetCategory]}
          </span>
        </div>
        {/* Below sm: the price, its change, a small 30-day line and the others. */}
        <PhoneLine line={l} symbol={c.symbol} first chips={also} chainNamed={false} />
      </DataTableCell>
      <DataTableCell data-dt-stack-hidden="" valign="middle" className="whitespace-nowrap">
        <span className="text-sm text-foreground" title={CATEGORY_NOTE} data-asset-category-badge={c.category}>
          {ASSET_CATEGORY_LABELS[c.category as AssetCategory]}
        </span>
      </DataTableCell>
      <PriceCell line={l} figure={`${l.chain}:${l.token}` === c.id ? c.figure : null} />
      <SparkCell line={l} symbol={c.symbol} />
      <DataTableCell data-dt-stack-hidden="" valign="middle" data-asset-markets="" data-anatomy="A6.2">
        {markets.length > 0 ? (
          // Above the line's cover, so each opens its page.
          <span className="relative z-[1] flex flex-col items-start gap-0.5 text-sm whitespace-nowrap">
            {markets.map((m) => (
              <Link key={m.href + m.label} href={m.href} className={INLINE_LINK} data-asset-market={m.href}>
                {m.label}
              </Link>
            ))}
          </span>
        ) : (
          <span className="text-xs text-rb-500">–</span>
        )}
      </DataTableCell>
      <DataTableCell data-dt-stack-hidden="" valign="middle" className="whitespace-nowrap sm:w-full" data-asset-also="">
        <ExplorerMarks symbol={c.symbol} chips={also} empty="No other" />
      </DataTableCell>
    </DataTableRow>
  );
}
