// LlamaLend listing filter registry (SERVER-DRIVEN). The listing pages
// against the backend: the selection here maps onto the
// /api/llamalend/positions fetch params (filter + sort + offset), and
// rails-server does the structural work over mv_llamalend_positions at the
// (controller, user) grain. So these dimensions carry a `param` (for the
// shareable URL) but no in-memory `matches` predicate — the backend is the
// filter.
//
// Facets:
//   • Status  — Open / Closed / All (ui-jobs 805), and Closed by liquidation
//     with Closed. 'liquidated' names only a CLOSED position — the two-axis
//     status model.
//   • Size: Debt and Collateral ranges in USD (lib/shared/size-dimensions.ts),
//     sent as minDebtUsd / maxDebtUsd / minCollUsd / maxCollUsd. Only a
//     crvUSD-borrowed market has a dollar figure; the rest stay out of a range.
//   • History — Liquidated before (the orthogonal flag): open SURVIVORS
//     match too.
//   • Transactions — a range over tx_count, every distinct transaction on the
//     position (liquidations included), sent as minTx / maxTx.
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

import { COLLATERAL_PARAM, collateralOptions, collateralTokensOf } from "@/lib/shared/collateral-facet";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { sizeDimensions, usdBounds } from "@/lib/shared/size-dimensions";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchLlamalendPositionsParams } from "@/lib/api/fetch-llamalend-positions";
import type { LlamalendPositionSort } from "@/lib/sources/api/llamalend-positions";
import {
  llamalendStatusBuckets,
  defaultStatusChoice,
  endedByLiquidation,
  statusChoice,
} from "@/lib/llamalend/listing-visibility";
import { ENDED_BY_LIQUIDATION, readStatusParam, STATUS_CHOICE_OPTIONS } from "@/lib/shared/status-choice";

/** 20 keeps the page light — and the per-page soft-liq overlay is ONE
 *  multicall of 20 user_state reads. */
export const LLAMALEND_ITEMS_PER_PAGE = 20;

/** The Transactions slider's top: the round number above the busiest position
 *  (932 transactions, 16 Oct 2026). */
const LLAMALEND_TX_TOP = 1000;

export interface LlamalendListFilters extends BaseListFilters {
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  /** "" | "liquidated" — with Closed, the positions that ended by liquidation.
   *  URL param `ended`. */
  ended: string[];
  /** "" | "liquidated" — positions hard-liquidated at least once (the
   *  orthogonal flag; open survivors included). */
  liquidations: string[];
  /** Debt range in USD, one encodeRange value (`1000-50000`, `-0` for no
   *  debt) or [] for no bound. URL param `debt`. */
  debt: string[];
  /** Collateral range in USD, as `debt`. URL param `coll`. */
  coll: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
  /** Collateral token symbols of the market (multi, OR). URL param `collateral`. */
  collateral: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open positions on the bare directory,
// every status once the search names an identity.
export const LLAMALEND_LIST_DEFAULTS: LlamalendListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  ended: [],
  liquidations: [],
  debt: [],
  coll: [],
  tx: [],
  collateral: [],
};

// Values match Liquity V2's (lib/liquity-v2/list-filter-dimensions.tsx) so the
// URL grammar (`?sortBy=debt`) is the same across explorers.
export const LLAMALEND_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

/** The Size panel's price line. */
const LLAMALEND_SIZE_NOTE =
  "At the latest indexed price per asset, as of the listing's last refresh. A market with no dollar figure stays out of a range.";

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [{ value: "liquidated", label: "Liquidated before" }];

export function llamalendListDimensions(): SerializableDimension<LlamalendListFilters>[] {
  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "single",
      param: "status",
      options: STATUS_CHOICE_OPTIONS,
      segmented: true,
      get: (f) => [statusChoice(f)],
      defaultValues: (f) => [defaultStatusChoice(f)],
      // Takes the choice, or an old link's list of statuses (ui-jobs 805).
      set: (f, v) => {
        const read = readStatusParam(v);
        const choice = read.choice ?? defaultStatusChoice(f);
        return {
          ...f,
          status: choice === defaultStatusChoice(f) ? [] : [choice],
          ended: choice !== "closed" ? [] : read.endedByLiquidation ? [ENDED_BY_LIQUIDATION] : f.ended,
        };
      },
    },
    {
      id: "ended",
      label: "Closed by liquidation",
      // Its own group, for its pill; in the panel it sits under Status.
      group: "Closed by liquidation",
      cardinality: "single",
      param: "ended",
      options: [{ value: ENDED_BY_LIQUIDATION, label: "Closed by liquidation" }],
      // Offered with Closed, which it narrows.
      available: (f) => statusChoice(f) === "closed",
      get: (f) => (endedByLiquidation(f) ? [ENDED_BY_LIQUIDATION] : []),
      set: (f, v) => ({ ...f, ended: v }),
      chipLabel: () => "Closed by liquidation",
    },
    ...sizeDimensions<LlamalendListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      panelNote: LLAMALEND_SIZE_NOTE,
    }),
    {
      id: "liquidations",
      label: "Liquidated before",
      group: "History",
      cardinality: "single",
      param: "liq",
      options: LIQUIDATION_OPTIONS,
      get: (f) => f.liquidations,
      set: (f, v) => ({ ...f, liquidations: v }),
      chipLabel: () => "Liquidated before",
    },
    {
      id: "collateral",
      label: "Collateral",
      group: "Assets",
      cardinality: "multi",
      param: COLLATERAL_PARAM,
      options: collateralOptions(),
      get: (f) => f.collateral,
      set: (f, v) => ({ ...f, collateral: v }),
    },
    transactionsDimension<LlamalendListFilters>({
      get: (f) => f.tx,
      set: (f, tx) => ({ ...f, tx }),
      top: LLAMALEND_TX_TOP,
    }),
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
    // All maps to no status filter; Closed asks for closed and liquidated.
    status: llamalendStatusBuckets(filters) as FetchLlamalendPositionsParams["status"],
    hasLiquidations: filters.liquidations.includes("liquidated") ? true : undefined,
    collateralTokens: collateralTokensOf(filters.collateral),
    ...usdBounds(filters),
    ...transactionBounds(filters.tx),
    sortBy: filters.sortBy as LlamalendPositionSort,
    sortOrder: filters.sortOrder,
    limit: LLAMALEND_ITEMS_PER_PAGE,
    offset: (page - 1) * LLAMALEND_ITEMS_PER_PAGE,
  };
}
