// Seamless listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/seamless proxy), and hands it to
// the client half as SSR first-paint data, coverage included.

import { SeamlessListing } from "./seamless-listing";
import { fetchAaveV3Positions } from "@/lib/api/fetch-aave-v3-positions";
import {
  seamlessListDimensions,
  seamlessFiltersToFetchParams,
  SEAMLESS_LIST_DEFAULTS,
} from "@/lib/seamless/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Seamless Positions on Base",
  canonicalPath: "/base/seamless",
});

export default async function SeamlessListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = seamlessListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, SEAMLESS_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: SEAMLESS_LIST_DEFAULTS,
    filters,
    page,
    label: "Seamless",
    fetchPage: (baseUrl, signal, headers) =>
      fetchAaveV3Positions({ ...seamlessFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then((r) => ({
        data: r.rows,
        total: r.total,
      })),
  });

  return <SeamlessListing {...initial} initialSearch={sp.toString()} />;
}
