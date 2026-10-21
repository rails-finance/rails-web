// f(x) V2 listing filter registry (SERVER-DRIVEN). Like Moonwell, the listing
// pages against the backend: the selection here maps onto the
// /api/fx/positions fetch params (filter + sort + offset), and rails-server
// does the structural work over mv_fx_positions ⋈ fx_position_chain. So these
// dimensions carry a `param` (for the shareable URL) but no in-memory `matches`
// predicate — the backend is the filter.
//
// f(x) is position-keyed like Maker vaults (the row is an ERC721 xPOSITION,
// not a wallet), so the value sorts are per-position figures off the settled
// sweep: collateral (normalized units), fxUSD debt, debt ratio. The Pool facet
// is the two-pool roster (chain-verified complete: exactly two RegisterPool
// events ever), the Maker ilk pattern with a fixed catalog.
//
// Facets that ship LIVE (backend + proxy honor the params):
//   • Status — open / closed / liquidated. Open/closed come off the settled
//     sweep (chain_closed); liquidated = ever liquidated (n_liquidations > 0).
//   • Pool   — wstETH pool / WBTC pool (multi, OR).
//   • Size   — Debt in fxUSD (minDebt / maxDebt, the settled debt as a token
//     amount: the listing reads no USD price for fxUSD) and Collateral in USD
//     (minCollUsd / maxCollUsd, the settled collateral at the pool oracle's
//     minimum price on fx_pool_state); lib/shared/size-dimensions.ts.
//   • Transactions — a range over the position's distinct transactions in
//     mv_fx_events (minTx / maxTx; lib/shared/transactions-dimension.ts).
//   • Search — a position id, a `<pool>-<id>` slug, or an owner address; the
//     proxy gets the disambiguated param.
//   • Sort   — settled collateral / debt / debt ratio, event count, recency,
//     age (the FxPositionSort vocabulary).

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchFxPositionsParams } from "@/lib/api/fetch-fx-positions";
import type { FxPositionSort } from "@/lib/sources/api/fx-positions";
import { FX_POOLS, FX_POOL_KEYS, isFxPoolKey, parseFxPositionSlug, type FxPoolKey } from "@/lib/fx/asset-catalog";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/fx/listing-visibility";
import { sizeBounds, sizeDimensions } from "@/lib/shared/size-dimensions";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const FX_ITEMS_PER_PAGE = 20;

/** The Size sliders' top: the round number above the larger of the biggest
 *  position's settled debt (35,271,292 fxUSD) and collateral ($43,344,381 at
 *  the pool oracle price) in fx_position_chain, 21 Oct 2026. */
const FX_SIZE_TOP = 50_000_000;

/** The Transactions slider's top: the round number above the busiest position
 *  (236 distinct transactions in mv_fx_events, 21 Oct 2026). */
const FX_TX_TOP = 300;

/** The Size panel's unit and price line. */
const FX_SIZE_NOTE = "Debt in fxUSD; collateral at the pool oracle's minimum price.";

export interface FxListFilters extends BaseListFilters {
  /** open / closed / liquidated — multi (OR). Lifecycle over the settled sweep. */
  status: string[];
  /** Pool keys the position must belong to (multi, OR). */
  pools: string[];
  /** Debt range in fxUSD, one encodeRange value (`1000-50000`, `-0` for no
   *  debt) or [] for no bound. URL param `debt`. */
  debt: string[];
  /** Collateral range in USD, as `debt`. URL param `coll`. */
  coll: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open positions on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const FX_LIST_DEFAULTS: FxListFilters = {
  q: "",
  sortBy: "lastActivity",
  sortOrder: "desc",
  status: [],
  pools: [],
  debt: [],
  coll: [],
  tx: [],
};

// Values are the FxPositionSort vocabulary — the backend sorts, so these must
// match what /api/fx/positions accepts.
export const FX_SORT_OPTIONS: SortOption[] = [
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "collateral", label: "Collateral (settled)" },
  { value: "debt", label: "Debt (fxUSD)" },
  { value: "debtRatio", label: "Debt ratio" },
  { value: "events", label: "Event count" },
  { value: "created", label: "Created" },
];

const FX_SORT_VALUES = new Set<string>(FX_SORT_OPTIONS.map((o) => o.value));

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Ever liquidated" },
];

// One chip per pool (the whole two-pool catalog), carrying the collateral
// token's glyph — the Maker ilk-chip grammar.
const POOL_OPTIONS: FilterOptionDef[] = FX_POOL_KEYS.map((key) => ({
  value: key,
  label: `${FX_POOLS[key].tokenSymbol} pool`,
  icon: <TokenChipIcon symbol={FX_POOLS[key].tokenSymbol} size={16} filterable={false} />,
}));

export function fxListDimensions(): SerializableDimension<FxListFilters>[] {
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
      id: "pools",
      label: "Pool",
      group: "Pool",
      cardinality: "multi",
      param: "pool",
      options: POOL_OPTIONS,
      get: (f) => f.pools,
      set: (f, v) => ({ ...f, pools: v }),
    },
    ...sizeDimensions<FxListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      panelNote: FX_SIZE_NOTE,
      top: FX_SIZE_TOP,
      debtUnit: "fxUSD",
    }),
    transactionsDimension<FxListFilters>({
      get: (f) => f.tx,
      set: (f, tx) => ({ ...f, tx }),
      top: FX_TX_TOP,
    }),
  ];
}

/** Disambiguate the free-text query: a bare integer is a position id, a
 *  `<pool>-<id>` slug pins both the id and its pool, anything else is treated
 *  as an owner address (the backend matches exactly). */
function parseFxQuery(q: string): { positionId?: string; owner?: string; pool?: FxPoolKey } {
  if (!q) return {};
  if (/^\d+$/.test(q)) return { positionId: q };
  const slug = parseFxPositionSlug(q.toLowerCase());
  if (slug) return { positionId: slug.positionId, pool: slug.pool };
  return { owner: q };
}

/** Map the decoded selection + page onto the fetch params — the server-driven
 *  counterpart of the in-memory tier's ApplyConfig. */
export function fxFiltersToFetchParams(filters: FxListFilters, page: number): FetchFxPositionsParams {
  const parsed = parseFxQuery(filters.q.trim());
  // A slug's pool pins the query; otherwise the Pool facet applies.
  const pools = parsed.pool ? [parsed.pool] : filters.pools.filter(isFxPoolKey);
  const sortBy = (FX_SORT_VALUES.has(filters.sortBy) ? filters.sortBy : "lastActivity") as FxPositionSort;
  return {
    positionId: parsed.positionId,
    owner: parsed.owner,
    pools: pools.length > 0 ? pools : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    ...sizeBounds(filters, { debt: "unit", coll: "usd" }),
    ...transactionBounds(filters.tx),
    sortBy,
    sortOrder: filters.sortOrder,
    limit: FX_ITEMS_PER_PAGE,
    offset: (page - 1) * FX_ITEMS_PER_PAGE,
  };
}
