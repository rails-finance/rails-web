// Ebisu Trove listing — server half. Fetches the full set server-side (via this
// deployment's own /api/ebisu proxy) and hands it to the client half as SSR
// first-paint data; the client seeds the driver and filters it in memory (Ebisu is a
// small ~91-Trove set across 5 branches, like Maker).

import { EbisuListing } from "./ebisu-listing";
import { fetchEbisuTroves } from "@/lib/api/fetch-ebisu-troves";
import { ebisuListDimensions, EBISU_LIST_DEFAULTS } from "@/lib/ebisu/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Ebisu Troves", canonicalPath: "/ethereum/ebisu" });

export default async function EbisuListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = ebisuListDimensions([]);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, EBISU_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: EBISU_LIST_DEFAULTS,
    filters,
    page,
    label: "Ebisu",
    fetchPage: (baseUrl, signal, headers) =>
      fetchEbisuTroves({ sortBy: "debt", sortOrder: "desc", limit: 500, baseUrl, signal, headers }).then((r) => ({
        data: r.data,
        total: r.data.length,
      })),
  });

  return <EbisuListing {...initial} initialSearch={sp.toString()} />;
}
