// Aave V3 listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/aave-v3 proxy), and hands it to the
// client half as SSR first-paint data. The client (AaveV3Listing) owns all
// interactivity and skips the redundant initial fetch when the mount URL matches
// the SSR'd key.

import { AaveV3Listing } from "./aave-v3-listing";
import { fetchAaveV3Positions } from "@/lib/api/fetch-aave-v3-positions";
import {
  aaveV3ListDimensions,
  aaveV3FiltersToFetchParams,
  AAVE_V3_LIST_DEFAULTS,
} from "@/lib/aave-v3/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Aave V3 Positions", canonicalPath: "/ethereum/aave-v3" });

export default async function AaveV3ListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = aaveV3ListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, AAVE_V3_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: AAVE_V3_LIST_DEFAULTS,
    filters,
    page,
    label: "Aave V3",
    fetchPage: (baseUrl, signal, headers) =>
      fetchAaveV3Positions({ ...aaveV3FiltersToFetchParams(filters, page), baseUrl, signal, headers }).then((r) => ({
        data: r.rows,
        total: r.total,
      })),
  });

  return <AaveV3Listing {...initial} initialSearch={sp.toString()} />;
}
