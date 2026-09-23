// Fluid listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/fluid proxy), and hands it to
// the client half as SSR first-paint data. The client (FluidListing) owns all
// interactivity and skips the redundant initial fetch when the mount URL
// matches the SSR'd key.

import { FluidListing } from "./fluid-listing";
import { fetchFluidPositions } from "@/lib/api/fetch-fluid-positions";
import {
  fluidListDimensions,
  fluidFiltersToFetchParams,
  FLUID_LIST_DEFAULTS,
} from "@/lib/fluid/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Fluid Positions", canonicalPath: "/ethereum/fluid" });

export default async function FluidListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = fluidListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, FLUID_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: FLUID_LIST_DEFAULTS,
    filters,
    page,
    label: "Fluid",
    fetchPage: (baseUrl, signal, headers) =>
      fetchFluidPositions({ ...fluidFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then((r) => ({
        data: r.data,
        total: r.pagination.total,
      })),
  });

  return <FluidListing {...initial} initialSearch={sp.toString()} />;
}
