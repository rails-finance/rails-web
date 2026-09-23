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

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const FX_ITEMS_PER_PAGE = 20;

export interface FxListFilters extends BaseListFilters {
  /** open / closed / liquidated — multi (OR). Lifecycle over the settled sweep. */
  status: string[];
  /** Pool keys the position must belong to (multi, OR). */
  pools: string[];
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
  { value: "liquidated", label: "Liquidated" },
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
    sortBy,
    sortOrder: filters.sortOrder,
    limit: FX_ITEMS_PER_PAGE,
    offset: (page - 1) * FX_ITEMS_PER_PAGE,
  };
}
