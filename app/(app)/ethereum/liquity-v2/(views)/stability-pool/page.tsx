// Liquity V2 Stability Pool deposits (/ethereum/liquity-v2/stability-pool) —
// server half: decodes the URL, reads the first page through this
// deployment's proxy, and hands it to the client half (sp-listing.tsx) as
// first paint. A depositor search opens the wallet page (ui-jobs 738).

import { SpListing } from "./sp-listing";
import { fetchSpPage, spListDimensions, SP_LIST_DEFAULTS } from "@/lib/liquity-v2/sp-listing";
import { LIQUITY_V2_SP_PATH } from "@/lib/liquity-v2/sp-routes";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { redirectWalletSearch } from "@/lib/wallet/wallet-search-redirect";

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
  redirectWalletSearch(sp, "liquity-v2");
  const { filters, page } = ssrDecode(dims, sp, SP_LIST_DEFAULTS);
  const initial = await ssrInitial({
    dims,
    defaults: SP_LIST_DEFAULTS,
    filters,
    page,
    label: "Liquity V2 deposits",
    fetchPage: (baseUrl, signal, headers) => fetchSpPage(filters, page, { baseUrl, signal, headers }),
  });
  return <SpListing {...initial} initialSearch={sp.toString()} />;
}
