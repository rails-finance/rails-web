// Aave V4 landing — server half. Decodes the URL, awaits the first page of
// api-mode spoke positions on the server (direct box call, bearer auth — live
// USD/HF are computed per-request server-side, so this route is force-dynamic and
// never statically cached), and hands it to the client half as SSR first-paint
// data. The client (AaveV4Listing) takes over for filters, sort and pagination; it
// skips the redundant initial fetch when the mount URL matches the SSR'd key.
//
// Graduated onto the shared ChainTruthListingPage driver (decision 0009): the
// bespoke parse/build/listKey (list-query) is replaced by the driver's generic
// codec over the SerializableDimension registry, so the URL/facets/keying live in
// one place. The direct-box SSR fetch (not the /api proxy) is kept — V4's SSR
// needs the bearer auth the proxy adds for the client — but its key is now the
// shared listKey the driver compares against.

import { AaveV4Listing } from "./aave-v4-listing";
import { fetchAaveV4SpokePositionsServer } from "@/lib/api/fetch-aave-v4-spoke-positions-server";
import type { AaveV4SpokePositionRow } from "@/lib/api/fetch-aave-v4-spoke-positions";
import {
  aaveV4ListDimensions,
  aaveV4FiltersToFetchParams,
  AAVE_V4_LIST_DEFAULTS,
} from "@/lib/aave-v4/list-filter-dimensions";
import { listKey } from "@/lib/shared/list-filter";
import { toURLSearchParams, ssrDecode, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Aave V4 Positions",
  canonicalPath: "/ethereum/aave-v4",
  description:
    "Explore Aave V4 wallet activity across all 11 spokes — supply, borrow, liquidations, and collateral toggles per market with full position context.",
});

export default async function AaveV4LandingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  // Codec dims: the param/get/set the URL round-trips through — options-independent,
  // so the defaults + no universe evaluate the same codec the client uses.
  const dims = aaveV4ListDimensions(AAVE_V4_LIST_DEFAULTS, undefined);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, AAVE_V4_LIST_DEFAULTS);

  // Best-effort SSR fetch. On failure, hand the client an empty page + a key that
  // can't match so it falls back to its own client fetch (the page still works,
  // just without the first-paint win for this request).
  let initialItems: AaveV4SpokePositionRow[] = [];
  let initialTotal = 0;
  let initialKey = "__ssr_unavailable__";
  try {
    const res = await fetchAaveV4SpokePositionsServer(aaveV4FiltersToFetchParams(filters, page));
    initialItems = res.rows;
    initialTotal = res.total;
    initialKey = listKey(dims, filters, AAVE_V4_LIST_DEFAULTS, page);
  } catch (err) {
    console.error("Aave V4 listing SSR fetch failed; client will fetch:", err);
  }

  return (
    <AaveV4Listing
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={sp.toString()}
    />
  );
}
