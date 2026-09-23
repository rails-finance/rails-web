// f(x) listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/fx proxy), and hands it to the
// client half as SSR first-paint data, so the first render carries real rows
// instead of a skeleton + a post-hydration fetch. The client (FxListing) owns
// all interactivity and skips the redundant initial fetch when the mount URL
// matches the SSR'd key.

import { FxListing } from "./fx-listing";
import { fetchFxPositions } from "@/lib/api/fetch-fx-positions";
import { fetchFxPoolStats } from "@/lib/api/fetch-fx-stats";
import { fxListDimensions, fxFiltersToFetchParams, FX_LIST_DEFAULTS } from "@/lib/fx/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, ssrHop, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore f(x) Positions", canonicalPath: "/ethereum/fx" });

export default async function FxListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = fxListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, FX_LIST_DEFAULTS);

  // The stats band rides the same SSR pass (fetchFxPoolStats resolves to []
  // on any failure, so it can never block or error the listing).
  const [initial, poolStats] = await Promise.all([
    ssrInitial({
      dims,
      defaults: FX_LIST_DEFAULTS,
      filters,
      page,
      label: "f(x)",
      fetchPage: (baseUrl, signal, headers) =>
        fetchFxPositions({ ...fxFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then((r) => ({
          data: r.data,
          total: r.pagination.total,
        })),
    }),
    ssrHop().then((hop) => (hop ? fetchFxPoolStats(hop) : [])),
  ]);

  return <FxListing {...initial} initialSearch={sp.toString()} poolStats={poolStats} />;
}
