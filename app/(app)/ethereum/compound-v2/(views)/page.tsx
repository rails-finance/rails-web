// Compound V2 listing — server half. Decodes the URL, fetches the first page
// slice server-side (via this deployment's own /api/compound-v2 proxy), and
// hands it to the client half as SSR first-paint data, so the first render
// carries real rows instead of a skeleton + a post-hydration fetch. The client
// (CompoundV2Listing) owns all interactivity and skips the redundant initial
// fetch when the mount URL matches the SSR'd key.
//
// This is the POSITION explorer at /compound-v2; the protocol view (every
// listed market at one head block) lives beside it at /compound-v2/markets —
// the two answer different questions and neither substitutes for the other.

import { CompoundV2Listing } from "./compound-v2-listing";
import { fetchCompoundV2Positions } from "@/lib/api/fetch-compound-v2-positions";
import {
  compoundV2ListDimensions,
  compoundV2FiltersToFetchParams,
  COMPOUND_V2_LIST_DEFAULTS,
} from "@/lib/compound-v2/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Compound V2 Positions",
  canonicalPath: "/ethereum/compound-v2",
});

export default async function CompoundV2ListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = compoundV2ListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, COMPOUND_V2_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: COMPOUND_V2_LIST_DEFAULTS,
    filters,
    page,
    label: "Compound V2",
    fetchPage: (baseUrl, signal, headers) =>
      fetchCompoundV2Positions({ ...compoundV2FiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.data,
          total: r.pagination.total,
        }),
      ),
  });

  return <CompoundV2Listing {...initial} initialSearch={sp.toString()} />;
}
