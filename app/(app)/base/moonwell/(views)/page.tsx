// Moonwell Base listing — server half. Decodes the URL, fetches the first page
// slice and the facet roster server-side (via this deployment's own
// /api/moonwell-base proxies), and hands both to the client half as SSR
// first-paint data, coverage included.

import { MoonwellBaseListing } from "./moonwell-base-listing";
import { fetchMoonwellPositions } from "@/lib/api/fetch-moonwell-positions";
import {
  fetchMoonwellBaseMarkets,
  MOONWELL_BASE_ROSTER_UNAVAILABLE,
  type MoonwellBaseRosterState,
} from "@/lib/api/fetch-moonwell-base-markets";
import {
  moonwellBaseListDimensions,
  moonwellBaseFiltersToFetchParams,
  MOONWELL_BASE_LIST_DEFAULTS,
} from "@/lib/moonwell-base/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, ssrHop, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Moonwell Positions on Base",
  canonicalPath: "/base/moonwell",
});

/** The facet roster for this request, or "unavailable" — it never rejects and
 *  never blocks the render. Unlike Morpho's, this listing does not gate its
 *  first paint on the roster: a Moonwell Base chip already carries the mToken
 *  address the backend filters on, so the page fetch is roster-independent and
 *  a missing roster costs the chips their labels, never the rows their
 *  correctness. It is still fetched here rather than left to the client because
 *  a seeded first paint skips the client's mount fetch — without it an active
 *  chip would read as a raw address until a later fetch landed. */
async function ssrRoster(): Promise<MoonwellBaseRosterState> {
  try {
    const hop = await ssrHop();
    if (!hop) return MOONWELL_BASE_ROSTER_UNAVAILABLE;
    const { markets } = await fetchMoonwellBaseMarkets(hop);
    return { status: "ready", markets };
  } catch {
    return MOONWELL_BASE_ROSTER_UNAVAILABLE;
  }
}

export default async function MoonwellBaseListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  // Options are irrelevant to the codec, so the decode pass needs no roster.
  const dims = moonwellBaseListDimensions(MOONWELL_BASE_LIST_DEFAULTS, undefined);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, MOONWELL_BASE_LIST_DEFAULTS);

  const [initial, roster] = await Promise.all([
    ssrInitial({
      dims,
      defaults: MOONWELL_BASE_LIST_DEFAULTS,
      filters,
      page,
      label: "Moonwell Base",
      fetchPage: (baseUrl, signal, headers) =>
        fetchMoonwellPositions({ ...moonwellBaseFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
          (r) => ({
            data: r.data,
            total: r.pagination.total,
          }),
        ),
    }),
    ssrRoster(),
  ]);

  return <MoonwellBaseListing {...initial} initialSearch={sp.toString()} initialRoster={roster} />;
}
