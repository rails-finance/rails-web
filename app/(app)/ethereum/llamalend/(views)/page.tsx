// LlamaLend listing — server half. Decodes the URL, fetches the first page
// slice server-side (via this deployment's own /api/llamalend proxy), and
// hands it to the client half as SSR first-paint data. The client
// (LlamalendListing) owns all interactivity and skips the redundant initial
// fetch when the mount URL matches the SSR'd key.
//
// This is the POSITION explorer at /llamalend — the grain is the PAIR
// (controller, user): each controller is an isolated market liquidated
// independently, so the rows are positions, never users, and `q` searches by
// user ("this user's positions", plural on purpose). The protocol view
// (every factory-listed market at one head block) lives beside it at
// /llamalend/markets. This file replaced the coming-soon placeholder in
// place, exactly as that placeholder's header said it would; the roster /
// coverage / sessions registry flip belongs to the one go-live commit.

import { LlamalendListing } from "./llamalend-listing";
import { fetchLlamalendPositions } from "@/lib/api/fetch-llamalend-positions";
import {
  llamalendListDimensions,
  llamalendFiltersToFetchParams,
  LLAMALEND_LIST_DEFAULTS,
} from "@/lib/llamalend/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore LlamaLend Positions", canonicalPath: "/ethereum/llamalend" });

export default async function LlamalendListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = llamalendListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, LLAMALEND_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: LLAMALEND_LIST_DEFAULTS,
    filters,
    page,
    label: "LlamaLend",
    fetchPage: (baseUrl, signal, headers) =>
      fetchLlamalendPositions({ ...llamalendFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.data,
          total: r.pagination.total,
        }),
      ),
  });

  return <LlamalendListing {...initial} initialSearch={sp.toString()} />;
}
