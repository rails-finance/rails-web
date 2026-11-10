"use client";

// The asset explorer's body (rails-ops reference/asset-key-map.md, "The asset
// explorer"; anatomy A5): the h1 with its (i) drawer, the listings' toolbar
// (search, Category, Chain, Explorer and, under Focus, Focus; the sort), then
// one table row per asset (A5.4) in the house table (D1, stacked below sm).
// The selection lives in the URL (`?cat=`, `?chain=`, `?explorer=`,
// `?focus=`, `?sort=`, `?dir=`), written in place without a reload.
//
// SORT. From sm the headers sort (D2): Asset by symbol, Price by how many
// series read it (the default), Change and Listed by; below sm the rows stack
// (D6) and the toolbar's sort offers every order, Flagged first included.
//
// FOCUS (ui-jobs 557). /assets is where many assets join the focus: each row's
// ⋮ (D7) holds "Add to focus" or "Remove from focus", and under "Add assets"
// a row in focus carries an "in focus" pill after its name; with a filter on, "Focus on these N"
// makes the shown assets the focus (50 at most). Like every page the list is
// held to the focus; "Add assets" (`?manage=1`, also the Focus panel's "Add
// from all assets") shows every asset until "Done" (Miles, 10 Nov 2026).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { asOfMark, asOfWords, flagWords, fmtRowPrice } from "@/components/assets/asset-price-row";
import { PriceUnitMark } from "@/components/assets/price-unit-mark";
import { fmtChange, PriceSparkline } from "@/components/assets/price-sparkline";
import { formatCompactTitled } from "@/lib/shared/format-compact";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { InfoDisclosureTrigger } from "@/components/shared/info-disclosure";
import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
  DataTableRowMenu,
  DATA_TABLE_PILL,
  type DataTableDir,
} from "@/components/shared/data-table/data-table";
import { ASSET_CATEGORY_LABELS, ASSET_CATEGORY_ORDER, type AssetCategory } from "@/lib/shared/asset-categories";
import {
  CARD_SORTS,
  sortCards,
  type AssetCard,
  type AssetChip,
  type CardFigure,
  type CardSort,
  type ExplorerState,
  PRICELESS_WHY,
} from "@/lib/shared/asset-explorer";
import { chainName } from "@/lib/shared/asset-roster";
import type { ChainId } from "@/lib/shared/chains";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import { useScopedRows } from "@/components/shared/asset-scope-note";
import { assetKey } from "@/lib/shared/asset-family";
import {
  focusViews,
  MANAGE_PARAM,
  OPEN_SCOPE_PANEL,
  registerSymbols,
  useAssetScope,
  type AssetPick,
} from "@/lib/shared/asset-scope";
import { notifyUrlChanged, useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";

const CATEGORY_NOTE = "Rails’ classification of the asset";
const n = (v: number) => v.toLocaleString("en-US");

/** "Focus on these N" takes this many assets at most. */
const FOCUS_ON_MAX = 50;
/** The Explorers cell draws this many marks, then "+N". */
const MARKS_SHOWN = 4;

/** The sortable headers: the sort each presses and the direction a first
 *  press takes (sortCards reads Symbol A to Z on "asc", the rest most first
 *  on "desc"). */
const HEAD_SORT: Partial<Record<string, { sort: CardSort; first: DataTableDir }>> = {
  Asset: { sort: "symbol", first: "asc" },
  Price: { sort: "read", first: "desc" },
  Change: { sort: "change", first: "desc" },
  "Listed by": { sort: "explorers", first: "desc" },
};

interface Filters extends BaseListFilters {
  cats: string[];
  chains: string[];
  explorers: string[];
  focus: string[];
}

const keysOf = (c: AssetCard) => c.chains.map((x) => assetKey(x.chain, x.token));

export function AssetExplorer({
  cards: allCards,
  initial,
  initialSearch,
  about,
}: {
  cards: AssetCard[];
  initial: ExplorerState;
  initialSearch: string;
  /** The (i) drawer's body: what the list is and the day its prices read. */
  about: ReactNode;
}) {
  const scope = useAssetScope();
  const [introOpen, setIntroOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFiltersState] = useState<Omit<Filters, "q">>({
    cats: initial.cats,
    chains: initial.chains.map(String),
    explorers: initial.explorers,
    focus: initial.focus,
    sortBy: initial.sort,
    sortOrder: initial.dir,
  });

  // Every row's symbol, so a pick added here is named everywhere.
  useEffect(() => {
    registerSymbols(
      allCards.flatMap((c) => c.chains.map((x) => ({ chain: x.chain, token: x.token, symbol: c.symbol }))),
    );
  }, [allCards]);

  const sp = useUrlSearchParams(initialSearch);
  const manage = scope.on && sp.get(MANAGE_PARAM) === "1";
  const setManage = useCallback((on: boolean) => {
    const p = new URLSearchParams(window.location.search);
    if (on) p.set(MANAGE_PARAM, "1");
    else p.delete(MANAGE_PARAM);
    const qs = p.toString().replace(/%2C/gi, ",").replace(/%2B/g, "+").replace(/%3A/gi, ":");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    notifyUrlChanged();
  }, []);

  // Held to the focus like every list (Miles, 9 Nov 2026): a row is kept when
  // one of its chains' tokens passes it, and its chain marks and explorers
  // keep only the chains that do. Managing shows every row.
  const scoped = useScopedRows(allCards, keysOf);
  const narrow = scope.on && !manage;
  const cards = useMemo(
    () =>
      !narrow
        ? allCards
        : scoped.rows.map((c) => {
            const chains = c.chains.filter((x) => scope.matches([assetKey(x.chain, x.token)], x.chain));
            if (chains.length === c.chains.length) return c;
            const on = new Set(chains.map((x) => x.chain));
            return { ...c, chains, chips: c.chips.filter((ch) => on.has(ch.chain)) };
          }),
    [narrow, allCards, scoped.rows, scope.matches], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const inFocus = useCallback(
    (c: AssetCard) => scope.on && c.chains.some((x) => scope.matches([assetKey(x.chain, x.token)], x.chain)),
    [scope.on, scope.matches], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** The picks that name one of the row's tokens. */
  const picked = useCallback(
    (c: AssetCard) => {
      const ks = new Set(keysOf(c));
      return scope.picks.filter((p) => ks.has(assetKey(p.chain, p.token)));
    },
    [scope.picks],
  );
  /** A row's picks: one per chain, each carrying the row's other chains as
   *  its asset record, so chain focus finds it by address on any of them. */
  const picksOf = (c: AssetCard): AssetPick[] =>
    c.chains.map((x) => ({
      chain: x.chain,
      token: x.token.toLowerCase(),
      builtOn: true,
      symbol: c.symbol,
      also: c.chains.filter((y) => y !== x).map((y) => ({ chain: y.chain, token: y.token.toLowerCase() })),
    }));
  const add = (c: AssetCard) => {
    // The first add keeps the whole list in view, to go on adding.
    if (!scope.on) setManage(true);
    const have = new Set(scope.picks.map((p) => assetKey(p.chain, p.token)));
    scope.setPicks([...scope.picks, ...picksOf(c).filter((p) => !have.has(assetKey(p.chain, p.token)))]);
  };
  const remove = (c: AssetCard) => {
    const ks = new Set(keysOf(c));
    scope.setPicks(scope.picks.filter((p) => !ks.has(assetKey(p.chain, p.token))));
  };

  const writeUrl = useCallback((next: Omit<Filters, "q">) => {
    const p = new URLSearchParams(window.location.search);
    const put = (k: string, v: string, def = "") => (v === def ? p.delete(k) : p.set(k, v));
    put("cat", next.cats.join(","));
    put("chain", next.chains.join(","));
    put("explorer", next.explorers.join(","));
    put("focus", next.focus.join(","));
    put("sort", next.sortBy, "read");
    put("dir", next.sortOrder, "desc");
    // A saved listing's `view` goes with a filter change; a focus link's
    // `&view=` name (with `?assets=` or `?chains=`) stays for its dialog.
    if (!p.has("assets") && !p.has("chains")) p.delete("view");
    const qs = p.toString().replace(/%2C/gi, ",").replace(/%2B/g, "+").replace(/%3A/gi, ":");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    notifyUrlChanged();
  }, []);

  const state: Filters = { q: query, ...filters };
  const onToolbar = (next: Filters) => {
    if (next.q !== query) setQuery(next.q);
    const { q: _q, ...rest } = next; // eslint-disable-line @typescript-eslint/no-unused-vars
    setFiltersState(rest);
    writeUrl(rest);
  };

  const setSort = (sortBy: CardSort, sortOrder: DataTableDir) => {
    const next = { ...filters, sortBy, sortOrder };
    setFiltersState(next);
    writeUrl(next);
  };
  /** A header's press: the same key flips, another takes its first direction. */
  const pressHead = (label: string) => {
    const h = HEAD_SORT[label]!;
    setSort(h.sort, filters.sortBy === h.sort ? (filters.sortOrder === "asc" ? "desc" : "asc") : h.first);
  };
  const headerFor = (label: string, align: "left" | "right" = "left") => {
    const h = HEAD_SORT[label];
    return (
      <DataTableHeader
        key={label}
        label={label}
        align={align}
        sort={
          h ? { dir: filters.sortBy === h.sort ? filters.sortOrder : null, onSort: () => pressHead(label) } : undefined
        }
        data-sort-key={h?.sort}
      />
    );
  };

  // ── the facets, their options from the rows the focus leaves ─────────────
  const dimensions = useMemo<FilterDimension<Filters>[]>(() => {
    const count = <K extends string>(keyOf: (c: AssetCard) => K[]) => {
      const m = new Map<K, number>();
      for (const c of cards) for (const k of new Set(keyOf(c))) m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    };
    const cats = count((c) => [c.category]);
    const chains = count((c) => c.chains.map((x) => String(x.chain)));
    const explorers = count((c) => c.chips.map((ch) => ch.explorer));
    const chipOf = new Map<string, AssetChip>();
    for (const c of cards) for (const ch of c.chips) if (!chipOf.has(ch.explorer)) chipOf.set(ch.explorer, ch);
    const labels = new Map<string, number>();
    for (const ch of chipOf.values()) labels.set(ch.label, (labels.get(ch.label) ?? 0) + 1);
    const explorerLabel = (id: string) => {
      const ch = chipOf.get(id);
      if (!ch) return id;
      return (labels.get(ch.label) ?? 0) > 1 ? `${ch.label}, ${chainName(ch.chain)}` : ch.label;
    };
    const byCount = (m: Map<string, number>, label: (v: string) => string) =>
      [...m.keys()].sort((a, b) => (m.get(b) ?? 0) - (m.get(a) ?? 0) || label(a).localeCompare(label(b), "en-US"));
    const multi = (
      id: keyof Pick<Filters, "cats" | "chains" | "explorers">,
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
    const dims: FilterDimension<Filters>[] = [
      multi(
        "cats",
        "Category",
        ASSET_CATEGORY_ORDER.filter((c) => cats.has(c)),
        (c) => ASSET_CATEGORY_LABELS[c as AssetCategory],
        cats as Map<string, number>,
      ),
      multi(
        "chains",
        "Chain",
        byCount(chains, (c) => chainName(Number(c))),
        (c) => chainName(Number(c)),
        chains,
        (c) => <ChainGlyph id={Number(c) as ChainId} className="h-3.5 w-3.5" />,
      ),
      multi("explorers", "Explorer", byCount(explorers, explorerLabel), explorerLabel, explorers, (id) => (
        <ProtocolIcon id={id} className="h-3.5 w-3.5" />
      )),
    ];
    if (scope.on) {
      const inN = cards.filter(inFocus).length;
      dims.push({
        id: "focus",
        label: "Focus",
        group: "Focus",
        cardinality: "single",
        options: [
          { value: "in", label: "In focus", meta: n(inN) },
          { value: "out", label: "Not in focus", meta: n(cards.length - inN) },
        ],
        get: (s) => s.focus,
        set: (s, v) => ({ ...s, focus: v }),
      });
    }
    return dims;
  }, [cards, scope.on, inFocus]);

  const passesFor = (s: Filters) => {
    const want = s.q.trim().toLowerCase();
    return (c: AssetCard) =>
      (s.cats.length === 0 || s.cats.includes(c.category)) &&
      (s.chains.length === 0 || c.chains.some((x) => s.chains.includes(String(x.chain)))) &&
      (s.explorers.length === 0 || c.chips.some((ch) => s.explorers.includes(ch.explorer))) &&
      (!scope.on || s.focus.length === 0 || s.focus.includes(inFocus(c) ? "in" : "out")) &&
      (want === "" ||
        c.symbol.toLowerCase().includes(want) ||
        c.chains.some((x) => x.token.toLowerCase().includes(want)) ||
        ASSET_CATEGORY_LABELS[c.category].toLowerCase().includes(want));
  };
  const shown = useMemo(
    () => sortCards(cards.filter(passesFor(state)), filters.sortBy as CardSort, filters.sortOrder),
    [cards, query, filters, scope.on, inFocus], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const filtering =
    query.trim() !== "" ||
    filters.cats.length + filters.chains.length + filters.explorers.length + (scope.on ? filters.focus.length : 0) > 0;

  // "Focus on these N" (Miles, 10 Nov 2026): a new view holding the shown
  // assets (on the chains in focus), put in use; the view in use is kept.
  const focusOnShown = () =>
    focusViews.add({
      assets: shown
        .flatMap(picksOf)
        .filter((p, i, all) => all.findIndex((q) => q.chain === p.chain && q.token === p.token) === i),
      chains: scope.chains,
    });

  const countNode = (
    <span className="text-xs text-rb-500 tabular-nums" data-asset-count={shown.length}>
      {filtering
        ? `${n(shown.length)} of ${n(cards.length)} ${cards.length === 1 ? "asset" : "assets"}`
        : `${n(cards.length)} ${cards.length === 1 ? "asset" : "assets"}`}
    </span>
  );

  return (
    <div>
      <header className="mb-4" data-anatomy="A5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Assets</h1>
          <InfoDisclosureTrigger
            open={introOpen}
            onToggle={() => setIntroOpen((o) => !o)}
            label="about this list"
            ariaControls="asset-explorer-intro"
          />
        </div>
        <div
          id="asset-explorer-intro"
          data-intro-drawer
          hidden={!introOpen}
          className="mt-2 max-w-3xl rounded-xl bg-raised px-3 py-3 text-[12px] leading-relaxed text-rb-500"
        >
          {about}
        </div>
      </header>

      {scope.on && (
        <p className="mb-3 text-xs text-rb-500" data-asset-focus-line={manage ? "manage" : "focus"}>
          {manage ? (
            <>
              Showing all assets to add to your focus ·{" "}
              <button
                type="button"
                onClick={() => setManage(false)}
                className={`font-semibold ${INPLACE_TEXT}`}
                data-asset-manage-done=""
              >
                Done
              </button>
            </>
          ) : (
            <>
              Showing {n(scoped.rows.length)} of {n(allCards.length)} {allCards.length === 1 ? "asset" : "assets"} in
              your focus ·{" "}
              <button
                type="button"
                onClick={() => setManage(true)}
                className={`font-semibold ${INPLACE_TEXT}`}
                data-asset-manage=""
              >
                Add assets
              </button>
            </>
          )}
        </p>
      )}

      <div {...scoped.listProps}>
        <ListToolbar
          dimensions={dimensions}
          filters={state}
          onChange={onToolbar}
          sortOptions={[]}
          mobileSort={{
            options: [...CARD_SORTS],
            sortBy: filters.sortBy,
            sortOrder: filters.sortOrder,
            onChange: (key, order) => {
              const k = key as CardSort;
              const first = Object.values(HEAD_SORT).find((h) => h?.sort === k)?.first ?? "desc";
              setSort(k, k === filters.sortBy ? order : first);
            },
          }}
          searchPlaceholder="Symbol, address or category"
          countNode={countNode}
          sheetCount={{ total: shown.length, noun: "assets" }}
          countFor={(draft) => cards.filter(passesFor(draft)).length}
          skel="asset-explorer-toolbar"
        />

        {filtering && shown.length > 0 && (
          <p className="-mt-3 mb-4 text-xs text-rb-500" data-asset-focus-on={shown.length}>
            {shown.length <= FOCUS_ON_MAX ? (
              <button
                type="button"
                onClick={focusOnShown}
                className={`font-semibold ${INPLACE_TEXT}`}
                data-asset-focus-on-press=""
              >
                Focus on {shown.length === 1 ? "this asset" : `these ${n(shown.length)}`}
              </button>
            ) : (
              <>Narrow to {FOCUS_ON_MAX} or fewer to focus on them</>
            )}
          </p>
        )}

        {shown.length === 0 ? (
          <p className="text-[13px] text-rb-500">No asset matches.</p>
        ) : (
          <DataTable
            caption="Assets, with their price at the day's close and the Rails explorers that list them"
            tableClassName="min-w-[860px] text-sm"
            stacked
            rowHeight="one"
            data-asset-table=""
          >
            <DataTableHead>
              {headerFor("Asset")}
              {headerFor("Category")}
              {headerFor("Chains")}
              {headerFor("Price", "right")}
              {headerFor("30 days", "right")}
              {headerFor("Change", "right")}
              {headerFor("Listed by")}
              <DataTableHeader label={<span className="sr-only">Actions</span>} data-col-head="menu" />
            </DataTableHead>
            <DataTableBody>
              {shown.map((c) => (
                <AssetRow
                  key={c.id}
                  card={c}
                  focusOn={scope.on}
                  marked={manage}
                  inFocus={inFocus(c)}
                  picked={picked(c).length > 0}
                  onAdd={() => add(c)}
                  onRemove={() => remove(c)}
                />
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </div>
    </div>
  );
}

/** One asset as a table row (A5.4): the whole row opens its page. */
function AssetRow({
  card: c,
  focusOn,
  marked,
  inFocus,
  picked,
  onAdd,
  onRemove,
}: {
  card: AssetCard;
  focusOn: boolean;
  /** "Add assets" shows every row, so the ones in focus carry the pill;
   *  held to the focus, every row is in it and none does. */
  marked: boolean;
  inFocus: boolean;
  picked: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const href = c.row?.href ?? c.chains.find((x) => x.href)?.href ?? null;
  const row = c.row;
  const flag = row?.flag ? flagWords(row.flag) : null;
  const token = c.chains[0]?.token ?? "";
  const name = (
    <span className="min-w-0 truncate text-sm font-semibold" title={c.symbol}>
      {c.symbol}
    </span>
  );
  return (
    <DataTableRow
      href={href ?? undefined}
      data-asset-card={c.id}
      data-asset-category={c.category}
      data-asset-in-focus={focusOn ? (inFocus ? (picked ? "picked" : "built-on") : "out") : undefined}
      data-anatomy="A5.4"
    >
      <DataTableCell rowHeader valign="middle" className="sm:w-full sm:max-w-0 sm:min-w-[160px]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0" data-prov-exempt>
            <TokenChipIcon symbol={c.symbol} address={token} size={28} filterable={false} untitled />
          </span>
          {href ? (
            <DataTableRowLink href={href} className="flex min-w-0 items-baseline gap-1.5">
              {name}
            </DataTableRowLink>
          ) : (
            name
          )}
          {c.short && <span className="shrink-0 font-mono text-[11px] text-rb-500">{c.short}</span>}
          {marked && inFocus && (
            <span
              className={`${DATA_TABLE_PILL} shrink-0 px-1.5 py-0.5 text-[11px]`}
              title={picked ? "In your focus" : "In your focus through what it is built on"}
              data-pill="in-focus"
              data-asset-focus-pill={picked ? "picked" : "built-on"}
            >
              In focus
            </span>
          )}
        </div>
      </DataTableCell>
      <DataTableCell label="Category" valign="middle" className="whitespace-nowrap">
        <span
          className="text-sm text-foreground"
          title={CATEGORY_NOTE}
          data-asset-category-badge={c.category}
          data-anatomy="A5.8"
        >
          {ASSET_CATEGORY_LABELS[c.category]}
        </span>
      </DataTableCell>
      <DataTableCell label="Chains" valign="middle" className="whitespace-nowrap">
        <span className="flex items-center gap-1.5" data-asset-card-chains="">
          {c.chains.map((x) =>
            x.href ? (
              <Link
                key={`${x.chain}:${x.token}`}
                href={x.href}
                title={`${c.symbol} on ${chainName(x.chain)}`}
                aria-label={`${c.symbol} on ${chainName(x.chain)}`}
                className="text-rb-500 hover:text-foreground"
              >
                <ChainGlyph id={x.chain as ChainId} className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span
                key={`${x.chain}:${x.token}`}
                title={`${c.symbol} on ${chainName(x.chain)}`}
                className="text-rb-500"
              >
                <ChainGlyph id={x.chain as ChainId} className="h-3.5 w-3.5" />
              </span>
            ),
          )}
        </span>
      </DataTableCell>
      <DataTableCell label="Price" align="right" valign="middle" className="whitespace-nowrap tabular-nums">
        {row && row.price != null ? (
          <span
            className="inline-flex items-center justify-end gap-1"
            data-asset-price-row={`${row.chain}:${row.token}`}
            data-anatomy="A5.1"
          >
            <PriceUnitMark unit={row.unit} size={14} />
            <span className="font-semibold text-foreground">{fmtRowPrice(row.price)}</span>
            {row.asOf && (
              <span
                className="ml-1 text-[11px] text-rb-500"
                title={`The stored round in force ${asOfWords(row.asOf)}`}
                data-asset-price-as-of={row.asOf.block}
                data-anatomy="A5.3"
              >
                {asOfMark(row.asOf)}
              </span>
            )}
            {flag && (
              <span
                className="ml-1.5 rounded border border-[var(--caution)] px-1 text-[11px] leading-4 text-[var(--caution)]"
                title={flag.text}
                data-asset-price-flag={row.flag?.gap ? "gap" : "fixed"}
                data-anatomy="A5.2"
              >
                {flag.mark}
              </span>
            )}
          </span>
        ) : c.figure ? (
          <FigureRow figure={c.figure} />
        ) : (
          <span className="text-xs text-rb-500" title={PRICELESS_WHY} data-asset-priceless="" data-anatomy="A5.10">
            No price
          </span>
        )}
      </DataTableCell>
      <DataTableCell label="30 days" align="right" valign="middle">
        {row ? (
          <PriceSparkline points={row.spark} label={`${c.symbol} over 30 days`} className="ml-auto h-7 w-24" />
        ) : (
          <None />
        )}
      </DataTableCell>
      <DataTableCell label="Change" align="right" valign="middle" className="whitespace-nowrap tabular-nums">
        {row?.change != null ? (
          <span
            className={`text-xs ${row.change >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            data-asset-price-change={row.change}
          >
            {fmtChange(row.change)}
          </span>
        ) : (
          <None />
        )}
      </DataTableCell>
      <DataTableCell label="Listed by" valign="middle" className="whitespace-nowrap">
        <ExplorerMarks card={c} />
      </DataTableCell>
      {/* The row's ⋮ (D7): the Focus entry; on a card it sits at the top right. */}
      <DataTableCell valign="middle" className="dt-row-menu w-px whitespace-nowrap" data-col="menu">
        <AssetRowMenu inFocus={inFocus} picked={picked} symbol={c.symbol} onAdd={onAdd} onRemove={onRemove} />
      </DataTableCell>
    </DataTableRow>
  );
}

const None = () => (
  <span className="text-sm text-rb-500">
    <span aria-hidden>–</span>
    <span className="sr-only">no figure</span>
  </span>
);

/** The explorers that list the asset: up to four marks, each linking where
 *  its chip links (A5.9), then "+N"; their names in each mark's title. */
function ExplorerMarks({ card: c }: { card: AssetCard }) {
  if (!c.chips.length) return <span className="text-xs text-rb-500">None</span>;
  const many = c.chains.length > 1;
  const more = c.chips.length - MARKS_SHOWN;
  return (
    <span className="flex items-center gap-1" data-asset-chips={c.chips.length}>
      {c.chips.slice(0, MARKS_SHOWN).map((ch) => (
        <Link
          key={ch.explorer}
          href={ch.href}
          title={`${c.symbol} on ${ch.label}${many ? `, ${chainName(ch.chain)}` : ""}`}
          aria-label={`${c.symbol} on ${ch.label}, ${chainName(ch.chain)}`}
          className="inline-flex size-6 items-center justify-center rounded bg-[var(--surface-hover)] hover:bg-[var(--surface-active)]"
          data-asset-chip={ch.explorer}
          data-asset-chip-link={ch.link}
          data-anatomy="A5.9"
        >
          <ProtocolIcon id={ch.explorer} className="h-3.5 w-3.5" />
        </Link>
      ))}
      {more > 0 && (
        <span
          className="pl-0.5 text-xs text-rb-500 tabular-nums"
          title={c.chips
            .slice(MARKS_SHOWN)
            .map((ch) => ch.label)
            .join(", ")}
        >
          +{more}
        </span>
      )}
    </span>
  );
}

/** A row's ⋮ (D7): "Add to focus"; on a picked row, "Remove from focus"
 *  (checked); on a row in focus through what it is built on, "Change focus",
 *  which opens the Focus panel. */
function AssetRowMenu({
  inFocus,
  picked,
  symbol,
  onAdd,
  onRemove,
}: {
  inFocus: boolean;
  picked: boolean;
  symbol: string;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const item = picked
    ? {
        key: "focus",
        label: "Remove from focus",
        checked: true,
        onSelect: onRemove,
        hooks: { "data-asset-focus-press": "remove" },
      }
    : inFocus
      ? {
          key: "focus",
          label: "Change focus",
          onSelect: () => window.dispatchEvent(new Event(OPEN_SCOPE_PANEL)),
          hooks: { "data-asset-focus-press": "change" },
        }
      : {
          key: "focus",
          label: "Add to focus",
          checked: false,
          onSelect: onAdd,
          hooks: { "data-asset-focus-press": "add" },
        };
  return <DataTableRowMenu label={`Actions for ${symbol}`} items={[item]} />;
}

/** A card without a price's figure (A5.11); the asset page (A1.3) draws it too. */
export function FigureRow({ figure: f }: { figure: CardFigure }) {
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
      <span className="font-semibold text-foreground">
        {v.display} {f.unit}
      </span>
      {f.asOf && (
        <span className="text-[11px] text-rb-500" data-asset-card-figure-as-of={f.asOf.block}>
          {asOfMark(f.asOf)}
        </span>
      )}
    </p>
  );
}

/** The asset's category (A5.8); the asset page's heading draws it too. */
export function CategoryBadge({ category }: { category: AssetCategory }) {
  return (
    <span
      className="shrink-0 rounded-full border border-rb-200 px-1.5 py-0.5 text-[10px] leading-none text-rb-500 dark:border-rb-800"
      title={CATEGORY_NOTE}
      data-asset-category-badge={category}
      data-anatomy="A5.8"
    >
      {ASSET_CATEGORY_LABELS[category]}
    </span>
  );
}

/** An explorer that lists the asset (A5.9), linking where its chip links; the
 *  chain's mark where the chips span chains (`chainMark`). The asset page's
 *  "Read by" draws it. */
export function ExplorerChip({ chip: ch, symbol, chainMark }: { chip: AssetChip; symbol: string; chainMark: boolean }) {
  return (
    <Link
      href={ch.href}
      className="inline-flex items-center gap-1 rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs text-foreground hover:bg-[var(--surface-active)]"
      title={`${symbol} on ${ch.label}, ${chainName(ch.chain)}`}
      data-asset-chip={ch.explorer}
      data-asset-chip-link={ch.link}
      data-anatomy="A5.9"
    >
      <ProtocolIcon id={ch.explorer} className="h-3 w-3 shrink-0" />
      {ch.label}
      {chainMark && <ChainGlyph id={ch.chain as ChainId} className="h-2.5 w-2.5 text-rb-500" />}
    </Link>
  );
}
