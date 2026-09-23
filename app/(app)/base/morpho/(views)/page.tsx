// Morpho Blue Base listing — server half. Decodes the URL, fetches the first
// page slice server-side (via this deployment's own /api/morpho-base proxy),
// and hands it to the client half as SSR first-paint data, coverage included.
//
// Until 2026-08-26 this route was the protocol view with a wallet lookup
// above it, because nothing stood behind the position set; the listing lane
// (rails-ops architecture/base-l2-lane.md §8) now reduces every (market,
// borrower) pair from the singleton's own logs on the Base box, and the
// protocol view moved beside this page at /base/morpho/markets — the same
// split as /ethereum/morpho and /ethereum/morpho/markets.

import { MorphoBaseListing } from "./morpho-base-listing";
import { fetchMorphoPositions } from "@/lib/api/fetch-morpho-positions";
import {
  morphoBaseListDimensions,
  morphoBaseFiltersToFetchParams,
  MORPHO_BASE_LIST_DEFAULTS,
} from "@/lib/morpho-base/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Morpho Blue Positions on Base",
  canonicalPath: "/base/morpho",
});

export default async function MorphoBaseListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  // Codec dims only (decode/ssrInitial), so evaluated with the defaults — same
  // convention as the client driver's cached serverCodecDimsRef.
  const dims = morphoBaseListDimensions(MORPHO_BASE_LIST_DEFAULTS);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, MORPHO_BASE_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: MORPHO_BASE_LIST_DEFAULTS,
    filters,
    page,
    label: "Morpho Blue Base",
    fetchPage: (baseUrl, signal, headers) =>
      fetchMorphoPositions({ ...morphoBaseFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.data,
          total: r.pagination.total,
        }),
      ),
  });

  return <MorphoBaseListing {...initial} initialSearch={sp.toString()} />;
}
