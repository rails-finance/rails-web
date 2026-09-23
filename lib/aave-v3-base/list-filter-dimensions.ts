// Aave V3 Base listing — the Aave V3 filter dimensions minus the market facet.
// ----------------------------------------------------------------------------
// The Base deployment is one Pool, so the Ethereum explorer's Core / Prime /
// EtherFi facet has nothing to select. Everything else — status, position
// side, liquidation history — is the same question asked of the same Pool
// interface, so the dimensions are the Aave V3 ones with that one removed,
// and the fetch params are the Aave V3 ones pointed at the Base route.

import {
  aaveV3ListDimensions,
  aaveV3FiltersToFetchParams,
  AAVE_V3_LIST_DEFAULTS,
  type AaveV3ListFilters,
} from "@/lib/aave-v3/list-filter-dimensions";
import type { FetchAaveV3PositionsParams, AaveV3PositionSort } from "@/lib/api/fetch-aave-v3-positions";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";

export const AAVE_V3_BASE_POSITIONS_ROUTE = "/api/aave-v3-base/positions";

export function aaveV3BaseListDimensions() {
  return aaveV3ListDimensions().filter((d) => d.id !== "market");
}

export const AAVE_V3_BASE_LIST_DEFAULTS: AaveV3ListFilters = { ...AAVE_V3_LIST_DEFAULTS, market: [] };

// This lane's own constant, NOT Ethereum's AAVE_V3_SORT_OPTIONS: the two
// backends page different tables (baseLending.ts's total_debt_usd /
// total_collateral_usd vs mv_aave_v3_wallets), so sharing one constant would
// let this lane drift onto values its own backend cannot honor if Ethereum's
// list grows independently. Values match Liquity V2's URL grammar.
export const AAVE_V3_BASE_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

export function aaveV3BaseFiltersToFetchParams(filters: AaveV3ListFilters, page: number): FetchAaveV3PositionsParams {
  const p = aaveV3FiltersToFetchParams(filters, page);
  return { ...p, market: undefined, sortBy: filters.sortBy as AaveV3PositionSort, route: AAVE_V3_BASE_POSITIONS_ROUTE };
}
