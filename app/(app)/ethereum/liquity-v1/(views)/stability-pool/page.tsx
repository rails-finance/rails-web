// Liquity V1 Stability Pool deposits (/ethereum/liquity-v1/stability-pool) —
// server half: decodes the URL, reads the first page through this
// deployment's proxy, and hands it to the client half (sp-listing.tsx) as
// first paint.

import { SpListing } from "./sp-listing";
import { fetchSpPage, spListDimensions, SP_LIST_DEFAULTS } from "@/lib/liquity-v1/sp-listing";
import { LIQUITY_V1_SP_PATH } from "@/lib/liquity-v1/sp-routes";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Liquity V1 Stability Pool deposits",
  canonicalPath: LIQUITY_V1_SP_PATH,
  description:
    "Every deposit in Liquity V1's Stability Pool: what each has deposited, lost to liquidations and been paid in ETH and LQTY.",
});

export default async function LiquityV1SpListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = spListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, SP_LIST_DEFAULTS);
  const initial = await ssrInitial({
    dims,
    defaults: SP_LIST_DEFAULTS,
    filters,
    page,
    label: "Liquity V1 deposits",
    fetchPage: (baseUrl, signal, headers) => fetchSpPage(filters, page, { baseUrl, signal, headers }),
  });
  return <SpListing {...initial} initialSearch={sp.toString()} />;
}
