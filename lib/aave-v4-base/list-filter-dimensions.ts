// Aave V4 Base listing — the Aave V4 filter dimensions minus the hub and spoke
// facets, which have one value each on Base (the Equities hub, the Mag7
// spoke). The asset facets list the spoke's reserves, read from the Equities
// hub's roster (lib/api/fetch-aave-v4-base-asset-universe.ts): every reserve on
// the supply side and the borrowable ones (USDC) on the other. The fetch
// params are the Aave V4 ones pointed at /api/aave-v4-base.

import {
  aaveV4ListDimensions,
  aaveV4FiltersToFetchParams,
  AAVE_V4_LIST_DEFAULTS,
  AAVE_V4_SORT_OPTIONS,
  type AaveV4ListFilters,
} from "@/lib/aave-v4/list-filter-dimensions";
import type { AaveV4AssetUniverseEntry } from "@/lib/api/fetch-aave-v4-asset-universe";
import type { FetchAaveV4SpokePositionsParams } from "@/lib/api/fetch-aave-v4-spoke-positions";
import { AAVE_V4_BASE_API_ROOT } from "@/lib/aave-v4/deployment-routes";

/** The Transactions slider's top on Base: the round number above the busiest
 *  account (1,096 transactions, 16 Oct 2026). */
const AAVE_V4_BASE_TX_TOP = 2000;

/** The Size panel's price line on Base. */
const AAVE_V4_BASE_SIZE_NOTE = "At the reserve's price feed at the latest read.";

/** The dimensions for the loaded roster; with none loaded (the server's codec
 *  pass) the asset facets hold no options and the codec is the same. */
export function aaveV4BaseListDimensions(universe?: AaveV4AssetUniverseEntry[]) {
  return aaveV4ListDimensions(AAVE_V4_LIST_DEFAULTS, universe, AAVE_V4_BASE_TX_TOP, AAVE_V4_BASE_SIZE_NOTE).filter(
    (d) => d.id !== "hubs" && d.id !== "spokes",
  );
}

export const AAVE_V4_BASE_LIST_DEFAULTS: AaveV4ListFilters = AAVE_V4_LIST_DEFAULTS;
export const AAVE_V4_BASE_SORT_OPTIONS = AAVE_V4_SORT_OPTIONS;

export function aaveV4BaseFiltersToFetchParams(
  filters: AaveV4ListFilters,
  page: number,
): FetchAaveV4SpokePositionsParams {
  return {
    ...aaveV4FiltersToFetchParams(filters, page),
    spokes: undefined,
    hubs: undefined,
    apiRoot: AAVE_V4_BASE_API_ROOT,
  };
}
