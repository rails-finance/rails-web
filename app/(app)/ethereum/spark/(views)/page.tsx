// SparkLend listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/spark proxy), and hands it to the
// client half as SSR first-paint data, so the first render carries real rows
// instead of a skeleton + a post-hydration fetch. The client (SparkListing) owns
// all interactivity and skips the redundant initial fetch when the mount URL
// matches the SSR'd key.

import { SparkListing } from "./spark-listing";
import { fetchSparkPositions } from "@/lib/api/fetch-spark-positions";
import {
  sparkListDimensions,
  sparkFiltersToFetchParams,
  SPARK_LIST_DEFAULTS,
} from "@/lib/spark/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore SparkLend Positions", canonicalPath: "/ethereum/spark" });

export default async function SparkListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = sparkListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, SPARK_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: SPARK_LIST_DEFAULTS,
    filters,
    page,
    label: "Spark",
    fetchPage: (baseUrl, signal, headers) =>
      fetchSparkPositions({ ...sparkFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then((r) => ({
        data: r.data,
        total: r.pagination.total,
      })),
  });

  return <SparkListing {...initial} initialSearch={sp.toString()} />;
}
