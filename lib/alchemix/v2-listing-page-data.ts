// The server half of the V2 listing: the URL decoded against this chain's
// dimensions, and the first page fetched through the deployment's own proxy,
// as the Transmuter listing's server half does.

import { fetchAlchemixV2Positions } from "@/lib/api/fetch-alchemix-v2-positions";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import {
  v2FiltersToFetchParams,
  v2ListDimensions,
  V2_LIST_DEFAULTS,
  type V2ListFilters,
} from "@/lib/alchemix/v2-list-filter-dimensions";
import { ssrDecode, ssrInitial, toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import type { AlchemixV2PositionSummary } from "@/types/api/alchemix";

export async function v2ListingPageData(deployment: AlchemixDeployment, rawSearchParams: RawSearchParams) {
  const dims = v2ListDimensions(deployment.chainId);
  const sp = toURLSearchParams(rawSearchParams);
  const { filters, page } = ssrDecode<V2ListFilters>(dims, sp, V2_LIST_DEFAULTS);

  const initial = await ssrInitial<V2ListFilters, AlchemixV2PositionSummary>({
    dims,
    defaults: V2_LIST_DEFAULTS,
    filters,
    page,
    label: `Alchemix V2 (chain ${deployment.chainId})`,
    fetchPage: (baseUrl, signal, headers) =>
      fetchAlchemixV2Positions({ ...v2FiltersToFetchParams(deployment, filters, page), baseUrl, signal, headers }).then(
        (r) => ({ data: r.data, total: r.pagination.total }),
      ),
  });

  return { ...initial, initialSearch: sp.toString() };
}
