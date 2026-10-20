// Maple listing filter registry (SERVER-DRIVEN). Like Moonwell, the listing
// pages against the backend: the selection here maps onto the
// /api/maple/positions fetch params (filter + sort + offset), and
// rails-server does the structural work over mv_maple_wallets. So these
// dimensions carry a `param` (for the shareable URL) but no in-memory
// `matches` predicate — the backend is the filter.
//
// Facets that ship LIVE (backend + proxy honor the params):
//   • Status — open / closed (lifecycle), over mv_maple_wallets. There is no
//     liquidated state: a Maple lender has no liquidation surface (default
//     risk socializes through the pool's exit rate).
//   • Queue  — In withdrawal queue (inQueue), from the escrow lane.
//   • Pool   — per-pool facets over the two-pool catalog (share symbols).
//   • Size   — one Deposited range in USD (lib/shared/size-dimensions.ts with
//     `sides: ["coll"]`), sent as minCollUsd / maxCollUsd. A lender has no
//     debt side, so there is no Debt range.
//   • Transactions — a range over tx_count (`minTx` / `maxTx`, inclusive;
//     lib/shared/transactions-dimension.ts).
//   • Wallet search (exact address → the `wallet` param) and recency sort.

import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { sizeDimensions, usdBounds } from "@/lib/shared/size-dimensions";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchMaplePositionsParams } from "@/lib/api/fetch-maple-positions";
import type { MaplePositionSort } from "@/lib/sources/api/maple-positions";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/maple/listing-visibility";

/** The Transactions slider's top: the round number above the busiest listed
 *  wallet (21,838 transactions, 20 Oct 2026). */
const MAPLE_TX_TOP = 30000;

/** The Size panel's price line. */
const MAPLE_SIZE_NOTE = "The deposited principal at the latest indexed price, as of the listing's last refresh.";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const MAPLE_ITEMS_PER_PAGE = 20;

export interface MapleListFilters extends BaseListFilters {
  /** open / closed — multi (OR). Lifecycle over mv_maple_wallets. */
  status: string[];
  /** "" | "queued" — positions currently waiting in the withdrawal queue. */
  queue: string[];
  /** Share-token symbols the position must hold (multi, OR). */
  pools: string[];
  /** Deposited range in USD, one encodeRange value (`1000-50000`) or [] for
   *  no bound. URL param `coll`. */
  coll: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open wallets on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const MAPLE_LIST_DEFAULTS: MapleListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  queue: [],
  pools: [],
  coll: [],
  tx: [],
};

// "coll" reads "Deposited", not "Collateral" — a Maple lender position has no
// debt side, so there is no "Debt" entry (mig 188's header). Value matches
// the other explorers' collateral-sort URL grammar (`?sortBy=coll`) even
// though the label differs.
export const MAPLE_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "coll", label: "Deposited" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

const QUEUE_OPTIONS: FilterOptionDef[] = [{ value: "queued", label: "In withdrawal queue" }];

// One chip per pool (the whole two-pool catalog).
const POOL_OPTIONS: FilterOptionDef[] = MAPLE_POOLS.map((p) => ({ value: p.symbol, label: p.symbol }));

export function mapleListDimensions(): SerializableDimension<MapleListFilters>[] {
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
      defaultChip: (f) => (defaultStatuses(f).length < STATUS_OPTIONS.length ? "Status: Open" : null),
      clearDefault: (f) => ({ ...f, status: STATUS_OPTIONS.map((o) => o.value) }),
      set: (f, v) => {
        const sel = canonicalStatuses(v);
        return { ...f, status: sel.length === 0 || sameStatusSet(sel, defaultStatuses(f)) ? [] : sel };
      },
    },
    {
      id: "queue",
      label: "Queue",
      group: "Queue",
      cardinality: "single",
      param: "queue",
      options: QUEUE_OPTIONS,
      get: (f) => f.queue,
      set: (f, v) => ({ ...f, queue: v }),
      chipLabel: () => "In withdrawal queue",
    },
    {
      id: "pools",
      label: "Pool",
      group: "Pools",
      cardinality: "multi",
      param: "pool",
      options: POOL_OPTIONS,
      get: (f) => f.pools,
      set: (f, v) => ({ ...f, pools: v }),
    },
    ...sizeDimensions<MapleListFilters>({
      getDebt: () => [],
      setDebt: (f) => f,
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      panelNote: MAPLE_SIZE_NOTE,
      sides: ["coll"],
      collLabel: "Deposited",
    }),
    transactionsDimension<MapleListFilters>({
      get: (f) => f.tx,
      set: (f, tx) => ({ ...f, tx }),
      top: MAPLE_TX_TOP,
    }),
  ];
}

/** Map the decoded selection + page onto the fetch params — the server-driven
 *  counterpart of the in-memory tier's ApplyConfig. */
export function mapleFiltersToFetchParams(filters: MapleListFilters, page: number): FetchMaplePositionsParams {
  const wallet = filters.q.trim();
  return {
    wallet: wallet ? wallet : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    inQueue: filters.queue.includes("queued") ? true : undefined,
    pools: filters.pools.length > 0 ? filters.pools : undefined,
    minCollUsd: usdBounds({ debt: [], coll: filters.coll }).minCollUsd,
    maxCollUsd: usdBounds({ debt: [], coll: filters.coll }).maxCollUsd,
    ...transactionBounds(filters.tx),
    sortBy: filters.sortBy as MaplePositionSort,
    sortOrder: filters.sortOrder,
    limit: MAPLE_ITEMS_PER_PAGE,
    offset: (page - 1) * MAPLE_ITEMS_PER_PAGE,
  };
}
