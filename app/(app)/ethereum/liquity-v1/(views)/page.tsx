// Liquity V1 Trove listing — server half. Decodes the URL, fetches the first page
// slice server-side (via this deployment's own /api/liquity-v1 proxy), and hands it
// to the client half as SSR first-paint data, so the first render carries real rows
// instead of a skeleton + a post-hydration fetch. The client (LiquityV1Listing) owns
// all interactivity and skips the redundant initial fetch when the mount URL matches
// the SSR'd key.
//
// Graduated from the old memory-tier (fetch ~10k Troves once, filter client-side):
// mv_liquity_v1_positions now carries a server-side status filter + ever-liquidated /
// ever-redeemed filters + collateral / debt sorts, so V1 pages against the backend
// like Spark / Compound / Aave V3 — no more 10k-row payload, and a real SSR first paint.

import { LiquityV1Listing } from "./liquity-v1-listing";
import { fetchLiquityV1Positions } from "@/lib/api/fetch-liquity-v1-positions";
import {
  liquityV1ListDimensions,
  liquityV1FiltersToFetchParams,
  LIQUITY_V1_LIST_DEFAULTS,
} from "@/lib/liquity-v1/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Liquity V1 Troves", canonicalPath: "/ethereum/liquity-v1" });

export default async function LiquityV1ListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = liquityV1ListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, LIQUITY_V1_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: LIQUITY_V1_LIST_DEFAULTS,
    filters,
    page,
    label: "Liquity V1",
    fetchPage: (baseUrl, signal, headers) =>
      fetchLiquityV1Positions({ ...liquityV1FiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.data,
          total: r.pagination.total,
        }),
      ),
  });

  return <LiquityV1Listing {...initial} initialSearch={sp.toString()} />;
}
