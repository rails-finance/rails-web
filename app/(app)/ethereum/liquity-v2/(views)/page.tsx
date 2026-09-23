// Liquity V2 Trove listing — server half. Decodes the URL, fetches the first page
// slice server-side (via this deployment's own /api/troves proxy), and hands it to
// the client half as SSR first-paint data, so the first render carries real rows
// instead of a skeleton + a post-hydration fetch. The client (LiquityV2Listing)
// owns all interactivity and skips the redundant initial fetch when the mount URL
// matches the SSR'd key.
//
// Graduated onto the shared ChainTruthListingPage driver (decision 0009): this
// delivers V2's previously-missing SSR first paint, and — by moving off
// next/navigation's useSearchParams onto the driver's useUrlSearchParams — retires
// the hidden-duplicate-subtree hydration risk the old bespoke body carried.

import { LiquityV2Listing } from "./liquity-v2-listing";
import { fetchTroves } from "@/lib/api/fetch-troves";
import {
  liquityV2ListDimensions,
  liquityV2FiltersToFetchParams,
  LIQUITY_V2_LIST_DEFAULTS,
} from "@/lib/liquity-v2/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { holderListingMetadata, listingMetadata } from "@/lib/shared/page-metadata";
import { parseTroveSearch } from "@/lib/liquity-v2/search";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

const LIQUITY_V2_BASE_PATH = "/ethereum/liquity-v2";

// A wallet search makes this page the HOLDER's page, and it is titled and
// unfurled as one: the wallet's own card (rendered by
// /api/share/liquity-v2-wallet, which reads the same rows this page does) and a
// canonical of `?q=<holder>` alone — the one param that names the view. Any
// other search is the directory: a trove id is one position, an ENS that
// resolves to nothing is no holder, and free text is browsing — all of them
// keep the explorer's own title and its static roster card.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const directory = listingMetadata({
    title: "Explore Liquity V2 Troves",
    canonicalPath: LIQUITY_V2_BASE_PATH,
    description:
      "Explore all Liquity V2 Troves across ETH, wstETH, and rETH collateral types. Filter by owner, status, collateral ratio, and more. View detailed transaction timelines for any trove.",
  });
  const { ownerAddress, ownerEns } = parseTroveSearch(toURLSearchParams(await searchParams).get("q") ?? "");
  // An address is lowercased (one wallet, one URL, whatever case it was typed
  // in); an ENS name stays as typed, which is how it resolves.
  const holder = ownerAddress ? ownerAddress.toLowerCase() : ownerEns;
  if (!holder) return directory;
  // A name that resolves to nothing names no holder either — the page will
  // answer an empty set, and a card of an empty set is the directory's card.
  // `resolveEnsAddress` is server-side, cached in process and never throws.
  if (ownerEns && !(await resolveEnsAddress(ownerEns))) return directory;
  const q = encodeURIComponent(holder);
  return holderListingMetadata({
    session: "liquity-v2",
    subject: ownerEns ?? holder,
    canonicalPath: `${LIQUITY_V2_BASE_PATH}?q=${q}`,
    imagePath: `/api/share/liquity-v2-wallet?q=${q}`,
  });
}

export default async function LiquityV2ListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = liquityV2ListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, LIQUITY_V2_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: LIQUITY_V2_LIST_DEFAULTS,
    filters,
    page,
    label: "Liquity V2",
    fetchPage: (baseUrl, signal, headers) =>
      fetchTroves({ ...liquityV2FiltersToFetchParams(filters, page), baseUrl, signal, headers }).then((r) => ({
        data: r.data,
        total: r.pagination.total,
      })),
  });

  return <LiquityV2Listing {...initial} initialSearch={sp.toString()} />;
}
