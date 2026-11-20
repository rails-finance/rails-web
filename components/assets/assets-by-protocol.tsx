"use client";

// A protocol's Assets table (rails-ops decisions 0069 and 0070, ui-jobs 786;
// anatomy A6 to A6.3). A ROSTER (decision 0070): the assets one explorer uses
// on its chain, all loaded, so its controls live in the table's headings:
// Asset searched from its heading (D10, symbol or address), Category and
// "Also used in" filtered from theirs (D9, `?cat=`, `?also=<explorer id>`,
// written to the URL in place). Columns: Asset, Category, Price, 30 days, "In
// <protocol>" (what the asset is there, each a link to the protocol's page for
// it) and "Also used in" (the other explorers on the chain, each opening its
// page for the asset). Below sm, where the stacked table draws no heading, one
// plain search over every text column and a chip per set filter; a line reads
// as a card. Held to the focus as every list is.

import Link from "next/link";
import { useMemo, useState } from "react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { SearchBox } from "@/components/shared/front-door-search";
import { HeadingFilterChip } from "@/components/shared/data-table/heading-filter";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
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
import { notifyUrlChanged } from "@/lib/shared/use-url-search-params";
import { INDEX_FIRST_COL, INLINE_LINK } from "@/lib/shared/ui-grammar";

const CATEGORY_NOTE = "Rails’ classification of the asset";

export function ProtocolAssets({
  lines: all,
  protocol,
  chain,
  initialCats,
  initialAlso,
  boldRead,
}: {
  lines: ProtocolAssetLine[];
  /** The protocol's name: "In Aave V3". */
  protocol: string;
  chain: number;
  initialCats: string[];
  /** `?also=<explorer id>`: the assets that explorer also uses. */
  initialAlso: string | null;
  boldRead?: BoldPriceRead | null;
}) {
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<string[]>(initialCats);
  const [alsoBy, setAlsoBy] = useState<string | null>(initialAlso);
  const scoped = useScopedRows(all, (r) => [assetKey(r.line.chain, r.line.token)]);
  const rows = scoped.rows;
  // From sm the Asset heading's search reads the symbol and the address;
  // below sm the one search reads every text column (decision 0070).
  const phone = useMediaQuery(PHONE_QUERY);

  const cat = cats[0] ?? null;
  const want = query.trim().toLowerCase();
  const matches = (r: ProtocolAssetLine) =>
    r.card.symbol.toLowerCase().includes(want) ||
    r.line.token.toLowerCase().includes(want) ||
    (phone &&
      (ASSET_CATEGORY_LABELS[r.card.category as AssetCategory].toLowerCase().includes(want) ||
        r.also.some((ch) => ch.label.toLowerCase().includes(want))));
  const shown = rows.filter(
    (r) =>
      (cat == null || r.card.category === cat) &&
      (alsoBy == null || r.also.some((ch) => ch.explorer === alsoBy)) &&
      (want === "" || matches(r)),
  );

  /** One heading filter's value in the URL, written in place. */
  const write = (key: string, v: string | null) => {
    const p = new URLSearchParams(window.location.search);
    if (v) p.set(key, v);
    else p.delete(key);
    const qs = p.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    notifyUrlChanged();
  };

  // The Category filter's values: the categories among the protocol's assets, with counts.
  const options = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.card.category, (m.get(r.card.category) ?? 0) + 1);
    return ASSET_CATEGORY_ORDER.filter((c) => m.has(c)).map((c) => ({
      value: c,
      label: ASSET_CATEGORY_LABELS[c],
      count: m.get(c) ?? 0,
    }));
  }, [rows]);
  const setCat = (c: string | null) => {
    setCats(c ? [c] : []);
    write("cat", c);
  };
  const filter = { label: "Category", name: "category", options, value: cat, onChange: setCat };

  // The "Also used in" filter's values: the other explorers on the chain, by
  // how many of the protocol's assets each also uses.
  const alsoOptions = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const r of rows)
      for (const ch of r.also) {
        const had = m.get(ch.explorer);
        m.set(ch.explorer, { label: ch.label, count: (had?.count ?? 0) + 1 });
      }
    return [...m.entries()]
      .map(([value, o]) => ({ value, ...o }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en-US"));
  }, [rows]);
  const setAlso = (v: string | null) => {
    setAlsoBy(v);
    write("also", v);
  };
  const alsoFilter = {
    label: "Also used in",
    name: "also",
    allLabel: "Any explorer",
    options: alsoOptions,
    value: alsoBy,
    onChange: setAlso,
  };

  const where = chainName(chain);
  return (
    <BoldReadContext.Provider value={boldRead}>
      <ScopeNote scoped={scoped} noun={["asset", "assets"]} className="mb-3" />
      <div {...scoped.listProps} data-anatomy="A6">
        {/* Below sm, where the stacked table draws no heading (decision 0070):
            one plain search over every text column (A6.3), and a removable
            chip for each heading filter the URL or a choice set. From sm the
            Asset heading carries the search (D10). */}
        <div className="mb-4 flex flex-col gap-2 sm:hidden" data-roster-controls="">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Symbol, address, category or explorer"
            size="pill"
            anatomy="A6.3 H15"
            className="w-full"
          />
          {(cat || alsoBy) && (
            <span className="flex flex-wrap gap-2">
              <HeadingFilterChip {...filter} />
              <HeadingFilterChip {...alsoFilter} />
            </span>
          )}
        </div>
        <p className="sr-only" aria-live="polite" data-roster-live="">
          {`${shown.length} ${shown.length === 1 ? "asset" : "assets"} shown`}
        </p>
        <DataTable
          caption={`The assets ${protocol} uses on ${where}, with each one's price at the day's close, what it is in ${protocol}, and the other explorers that use it there`}
          tableClassName="min-w-[900px] text-sm"
          stacked
          rowHeight="one"
          data-asset-table="protocol"
          data-asset-count={shown.length}
        >
          <DataTableHead>
            <DataTableHeader search={{ label: "Asset", value: query, onChange: setQuery, name: "asset" }} />
            <DataTableHeader filter={filter} />
            <DataTableHeader label="Price" align="right" />
            <DataTableHeader label="30 days" align="right" />
            <DataTableHeader label={`In ${protocol}`} />
            <DataTableHeader filter={alsoFilter} />
          </DataTableHead>
          <DataTableBody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-[13px] text-rb-500" data-asset-none="">
                  No asset matches.
                </td>
              </tr>
            ) : (
              shown.map((r) => <ProtocolAssetRow key={r.card.id} row={r} />)
            )}
          </DataTableBody>
        </DataTable>
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
