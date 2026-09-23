// Compound V3 Base listing — server half. Decodes the URL, fetches the first
// page slice server-side (via this deployment's own /api/compound-base proxy),
// and hands it to the client half as SSR first-paint data, coverage included.

import { CompoundBaseListing } from "./compound-base-listing";
import { fetchCompoundPositions } from "@/lib/api/fetch-compound-positions";
import {
  compoundBaseListDimensions,
  compoundBaseFiltersToFetchParams,
  COMPOUND_BASE_LIST_DEFAULTS,
} from "@/lib/compound-base/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Explore Compound V3 Positions on Base",
  canonicalPath: "/base/compound-v3",
});

export default async function CompoundBaseListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = compoundBaseListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, COMPOUND_BASE_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: COMPOUND_BASE_LIST_DEFAULTS,
    filters,
    page,
    label: "Compound V3 Base",
    fetchPage: (baseUrl, signal, headers) =>
      fetchCompoundPositions({ ...compoundBaseFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => ({
          data: r.data,
          total: r.pagination.total,
        }),
      ),
  });

  return <CompoundBaseListing {...initial} initialSearch={sp.toString()} />;
}
