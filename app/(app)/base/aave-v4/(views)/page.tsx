// Aave V4 Base listing — server half. The first page of (spoke, wallet) rows
// read on the server from the box's /api/aave-v4-base/spoke-positions (bearer
// auth), handed to the client half as first paint. Same shape as the Ethereum
// listing's page.tsx.

import { AaveV4BaseListing } from "./aave-v4-base-listing";
import { fetchAaveV4SpokePositionsServer } from "@/lib/api/fetch-aave-v4-spoke-positions-server";
import type { AaveV4SpokePositionRow } from "@/lib/api/fetch-aave-v4-spoke-positions";
import {
  aaveV4BaseListDimensions,
  aaveV4BaseFiltersToFetchParams,
  AAVE_V4_BASE_LIST_DEFAULTS,
} from "@/lib/aave-v4-base/list-filter-dimensions";
import { listKey } from "@/lib/shared/list-filter";
import { toURLSearchParams, ssrDecode, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Aave V4 Positions on Base",
  canonicalPath: "/base/aave-v4",
  description:
    "Aave V4 on Base: every account on the Equities hub's Mag7 spoke, where seven Coinbase tokenized stocks back USDC loans, read from the spoke's own contracts.",
});

export default async function AaveV4BaseListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = aaveV4BaseListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, AAVE_V4_BASE_LIST_DEFAULTS);

  let initialItems: AaveV4SpokePositionRow[] = [];
  let initialTotal = 0;
  let initialKey = "__ssr_unavailable__";
  try {
    const res = await fetchAaveV4SpokePositionsServer(aaveV4BaseFiltersToFetchParams(filters, page));
    initialItems = res.rows;
    initialTotal = res.total;
    initialKey = listKey(dims, filters, AAVE_V4_BASE_LIST_DEFAULTS, page);
  } catch (err) {
    console.error("Aave V4 Base listing SSR fetch failed; client will fetch:", err);
  }

  return (
    <AaveV4BaseListing
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={sp.toString()}
    />
  );
}
