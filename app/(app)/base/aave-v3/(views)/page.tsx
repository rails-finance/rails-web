// Aave V3 Base listing — server half. Decodes the URL, fetches the first page
// slice server-side (via this deployment's own /api/aave-v3-base proxy), and
// hands it to the client half as SSR first-paint data, coverage included.

import { AaveV3BaseListing } from "./aave-v3-base-listing";
import { fetchAaveV3Positions } from "@/lib/api/fetch-aave-v3-positions";
import {
  aaveV3BaseListDimensions,
  aaveV3BaseFiltersToFetchParams,
  AAVE_V3_BASE_LIST_DEFAULTS,
} from "@/lib/aave-v3-base/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Aave V3 Positions on Base", canonicalPath: "/base/aave-v3" });

export default async function AaveV3BaseListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = aaveV3BaseListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, AAVE_V3_BASE_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: AAVE_V3_BASE_LIST_DEFAULTS,
    filters,
    page,
    label: "Aave V3 Base",
    fetchPage: (baseUrl, signal, headers) =>
      fetchAaveV3Positions({ ...aaveV3BaseFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.rows,
          total: r.total,
        }),
      ),
  });

  return <AaveV3BaseListing {...initial} initialSearch={sp.toString()} />;
}
