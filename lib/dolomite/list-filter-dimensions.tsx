// Dolomite listing filter registry (SERVER-DRIVEN). The listing pages against
// the backend: the selection here maps onto the /api/dolomite/positions fetch
// params (filter + sort + offset), and rails-server does the structural work
// over mv_dolomite_positions at the (owner, account_number) grain. So these
// dimensions carry a `param` (for the shareable URL) but no in-memory
// `matches` predicate — the backend is the filter.
//
// Facets:
//   • Status   — open / closed / liquidated (lifecycle). 'liquidated' names
//     only a CLOSED account — the two-axis status model.
//   • Position — Borrowing (any negative balance) / Lending only, from the
//     replayed pars (a negative balance IS debt; there is no Borrow action).
//   • Account  — Dolomite Balance (account 0) vs isolated Borrow Positions —
//     Dolomite's own account vocabulary, a facet no other explorer has
//     because no other subject has the two-kind account grain.
//   • History  — Liquidated before (the orthogonal flag): open SURVIVORS
//     match too.
//   • Owner search (the `q` box → the `owner` param — "this owner's
//     accounts", plural on purpose: the grain is the pair) + recency sort.
//
// There are deliberately NO per-asset facets: the roster is read from the
// core at head (admin can list markets), and a hardcoded symbol chip list
// would assert a roster — revisit when the backend exposes the market table
// to build chips from.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchDolomitePositionsParams } from "@/lib/api/fetch-dolomite-positions";
import type { DolomitePositionSort } from "@/lib/sources/api/dolomite-positions";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/dolomite/listing-visibility";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const DOLOMITE_ITEMS_PER_PAGE = 20;

export interface DolomiteListFilters extends BaseListFilters {
  /** open / closed / liquidated — multi (OR). */
  status: string[];
  /** "" | "borrowing" | "lending-only" — the debt side of the account. */
  state: string[];
  /** "" | "dolomite-balance" | "borrow-position" — the account kind. */
  accountKind: string[];
  /** "" | "liquidated" — accounts liquidated at least once (the orthogonal
   *  flag; open survivors included). */
  liquidations: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open accounts on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const DOLOMITE_LIST_DEFAULTS: DolomiteListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  state: [],
  accountKind: [],
  liquidations: [],
};

// Values match Liquity V2's (lib/liquity-v2/list-filter-dimensions.tsx) so the
// URL grammar (`?sortBy=debt`) is the same across explorers.
export const DOLOMITE_SORT_OPTIONS: SortOption[] = [
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
  { value: "lending-only", label: "Lending only" },
];

const ACCOUNT_KIND_OPTIONS: FilterOptionDef[] = [
  { value: "dolomite-balance", label: "Dolomite Balance" },
  { value: "borrow-position", label: "Borrow Position" },
];

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [{ value: "liquidated", label: "Liquidated before" }];

export function dolomiteListDimensions(): SerializableDimension<DolomiteListFilters>[] {
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
      id: "accountKind",
      label: "Account",
      group: "Account",
      cardinality: "single",
      param: "kind",
      options: ACCOUNT_KIND_OPTIONS,
      get: (f) => f.accountKind,
      set: (f, v) => ({ ...f, accountKind: v }),
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
export function dolomiteFiltersToFetchParams(filters: DolomiteListFilters, page: number): FetchDolomitePositionsParams {
  const state = filters.state[0];
  const kind = filters.accountKind[0];
  const owner = filters.q.trim();
  return {
    owner: owner ? owner : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    hasDebt: state === "borrowing" ? true : undefined,
    noDebt: state === "lending-only" ? true : undefined,
    kind: kind === "dolomite-balance" ? "balance" : kind === "borrow-position" ? "borrow" : undefined,
    hasLiquidations: filters.liquidations.includes("liquidated") ? true : undefined,
    sortBy: filters.sortBy as DolomitePositionSort,
    sortOrder: filters.sortOrder,
    limit: DOLOMITE_ITEMS_PER_PAGE,
    offset: (page - 1) * DOLOMITE_ITEMS_PER_PAGE,
  };
}
