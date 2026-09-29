// Sky Savings listing — server half. Decodes the URL, fetches the first page
// through this deployment's /api/sky-savings proxy, and hands it to the client
// half as first-paint data.

import type { Metadata } from "next";
import { SkySavingsListing } from "./sky-savings-listing";
import { fetchSkyListingPage, SKY_LIST_DEFAULTS, skyListDimensions } from "@/lib/sky-savings/listing";
import { SKY_BASE_PATH } from "@/lib/sky-savings/constants";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = listingMetadata({ title: "Explore Sky Savings", canonicalPath: SKY_BASE_PATH });

export default async function SkySavingsListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = skyListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, SKY_LIST_DEFAULTS);
  const initial = await ssrInitial({
    dims,
    defaults: SKY_LIST_DEFAULTS,
    filters,
    page,
    label: "Sky Savings",
    fetchPage: (baseUrl, signal, headers) => fetchSkyListingPage(filters, page, baseUrl, signal, headers),
  });
  return <SkySavingsListing {...initial} initialSearch={sp.toString()} />;
}
