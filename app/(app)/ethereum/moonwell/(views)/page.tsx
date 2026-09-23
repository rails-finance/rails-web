// Moonwell listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/moonwell proxy), and hands it to
// the client half as SSR first-paint data, so the first render carries real
// rows instead of a skeleton + a post-hydration fetch. The client
// (MoonwellListing) owns all interactivity and skips the redundant initial
// fetch when the mount URL matches the SSR'd key.

import { MoonwellListing } from "./moonwell-listing";
import { fetchMoonwellPositions } from "@/lib/api/fetch-moonwell-positions";
import {
  moonwellListDimensions,
  moonwellFiltersToFetchParams,
  MOONWELL_LIST_DEFAULTS,
} from "@/lib/moonwell/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Moonwell Positions", canonicalPath: "/ethereum/moonwell" });

export default async function MoonwellListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = moonwellListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, MOONWELL_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: MOONWELL_LIST_DEFAULTS,
    filters,
    page,
    label: "Moonwell",
    fetchPage: (baseUrl, signal, headers) =>
      fetchMoonwellPositions({ ...moonwellFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.data,
          total: r.pagination.total,
        }),
      ),
  });

  return <MoonwellListing {...initial} initialSearch={sp.toString()} />;
}
