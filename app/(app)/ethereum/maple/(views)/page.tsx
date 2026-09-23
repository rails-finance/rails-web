// Maple listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/maple proxy), and hands it to
// the client half as SSR first-paint data, so the first render carries real
// rows instead of a skeleton + a post-hydration fetch. The client
// (MapleListing) owns all interactivity and skips the redundant initial fetch
// when the mount URL matches the SSR'd key.
//
// The access band's pool state rides the SAME positions response (the proxy
// resolves the chain read once per request), so no second fetch — it is
// captured out of the fetchPage closure.

import { MapleListing } from "./maple-listing";
import { fetchMaplePositions } from "@/lib/api/fetch-maple-positions";
import {
  mapleListDimensions,
  mapleFiltersToFetchParams,
  MAPLE_LIST_DEFAULTS,
} from "@/lib/maple/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Maple Positions", canonicalPath: "/ethereum/maple" });

export default async function MapleListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = mapleListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, MAPLE_LIST_DEFAULTS);

  let poolState: Record<string, MaplePoolState> = {};
  const initial = await ssrInitial({
    dims,
    defaults: MAPLE_LIST_DEFAULTS,
    filters,
    page,
    label: "Maple",
    fetchPage: (baseUrl, signal, headers) =>
      fetchMaplePositions({ ...mapleFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then((r) => {
        poolState = r.poolState;
        return { data: r.data, total: r.pagination.total };
      }),
  });

  return <MapleListing {...initial} initialSearch={sp.toString()} poolState={poolState} />;
}
