// Compound V2 listing filter registry (SERVER-DRIVEN). Like Moonwell, the
// listing pages against the backend: the selection here maps onto the
// /api/compound-v2/positions fetch params (filter + sort + offset), and
// rails-server does the structural work over mv_compound_v2_wallets. So these
// dimensions carry a `param` (for the shareable URL) but no in-memory `matches`
// predicate — the backend is the filter.
//
// Facets that ship LIVE (backend + proxy honor the params):
//   • Status   — open / closed / liquidated (lifecycle, over
//     mv_compound_v2_wallets). 'liquidated' names only a CLOSED wallet that
//     was liquidated — the two-axis status model.
//   • Position — Borrowing (hasDebt) / Supply only (noDebt), from replayed balances.
//   • History  — Liquidated before (hasLiquidations = ever_liquidated, the
//     orthogonal flag): open SURVIVORS match too. Close factor 0.5 makes V2
//     liquidations partial — 26,639 land on 5,864 borrowers, ~4.5 each.
//   • Wallet search (exact address → the `wallet` param) and recency sort order.
//   • Supplying / Borrowing — per-market facets over the twenty-market
//     catalog; chips carry underlying symbols (19 distinct — WBTC names TWO
//     markets and its one chip reaches both), the proxy maps them to market keys.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchCompoundV2PositionsParams } from "@/lib/api/fetch-compound-v2-positions";
import type { CompoundV2PositionSort } from "@/lib/sources/api/compound-v2-positions";
import { COMPOUND_V2_FILTER_SYMBOLS } from "@/lib/compound-v2/asset-catalog";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/compound-v2/listing-visibility";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const COMPOUND_V2_ITEMS_PER_PAGE = 20;

export interface CompoundV2ListFilters extends BaseListFilters {
  /** open / closed / liquidated — multi (OR). Lifecycle over mv_compound_v2_wallets. */
  status: string[];
  /** "" | "borrowing" | "supply-only" — the debt-side of the position. */
  state: string[];
  /** "" | "liquidated" — positions that were liquidated at least once (the
   *  orthogonal flag; open survivors included). */
  liquidations: string[];
  /** Underlying symbols the position must be SUPPLYING (multi, OR). */
  supplying: string[];
  /** Underlying symbols the position must be BORROWING (multi, OR). */
  borrowing: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open wallets on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const COMPOUND_V2_LIST_DEFAULTS: CompoundV2ListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  state: [],
  liquidations: [],
  supplying: [],
  borrowing: [],
};

// Values match Liquity V2's (lib/liquity-v2/list-filter-dimensions.tsx) so the
// URL grammar (`?sortBy=debt`) is the same across explorers.
export const COMPOUND_V2_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

const STATE_OPTIONS: FilterOptionDef[] = [
  { value: "borrowing", label: "Borrowing" },
  { value: "supply-only", label: "Supply only" },
];

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [{ value: "liquidated", label: "Liquidated before" }];

// One chip per distinct underlying symbol (19 — WBTC's chip reaches both its
// markets; the proxy expands symbols to every matching market key).
const ASSET_OPTIONS: FilterOptionDef[] = COMPOUND_V2_FILTER_SYMBOLS.map((s) => ({ value: s, label: s }));

export function compoundV2ListDimensions(): SerializableDimension<CompoundV2ListFilters>[] {
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
      id: "supplying",
      label: "Supplying",
      group: "Assets",
      cardinality: "multi",
      param: "supply",
      options: ASSET_OPTIONS,
      get: (f) => f.supplying,
      set: (f, v) => ({ ...f, supplying: v }),
    },
    {
      id: "borrowing",
      label: "Borrowing",
      group: "Assets",
      cardinality: "multi",
      param: "borrow",
      options: ASSET_OPTIONS,
      get: (f) => f.borrowing,
      set: (f, v) => ({ ...f, borrowing: v }),
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

/** Map the decoded selection + page onto the fetch params — the server-driven
 *  counterpart of the in-memory tier's ApplyConfig. */
export function compoundV2FiltersToFetchParams(
  filters: CompoundV2ListFilters,
  page: number,
): FetchCompoundV2PositionsParams {
  const state = filters.state[0];
  const wallet = filters.q.trim();
  return {
    wallet: wallet ? wallet : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    hasDebt: state === "borrowing" ? true : undefined,
    noDebt: state === "supply-only" ? true : undefined,
    hasLiquidations: filters.liquidations.includes("liquidated") ? true : undefined,
    supplyAssets: filters.supplying.length > 0 ? filters.supplying : undefined,
    borrowAssets: filters.borrowing.length > 0 ? filters.borrowing : undefined,
    sortBy: filters.sortBy as CompoundV2PositionSort,
    sortOrder: filters.sortOrder,
    limit: COMPOUND_V2_ITEMS_PER_PAGE,
    offset: (page - 1) * COMPOUND_V2_ITEMS_PER_PAGE,
  };
}
