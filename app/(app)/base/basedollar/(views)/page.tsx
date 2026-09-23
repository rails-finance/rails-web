// Basedollar Trove listing — server half. Fetches the full set server-side (via this
// deployment's own /api/basedollar proxy) and hands it to the client half as SSR
// first-paint data; the client seeds the driver and filters it in memory (Basedollar is
// a small set — 16 Troves across 5 branches at onboarding — so the whole roster fits
// one page).

import { BasedollarListing } from "./basedollar-listing";
import { fetchBasedollarTroves } from "@/lib/api/fetch-basedollar-troves";
import { basedollarListDimensions, BASEDOLLAR_LIST_DEFAULTS } from "@/lib/basedollar/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Basedollar Troves on Base",
  canonicalPath: "/base/basedollar",
});

export default async function BasedollarListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = basedollarListDimensions([]);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, BASEDOLLAR_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: BASEDOLLAR_LIST_DEFAULTS,
    filters,
    page,
    label: "Basedollar",
    fetchPage: (baseUrl, signal, headers) =>
      fetchBasedollarTroves({ sortBy: "debt", sortOrder: "desc", limit: 500, baseUrl, signal, headers }).then((r) => ({
        data: r.data,
        total: r.data.length,
      })),
  });

  return <BasedollarListing {...initial} initialSearch={sp.toString()} />;
}
