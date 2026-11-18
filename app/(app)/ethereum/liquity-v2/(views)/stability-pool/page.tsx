// Liquity V2 Stability Pool deposits (/ethereum/liquity-v2/stability-pool) —
// server half: decodes the URL, reads the first page through this
// deployment's proxy, and hands it to the client half (sp-listing.tsx) as
// first paint.

import { SpListing } from "./sp-listing";
import { loadLiquityV2SpDepth } from "@/lib/sources/chain/liquity-v2-sp-depth";
import { fetchSpPage, spListDimensions, SP_LIST_DEFAULTS } from "@/lib/liquity-v2/sp-listing";
import { LIQUITY_V2_SP_PATH } from "@/lib/liquity-v2/sp-routes";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Liquity V2 Stability Pool deposits",
  canonicalPath: LIQUITY_V2_SP_PATH,
  description:
    "Every deposit in Liquity V2's WETH, wstETH and rETH stability pools: what each has deposited, lost to liquidations and been paid in collateral and BOLD yield.",
});

export default async function LiquityV2SpListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = spListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, SP_LIST_DEFAULTS);
  const [initial, depth] = await Promise.all([
    ssrInitial({
      dims,
      defaults: SP_LIST_DEFAULTS,
      filters,
      page,
      label: "Liquity V2 deposits",
      fetchPage: (baseUrl, signal, headers) => fetchSpPage(filters, page, { baseUrl, signal, headers }),
    }),
    // The pools' depth per branch beside the debt it backs (ui-jobs 748).
    loadLiquityV2SpDepth(),
  ]);
  return <SpListing {...initial} depth={depth} initialSearch={sp.toString()} />;
}
