// Dolomite listing — server half. Decodes the URL, fetches the first page
// slice server-side (via this deployment's own /api/dolomite proxy), and
// hands it to the client half as SSR first-paint data. The client
// (DolomiteListing) owns all interactivity and skips the redundant initial
// fetch when the mount URL matches the SSR'd key.
//
// This is the POSITION explorer at /dolomite — the grain is the PAIR
// (owner, accountNumber), the contract's own Account.Info: accounts are
// independently liquidated, so the rows are accounts, never owners, and `q`
// searches by owner ("this owner's accounts", plural on purpose). The
// protocol view (every listed market + the risk ladder at one head block)
// lives beside it at /dolomite/markets.

import { DolomiteListing } from "./dolomite-listing";
import { fetchDolomitePositions } from "@/lib/api/fetch-dolomite-positions";
import {
  dolomiteListDimensions,
  dolomiteFiltersToFetchParams,
  DOLOMITE_LIST_DEFAULTS,
} from "@/lib/dolomite/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Dolomite Accounts", canonicalPath: "/ethereum/dolomite" });

export default async function DolomiteListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = dolomiteListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, DOLOMITE_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: DOLOMITE_LIST_DEFAULTS,
    filters,
    page,
    label: "Dolomite",
    fetchPage: (baseUrl, signal, headers) =>
      fetchDolomitePositions({ ...dolomiteFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.data,
          total: r.pagination.total,
        }),
      ),
  });

  return <DolomiteListing {...initial} initialSearch={sp.toString()} />;
}
