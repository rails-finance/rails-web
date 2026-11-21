// Liquity V2 Trove listing — server half. Decodes the URL, fetches the first page
// slice server-side (via this deployment's own /api/troves proxy), and hands it to
// the client half as SSR first-paint data, so the first render carries real rows
// instead of a skeleton + a post-hydration fetch. The client (LiquityV2Listing)
// owns all interactivity and skips the redundant initial fetch when the mount URL
// matches the SSR'd key.
//
// Graduated onto the shared ChainTruthListingPage driver (decision 0009): this
// delivers V2's previously-missing SSR first paint, and — by moving off
// next/navigation's useSearchParams onto the driver's useUrlSearchParams — retires
// the hidden-duplicate-subtree hydration risk the old bespoke body carried.
// A search by a whole address or an ENS name redirects to the wallet page
// before this renders (proxy.ts, ui-jobs 738).

import { LiquityV2Listing } from "./liquity-v2-listing";
import { fetchTroves } from "@/lib/api/fetch-troves";
import {
  liquityV2ListDimensions,
  liquityV2FiltersToFetchParams,
  LIQUITY_V2_LIST_DEFAULTS,
} from "@/lib/liquity-v2/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

const LIQUITY_V2_BASE_PATH = "/ethereum/liquity-v2";

export const metadata = listingMetadata({
  title: "Explore Liquity V2 Troves",
  canonicalPath: LIQUITY_V2_BASE_PATH,
  description: "Every Liquity V2 Trove on Ethereum, with its collateral, debt, interest rate and full history.",
});

async function LiquityV2ListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = liquityV2ListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, LIQUITY_V2_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: LIQUITY_V2_LIST_DEFAULTS,
    filters,
    page,
    label: "Liquity V2",
    fetchPage: (baseUrl, signal, headers) =>
      fetchTroves({ ...liquityV2FiltersToFetchParams(filters, page), baseUrl, signal, headers }).then((r) => ({
        data: r.data,
        total: r.pagination.total,
      })),
  });

  return <LiquityV2Listing {...initial} initialSearch={sp.toString()} />;
}

export default LiquityV2ListingPage;
