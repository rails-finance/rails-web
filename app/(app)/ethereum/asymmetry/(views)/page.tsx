// Asymmetry Trove listing — server half. Fetches the full set server-side (via this
// deployment's own /api/asymmetry proxy) and hands it to the client half as SSR
// first-paint data; the client seeds the driver and filters it in memory (Asymmetry is a
// small ~287-Trove set across 7 branches, like Maker).

import { AsymmetryListing } from "./asymmetry-listing";
import { fetchAsymmetryTroves } from "@/lib/api/fetch-asymmetry-troves";
import { asymmetryListDimensions, ASYMMETRY_LIST_DEFAULTS } from "@/lib/asymmetry/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Asymmetry Troves", canonicalPath: "/ethereum/asymmetry" });

export default async function AsymmetryListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = asymmetryListDimensions([]);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, ASYMMETRY_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: ASYMMETRY_LIST_DEFAULTS,
    filters,
    page,
    label: "Asymmetry",
    fetchPage: (baseUrl, signal, headers) =>
      fetchAsymmetryTroves({ sortBy: "debt", sortOrder: "desc", limit: 500, baseUrl, signal, headers }).then((r) => ({
        data: r.data,
        total: r.data.length,
      })),
  });

  return <AsymmetryListing {...initial} initialSearch={sp.toString()} />;
}
