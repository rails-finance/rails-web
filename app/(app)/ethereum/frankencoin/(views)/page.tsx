// Frankencoin listing — server half. Decodes the URL, fetches the first page
// slice server-side (via this deployment's own /api/frankencoin proxy), and
// hands it to the client half as SSR first-paint data. The client
// (FrankencoinListing) owns all interactivity and skips the redundant initial
// fetch when the mount URL matches the SSR'd key.
//
// This is the POSITION explorer at /frankencoin — the grain is the POSITION
// CONTRACT (every borrower owns a minimal-proxy clone; the address is the
// identity), and `q` searches by owner ("this owner's positions", plural on
// purpose). Units are native ZCHF / the position's own collateral token —
// Frankencoin is oracle-free and no USD renders anywhere on this explorer.

import { FrankencoinListing } from "./frankencoin-listing";
import { fetchFrankencoinPositions } from "@/lib/api/fetch-frankencoin-positions";
import {
  frankencoinListDimensions,
  frankencoinFiltersToFetchParams,
  FRANKENCOIN_LIST_DEFAULTS,
} from "@/lib/frankencoin/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Frankencoin Positions",
  canonicalPath: "/ethereum/frankencoin",
});

export default async function FrankencoinListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = frankencoinListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, FRANKENCOIN_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: FRANKENCOIN_LIST_DEFAULTS,
    filters,
    page,
    label: "Frankencoin",
    fetchPage: (baseUrl, signal, headers) =>
      fetchFrankencoinPositions({ ...frankencoinFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.data,
          total: r.pagination.total,
        }),
      ),
  });

  return <FrankencoinListing {...initial} initialSearch={sp.toString()} />;
}
