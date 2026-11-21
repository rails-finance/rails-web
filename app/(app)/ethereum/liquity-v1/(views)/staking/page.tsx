// Liquity V1 LQTY stakes (/ethereum/liquity-v1/staking) — server half: decodes
// the URL, reads the first page through this deployment's proxy, and hands it
// to the client half (staking-listing.tsx) as first paint.

import { StakingListing } from "./staking-listing";
import { fetchStakePage, stListDimensions, ST_LIST_DEFAULTS } from "@/lib/liquity-v1/staking-listing";
import { LIQUITY_V1_STAKING_PATH } from "@/lib/liquity-v1/staking-routes";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Liquity V1 LQTY stakes",
  canonicalPath: LIQUITY_V1_STAKING_PATH,
  description: "Every LQTY stake in Liquity V1: what each has staked and been paid in LUSD and ETH fees.",
});

export default async function LiquityV1StakingListingPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const dims = stListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, ST_LIST_DEFAULTS);
  const initial = await ssrInitial({
    dims,
    defaults: ST_LIST_DEFAULTS,
    filters,
    page,
    label: "Liquity V1 stakes",
    fetchPage: (baseUrl, signal, headers) => fetchStakePage(filters, page, { baseUrl, signal, headers }),
  });
  return <StakingListing {...initial} initialSearch={sp.toString()} />;
}
