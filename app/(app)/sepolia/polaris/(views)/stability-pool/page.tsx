// Polaris Stability Pool deposits (/sepolia/polaris/stability-pool) — server
// half: decodes the URL, reads the first page through this deployment's
// proxy, and hands it to the client half (sp-listing.tsx) as first paint.

import { SpListing } from "./sp-listing";
import { DEPOSIT_LIST_DEFAULTS, depositListDimensions, fetchDepositPage } from "@/lib/polaris/sp-loan-listing";
import { POLARIS_SP_PATH } from "@/lib/polaris/routes";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Polaris Stability Pool deposits",
  canonicalPath: POLARIS_SP_PATH,
  description:
    "Every deposit in Polaris's USDp and GOLDp stability pools on the Sepolia testnet: what each has deposited, lost to liquidations and been paid in pETH and yield. Test tokens only.",
});

export default async function PolarisSpListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = depositListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, DEPOSIT_LIST_DEFAULTS);
  const initial = await ssrInitial({
    dims,
    defaults: DEPOSIT_LIST_DEFAULTS,
    filters,
    page,
    label: "Polaris deposits",
    fetchPage: (baseUrl, signal, headers) => fetchDepositPage(filters, page, { baseUrl, signal, headers }),
  });
  return <SpListing {...initial} initialSearch={sp.toString()} />;
}
