// Seamless listing — the Aave V3 filter dimensions minus the market facet.
// ----------------------------------------------------------------------------
// Seamless is one Pool, so the Ethereum explorer's Core / Prime / EtherFi
// facet has nothing to select. Everything else (status, debt and collateral
// size, liquidation history) is the same question asked of the same Pool
// interface, so the dimensions are the Aave V3 ones with that one removed,
// and the fetch params are the Aave V3 ones pointed at the Seamless route.

import {
  aaveV3ListDimensions,
  aaveV3FiltersToFetchParams,
  AAVE_V3_LIST_DEFAULTS,
  BASE_LENDING_SIZE_NOTE,
  type AaveV3ListFilters,
} from "@/lib/aave-v3/list-filter-dimensions";
import type { FetchAaveV3PositionsParams, AaveV3PositionSort } from "@/lib/api/fetch-aave-v3-positions";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";

export const SEAMLESS_POSITIONS_ROUTE = "/api/seamless/positions";

export function seamlessListDimensions() {
  return aaveV3ListDimensions(undefined, BASE_LENDING_SIZE_NOTE).filter((d) => d.id !== "market" && d.id !== "tx");
}

export const SEAMLESS_LIST_DEFAULTS: AaveV3ListFilters = { ...AAVE_V3_LIST_DEFAULTS, market: [] };

// This lane's own constant, NOT Ethereum's AAVE_V3_SORT_OPTIONS: the two
// backends page different tables (baseLending.ts's total_debt_usd /
// total_collateral_usd vs mv_aave_v3_wallets), so sharing one constant would
// let this lane drift onto values its own backend cannot honor if Ethereum's
// list grows independently. Values match Liquity V2's URL grammar.
export const SEAMLESS_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

export function seamlessFiltersToFetchParams(filters: AaveV3ListFilters, page: number): FetchAaveV3PositionsParams {
  const p = aaveV3FiltersToFetchParams(filters, page);
  return { ...p, market: undefined, sortBy: filters.sortBy as AaveV3PositionSort, route: SEAMLESS_POSITIONS_ROUTE };
}
