// The cross-explorer results pages of the guided way in (rails-ops ui-jobs 478):
// which explorers answer "Borrowing against ETH", "Positions close to
// liquidation" and "Recent liquidations", and the link into each one's listing
// with the filter or sort in the URL.
//
// Derived, never guessed: a sort qualifies when the family's exported sort
// options carry it; a liquidation filter when the family's listing dimensions
// carry that param and value; a collateral when the family's asset catalog
// states it. Where no catalog states the collateral, the answer is written in
// start-tree.json with its note: the facet values per symbol read from Rails's
// index on a stated date, the one collateral an explorer takes, or neither (the
// row opens the whole listing). An explorer neither source names is left out. Names explorers only: no counts, no ranking (chain-truth charter).
// Rows run in chain order, then roster order.

import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { LAUNCHED_PROTOCOLS, type ProtocolEntry } from "@/lib/shared/protocols";
import { TREE, inGroup, type GroupKey, type ResultsKey, type WrittenCollateral } from "@/lib/start/tree";

import { AAVE_V3_SORT_OPTIONS, aaveV3ListDimensions } from "@/lib/aave-v3/list-filter-dimensions";
import { AAVE_V3_BASE_SORT_OPTIONS, aaveV3BaseListDimensions } from "@/lib/aave-v3-base/list-filter-dimensions";
import {
  AAVE_V4_LIST_DEFAULTS,
  AAVE_V4_SORT_OPTIONS,
  aaveV4ListDimensions,
} from "@/lib/aave-v4/list-filter-dimensions";
import { AAVE_V4_BASE_SORT_OPTIONS, aaveV4BaseListDimensions } from "@/lib/aave-v4-base/list-filter-dimensions";
import { ASYMMETRY_SORT_OPTIONS, asymmetryListDimensions } from "@/lib/asymmetry/list-filter-dimensions";
import { BASEDOLLAR_SORT_OPTIONS, basedollarListDimensions } from "@/lib/basedollar/list-filter-dimensions";
import { COMPOUND_SORT_OPTIONS, compoundListDimensions } from "@/lib/compound/list-filter-dimensions";
import { COMPOUND_BASE_SORT_OPTIONS, compoundBaseListDimensions } from "@/lib/compound-base/list-filter-dimensions";
import { COMPOUND_V2_SORT_OPTIONS, compoundV2ListDimensions } from "@/lib/compound-v2/list-filter-dimensions";
import { DOLOMITE_SORT_OPTIONS, dolomiteListDimensions } from "@/lib/dolomite/list-filter-dimensions";
import { EBISU_SORT_OPTIONS, ebisuListDimensions } from "@/lib/ebisu/list-filter-dimensions";
import { FLUID_SORT_OPTIONS, fluidListDimensions } from "@/lib/fluid/list-filter-dimensions";
import { FRANKENCOIN_SORT_OPTIONS, frankencoinListDimensions } from "@/lib/frankencoin/list-filter-dimensions";
import { FX_SORT_OPTIONS, fxListDimensions } from "@/lib/fx/list-filter-dimensions";
import { LIQUITY_V1_SORT_OPTIONS, liquityV1ListDimensions } from "@/lib/liquity-v1/list-filter-dimensions";
import { LIQUITY_V2_SORT_OPTIONS, liquityV2ListDimensions } from "@/lib/liquity-v2/list-filter-dimensions";
import { LLAMALEND_SORT_OPTIONS, llamalendListDimensions } from "@/lib/llamalend/list-filter-dimensions";
import { MAKER_LIST_DEFAULTS, MAKER_SORT_OPTIONS, makerListDimensions } from "@/lib/makerdao/list-filter-dimensions";
import { MOONWELL_SORT_OPTIONS, moonwellListDimensions } from "@/lib/moonwell/list-filter-dimensions";
import {
  MOONWELL_BASE_LIST_DEFAULTS,
  MOONWELL_BASE_SORT_OPTIONS,
  moonwellBaseListDimensions,
} from "@/lib/moonwell-base/list-filter-dimensions";
import { MORPHO_LIST_DEFAULTS, MORPHO_SORT_OPTIONS, morphoListDimensions } from "@/lib/morpho/list-filter-dimensions";
import {
  MORPHO_BASE_LIST_DEFAULTS,
  morphoBaseListDimensions,
  morphoBaseSortOptions,
} from "@/lib/morpho-base/list-filter-dimensions";
import { SEAMLESS_SORT_OPTIONS, seamlessListDimensions } from "@/lib/seamless/list-filter-dimensions";
import { SPARK_SORT_OPTIONS, sparkListDimensions } from "@/lib/spark/list-filter-dimensions";

import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { EBISU_BRANCHES } from "@/lib/ebisu/asset-catalog";
import { ASYMMETRY_BRANCHES } from "@/lib/asymmetry/asset-catalog";
import { BASEDOLLAR_BRANCHES } from "@/lib/basedollar/asset-catalog";
import { AAVE_V3_CATALOG } from "@/lib/aave-v3/asset-catalog";
import { SPARK_CATALOG } from "@/lib/spark/asset-catalog";
import { MOONWELL_MARKETS } from "@/lib/moonwell/asset-catalog";
import { COMPOUND_V2_FILTER_SYMBOLS } from "@/lib/compound-v2/asset-catalog";
import { FX_POOLS, FX_POOL_KEYS } from "@/lib/fx/asset-catalog";
import { AAVE_V3_ARBITRUM_SYMBOL_BY_ADDR } from "@/lib/aave-v3-arbitrum/asset-catalog";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";
import { COLLATERAL_PARAM as COMPOUND_ARBITRUM_COLLATERAL_PARAM } from "@/lib/compound-arbitrum/comet-cards";
import { MORPHO_ARBITRUM_MARKETS } from "@/lib/morpho-arbitrum/market-catalog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDims = SerializableDimension<any>[];

/** Each listing explorer's filter dimensions and sort options, as its listing
 *  page builds them (bare: no roster, no rows; the facets read here are static). */
const LISTINGS: Record<string, { dims: () => AnyDims; sorts: SortOption[] }> = {
  "aave-v3": { dims: () => aaveV3ListDimensions(), sorts: AAVE_V3_SORT_OPTIONS },
  "aave-v3-base": { dims: () => aaveV3BaseListDimensions(), sorts: AAVE_V3_BASE_SORT_OPTIONS },
  "aave-v4": { dims: () => aaveV4ListDimensions(AAVE_V4_LIST_DEFAULTS, undefined), sorts: AAVE_V4_SORT_OPTIONS },
  "aave-v4-base": { dims: () => aaveV4BaseListDimensions(), sorts: AAVE_V4_BASE_SORT_OPTIONS },
  asymmetry: { dims: () => asymmetryListDimensions([]), sorts: ASYMMETRY_SORT_OPTIONS },
  basedollar: { dims: () => basedollarListDimensions([]), sorts: BASEDOLLAR_SORT_OPTIONS },
  compound: { dims: () => compoundListDimensions(), sorts: COMPOUND_SORT_OPTIONS },
  "compound-base": { dims: () => compoundBaseListDimensions(), sorts: COMPOUND_BASE_SORT_OPTIONS },
  "compound-v2": { dims: () => compoundV2ListDimensions(), sorts: COMPOUND_V2_SORT_OPTIONS },
  dolomite: { dims: () => dolomiteListDimensions(), sorts: DOLOMITE_SORT_OPTIONS },
  ebisu: { dims: () => ebisuListDimensions([]), sorts: EBISU_SORT_OPTIONS },
  fluid: { dims: () => fluidListDimensions(), sorts: FLUID_SORT_OPTIONS },
  frankencoin: { dims: () => frankencoinListDimensions(), sorts: FRANKENCOIN_SORT_OPTIONS },
  fx: { dims: () => fxListDimensions(), sorts: FX_SORT_OPTIONS },
  "liquity-v1": { dims: () => liquityV1ListDimensions(), sorts: LIQUITY_V1_SORT_OPTIONS },
  liquity: { dims: () => liquityV2ListDimensions(), sorts: LIQUITY_V2_SORT_OPTIONS },
  llamalend: { dims: () => llamalendListDimensions(), sorts: LLAMALEND_SORT_OPTIONS },
  makerdao: { dims: () => makerListDimensions(MAKER_LIST_DEFAULTS, undefined), sorts: MAKER_SORT_OPTIONS },
  moonwell: { dims: () => moonwellListDimensions(), sorts: MOONWELL_SORT_OPTIONS },
  "moonwell-base": {
    dims: () => moonwellBaseListDimensions(MOONWELL_BASE_LIST_DEFAULTS, undefined),
    sorts: MOONWELL_BASE_SORT_OPTIONS,
  },
  morpho: { dims: () => morphoListDimensions(MORPHO_LIST_DEFAULTS, undefined), sorts: MORPHO_SORT_OPTIONS },
  "morpho-base": {
    dims: () => morphoBaseListDimensions(MORPHO_BASE_LIST_DEFAULTS),
    sorts: morphoBaseSortOptions(MORPHO_BASE_LIST_DEFAULTS),
  },
  seamless: { dims: () => seamlessListDimensions(), sorts: SEAMLESS_SORT_OPTIONS },
  spark: { dims: () => sparkListDimensions(), sorts: SPARK_SORT_OPTIONS },
};

/** The facet params of the in-memory listings LISTINGS leaves out (their
 *  dimensions live in a client component): the Arbitrum positions pages. */
const MEMORY_FACETS: Record<string, string[]> = {
  "compound-v3-arbitrum": [COMPOUND_ARBITRUM_COLLATERAL_PARAM],
};

/** The collateral an explorer's catalog states, and the listing facet that
 *  takes it (`param`, with `values` mapping a symbol to the facet's values). */
interface CatalogCollateral {
  symbols: string[];
  source: string;
  param?: string;
  values?: (symbol: string) => string[];
}

const symbolsOf = (rows: { symbol: string }[]) => rows.map((r) => r.symbol);

const CATALOGS: Record<string, CatalogCollateral> = {
  liquity: {
    symbols: symbolsOf(Object.values(LIQUITY_V2_BRANCHES)),
    source: "lib/liquity/asset-catalog.ts, the three branches",
    param: "collateralTypes",
  },
  ebisu: {
    symbols: symbolsOf(Object.values(EBISU_BRANCHES)),
    source: "lib/ebisu/asset-catalog.ts, the branches",
    param: "branch",
  },
  asymmetry: {
    symbols: symbolsOf(Object.values(ASYMMETRY_BRANCHES)),
    source: "lib/asymmetry/asset-catalog.ts, the branches",
    param: "branch",
  },
  basedollar: {
    symbols: symbolsOf(Object.values(BASEDOLLAR_BRANCHES)),
    source: "lib/basedollar/asset-catalog.ts, the branches",
    param: "branch",
  },
  "aave-v3": {
    symbols: symbolsOf(AAVE_V3_CATALOG.filter((a) => (a.lt ?? 0) > 0)),
    source: "lib/aave-v3/asset-catalog.ts, the reserves with a liquidation threshold above zero",
    param: "supply",
  },
  spark: {
    symbols: symbolsOf(SPARK_CATALOG.filter((a) => (a.lt ?? 0) > 0 && !a.frozen)),
    source: "lib/spark/asset-catalog.ts, the reserves with a liquidation threshold above zero, frozen ones left out",
    param: "supply",
  },
  moonwell: {
    symbols: symbolsOf(MOONWELL_MARKETS.filter((m) => m.collateralFactor > 0)),
    source: "lib/moonwell/asset-catalog.ts, the markets with a collateral factor above zero",
    param: "supply",
  },
  "compound-v2": {
    symbols: COMPOUND_V2_FILTER_SYMBOLS,
    source: "lib/compound-v2/asset-catalog.ts, the markets (the catalog states no collateral factors)",
    param: "supply",
  },
  fx: {
    symbols: FX_POOL_KEYS.map((k) => FX_POOLS[k].tokenSymbol),
    source: "lib/fx/asset-catalog.ts, the pools",
    param: "pool",
    values: (symbol) => [FX_POOL_KEYS.find((k) => FX_POOLS[k].tokenSymbol === symbol) ?? symbol],
  },
  "aave-v3-arbitrum": {
    symbols: Object.values(AAVE_V3_ARBITRUM_SYMBOL_BY_ADDR),
    source: "lib/aave-v3-arbitrum/asset-catalog.ts, the reserves",
  },
  "compound-v3-arbitrum": {
    symbols: COMPOUND_ARBITRUM_DEPLOYMENT.markets.flatMap((m) => (m.collateral ?? []).map((c) => c.symbol)),
    source: "lib/compound-arbitrum/asset-catalog.ts, each Comet's stated collateral",
    param: COMPOUND_ARBITRUM_COLLATERAL_PARAM,
  },
  "morpho-arbitrum": {
    symbols: MORPHO_ARBITRUM_MARKETS.map((m) => m.collateralSymbol).filter((s): s is string => !!s),
    source: "lib/morpho-arbitrum/market-catalog.ts, each market's collateral",
  },
};

/** One row of a results page. */
export interface ResultRow {
  entry: ProtocolEntry;
  href: string;
  /** The filter or sort rode into the URL; false = the plain listing. */
  applied: boolean;
  /** What the row matched on (the collateral symbols, or the sort's label). */
  detail?: string;
  /** The collateral symbols matched, drawn as tokens (a borrow row). */
  symbols?: string[];
  /** The explorer takes this one collateral, so its whole listing answers. */
  only?: boolean;
  /** Where the answer came from: a file in the code, or the tree's note. */
  source: string;
}

function withParams(entry: ProtocolEntry, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${entry.listingHref}?${qs}` : entry.listingHref;
}

function dimsOf(id: string): AnyDims {
  try {
    return LISTINGS[id]?.dims() ?? [];
  } catch {
    return [];
  }
}

function offers(dims: AnyDims, param: string, value: string): boolean {
  return dims.some((d) => d.param === param && (d.options ?? []).some((o) => o.value === value));
}

/** Chain order (Ethereum, Base, Arbitrum…), then roster order. Testnets are
 *  left out of every results page. */
function candidates(): ProtocolEntry[] {
  const chainOrder = Object.keys(CHAINS).map(Number) as ChainId[];
  return LAUNCHED_PROTOCOLS.filter((p) => !CHAINS[p.chainId].testnet).sort(
    (a, b) => chainOrder.indexOf(a.chainId) - chainOrder.indexOf(b.chainId),
  );
}

function nearLiquidation(): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const entry of candidates()) {
    const listing = LISTINGS[entry.id];
    if (!listing) continue;
    const sort = TREE.results["near-liquidation"].sorts.find((s) => listing.sorts.some((o) => o.value === s.sortBy));
    if (!sort) continue;
    const label = listing.sorts.find((o) => o.value === sort.sortBy)?.label;
    rows.push({
      entry,
      href: withParams(entry, { sortBy: sort.sortBy, sortOrder: sort.sortOrder }),
      applied: true,
      detail: label ? `Sorted by ${label.toLowerCase()}` : undefined,
      source: "the listing's sort options",
    });
  }
  return rows;
}

function liquidated(): ResultRow[] {
  const spec = TREE.results.liquidated;
  const rows: ResultRow[] = [];
  for (const entry of candidates()) {
    if (!LISTINGS[entry.id]) continue;
    const dims = dimsOf(entry.id);
    const status = dims.find((d) => d.param === "status");
    const history = spec.history.find((h) => offers(dims, h.param, h.value));
    if (history) {
      // Every status, so a position liquidated and then closed is listed too.
      const params: Record<string, string> = { [history.param]: history.value };
      if (status?.options?.length) params.status = status.options.map((o) => o.value).join(",");
      rows.push({ entry, href: withParams(entry, params), applied: true, source: "the listing's liquidation filter" });
    } else if (status && offers(dims, "status", spec.status)) {
      rows.push({
        entry,
        href: withParams(entry, { status: spec.status }),
        applied: true,
        source: "the listing's status filter",
      });
    }
  }
  return rows;
}

/** A start-tree.json entry read as a catalog: its symbols, and the facet
 *  values each one sends. No symbols when the entry names no facet. */
function writtenCatalog(written: WrittenCollateral): CatalogCollateral {
  const values = written.values ?? {};
  return {
    symbols: Object.keys(values),
    source: written.note,
    param: written.param,
    values: (symbol) => values[symbol] ?? [symbol],
  };
}

function borrow(group: GroupKey): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const entry of candidates()) {
    const written = TREE.collateral[entry.id];
    if (written && !written.groups.includes(group)) continue;
    if (written?.only) {
      rows.push({
        entry,
        href: entry.listingHref,
        applied: true,
        detail: written.only,
        symbols: [written.only],
        only: true,
        source: written.note,
      });
      continue;
    }
    const catalog = CATALOGS[entry.id] ?? (written ? writtenCatalog(written) : null);
    if (!catalog) continue;
    const matched = [...new Set(catalog.symbols.filter((s) => inGroup(group, s)))];
    if (matched.length === 0) {
      // A note that names the group without a value for it: the whole listing.
      if (written) rows.push({ entry, href: entry.listingHref, applied: false, source: written.note });
      continue;
    }
    const canFilter =
      catalog.param &&
      (LISTINGS[entry.id]
        ? dimsOf(entry.id).some((d) => d.param === catalog.param)
        : MEMORY_FACETS[entry.id]?.includes(catalog.param));
    const values = catalog.values ?? ((s: string) => [s]);
    rows.push({
      entry,
      href: canFilter
        ? withParams(entry, { [catalog.param!]: [...new Set(matched.flatMap(values))].join(",") })
        : entry.listingHref,
      applied: !!canFilter,
      detail: matched.join(", "),
      symbols: matched,
      source: catalog.source,
    });
  }
  return rows;
}

export function resultRows(results: ResultsKey, group?: GroupKey): ResultRow[] {
  if (results === "near-liquidation") return nearLiquidation();
  if (results === "liquidated") return liquidated();
  return group ? borrow(group) : [];
}
