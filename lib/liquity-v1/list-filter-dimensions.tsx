// Liquity V1 listing filter registry (chain-state tier, SERVER-DRIVEN). Liquity V1
// keeps every Trove ever opened (~7.2k, open + closed + liquidated), so — like
// Spark / Compound / Aave V3 — it pages against the backend: the URL-backed
// selection maps onto the /api/liquity-v1/positions fetch params and rails-server
// does the filter / sort / paginate over mv_liquity_v1_positions. Dimensions carry a
// `param` (for the shareable URL) but no in-memory `matches` — the backend filters.
//
// All values are read from the chain: the replayed open/closed/liquidated status, and the
// raw liquidation / redemption event counts. The two History axes are ORTHOGONAL to
// current status (a Trove liquidated or redeemed against can be reopened), so they
// map to the backend's ever-liquidated / ever-redeemed filters, not the status enum.
// No USD facet — the listing tier reads no price, so a valued axis can't (and
// mustn't) be offered here. The Ratio sort is not one: coll/debt is the quotient of
// two emitted balances, and it is the PROTOCOL'S ordering key — V1 sorts its
// redemption queue by nominal ICR (price-free by construction), which with one
// collateral asset is the same order a collateral ratio would give. Facets + sorts
// that ship LIVE:
//   • Status  — open / closed / liquidated (mv_liquity_v1_positions.status).
//   • History — Liquidated before / Redeemed before (ever, from the event stream).
//   • Wallet search + sort by recency / ETH collateral / LUSD debt / ratio
//     (all chain-direct).

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchLiquityV1PositionsParams } from "@/lib/api/fetch-liquity-v1-positions";
import type { LiquityV1PositionStatus, LiquityV1PositionSort } from "@/lib/sources/api/liquity-v1-positions";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const LIQUITY_V1_ITEMS_PER_PAGE = 20;

export interface LiquityV1ListFilters extends BaseListFilters {
  status: string[];
  /** ["with"] = Troves liquidated at least once (orthogonal to current status). */
  liquidations: string[];
  /** ["with"] = Troves redeemed against at least once. */
  redemptions: string[];
}

// Resting view = the live Troves (84 of ~7,239). Status defaults to ["open"] as an
// ACTIVE selection (a clearable chip, not the dimension's inactive default), so the
// listing renders the open set at rest and only broadens when the user opts in.
export const LIQUITY_V1_LIST_DEFAULTS: LiquityV1ListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: ["open"],
  liquidations: [],
  redemptions: [],
};

export const LIQUITY_V1_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "collateral", label: "Collateral" },
  { value: "debt", label: "Debt" },
  // Ascending is the redemption queue's own direction — lowest ratio first is
  // the Trove redeemers reach first.
  { value: "ratio", label: "Ratio" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

export function liquityV1ListDimensions(): SerializableDimension<LiquityV1ListFilters>[] {
  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "multi",
      param: "status",
      options: STATUS_OPTIONS,
      get: (f) => f.status,
      set: (f, v) => ({ ...f, status: v }),
    },
    {
      id: "liquidations",
      label: "Liquidations",
      group: "History",
      cardinality: "single",
      param: "liq",
      options: [{ value: "with", label: "Liquidated before" }],
      get: (f) => f.liquidations,
      set: (f, v) => ({ ...f, liquidations: v }),
      chipLabel: () => "Liquidated before",
    },
    {
      id: "redemptions",
      label: "Redemptions",
      group: "History",
      cardinality: "single",
      param: "redeem",
      options: [{ value: "with", label: "Redeemed before" }],
      get: (f) => f.redemptions,
      set: (f, v) => ({ ...f, redemptions: v }),
      chipLabel: () => "Redeemed before",
    },
  ];
}

/** Map the decoded selection + page onto the V1 fetch params — the server-driven
 *  counterpart of the retired in-memory ApplyConfig. */
export function liquityV1FiltersToFetchParams(
  filters: LiquityV1ListFilters,
  page: number,
): FetchLiquityV1PositionsParams {
  const wallet = filters.q.trim();
  return {
    wallet: wallet ? wallet : undefined,
    status: filters.status.length > 0 ? (filters.status as LiquityV1PositionStatus[]) : undefined,
    hasLiquidations: filters.liquidations.includes("with") ? true : undefined,
    hasRedemptions: filters.redemptions.includes("with") ? true : undefined,
    sortBy: filters.sortBy as LiquityV1PositionSort,
    sortOrder: filters.sortOrder,
    limit: LIQUITY_V1_ITEMS_PER_PAGE,
    offset: (page - 1) * LIQUITY_V1_ITEMS_PER_PAGE,
  };
}
