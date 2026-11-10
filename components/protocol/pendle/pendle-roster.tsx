"use client";

// The Pendle market roster's table section (R1.2, under the roster's R0 head,
// lib/pendle/product.tsx): one row per market the router record names, read
// at one block, in its own receipts scope with its ⋮ (Download CSV, Inspect
// provenance) on the house table (components/shared/data-table).
// ----------------------------------------------------------------------------
// D1 one-line rows (`rowHeight="one"`); D2 sortable headers, the sort in `?sort=` and `?dir=`, each
// written only off its default (maturity, soonest first); D3 the market pinned
// while the table scrolls sideways; D4 the whole row opens the market's page;
// D6 cards below sm, sorted from the toolbar (N1.3, `mobileSort`). No
// lead zone: one protocol on one chain. Worked example: the vault index table
// (components/vaults/vault-index-table.tsx, V6).
//
// FACETS (ListToolbar, kept in the URL so Save this view and Copy link keep
// them): Underlying (the Rails label of the protocol behind the yield token,
// lib/pendle/underlying.ts, "Not labelled" a value of its own), Maturity
// (active by default; `?maturity=matured` or `all`), Asset. The search narrows
// by market, PT, yield token, asset and any of the market's addresses.
//
// WALLET ROW (N1.1): a wallet address or ENS name that matches no market draws
// one row above the table opening that wallet's Pendle positions; Enter in the
// field opens it too, and ↓ moves focus to it. Every market, PT, YT, SY, yield token and asset address is
// in the roster, and none of them is a wallet, so the check is the search over
// every market whatever the facets: no read per keystroke. An ENS name resolves
// on Enter or on the row.
//
// Every market figure keeps its receipt.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { ToolsFor } from "@/components/shared/product/product-head";
import { AssetUnit } from "@/components/shared/asset-unit";
import { RevealTip } from "@/components/shared/reveal-tip";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { lookable, useLookup } from "@/components/shared/front-door-search";
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
import {
  apyText,
  assetDecimals,
  assetSymbol,
  exact,
  marketName,
  maturityDate,
  maturityWords,
  rate,
  shortAddress,
  units,
} from "@/lib/pendle/format";
import { impliedApyProv, markProv, maturityProv, tvlProv, underlyingProv, valueProv } from "@/lib/pendle/provenance";
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

/** Whether a market answers the search: its names, its tokens' symbols, its
 *  Rails label and every address it is built from. */
function searchMatch(m: PendleRosterEntry, want: string): boolean {
  const t = m.tokens;
  return [
    nameOf(m),
    t.pt.symbol,
    t.yieldToken.symbol,
    assetOf(m),
    underlyingOf(m),
    t.market.address,
    t.pt.address,
    t.yt.address,
    t.sy.address,
    t.yieldToken.address,
    t.asset.address,
  ].some((x) => x != null && x.toLowerCase().includes(want));
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

/** Every market as CSV, whatever the filters. */
function rosterCsv(markets: PendleRosterEntry[]): string {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = markets.map((m) => {
    const t = m.tokens;
    return [
      nameOf(m),
      t.market.address,
      underlyingOf(m),
      assetOf(m),
      m.impliedApy == null ? "" : m.impliedApy.toFixed(6),
      exact(m.tvl?.asset, assetDecimals(t)) ?? "",
      ptToAsset(m) == null ? "" : String(rate(ptToAsset(m))),
      new Date(t.expiry * 1000).toISOString().slice(0, 10),
      maturityOf(m),
    ]
      .map((v) => q(String(v)))
      .join(",");
  });
  return ["market,address,underlying,asset,implied_apy,tvl_in_asset,pt_price_in_asset,maturity,status", ...rows].join(
    "\n",
  );
}

export function PendleRosterTable({
  roster,
  at,
  initialSearch,
}: {
  roster: PendleRoster;
  at: number;
  initialSearch: string;
}) {
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
  /** The filter for a selection: the shown rows, and the phone sheet's staged
   *  count. */
  const passesFor = (s: RosterFilters) => {
    const want = s.q.trim().toLowerCase();
    const mat = s.facets.maturity?.[0] ?? MATURITY_DEFAULT;
    return (m: PendleRosterEntry) =>
      (mat === "all" || maturityOf(m) === mat) &&
      ((s.facets.underlying?.length ?? 0) === 0 || s.facets.underlying.includes(underlyingOf(m))) &&
      ((s.facets.asset?.length ?? 0) === 0 || s.facets.asset.includes(assetOf(m))) &&
      (want === "" || searchMatch(m, want));
  };
  const shown = markets.filter(passesFor(state)).sort(comparator(sort, dir));

  const typed = query.trim();
  const walletKind = lookable(typed);
  const wallet = walletKind != null && !markets.some((m) => searchMatch(m, needle)) ? walletKind : null;
  const lookup = useLookup(pendleWalletHref);
  const { setProblem } = lookup;
  useEffect(() => setProblem(null), [typed, setProblem]);
  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (wallet == null) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      document.querySelector<HTMLElement>("[data-pendle-wallet-row] :is(a, button)")?.focus();
      return;
    }
    if (e.key !== "Enter" || lookup.resolving) return;
    e.preventDefault();
    void lookup.lookUp(typed);
  };

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
    <ProvSection
      scope="markets-table"
      className="mb-8"
      data-anatomy="R1.2"
      data-pendle-roster=""
      data-pendle-asof={String(roster.block)}
      data-skel-section="page-table"
    >
      <SectionHeading
        title="Markets"
        menu={
          <ToolsFor
            scope="markets-table"
            title="Markets"
            tools={{
              exports: {
                csv: {
                  filename: "pendle-ethereum-markets.csv",
                  build: () => rosterCsv(markets),
                  subtitle: "Every market, whatever the filters",
                },
              },
            }}
          />
        }
      >
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
          Each row opens its market&rsquo;s page. Underlying is a Rails label for the protocol behind each yield token.
        </p>
      </SectionHeading>
      <div className="mt-3">
        <ListToolbar
          dimensions={dimensions}
          filters={state}
          onChange={onToolbar}
          sortOptions={[]}
          searchPlaceholder="Market, token, address or wallet"
          countNode={countNode}
          sheetCount={{ total: shown.length, noun: "markets" }}
          countFor={(draft) => markets.filter(passesFor(draft)).length}
          // Below sm the header row is hidden (D6) and the toolbar's sort
          // writes the same params as a header press.
          mobileSort={{
            options: COLUMNS.map((c) => ({ value: c.key, label: c.label })),
            sortBy: sort,
            sortOrder: dir,
            onChange: (key, order) => {
              const k = key as SortKey;
              writeSort(k, k === sort ? order : COLUMNS.find((c) => c.key === k)!.first);
            },
          }}
          viewMenu
          skel="pendle-roster-facets"
          onSearchKeyDown={onSearchKeyDown}
        />

        {/* The chosen sort's note, below sm where no header carries it. */}
        {SORT_NOTE[sort] && (
          <p className="mb-3 text-[12px] text-rb-500 sm:hidden" data-mobile-sort-note="">
            {SORT_NOTE[sort]}
          </p>
        )}

        {wallet && <WalletRow typed={typed} kind={wallet} lookup={lookup} />}

        {shown.length === 0 ? (
          wallet ? null : (
            <p className="text-[13px] text-rb-500">No market matches.</p>
          )
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
    </ProvSection>
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

const WALLET_ROW =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-rb-200 bg-raised px-3 py-2.5 text-left text-sm text-foreground transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-rb-600";

/** The search's wallet row (N1.1): a pasted address is a link; an ENS name
 *  resolves on the press, the reason under the row where it does not. */
function WalletRow({
  typed,
  kind,
  lookup,
}: {
  typed: string;
  kind: "address" | "ens";
  lookup: ReturnType<typeof useLookup>;
}) {
  const label = (
    <>
      <span className="min-w-0 truncate">
        {lookup.resolving ? "Looking up…" : `View ${kind === "ens" ? typed : shortAddress(typed)}’s Pendle positions`}
      </span>
      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-[var(--text-link)]" aria-hidden="true" />
    </>
  );
  return (
    <div className="mb-4" data-pendle-wallet-row={kind}>
      {kind === "address" ? (
        <Link href={pendleWalletHref(typed)} className={WALLET_ROW}>
          {label}
        </Link>
      ) : (
        <button
          type="button"
          className={WALLET_ROW}
          disabled={lookup.resolving}
          onClick={() => void lookup.lookUp(typed)}
        >
          {label}
        </button>
      )}
      <p className="mt-1.5 text-[13px] text-rb-500 empty:hidden" aria-live="polite">
        {lookup.problem}
      </p>
    </div>
  );
}
