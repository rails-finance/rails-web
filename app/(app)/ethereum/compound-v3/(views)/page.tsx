// Compound V3 listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/compound proxy), and hands it to the
// client half as SSR first-paint data. The client (CompoundListing) owns all
// interactivity and skips the redundant initial fetch when the mount URL matches
// the SSR'd key.

import { CompoundListing } from "./compound-listing";
import { fetchCompoundPositions } from "@/lib/api/fetch-compound-positions";
import {
  compoundListDimensions,
  compoundFiltersToFetchParams,
  COMPOUND_LIST_DEFAULTS,
} from "@/lib/compound/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Compound V3 Positions",
  canonicalPath: "/ethereum/compound-v3",
});

export default async function CompoundListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = compoundListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, COMPOUND_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: COMPOUND_LIST_DEFAULTS,
    filters,
    page,
    label: "Compound",
    fetchPage: (baseUrl, signal, headers) =>
      fetchCompoundPositions({ ...compoundFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.data,
          total: r.pagination.total,
        }),
      ),
  });

  return <CompoundListing {...initial} initialSearch={sp.toString()} />;
}
