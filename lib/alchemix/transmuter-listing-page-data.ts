// The server half of the Transmuter listing, shared by both explorers: the URL
// decoded against THIS chain's dimensions, and the first page fetched through
// this deployment's own proxy, as the Alchemist listing's server half does.

import { fetchAlchemixTransmuterPositions } from "@/lib/api/fetch-alchemix-transmuter-positions";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import {
  transmuterFiltersToFetchParams,
  transmuterListDimensions,
  TRANSMUTER_LIST_DEFAULTS,
  type TransmuterListFilters,
} from "@/lib/alchemix/transmuter-list-filter-dimensions";
import { ssrDecode, ssrInitial, toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import type { AlchemixTransmuterPositionSummary } from "@/types/api/alchemix";

export async function transmuterListingPageData(deployment: AlchemixDeployment, rawSearchParams: RawSearchParams) {
  const dims = transmuterListDimensions(deployment.chainId);
  const sp = toURLSearchParams(rawSearchParams);
  const { filters, page } = ssrDecode<TransmuterListFilters>(dims, sp, TRANSMUTER_LIST_DEFAULTS);

  const initial = await ssrInitial<TransmuterListFilters, AlchemixTransmuterPositionSummary>({
    dims,
    defaults: TRANSMUTER_LIST_DEFAULTS,
    filters,
    page,
    label: `Alchemix Transmuter (chain ${deployment.chainId})`,
    fetchPage: (baseUrl, signal, headers) =>
      fetchAlchemixTransmuterPositions({
        ...transmuterFiltersToFetchParams(deployment, filters, page),
        baseUrl,
        signal,
        headers,
      }).then((r) => ({ data: r.data, total: r.pagination.total })),
  });

  return { ...initial, initialSearch: sp.toString() };
}
