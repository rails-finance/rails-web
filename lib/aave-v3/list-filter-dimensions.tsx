// Aave V3 listing filter registry (chain-state tier, SERVER-DRIVEN). One row per
// (wallet, market) across the Core / Prime / EtherFi Pools, ~139k positions — so it
// pages against the backend: the URL-backed selection maps onto the
// /api/aave-v3/positions fetch params and rails-server does the filter / sort /
// offset over mv_aave_v3_positions. Dimensions carry a `param` (for the shareable
// URL) but no in-memory `matches` — the backend filters.
//
// Facets that ship LIVE:
//   • Status  — open / closed / liquidated (lifecycle), over mv_aave_v3_wallets,
//     resting on a CONTEXTUAL default (lib/aave-v3/listing-visibility.ts).
//   • Market  — Core / Prime / EtherFi (the three V3 Pools).
//   • Position — Borrowing (hasDebt) / Supply only (noDebt).
//   • History — Liquidated before (hasLiquidations).
// The Status facet arrived with mv_aave_v3_wallets (mig 076), the (wallet,market)-grain
// lifecycle MV — the old listing base (mv_aave_v3_positions) was OPEN-ONLY, so there
// was nothing closed / liquidated to filter. The directory rests on the open accounts
// and relaxes to every status on a wallet search — closed and liquidated positions,
// with their peak balances, arrive with the holder who came looking for them.
// Sort offers Recent activity / Debt / Collateral (mig 182's
// debt_usd/collateral_usd on mv_aave_v3_wallet_markets — a ranking aid, never
// displayed; the card's HF/USD stays chain-truth/overlay-derived, and is null
// unless the periodic chain-overlay snapshot covers this wallet).
// Per-asset Supplying/Borrowing facets are honored server-side (the proxy maps symbols
// → addresses off AAVE_V3_CATALOG) and can graduate later.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchAaveV3PositionsParams, AaveV3PositionSort } from "@/lib/api/fetch-aave-v3-positions";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/aave-v3/listing-visibility";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const AAVE_V3_ITEMS_PER_PAGE = 20;

export interface AaveV3ListFilters extends BaseListFilters {
  /** open / closed / liquidated — lifecycle status (multi-select). */
  status: string[];
  /** core / prime / etherfi — single-select market (stored as an array). */
  market: string[];
  /** "" | "borrowing" | "supply-only" — the debt side. */
  state: string[];
  /** "" | "liquidated" — positions liquidated at least once. */
  liquidations: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open accounts on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const AAVE_V3_LIST_DEFAULTS: AaveV3ListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  market: [],
  state: [],
  liquidations: [],
};

// Values match Liquity V2's (lib/liquity-v2/list-filter-dimensions.tsx) so the
// URL grammar (`?sortBy=debt`) is the same across explorers.
export const AAVE_V3_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

const MARKET_OPTIONS: FilterOptionDef[] = [
  { value: "core", label: "Core" },
  { value: "prime", label: "Prime" },
  { value: "etherfi", label: "EtherFi" },
];

const STATE_OPTIONS: FilterOptionDef[] = [
  { value: "borrowing", label: "Borrowing" },
  { value: "supply-only", label: "Supply only" },
];

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [{ value: "liquidated", label: "Liquidated before" }];

export function aaveV3ListDimensions(): SerializableDimension<AaveV3ListFilters>[] {
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

/** Map the decoded selection + page onto the V3 fetch params. */
export function aaveV3FiltersToFetchParams(filters: AaveV3ListFilters, page: number): FetchAaveV3PositionsParams {
  const state = filters.state[0];
  const wallet = filters.q.trim();
  return {
    wallet: wallet ? wallet : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    market: filters.market[0] || undefined,
    // Tri-state debt facet (see AaveV3DebtFacet): only ever "borrowing" /
    // "supply-only" / absent — a false-valued hasDebt/noDebt is unrepresentable.
    debt: state === "borrowing" || state === "supply-only" ? state : undefined,
    hasLiquidations: filters.liquidations.includes("liquidated") ? true : undefined,
    sortBy: filters.sortBy as AaveV3PositionSort,
    sortOrder: filters.sortOrder,
    limit: AAVE_V3_ITEMS_PER_PAGE,
    offset: (page - 1) * AAVE_V3_ITEMS_PER_PAGE,
  };
}
