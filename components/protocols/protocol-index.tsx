"use client";

// The protocols index's body (anatomy E8; rails-ops decisions 0068 point 2,
// 0069 point 1 and 0070, ui-jobs 781, 786). A ROSTER (decision 0070): bounded,
// chosen by Rails, every row loaded, so its controls live with the table. The
// h1 and the lead naming the table, the chain tabs (one chain at a time,
// Ethereum first, `?chain=<id>`), then the house table (D1, stacked below sm
// as D6), searched from its Protocol heading (D10) and Category filtered from
// its heading (D9, `?type=`); below sm, where no heading is drawn, one plain
// search and a chip for a set Category: a line per launched explorer on the tab's chain, by name, with no
// sort control (an index finds a row and ranks none). Each line is its
// explorer's link (D4) and splits its menu's entries (H5) in three cells, in
// the menu's order: Sections (the listing or Overview, the sub-pages), Assets
// (its asset marks, one link to its Assets page) and About. The selection lives in the URL, written in place without a reload.

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { ScopeNote } from "@/components/shared/asset-scope-note";
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
import type { ChainId } from "@/lib/shared/chains";
import { useScopedRoster } from "@/lib/shared/explorer-scope";
import { PROTOCOL_TYPE_LABELS, type ProtocolType } from "@/lib/shared/protocol-types";
import { protocolRowsShown, type ProtocolIndexRow, type ProtocolIndexState } from "@/lib/shared/protocol-index";
import { notifyUrlChanged } from "@/lib/shared/use-url-search-params";
import { INDEX_FIRST_COL, INLINE_LINK, MARK_LINK } from "@/lib/shared/ui-grammar";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ChainProvider } from "@/lib/shared/chain-context";

const CATEGORY_NOTE = "Rails’ classification of the protocol";
/** A token's mark in the Assets cell: its round shape at 24px, ringed in the
 *  page's ground so the overlap reads. */
const TOKEN_MARK =
  "inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background ring-2 ring-background";
/** The Assets cell draws this many marks, then "+N". */
const ASSETS_SHOWN = 5;
const typeLabel = (t: ProtocolType) => PROTOCOL_TYPE_LABELS[t];
/** A chain tab: its glyph and name, the chosen one on the raised ground. */
const TAB = "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm transition-colors focus-ring";
const TAB_ON = "bg-rb-200 font-semibold text-foreground dark:bg-rb-700";
const TAB_OFF = "text-rb-500 hover:bg-[var(--surface-hover)] hover:text-foreground";
/** A testnet's mark on its tab, as H3.1's pill. */
const TESTNET_PILL = "rounded-xs bg-rb-300 px-1.5 py-0.5 text-[11px] font-semibold text-foreground/70 dark:bg-rb-700";

export function ProtocolIndex({
  rows: allRows,
  chains,
  initial,
}: {
  rows: ProtocolIndexRow[];
  /** The tabs, in the chain order: the launched chains with an explorer. */
  chains: { id: number; name: string; testnet: boolean }[];
  initial: ProtocolIndexState;
}) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<ProtocolIndexState>(initial);
  const roster = useScopedRoster();
  const rows = useMemo(() => allRows.filter((r) => roster.shows(r.id)), [allRows, roster]);
  // The tabs follow the Focus as the wallet panel's chooser does
  // (`chainShows`): a chain only where one of its explorers shows; with none,
  // the chain asked for keeps its tab so the page still names it. A ?chain=
  // the Focus leaves out shows the first focused chain; the URL stays as it
  // came, as the listings keep a filter the Focus hides.
  const tabs = useMemo(() => {
    const shown = chains.filter((c) => roster.chainShows(c.id as ChainId));
    return shown.length ? shown : chains.filter((c) => c.id === sel.chain);
  }, [chains, roster, sel.chain]);
  const chain = tabs.some((c) => c.id === sel.chain) ? sel.chain : (tabs[0]?.id ?? sel.chain);
  const chainName = chains.find((c) => c.id === chain)?.name ?? "";

  const writeUrl = (next: ProtocolIndexState) => {
    const p = new URLSearchParams(window.location.search);
    if (next.chain === chains[0]?.id) p.delete("chain");
    else p.set("chain", String(next.chain));
    if (next.types.length) p.set("type", next.types.join(","));
    else p.delete("type");
    const qs = p.toString().replace(/%2C/gi, ",");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    notifyUrlChanged();
  };
  const choose = (next: ProtocolIndexState) => {
    setSel(next);
    writeUrl(next);
  };

  const type = (sel.types[0] as ProtocolType | undefined) ?? null;
  const setType = (t: string | null) => choose({ ...sel, types: t ? [t as ProtocolType] : [] });

  // The Category filter's values: the categories on the tab, with counts.
  const onTab = useMemo(() => rows.filter((r) => r.chainId === chain), [rows, chain]);
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of onTab) m.set(r.type, (m.get(r.type) ?? 0) + 1);
    return (Object.keys(PROTOCOL_TYPE_LABELS) as ProtocolType[])
      .filter((t) => m.has(t))
      .map((t) => ({ value: t, label: typeLabel(t), count: m.get(t) ?? 0 }));
  }, [onTab]);
  const filter = { label: "Category", name: "category", options: categories, value: type, onChange: setType };
  // From sm the Protocol heading's search reads the name; below sm the one
  // search reads every text column (decision 0070).
  const phone = useMediaQuery(PHONE_QUERY);
  const shown = protocolRowsShown(rows, { chain, types: type ? [type] : [] }, query, typeLabel, phone);

  return (
    <div>
      <header className="mb-4" data-anatomy="E8">
        <h1 className="text-2xl font-semibold text-foreground">Protocols by chain</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-rb-500" data-protocol-index-lead="">
          The table below lists each protocol Rails runs an explorer for on {chainName}, with its category and its
          sections. The categories are Rails&rsquo; classification: one per protocol, the one its positions read in.
        </p>
      </header>

      {/* The control row (decision 0070: a roster): the chain tabs (E8.2);
          below sm one plain search under them (E8.4) and, for a Category the
          URL or a choice set, a removable chip, as the stacked table draws no
          heading. Held with the list until the Focus is read, so no tab it
          leaves out flashes. */}
      <div {...roster.listProps} className="mb-4 flex flex-col gap-2" data-roster-controls="">
        <div
          role="tablist"
          aria-label="Chain"
          className="-mx-1 flex flex-wrap items-center gap-1"
          data-protocol-tabs=""
          data-anatomy="E8.2"
        >
          {tabs.map((c) => {
            const on = c.id === chain;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => choose({ ...sel, chain: c.id })}
                className={`${TAB} ${on ? TAB_ON : TAB_OFF}`}
                data-protocol-tab={c.id}
              >
                <ChainGlyph id={c.id as ChainId} className="h-4 w-4 shrink-0" />
                {c.name}
                {c.testnet && (
                  <span className={TESTNET_PILL} data-testnet-pill="">
                    Testnet
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Protocol or category"
          size="pill"
          anatomy="E8.4 H15"
          className="w-full sm:hidden"
        />
        {type && (
          <span className="sm:hidden">
            <HeadingFilterChip {...filter} />
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite" data-roster-live="">
        {`${shown.length} ${shown.length === 1 ? "protocol" : "protocols"} shown`}
      </p>

      <ScopeNote scoped={roster} noun={["explorer", "explorers"]} className="mb-3" />

      <div {...roster.listProps} role="tabpanel" aria-label={chainName}>
        <DataTable
          caption={`The protocols Rails runs an explorer for on ${chainName}, with each one's category, sections, assets and About page`}
          tableClassName="min-w-[640px] text-sm"
          stacked
          rowHeight="one"
          data-protocol-table=""
          data-protocol-count={shown.length}
        >
          <DataTableHead>
            <DataTableHeader search={{ label: "Protocol", value: query, onChange: setQuery, name: "protocol" }} />
            <DataTableHeader filter={filter} />
            <DataTableHeader label="Sections" />
            <DataTableHeader label="Assets" />
            <DataTableHeader label={<span className="sr-only">About</span>} />
          </DataTableHead>
          <DataTableBody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-[13px] text-rb-500" data-protocol-none="">
                  No protocol matches.
                </td>
              </tr>
            ) : (
              shown.map((r) => <ProtocolLine key={r.id} row={r} chainName={chainName} />)
            )}
          </DataTableBody>
        </DataTable>
      </div>
    </div>
  );
}

/** The explorer's sections as links (E8.3), above the line's cover: its
 *  menu's entries but Assets and About; on a phone's card About after them. */
function Sections({ row: r, named, about = false }: { row: ProtocolIndexRow; named: string; about?: boolean }) {
  const links = about ? [...r.sections, { href: r.aboutHref, name: "About" }] : r.sections;
  return (
    <nav aria-label={`${named} sections`} className="relative z-[1]" data-protocol-sections="" data-anatomy="E8.3">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {links.map((s) => (
          <li key={s.href}>
            <Link href={s.href} prefetch={false} className={INLINE_LINK} data-protocol-section={s.name}>
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The explorer's assets (E8.5): "Any token" on a DEX or trading line; a
 *  muted dash where it has no Assets page; else up to five overlapping round
 *  marks and "+N" as one link to its Assets page, every symbol in its title.
 *  `hooks` marks the table's copy for the verifiers. */
function LineAssets({ row: r, named, hooks }: { row: ProtocolIndexRow; named: string; hooks: boolean }) {
  if (r.anyToken)
    return (
      <span className="text-sm text-rb-500" data-protocol-assets={hooks ? "any" : undefined}>
        Any token
      </span>
    );
  const assets = r.assets ?? [];
  if (!r.assetsHref || assets.length === 0)
    return (
      <span className="text-sm text-rb-500" data-protocol-assets={hooks ? "none" : undefined}>
        <span aria-hidden>–</span>
        <span className="sr-only">no assets page</span>
      </span>
    );
  const more = assets.length - ASSETS_SHOWN;
  return (
    <Link
      href={r.assetsHref}
      prefetch={false}
      title={assets.map((a) => a.symbol).join(", ")}
      aria-label={`${named}: ${assets.length.toLocaleString("en-US")} ${assets.length === 1 ? "asset" : "assets"}`}
      className={`relative z-[1] inline-flex items-center rounded px-0.5 py-0.5 ${MARK_LINK}`}
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
      {more > 0 && (
        <span className="pr-0.5 pl-1.5 text-xs text-rb-500 tabular-nums">+{more.toLocaleString("en-US")}</span>
      )}
    </Link>
  );
}

/** One explorer on the tab's chain (E8.1): the whole line opens it; its
 *  menu's entries split in three cells in its order: Sections, Assets, About.
 *  Below sm a card: the head (mark, name, category at its right), the
 *  sections and About on one wrapped row, the asset marks on their own. */
function ProtocolLine({ row: r, chainName }: { row: ProtocolIndexRow; chainName: string }) {
  const named = `${r.label} on ${chainName}`;
  return (
    <DataTableRow
      href={r.href}
      data-protocol-row={r.id}
      data-protocol-line={r.id}
      data-protocol-type={r.type}
      data-anatomy="E8.1"
    >
      <DataTableCell rowHeader valign="middle" className={INDEX_FIRST_COL}>
        <div className="flex min-w-0 items-center gap-2.5">
          <ProtocolIcon id={r.id} className="h-7 w-7 shrink-0" />
          <DataTableRowLink
            href={r.href}
            aria-label={named}
            className="min-w-0 truncate text-sm font-semibold"
            data-protocol-hub=""
          >
            {r.label}
          </DataTableRowLink>
          <span className="ml-auto shrink-0 text-xs text-rb-500 sm:hidden" aria-hidden>
            {typeLabel(r.type)}
          </span>
        </div>
        {/* Below sm: the sections and About, then the asset marks. */}
        <div className="mt-2 flex flex-col gap-1.5 sm:hidden" data-phone-line="">
          <Sections row={r} named={named} about />
          <LineAssets row={r} named={named} hooks={false} />
        </div>
      </DataTableCell>
      <DataTableCell data-dt-stack-hidden="" valign="middle" className="whitespace-nowrap sm:w-32">
        <span className="text-sm text-foreground" title={CATEGORY_NOTE} data-protocol-category={r.type}>
          {typeLabel(r.type)}
        </span>
      </DataTableCell>
      <DataTableCell data-dt-stack-hidden="" valign="middle">
        <Sections row={r} named={named} />
      </DataTableCell>
      <DataTableCell data-dt-stack-hidden="" valign="middle" className="whitespace-nowrap" data-anatomy="E8.5">
        <LineAssets row={r} named={named} hooks />
      </DataTableCell>
      <DataTableCell data-dt-stack-hidden="" valign="middle" className="whitespace-nowrap" data-anatomy="E8.6">
        <Link
          href={r.aboutHref}
          prefetch={false}
          aria-label={`About ${named}`}
          className={`relative z-[1] text-sm ${INLINE_LINK}`}
          data-protocol-about=""
        >
          About
        </Link>
      </DataTableCell>
    </DataTableRow>
  );
}
