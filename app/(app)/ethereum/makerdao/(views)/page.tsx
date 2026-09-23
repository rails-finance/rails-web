// MakerDAO listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/makerdao proxy), and hands it to
// the client half as SSR first-paint data.
//
// It fetches the ilk roster too, and for the same reason the client does: a
// search can name a collateral type, and only the roster turns that into the
// backend's `ilks` param. Where the roster is needed and did not arrive, this
// page renders NO first paint at all rather than a first paint drawn from a
// question it could not read — the driver skips its mount fetch when the SSR key
// matches the mount URL, so a wrong-but-keyed first paint would persist. An
// absent first paint costs a skeleton; a wrong one costs the answer.

import { MakerDAOListing } from "./makerdao-listing";
import { fetchMakerIlkRoster } from "@/lib/api/fetch-makerdao-ilk-roster";
import { fetchMakerVaultPage } from "@/lib/makerdao/list-fetch";
import {
  makerListDimensions,
  makerSelectionNeedsRoster,
  MAKER_LIST_DEFAULTS,
  type MakerRosterState,
} from "@/lib/makerdao/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, ssrHop, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({ title: "Explore MakerDAO Vaults", canonicalPath: "/ethereum/makerdao" });

/** The roster for this request, or "unavailable" — the route 404s until the
 *  backend half is deployed, and the listing is built to work without it. */
async function ssrRoster(): Promise<MakerRosterState> {
  try {
    const hop = await ssrHop();
    if (!hop) return { status: "unavailable", roster: null };
    return { status: "ready", roster: await fetchMakerIlkRoster(hop) };
  } catch {
    return { status: "unavailable", roster: null };
  }
}

export default async function MakerDAOListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = makerListDimensions(MAKER_LIST_DEFAULTS, undefined);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, MAKER_LIST_DEFAULTS);

  const roster = await ssrRoster();
  if (roster.status !== "ready" && makerSelectionNeedsRoster(filters)) {
    return <MakerDAOListing initialSearch={sp.toString()} />;
  }

  const initial = await ssrInitial({
    dims,
    defaults: MAKER_LIST_DEFAULTS,
    filters,
    page,
    label: "MakerDAO",
    fetchPage: (baseUrl, signal, headers) => fetchMakerVaultPage(filters, page, roster, baseUrl, signal, headers),
  });

  return <MakerDAOListing {...initial} initialSearch={sp.toString()} />;
}
