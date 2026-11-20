"use client";

// The protocols index's body (anatomy E8; rails-ops decision 0068 points 2 and
// 8, ui-jobs 781), in the /assets listing's parts: the h1 and the lead naming
// the table, the listings' toolbar (search; Chain and Category), then the
// house table (D1, stacked below sm as D6): a group per protocol, a line per
// launched explorer in the chain order (Miles, 20 Nov 2026). The group's first
// line shown carries the mark, name and category; a dashed hairline runs
// between its lines and a solid one between groups. Each line is its
// explorer's link (D4, its hover the house blue border on that line alone):
// the chain's mark (the line is the link), and the assets that explorer
// lists as one link to /assets on it. Ordered by name with no sort control: an index finds a row and ranks
// none. The selection lives in the URL (`?chain=`, `?type=`), written in place
// without a reload. The chain, the search and Focus act a line at a time; the
// facets and the count count protocols.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import { ScopeNote } from "@/components/shared/asset-scope-note";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import type { ChainId } from "@/lib/shared/chains";
import { useScopedRoster } from "@/lib/shared/explorer-scope";
import { PROTOCOL_TYPE_LABELS, type ProtocolType } from "@/lib/shared/protocol-types";
import {
  protocolLinesShown,
  sortProtocolRows,
  type ProtocolIndexLine,
  type ProtocolIndexRow,
  type ProtocolIndexState,
} from "@/lib/shared/protocol-index";
import { notifyUrlChanged } from "@/lib/shared/use-url-search-params";
import { ChainProvider } from "@/lib/shared/chain-context";
import { INDEX_FIRST_COL, MARK_LINK, MARK_TILE } from "@/lib/shared/ui-grammar";

const n = (v: number) => v.toLocaleString("en-US");
const CATEGORY_NOTE = "Rails’ classification of the protocol";
const typeLabel = (t: ProtocolType) => PROTOCOL_TYPE_LABELS[t];
/** A token's mark in the Assets group: its round shape at the tiles'
 *  24px, ringed in the page's ground so the overlap reads. */
const TOKEN_MARK =
  "inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background ring-2 ring-background";
/** The Assets cell draws this many marks, then "+N". */
const ASSETS_SHOWN = 5;

export const PROTOCOLS_LEAD =
  "The table below lists each protocol Rails runs an explorer for, with its category, and one line per chain with the assets that explorer lists. The categories are Rails’ classification: one per protocol, the one its positions read in.";

interface Filters extends BaseListFilters {
  chains: string[];
  types: string[];
}

export function ProtocolIndex({ rows: allRows, initial }: { rows: ProtocolIndexRow[]; initial: ProtocolIndexState }) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<ProtocolIndexState>(initial);
  const roster = useScopedRoster();
  // Held to the focus a line at a time; a protocol with no line left goes.
  const rows = useMemo(
    () =>
      sortProtocolRows(
        allRows.flatMap((r) => {
          const lines = r.lines.filter((l) => roster.shows(l.id));
          if (lines.length === 0) return [];
          return lines.length === r.lines.length ? [r] : [{ ...r, lines }];
        }),
      ),
    [allRows, roster], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const writeUrl = (next: ProtocolIndexState) => {
    const p = new URLSearchParams(window.location.search);
    const put = (k: string, v: string) => (v === "" ? p.delete(k) : p.set(k, v));
    put("chain", next.chains.join(","));
    put("type", next.types.join(","));
    const qs = p.toString().replace(/%2C/gi, ",");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    notifyUrlChanged();
  };

  const state: Filters = { q: query, chains: sel.chains, types: sel.types, sortBy: "name", sortOrder: "asc" };
  const asSel = (f: Filters): ProtocolIndexState => ({ chains: f.chains, types: f.types as ProtocolType[] });
  const onToolbar = (next: Filters) => {
    if (next.q !== query) setQuery(next.q);
    const s = asSel(next);
    setSel(s);
    writeUrl(s);
  };

  // The facets, each option counting the protocols it keeps (as the total
  // does), from the rows the focus leaves.
  const dimensions = useMemo<FilterDimension<Filters>[]>(() => {
    const chains = new Map<string, number>();
    const chainOf = new Map<string, { name: string; order: number }>();
    for (const r of rows)
      for (const id of new Set(r.lines.map((l) => String(l.chainId)))) chains.set(id, (chains.get(id) ?? 0) + 1);
    for (const r of rows)
      for (const l of r.lines) chainOf.set(String(l.chainId), { name: l.chainName, order: l.chainOrder });
    const types = new Map<string, number>();
    for (const r of rows) types.set(r.type, (types.get(r.type) ?? 0) + 1);
    const multi = (
      id: "chains" | "types",
      label: string,
      values: string[],
      labelOf: (v: string) => string,
      m: Map<string, number>,
      icon?: (v: string) => ReactNode,
    ): FilterDimension<Filters> => ({
      id,
      label,
      group: label,
      cardinality: "multi",
      options: values.map((value) => ({
        value,
        label: labelOf(value),
        meta: n(m.get(value) ?? 0),
        icon: icon?.(value),
      })),
      get: (s) => s[id],
      set: (s, v) => ({ ...s, [id]: v }),
    });
    return [
      multi(
        "chains",
        "Chain",
        [...chains.keys()].sort((a, b) => chainOf.get(a)!.order - chainOf.get(b)!.order),
        (c) => chainOf.get(c)?.name ?? c,
        chains,
        (c) => <ChainGlyph id={Number(c) as ChainId} className="h-3.5 w-3.5" />,
      ),
      multi(
        "types",
        "Category",
        (Object.keys(PROTOCOL_TYPE_LABELS) as ProtocolType[]).filter((t) => types.has(t)),
        (t) => typeLabel(t as ProtocolType),
        types,
      ),
    ];
  }, [rows]);

  const shownOf = (f: Filters) =>
    rows.flatMap((r) => {
      const lines = protocolLinesShown(r, asSel(f), f.q, typeLabel);
      return lines.length ? [{ row: r, lines }] : [];
    });
  const shown = shownOf(state);
  const filtering = query.trim() !== "" || sel.chains.length + sel.types.length > 0;
  const noun = (k: number) => (k === 1 ? "protocol" : "protocols");
  const countNode = (
    <span className="text-xs text-rb-500 tabular-nums" data-protocol-count={shown.length}>
      {filtering
        ? `${n(shown.length)} of ${n(rows.length)} ${noun(rows.length)}`
        : `${n(rows.length)} ${noun(rows.length)}`}
    </span>
  );

  return (
    <div>
      <header className="mb-4" data-anatomy="E8">
        <h1 className="text-2xl font-semibold text-foreground">Protocols</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-rb-500" data-protocol-index-lead="">
          {PROTOCOLS_LEAD}
        </p>
      </header>

      <ScopeNote scoped={roster} noun={["explorer", "explorers"]} className="mb-3" />

      <div {...roster.listProps}>
        <ListToolbar
          dimensions={dimensions}
          filters={state}
          onChange={onToolbar}
          sortOptions={[]}
          searchPlaceholder="Protocol, category or chain"
          countNode={countNode}
          sheetCount={{ total: shown.length, noun: noun(shown.length) }}
          countFor={(draft) => shownOf(draft).length}
          skel="protocol-index-toolbar"
        />
        {shown.length === 0 ? (
          <p className="text-[13px] text-rb-500" data-protocol-none="">
            No protocol matches.
          </p>
        ) : (
          <DataTable
            caption="The protocols Rails runs an explorer for, a line per chain, with each one's category and each explorer's assets"
            tableClassName="min-w-[640px] text-sm"
            stacked
            rowHeight="one"
            data-protocol-table=""
          >
            <DataTableHead>
              <DataTableHeader label="Protocol" />
              <DataTableHeader label="Category" />
              <DataTableHeader label="Chain" />
              <DataTableHeader label="Assets" />
            </DataTableHead>
            <DataTableBody>
              {shown.map(({ row, lines }) => (
                <Fragment key={row.key}>
                  {lines.map((l, i) => (
                    <ProtocolLine key={l.id} row={row} line={l} first={i === 0} />
                  ))}
                </Fragment>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </div>
    </div>
  );
}

/** The explorer's assets: "Any token", or one link to /assets on the
 *  explorer holding up to five overlapping marks and "+N". `hooks` marks the
 *  table's copy for the verifiers; the phone's copy draws without them. */
function LineAssets({
  row: r,
  line: l,
  named,
  hooks,
}: {
  row: ProtocolIndexRow;
  line: ProtocolIndexLine;
  named: string;
  hooks: boolean;
}) {
  const assets = l.assets ?? [];
  const more = assets.length - ASSETS_SHOWN;
  if (r.anyToken)
    return (
      <span className="text-sm text-rb-500" data-protocol-assets={hooks ? "any" : undefined}>
        Any token
      </span>
    );
  if (l.assets == null || assets.length === 0) return null;
  // One link per cell: /assets on this explorer. Rails' own list of the
  // tokens it names, so no chain figure.
  return (
    <Link
      href={`/assets?explorer=${encodeURIComponent(l.id)}`}
      prefetch={false}
      title={assets.map((a) => a.symbol).join(", ")}
      aria-label={`${named}: ${n(assets.length)} ${assets.length === 1 ? "asset" : "assets"} on the assets list`}
      className={`inline-flex items-center rounded px-0.5 py-0.5 ${MARK_LINK}`}
      data-protocol-assets={hooks ? assets.length : undefined}
      data-protocol-assets-link={hooks ? "" : undefined}
      data-prov-exempt=""
    >
      {assets.slice(0, ASSETS_SHOWN).map((a) => (
        // Overlapping, each ringed in the page's ground.
        <span
          key={`${a.chainId}:${a.symbol}`}
          className={`${TOKEN_MARK} not-first:-ml-1.5`}
          data-protocol-asset={hooks ? a.symbol : undefined}
        >
          <ChainProvider chainId={a.chainId as ChainId}>
            <TokenChipIcon symbol={a.symbol} address={a.address} size={22} filterable={false} untitled />
          </ChainProvider>
        </span>
      ))}
      {more > 0 && <span className="pr-0.5 pl-1.5 text-xs text-rb-500 tabular-nums">+{n(more)}</span>}
    </Link>
  );
}

/** One explorer's line in its protocol's group (E8.1): the whole line opens
 *  the explorer. The group's first line shown names the protocol and its
 *  category; a later line leaves both cells empty and continues the group
 *  (`data-dt-cont`, its hairline above dashed). Below sm the group reads as
 *  one card: the first line's head (mark, name, category) once, then a
 *  compact row per chain (its mark and name, the assets, a chevron), each the
 *  line's link; the table's other cells are not drawn there. */
function ProtocolLine({ row: r, line: l, first }: { row: ProtocolIndexRow; line: ProtocolIndexLine; first: boolean }) {
  const named = `${r.label} on ${l.chainName}`;
  return (
    <DataTableRow
      href={l.href}
      data-protocol-row={r.key}
      data-protocol-line={l.id}
      data-protocol-type={r.type}
      data-dt-cont={first ? undefined : ""}
      data-anatomy="E8.1"
    >
      <DataTableCell rowHeader valign="middle" className={INDEX_FIRST_COL}>
        <div className="flex min-w-0 items-center gap-2.5">
          {first ? (
            <ProtocolIcon id={r.iconId} className="h-7 w-7 shrink-0" />
          ) : (
            <span className="h-7 w-7 shrink-0 max-sm:hidden" aria-hidden />
          )}
          {/* The line's one link: the name on the group's first line, else
              the protocol's name for a screen reader alone. */}
          <DataTableRowLink
            href={l.href}
            aria-label={named}
            className={`min-w-0 truncate text-sm font-semibold ${first ? "" : "sr-only"}`}
            data-protocol-hub=""
          >
            {r.label}
          </DataTableRowLink>
          {first && (
            <span className="ml-auto shrink-0 text-xs text-rb-500 sm:hidden" aria-hidden>
              {typeLabel(r.type)}
            </span>
          )}
        </div>
        {/* Below sm: the chain's compact row in the group's card. */}
        <div className={`flex min-w-0 items-center gap-2 sm:hidden ${first ? "mt-2" : ""}`} data-phone-line="">
          <span className={`${MARK_TILE} text-rb-500`} aria-hidden>
            <ChainGlyph id={l.chainId as ChainId} className="h-3.5 w-3.5" />
          </span>
          <span className="w-20 shrink-0 truncate text-sm text-foreground">{l.chainName}</span>
          <span className="min-w-0 flex-1">
            <LineAssets row={r} line={l} named={named} hooks={false} />
          </span>
          <ChevronRight className="size-4 shrink-0 text-rb-500" aria-hidden />
        </div>
      </DataTableCell>
      {/* A later line's Category is blank; below sm the card's head names it. */}
      <DataTableCell data-dt-stack-hidden="" valign="middle" className="whitespace-nowrap sm:w-32">
        {first && (
          <span className="text-sm text-foreground" title={CATEGORY_NOTE} data-protocol-category={r.type}>
            {typeLabel(r.type)}
          </span>
        )}
      </DataTableCell>
      <DataTableCell data-dt-stack-hidden="" valign="middle" className="whitespace-nowrap sm:w-24">
        {/* The chain's mark on Listed by's tile; the line is the link. */}
        <span
          role="img"
          aria-label={l.chainName}
          title={l.chainName}
          className={`${MARK_TILE} text-rb-500`}
          data-protocol-chain={l.chainId}
        >
          <ChainGlyph id={l.chainId as ChainId} className="h-3.5 w-3.5" />
        </span>
      </DataTableCell>
      <DataTableCell data-dt-stack-hidden="" valign="middle" className="whitespace-nowrap sm:w-full">
        <LineAssets row={r} line={l} named={named} hooks />
      </DataTableCell>
    </DataTableRow>
  );
}
