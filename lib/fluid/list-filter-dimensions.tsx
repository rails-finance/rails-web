// Fluid listing filter registry (SERVER-DRIVEN). Like Moonwell/Spark, the
// listing pages against the backend: the selection here maps onto the
// /api/fluid/positions fetch params (filter + sort + offset), and rails-server
// does the structural work over mv_fluid_positions. So these dimensions carry
// a `param` (for the shareable URL) but no in-memory `matches` predicate — the
// backend is the filter.
//
// Facets that ship LIVE (backend + proxy honor the params):
//   • Status     — open / closed (lifecycle over mv_fluid_positions).
//   • Position   — Borrowing (hasDebt) / Collateral only (noDebt).
//   • History    — Liquidated before / Never liquidated (wasLiquidated).
//   • Vault kind — Standard pairs (T1) / Smart vaults (DEX-share legs).
//   • Owner search (address → the `wallet` param; a bare integer → the `nft`
//     param — positions are NFTs) and the four sort orders.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchFluidPositionsParams } from "@/lib/api/fetch-fluid-positions";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/fluid/listing-visibility";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const FLUID_ITEMS_PER_PAGE = 20;

export interface FluidListFilters extends BaseListFilters {
  /** open / closed — multi (OR). Lifecycle over mv_fluid_positions. */
  status: string[];
  /** "" | "borrowing" | "collateral-only" — the debt-side of the position. */
  state: string[];
  /** "" | "liquidated" | "never" — the wasLiquidated flag (orthogonal history). */
  liquidations: string[];
  /** "" | "t1" | "smart" — plain token pairs vs DEX-share-legged smart vaults. */
  vaultKind: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open positions on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const FLUID_LIST_DEFAULTS: FluidListFilters = {
  q: "",
  sortBy: "lastActivity",
  sortOrder: "desc",
  status: [],
  state: [],
  liquidations: [],
  vaultKind: [],
};

export const FLUID_SORT_OPTIONS: SortOption[] = [
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt size" },
  { value: "collateral", label: "Collateral size" },
  { value: "events", label: "Event count" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

const STATE_OPTIONS: FilterOptionDef[] = [
  { value: "borrowing", label: "Borrowing" },
  { value: "collateral-only", label: "Collateral only" },
];

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [
  { value: "liquidated", label: "Liquidated before" },
  { value: "never", label: "Never liquidated" },
];

const VAULT_KIND_OPTIONS: FilterOptionDef[] = [
  { value: "t1", label: "Standard pairs" },
  { value: "smart", label: "Smart vaults" },
];

export function fluidListDimensions(): SerializableDimension<FluidListFilters>[] {
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
      id: "vaultKind",
      label: "Vault kind",
      group: "Vault kind",
      cardinality: "single",
      param: "kind",
      options: VAULT_KIND_OPTIONS,
      get: (f) => f.vaultKind,
      set: (f, v) => ({ ...f, vaultKind: v }),
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
    },
  ];
}

const SORT_VALUES = new Set(FLUID_SORT_OPTIONS.map((o) => o.value));

/** Map the decoded selection + page onto the fetch params — the server-driven
 *  counterpart of the in-memory tier's ApplyConfig. */
export function fluidFiltersToFetchParams(filters: FluidListFilters, page: number): FetchFluidPositionsParams {
  const state = filters.state[0];
  const liq = filters.liquidations[0];
  const kind = filters.vaultKind[0];
  // Positions are NFTs: a bare integer looks up the NFT id, anything else the
  // owner wallet (the backend filters by the NFT's current owner).
  const q = filters.q.trim();
  return {
    wallet: q && !/^\d+$/.test(q) ? q : undefined,
    nft: q && /^\d+$/.test(q) ? q : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    hasDebt: state === "borrowing" ? true : undefined,
    noDebt: state === "collateral-only" ? true : undefined,
    wasLiquidated: liq === "liquidated" ? true : liq === "never" ? false : undefined,
    vaultKind: kind === "t1" || kind === "smart" ? kind : undefined,
    sortBy: SORT_VALUES.has(filters.sortBy)
      ? (filters.sortBy as NonNullable<FetchFluidPositionsParams["sortBy"]>)
      : undefined,
    sortOrder: filters.sortOrder,
    limit: FLUID_ITEMS_PER_PAGE,
    offset: (page - 1) * FLUID_ITEMS_PER_PAGE,
  };
}
