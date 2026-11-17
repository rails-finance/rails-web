// Polaris reserve loans (/sepolia/polaris/reserve-loans) — server half:
// decodes the URL, reads the first page through this deployment's own proxy,
// and hands it to the client half (loan-listing.tsx) as first paint.

import { LoanListing } from "./loan-listing";
import { fetchLoanPage, LOAN_LIST_DEFAULTS, loanListDimensions } from "@/lib/polaris/sp-loan-listing";
import { POLARIS_LOANS_PATH } from "@/lib/polaris/routes";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Polaris reserve loans",
  canonicalPath: POLARIS_LOANS_PATH,
  description:
    "Every Polaris reserve loan on the Sepolia testnet: WETH borrowed from the reserve against fpETH, with its collateral, debt and cost. Test tokens only.",
});

export default async function PolarisLoanListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = loanListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, LOAN_LIST_DEFAULTS);
  const initial = await ssrInitial({
    dims,
    defaults: LOAN_LIST_DEFAULTS,
    filters,
    page,
    label: "Polaris loans",
    fetchPage: (baseUrl, signal, headers) => fetchLoanPage(filters, page, { baseUrl, signal, headers }),
  });
  return <LoanListing {...initial} initialSearch={sp.toString()} />;
}
