// Compound V3 (Comet) listing filter registry (chain-state tier, SERVER-DRIVEN).
// Comet is single-base / multi-collateral, one row per (market, account), ~28k
// positions — so, like Spark, it pages against the backend: the URL-backed
// selection maps onto the /api/compound/positions fetch params and rails-server
// does the filter / sort / offset over mv_compound_v3_positions. Dimensions carry a
// `param` (for the shareable URL) but no in-memory `matches` — the backend filters.
//
// Every facet here ships LIVE — rails-server + the proxy honor all of these params
// (verified by count: status open/closed/liquidated and hasDebt/noDebt/market each
// partition the set):
//   • Status  — open / closed / liquidated (lifecycle).
//   • Market  — cUSDCv3 / cWETHv3 / cUSDTv3 (Comet's fixed, known market set).
//   • Position — Borrowing (signed base < 0) / Supply only (≥ 0).
//   • History — Liquidated before.
//   • Sort — Recent activity / Debt / Collateral. Debt/Collateral order by
//     mig 185's debt_usd/collateral_usd on mv_compound_v3_positions (per
//     (market, account) row, Ethereum only — see lib/api/compound-positions-proxy.ts).

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchCompoundPositionsParams } from "@/lib/api/fetch-compound-positions";
import type { CompoundPositionSort } from "@/lib/sources/api/compound-positions";
import { COMPOUND_MARKETS } from "@/lib/compound/asset-catalog";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/compound/listing-visibility";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const COMPOUND_ITEMS_PER_PAGE = 20;

export interface CompoundListFilters extends BaseListFilters {
  /** open / closed / liquidated — multi (OR). */
  status: string[];
  /** usdc / weth / usdt — single-select market (stored as an array for the registry). */
  market: string[];
  /** "" | "borrowing" | "supply-only" — the signed base side. */
  state: string[];
  /** "" | "liquidated" — positions liquidated at least once. */
  liquidations: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open accounts on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const COMPOUND_LIST_DEFAULTS: CompoundListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  market: [],
  state: [],
  liquidations: [],
};

// Values match Liquity V2's (lib/liquity-v2/list-filter-dimensions.tsx) so the
// URL grammar (`?sortBy=debt`) is the same across explorers. Ethereum only —
// see lib/compound-base/list-filter-dimensions.ts for the Base lane's own
// one-entry constant.
export const COMPOUND_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

const MARKET_OPTIONS: FilterOptionDef[] = Object.values(COMPOUND_MARKETS).map((m) => ({
  value: m.key,
  label: m.label,
}));

const STATE_OPTIONS: FilterOptionDef[] = [
  { value: "borrowing", label: "Borrowing" },
  { value: "supply-only", label: "Supply only" },
];

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [{ value: "liquidated", label: "Liquidated before" }];

export function compoundListDimensions(): SerializableDimension<CompoundListFilters>[] {
  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "multi",
      param: "status",
      options: STATUS_OPTIONS,
      get: (f) => effectiveStatuses(f),
      defaultValues: (f) => defaultStatuses(f),
      set: (f, v) => {
        const sel = canonicalStatuses(v);
        return { ...f, status: sel.length === 0 || sameStatusSet(sel, defaultStatuses(f)) ? [] : sel };
      },
    },
    {
      id: "market",
      label: "Market",
      group: "Market",
      cardinality: "single",
      param: "market",
      options: MARKET_OPTIONS,
      get: (f) => f.market,
      set: (f, v) => ({ ...f, market: v }),
    },
    {
      id: "state",
      label: "Position",
      group: "Position",
      cardinality: "single",
      param: "state",
      options: STATE_OPTIONS,
      get: (f) => f.state,
      set: (f, v) => ({ ...f, state: v }),
    },
    {
      id: "liquidations",
      label: "History",
      group: "History",
      cardinality: "single",
      param: "liq",
      options: LIQUIDATION_OPTIONS,
      get: (f) => f.liquidations,
      set: (f, v) => ({ ...f, liquidations: v }),
      chipLabel: () => "Liquidated before",
    },
  ];
}

/** Map the decoded selection + page onto the Comet fetch params. */
export function compoundFiltersToFetchParams(filters: CompoundListFilters, page: number): FetchCompoundPositionsParams {
  const state = filters.state[0];
  const wallet = filters.q.trim();
  return {
    wallet: wallet ? wallet : undefined,
    market: filters.market[0] || undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    hasDebt: state === "borrowing" ? true : undefined,
    noDebt: state === "supply-only" ? true : undefined,
    hasLiquidations: filters.liquidations.includes("liquidated") ? true : undefined,
    sortBy: filters.sortBy as CompoundPositionSort,
    sortOrder: filters.sortOrder,
    limit: COMPOUND_ITEMS_PER_PAGE,
    offset: (page - 1) * COMPOUND_ITEMS_PER_PAGE,
  };
}
