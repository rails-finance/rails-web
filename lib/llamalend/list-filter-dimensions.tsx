// LlamaLend listing filter registry (SERVER-DRIVEN). The listing pages
// against the backend: the selection here maps onto the
// /api/llamalend/positions fetch params (filter + sort + offset), and
// rails-server does the structural work over mv_llamalend_positions at the
// (controller, user) grain. So these dimensions carry a `param` (for the
// shareable URL) but no in-memory `matches` predicate — the backend is the
// filter.
//
// Facets:
//   • Status  — open / closed / liquidated (lifecycle). 'liquidated' names
//     only a CLOSED position — the two-axis status model.
//   • History — Liquidated before (the orthogonal flag): open SURVIVORS
//     match too.
//   • User search (the `q` box → the `user` param — "this user's positions",
//     plural on purpose: the grain is the pair and a user can hold several
//     isolated markets) + recency sort.
//
// There are deliberately NO per-market facets: the roster is read from the
// factories at head (59 today, growing), and a hardcoded market chip list
// would assert a roster. A `controller` param still filters (the detail page
// and market links use it) — it just isn't a chip. Soft-liquidation is NOT a
// facet either: it is a chain overlay figure (no event carries it), so the
// backend cannot filter on it — the cards state it instead.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchLlamalendPositionsParams } from "@/lib/api/fetch-llamalend-positions";
import type { LlamalendPositionSort } from "@/lib/sources/api/llamalend-positions";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/llamalend/listing-visibility";

/** 20 keeps the page light — and the per-page soft-liq overlay is ONE
 *  multicall of 20 user_state reads. */
export const LLAMALEND_ITEMS_PER_PAGE = 20;

export interface LlamalendListFilters extends BaseListFilters {
  /** open / closed / liquidated — multi (OR). */
  status: string[];
  /** "" | "liquidated" — positions hard-liquidated at least once (the
   *  orthogonal flag; open survivors included). */
  liquidations: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open positions on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const LLAMALEND_LIST_DEFAULTS: LlamalendListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  liquidations: [],
};

// Values match Liquity V2's (lib/liquity-v2/list-filter-dimensions.tsx) so the
// URL grammar (`?sortBy=debt`) is the same across explorers.
export const LLAMALEND_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [{ value: "liquidated", label: "Liquidated before" }];

export function llamalendListDimensions(): SerializableDimension<LlamalendListFilters>[] {
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
export function llamalendFiltersToFetchParams(
  filters: LlamalendListFilters,
  page: number,
): FetchLlamalendPositionsParams {
  const user = filters.q.trim();
  return {
    user: user ? user : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    hasLiquidations: filters.liquidations.includes("liquidated") ? true : undefined,
    sortBy: filters.sortBy as LlamalendPositionSort,
    sortOrder: filters.sortOrder,
    limit: LLAMALEND_ITEMS_PER_PAGE,
    offset: (page - 1) * LLAMALEND_ITEMS_PER_PAGE,
  };
}
