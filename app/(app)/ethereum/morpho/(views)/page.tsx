// Morpho Blue L1 listing — server half. Decodes the URL, fetches the first page
// slice server-side (via this deployment's own /api/morpho proxy), and hands it
// to the client half as SSR first-paint data.
//
// It fetches the market roster too, and for the same reason the client does: a
// selection can name markets by label or by token, and only the roster turns
// that into the backend's params. Where the roster is needed and did not arrive,
// this page renders NO first paint at all rather than a first paint drawn from a
// question it could not read — the driver skips its mount fetch when the SSR key
// matches the mount URL, so a wrong-but-keyed first paint would persist. An
// absent first paint costs a skeleton; a wrong one costs the answer.

import { MorphoListing } from "./morpho-listing";
import { fetchMorphoPositions } from "@/lib/api/fetch-morpho-positions";
import { fetchMorphoMarketRoster } from "@/lib/api/fetch-morpho-market-roster";
import {
  morphoListDimensions,
  morphoFiltersToFetchParams,
  morphoSelectionNeedsRoster,
  MORPHO_LIST_DEFAULTS,
  type MorphoRosterState,
} from "@/lib/morpho/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, ssrHop, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore Morpho Blue Positions", canonicalPath: "/ethereum/morpho" });

/** The roster for this request, or "unavailable" — the route 404s until the
 *  backend half is deployed, and the listing is built to work without it. */
async function ssrRoster(): Promise<MorphoRosterState> {
  try {
    const hop = await ssrHop();
    if (!hop) return { status: "unavailable", roster: null };
    return { status: "ready", roster: await fetchMorphoMarketRoster(hop) };
  } catch {
    return { status: "unavailable", roster: null };
  }
}

export default async function MorphoListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = morphoListDimensions(MORPHO_LIST_DEFAULTS, undefined);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, MORPHO_LIST_DEFAULTS);

  const roster = await ssrRoster();
  if (roster.status !== "ready" && morphoSelectionNeedsRoster(filters)) {
    return <MorphoListing initialSearch={sp.toString()} />;
  }

  const initial = await ssrInitial({
    dims,
    defaults: MORPHO_LIST_DEFAULTS,
    filters,
    page,
    label: "Morpho",
    fetchPage: async (baseUrl, signal, headers) => {
      const params = morphoFiltersToFetchParams(filters, page, roster);
      if (!params) return { data: [], total: 0 };
      const r = await fetchMorphoPositions({ ...params, baseUrl, signal, headers });
      return { data: r.data, total: r.pagination.total };
    },
  });

  return <MorphoListing {...initial} initialSearch={sp.toString()} />;
}
