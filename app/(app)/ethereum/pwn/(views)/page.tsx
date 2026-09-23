// PWN listing — server half. Fetches the full loan set server-side (via this
// deployment's own /api/pwn proxy) and hands it to the client half as SSR
// first-paint data; the client seeds the driver and filters it in memory.

import { PwnListing } from "./pwn-listing";
import { fetchAllPwnPositions } from "@/lib/api/fetch-pwn-positions";
import { pwnListDimensions, PWN_LIST_DEFAULTS } from "@/lib/pwn/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore PWN Loans", canonicalPath: "/ethereum/pwn" });

export default async function PwnListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = pwnListDimensions([]);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, PWN_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: PWN_LIST_DEFAULTS,
    filters,
    page,
    label: "PWN",
    fetchPage: (baseUrl, signal, headers) =>
      fetchAllPwnPositions({ sortOrder: "desc", baseUrl, signal, headers }).then((data) => ({
        data,
        total: data.length,
      })),
  });

  return <PwnListing {...initial} initialSearch={sp.toString()} />;
}
