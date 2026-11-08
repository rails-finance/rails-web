"use client";

// The Pendle market roster on the house table (components/shared/data-table):
// one row per market the router record names, read at one block.
// ----------------------------------------------------------------------------
// D1 one-line rows (`rowHeight="one"`); D2 sortable headers, the sort in `?sort=` and `?dir=`, each
// written only off its default (maturity, soonest first); D3 the market pinned
// while the table scrolls sideways; D4 the whole row opens the market's page;
// D6 cards below sm, with a select and a direction button for the sort. No
// lead zone: one protocol on one chain. Worked example: the vault index table
// (components/vaults/vault-index-table.tsx, V6).
//
// FACETS (ListToolbar, kept in the URL so Save this view and Copy link keep
// them): Underlying (the Rails label of the protocol behind the yield token,
// lib/pendle/underlying.ts, "Not labelled" a value of its own), Maturity
// (active by default; `?maturity=matured` or `all`), Asset. The search narrows
// by market, PT, yield token, asset and address.
//
// Every market figure keeps its receipt.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { AssetUnit } from "@/components/shared/asset-unit";
import { RevealTip } from "@/components/shared/reveal-tip";
import { BlockRef } from "@/components/shared/block-ref";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import { PendleTokenIcon } from "@/components/protocol/pendle/pendle-token-icon";
import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
  type DataTableDir,
} from "@/components/shared/data-table/data-table";
import { notifyUrlChanged, useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import { formatCompact } from "@/lib/shared/format-compact";
import { CARD_INSET_START } from "@/lib/shared/ui-grammar";
import {
  PENDLE_CHAIN_ID,
  apyText,
  assetDecimals,
  assetSymbol,
  exact,
  marketName,
  maturityDate,
  maturityWords,
  rate,
  units,
} from "@/lib/pendle/format";
import {
  impliedApyProv,
  markProv,
  maturityProv,
  readBlockProv,
  tvlProv,
  underlyingProv,
  valueProv,
} from "@/lib/pendle/provenance";
import { UNDERLYING_LABEL_TIP, underlyingProtocol } from "@/lib/pendle/underlying";
import { pendleMarketHref, pendleWalletHref } from "@/lib/pendle/routes";
import type { PendleRoster, PendleRosterEntry } from "@/lib/pendle/types";

const n = (v: number) => v.toLocaleString("en-US");
const UNLABELLED = "Not labelled";
const E18 = BigInt("1000000000000000000");

// ── sort ────────────────────────────────────────────────────────────────────
type SortKey = "market" | "apy" | "tvl" | "pt" | "maturity";

interface Column {
  key: SortKey;
  label: string;
  first: DataTableDir;
  numeric: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: "market", label: "Market", first: "asc", numeric: false },
  { key: "apy", label: "Implied APY", first: "desc", numeric: true },
  { key: "tvl", label: "TVL", first: "desc", numeric: true },
  { key: "pt", label: "PT price", first: "desc", numeric: true },
  { key: "maturity", label: "Maturity", first: "asc", numeric: true },
];
const DEFAULT_SORT: SortKey = "maturity";

/** How a column sorts, where that is not plain from its figure. */
const SORT_NOTE: Partial<Record<SortKey, string>> = {
  apy: "The fixed rate the market prices PT at, at this block. Sorts by that rate; a matured market has none and sorts last.",
  tvl: "The pool's SY and its PT at the PT's rate, in the market's asset. Sorts by asset, then by TVL within each asset.",
  pt: "What one PT is worth in the market's asset. Sorts by asset, then by price within each asset.",
  maturity: "Sorts by the expiry date, soonest first.",
};

const nameOf = (m: PendleRosterEntry) => marketName(m.tokens);
const assetOf = (m: PendleRosterEntry) => assetSymbol(m.tokens);
const tvlOf = (m: PendleRosterEntry) => units(m.tvl?.asset, assetDecimals(m.tokens));

/** The PT's price in the asset: ptToSy × SY.exchangeRate(), both 1e18-scaled. */
function ptToAsset(m: PendleRosterEntry): string | null {
  if (m.expired) return E18.toString();
  if (m.ptToSy == null || m.syToAsset == null) return null;
  return ((BigInt(m.ptToSy) * BigInt(m.syToAsset)) / E18).toString();
}

function figureOf(key: SortKey, m: PendleRosterEntry): number | null {
  switch (key) {
    case "apy":
      return m.impliedApy;
    case "tvl":
      return tvlOf(m);
    case "pt":
      return rate(ptToAsset(m));
    case "maturity":
      return m.tokens.expiry;
    default:
      return null;
  }
}

function comparator(key: SortKey, dir: DataTableDir) {
  const sign = dir === "asc" ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, "en-US", { sensitivity: "base" });
  const byName = (a: PendleRosterEntry, b: PendleRosterEntry) => text(nameOf(a), nameOf(b));
  return (a: PendleRosterEntry, b: PendleRosterEntry): number => {
    if (key === "market") return sign * byName(a, b);
    // An amount in the asset compares inside its asset only.
    const within = key === "tvl" || key === "pt" ? text(assetOf(a), assetOf(b)) : 0;
    if (within !== 0) return within;
    const fa = figureOf(key, a);
    const fb = figureOf(key, b);
    if (fa == null || fb == null) {
      if (fa != null) return -1;
      if (fb != null) return 1;
    } else if (fa !== fb) return sign * (fa - fb);
    return byName(a, b);
  };
}

// ── facets ──────────────────────────────────────────────────────────────────
type Facets = Record<string, string[]>;
interface RosterFilters extends BaseListFilters {
  facets: Facets;
}

const underlyingOf = (m: PendleRosterEntry) => underlyingProtocol(m.tokens.yieldToken.address) ?? UNLABELLED;
const maturityOf = (m: PendleRosterEntry) => (m.expired === false ? "active" : "matured");
const MATURITY_DEFAULT = "active";

/** The facets a URL names: `?underlying=`, `?asset=` (comma lists) and `?maturity=`. */
function facetsFromSearch(search: string): Facets {
  const p = new URLSearchParams(search);
  const list = (k: string) =>
    (p.get(k) ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const maturity = p.get("maturity");
  return {
    underlying: list("underlying"),
    asset: list("asset"),
    maturity: [maturity === "matured" || maturity === "all" ? maturity : MATURITY_DEFAULT],
  };
}

function writeParams(next: Record<string, string | null>) {
  const p = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(next)) v == null || v === "" ? p.delete(k) : p.set(k, v);
  const qs = p.toString().replace(/%2C/gi, ",");
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  notifyUrlChanged();
}

function countProv(shown: number, total: number, block: number, criteria: string[]): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `Markets shown. ${n(shown)} of the ${n(total)} markets the router record names through block ${n(block)}${criteria.length ? `, narrowed by ${criteria.join("; ")}` : ""}.`,
    verify: { kind: "rollup", text: "The rows of the table." },
  };
}

// ── cells ───────────────────────────────────────────────────────────────────
/** A figure in the market's asset, the asset's mark after it, or its symbol in
 *  words where the token has no mark. */
function InAsset({ m, children }: { m: PendleRosterEntry; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span>{children}</span>
      <AssetUnit symbol={assetOf(m)} address={m.tokens.asset.address} />
    </span>
  );
}

/** A pill on a row: a ground apart from both stripes. */
const PILL =
  "rounded-sm bg-background px-1.5 py-0.5 text-[11px] whitespace-nowrap text-foreground/80 dark:bg-rb-600 dark:text-foreground/70";

const NONE = (
  <span className="text-sm text-rb-500">
    <span aria-hidden>–</span>
    <span className="sr-only">no figure</span>
  </span>
);

export function PendleRosterView({
  roster,
  at,
  initialSearch,
}: {
  roster: PendleRoster;
  at: number;
  initialSearch: string;
}) {
  const registry = useReceiptRegistry();
  const markets = roster.markets;
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<Facets>(() => facetsFromSearch(initialSearch));

  const sp = useUrlSearchParams(initialSearch);
  const sortParam = sp.get("sort");
  const sort: SortKey = COLUMNS.some((c) => c.key === sortParam) ? (sortParam as SortKey) : DEFAULT_SORT;
  const column = COLUMNS.find((c) => c.key === sort)!;
  const dirParam = sp.get("dir");
  const dir: DataTableDir = dirParam === "asc" || dirParam === "desc" ? dirParam : column.first;

  const writeSort = useCallback((key: SortKey, nextDir: DataTableDir) => {
    const col = COLUMNS.find((c) => c.key === key)!;
    writeParams({ sort: key === DEFAULT_SORT ? null : key, dir: nextDir === col.first ? null : nextDir });
  }, []);
  const press = (key: SortKey) =>
    writeSort(key, key === sort ? (dir === "asc" ? "desc" : "asc") : COLUMNS.find((c) => c.key === key)!.first);

  const putFacets = (next: Facets) => {
    setFacets(next);
    const maturity = next.maturity?.[0] ?? MATURITY_DEFAULT;
    writeParams({
      underlying: (next.underlying ?? []).join(","),
      asset: (next.asset ?? []).join(","),
      maturity: maturity === MATURITY_DEFAULT ? null : maturity,
    });
  };

  const dimensions = useMemo<FilterDimension<RosterFilters>[]>(() => {
    const multi = (id: "underlying" | "asset", label: string, valueOf: (m: PendleRosterEntry) => string) => {
      const counts = new Map<string, number>();
      for (const m of markets) counts.set(valueOf(m), (counts.get(valueOf(m)) ?? 0) + 1);
      const values = [...counts.keys()].sort((a, b) =>
        a === UNLABELLED
          ? 1
          : b === UNLABELLED
            ? -1
            : (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b, "en-US"),
      );
      return {
        id,
        label,
        group: label,
        cardinality: "multi" as const,
        options: values.map((value) => ({ value, label: value, meta: n(counts.get(value) ?? 0) })),
        get: (s: RosterFilters) => s.facets[id] ?? [],
        set: (s: RosterFilters, chosen: string[]) => ({ ...s, facets: { ...s.facets, [id]: chosen } }),
      };
    };
    const active = markets.filter((m) => maturityOf(m) === "active").length;
    const maturity: FilterDimension<RosterFilters> = {
      id: "maturity",
      label: "Maturity",
      group: "Maturity",
      cardinality: "single",
      options: [
        { value: "active", label: "Active", meta: n(active) },
        { value: "matured", label: "Matured", meta: n(markets.length - active) },
        { value: "all", label: "Every market", meta: n(markets.length) },
      ],
      get: (s) => s.facets.maturity ?? [MATURITY_DEFAULT],
      set: (s, v) => ({ ...s, facets: { ...s.facets, maturity: v.length > 0 ? v : ["all"] } }),
      defaultValues: () => [MATURITY_DEFAULT],
      defaultChip: (s) => ((s.facets.maturity?.[0] ?? MATURITY_DEFAULT) === MATURITY_DEFAULT ? "Active" : null),
      clearDefault: (s) => ({ ...s, facets: { ...s.facets, maturity: ["all"] } }),
      chipLabel: (v) => (v[0] === "matured" ? "Matured" : v[0] === "all" ? "Every market" : "Active"),
    };
    return [multi("underlying", "Underlying", underlyingOf), maturity, multi("asset", "Asset", assetOf)];
  }, [markets]);

  const state: RosterFilters = { q: query, sortBy: sort, sortOrder: dir, facets };
  const onToolbar = (next: RosterFilters) => {
    if (next.q !== query) setQuery(next.q);
    if (next.facets !== facets) putFacets(next.facets);
  };

  const needle = query.trim().toLowerCase();
  const maturityChoice = facets.maturity?.[0] ?? MATURITY_DEFAULT;
  const passes = (m: PendleRosterEntry) =>
    (maturityChoice === "all" || maturityOf(m) === maturityChoice) &&
    ((facets.underlying?.length ?? 0) === 0 || facets.underlying.includes(underlyingOf(m))) &&
    ((facets.asset?.length ?? 0) === 0 || facets.asset.includes(assetOf(m))) &&
    (needle === "" ||
      [
        nameOf(m),
        m.tokens.pt.symbol,
        m.tokens.yieldToken.symbol,
        assetOf(m),
        m.tokens.market.address,
        m.tokens.pt.address,
        underlyingOf(m),
      ].some((s) => s != null && s.toLowerCase().includes(needle)));
  const shown = markets.filter(passes).sort(comparator(sort, dir));

  const criteria = [
    ...(maturityChoice !== "all" ? [maturityChoice === "active" ? "active markets" : "matured markets"] : []),
    ...(facets.underlying?.length ? [`underlying ${facets.underlying.join(", ")}`] : []),
    ...(facets.asset?.length ? [`asset ${facets.asset.join(", ")}`] : []),
    ...(needle ? [`search “${query.trim()}”`] : []),
  ];
  const countNode = (
    <span data-figure="shown-count" data-shown={shown.length} data-total={markets.length}>
      <Prov info={countProv(shown.length, markets.length, roster.block, criteria)}>
        {shown.length === markets.length
          ? `${n(markets.length)} ${markets.length === 1 ? "market" : "markets"}`
          : `${n(shown.length)} of ${n(markets.length)} markets`}
      </Prov>
    </span>
  );

  const headerTip = (key: SortKey) => {
    const tip = SORT_NOTE[key];
    if (!tip) return null;
    return (
      <>
        <RevealTip
          tip={tip}
          label={`${COLUMNS.find((c) => c.key === key)!.label}: ${tip}`}
          focusable
          wrap
          className="focus-ring rounded-sm"
        >
          <span className="tip-underline text-[10px]" data-header-tip={key}>
            ?
          </span>
        </RevealTip>
        <span id={`pendle-sort-note-${key}`} className="sr-only">
          {tip}
        </span>
      </>
    );
  };

  return (
    <ProvReceiptsScope registry={registry}>
      <div data-pendle-roster="">
        <p className={`mb-4 text-xs text-rb-500 ${CARD_INSET_START}`} data-pendle-asof={roster.block}>
          Every market Pendle&rsquo;s routers have named, read at block{" "}
          <Prov info={readBlockProv(roster.block)} value={String(roster.block)}>
            <BlockRef block={roster.block} chainId={PENDLE_CHAIN_ID} />
          </Prov>
          . Underlying is a Rails label for the protocol behind each yield token.
        </p>
        <ListToolbar
          dimensions={dimensions}
          filters={state}
          onChange={onToolbar}
          sortOptions={[]}
          searchPlaceholder="Market, token or address"
          countNode={countNode}
          viewMenu
          skel="pendle-roster-facets"
        />

        {/* Below sm the header row is hidden (D6): a select and a direction
            button write the same params. */}
        <div className="mb-3 sm:hidden" data-mobile-sort="">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] text-rb-500">
              Sort by
              <select
                value={sort}
                onChange={(e) => {
                  const key = e.target.value as SortKey;
                  writeSort(key, COLUMNS.find((c) => c.key === key)!.first);
                }}
                className="rounded-md border border-rb-200 bg-background px-2 py-1 text-base text-foreground dark:border-rb-700"
                aria-describedby={SORT_NOTE[sort] ? "pendle-mobile-sort-note" : undefined}
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => writeSort(sort, dir === "asc" ? "desc" : "asc")}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-rb-200 px-2 py-1 text-[12px] text-foreground focus-ring dark:border-rb-700"
              aria-label={dir === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"}
              data-mobile-sort-dir={dir}
            >
              <span aria-hidden>{dir === "asc" ? "▲" : "▼"}</span>
              {column.numeric ? (dir === "asc" ? "Low first" : "High first") : dir === "asc" ? "A to Z" : "Z to A"}
            </button>
          </div>
          {SORT_NOTE[sort] && (
            <p id="pendle-mobile-sort-note" className="mt-1.5 text-[12px] text-rb-500" data-mobile-sort-note="">
              {SORT_NOTE[sort]}
            </p>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="text-[13px] text-rb-500">No market matches.</p>
        ) : (
          <DataTable
            caption="Pendle markets on Ethereum; TVL and PT price are in each market's asset"
            tableClassName="min-w-[720px] text-sm"
            stacked
            rowHeight="one"
            data-pendle-table=""
          >
            <DataTableHead>
              {COLUMNS.map((c) => (
                <DataTableHeader
                  key={c.key}
                  label={c.label}
                  align={c.numeric ? "right" : "left"}
                  sticky={c.key === "market" ? "sm:sticky sm:left-0" : ""}
                  sort={{
                    dir: c.key === sort ? dir : null,
                    onSort: () => press(c.key),
                    describedBy: SORT_NOTE[c.key] ? `pendle-sort-note-${c.key}` : undefined,
                  }}
                  data-sort-key={c.key}
                  after={headerTip(c.key)}
                />
              ))}
            </DataTableHead>
            <DataTableBody>
              {shown.map((m) => (
                <Row key={m.tokens.market.address} m={m} block={roster.block} at={at} />
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </div>
    </ProvReceiptsScope>
  );
}

function Row({ m, block, at }: { m: PendleRosterEntry; block: number; at: number }) {
  const t = m.tokens;
  const href = pendleMarketHref(t.market.address);
  const dec = assetDecimals(t);
  const asset = assetOf(m);
  const label = underlyingProtocol(t.yieldToken.address);
  const pt = ptToAsset(m);
  const tvl = tvlOf(m);
  const cell = (id: string, name: string, value: ReactNode) => (
    <DataTableCell label={name} align="right" valign="middle" className="whitespace-nowrap tabular-nums" data-col={id}>
      {value != null ? <span className="text-sm font-semibold text-foreground">{value}</span> : NONE}
    </DataTableCell>
  );
  return (
    <DataTableRow
      href={href}
      data-pendle-roster-row={t.market.address}
      data-underlying={underlyingOf(m)}
      data-asset={asset}
      data-maturity={maturityOf(m)}
    >
      {/* From sm one line: the PT's icon, the market's name (truncating), the
          pills after it. Below sm (D6) the pills take their own line. */}
      <DataTableCell
        rowHeader
        valign="middle"
        sticky="sm:sticky sm:left-0"
        className="sm:w-full sm:max-w-0 sm:min-w-[220px] xl:min-w-[300px]"
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:flex-nowrap">
          <span className="shrink-0" data-prov-exempt>
            <PendleTokenIcon kind="pt" tokens={t} size={28} />
          </span>
          <DataTableRowLink
            href={href}
            className="min-w-0 flex-1 text-sm font-semibold break-words sm:min-w-[7rem] sm:flex-initial sm:truncate"
            title={marketName(t)}
            data-pendle-market-link={t.market.address}
          >
            {marketName(t)}
          </DataTableRowLink>
          <span className="flex flex-wrap gap-1 max-sm:basis-full sm:min-w-0 sm:flex-nowrap sm:overflow-hidden">
            {label && (
              <RevealTip tip={UNDERLYING_LABEL_TIP} label={UNDERLYING_LABEL_TIP}>
                <span className={`${PILL} sm:truncate`} data-pill="underlying">
                  <Prov info={underlyingProv(label, t.yieldToken)} value={label}>
                    {label}
                  </Prov>
                </span>
              </RevealTip>
            )}
            {m.expired !== false && (
              <span className={PILL} data-pill="matured">
                Matured
              </span>
            )}
          </span>
        </div>
      </DataTableCell>
      {cell(
        "apy",
        "Implied APY",
        m.impliedApy == null ? null : (
          <Prov info={impliedApyProv(t.market.address, block, null)} value={m.impliedApy.toFixed(6)}>
            {apyText(m.impliedApy)}
          </Prov>
        ),
      )}
      {cell(
        "tvl",
        "TVL",
        m.tvl?.asset == null || tvl == null ? null : (
          <InAsset m={m}>
            <Prov info={tvlProv(t.market.address, block)} value={exact(m.tvl.asset, dec) ?? m.tvl.asset} symbol={asset}>
              {formatCompact(tvl)}
            </Prov>
          </InAsset>
        ),
      )}
      {cell(
        "pt",
        "PT price",
        pt == null ? null : (
          <InAsset m={m}>
            <Prov
              info={m.expired ? valueProv("PT", t, block, true) : markProv("PT", "routerstatic-spot", 900, block)}
              value={pt}
            >
              {(rate(pt) ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}
            </Prov>
          </InAsset>
        ),
      )}
      <DataTableCell
        label="Maturity"
        align="right"
        valign="middle"
        className="whitespace-nowrap tabular-nums"
        data-col="maturity"
      >
        <span className="text-sm font-semibold text-foreground">
          <Prov info={maturityProv(t.market.address, t.expiry, block)} value={String(t.expiry)}>
            {maturityDate(t.expiry)}
          </Prov>
        </span>{" "}
        <span className="text-[11px] text-rb-500">{maturityWords(t.expiry, at)}</span>
      </DataTableCell>
    </DataTableRow>
  );
}

/** The search (H15) landing on a wallet's Pendle positions. */
export function PendleWalletSearch() {
  return <FrontDoorSearch href={(wallet) => pendleWalletHref(wallet)} />;
}
