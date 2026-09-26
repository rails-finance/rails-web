// The server half of the Alchemix listing, shared by both explorers.
//
// Decodes the URL against THIS chain's dimensions and fetches the first page
// server-side, through this deployment's own /api/alchemix proxy so the read
// carries the reader's IP and the box budgets it as the reader.
//
// The decode is chain-scoped on purpose. A `line=` arriving from a link built
// on the other explorer is dropped by the dimension's own `set`, so the SSR
// fetch asks for lines this chain actually has. The alternative — forwarding an
// unknown line key — returns an empty page, which reads as "this wallet holds
// nothing here" rather than as "that line is not on this chain".

import { fetchAlchemixPositions } from "@/lib/api/fetch-alchemix-positions";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import {
  alchemixFiltersToFetchParams,
  alchemixListDimensions,
  ALCHEMIX_LIST_DEFAULTS,
  type AlchemixListFilters,
} from "@/lib/alchemix/list-filter-dimensions";
import { ssrDecode, ssrInitial, toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import type { AlchemixPositionSummary } from "@/types/api/alchemix";

export interface AlchemixListingPageData {
  initialItems?: AlchemixPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch: string;
}

export async function alchemixListingPageData(
  deployment: AlchemixDeployment,
  rawSearchParams: RawSearchParams,
): Promise<AlchemixListingPageData> {
  const dims = alchemixListDimensions(deployment.chainId);
  const sp = toURLSearchParams(rawSearchParams);
  const { filters, page } = ssrDecode<AlchemixListFilters>(dims, sp, ALCHEMIX_LIST_DEFAULTS);

  const initial = await ssrInitial<AlchemixListFilters, AlchemixPositionSummary>({
    dims,
    defaults: ALCHEMIX_LIST_DEFAULTS,
    filters,
    page,
    label: `Alchemix (chain ${deployment.chainId})`,
    fetchPage: (baseUrl, signal, headers) =>
      fetchAlchemixPositions({
        ...alchemixFiltersToFetchParams(deployment, filters, page),
        baseUrl,
        signal,
        headers,
      }).then((r) => ({ data: r.data, total: r.pagination.total })),
  });

  return { ...initial, initialSearch: sp.toString() };
}
