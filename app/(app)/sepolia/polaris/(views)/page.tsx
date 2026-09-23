// Polaris listing — server half. Decodes the URL, fetches the first page slice
// server-side (via this deployment's own /api/polaris proxy), and hands it to
// the client half as SSR first-paint data. The client (PolarisListing) owns
// all interactivity and skips the redundant initial fetch when the mount URL
// matches the SSR'd key.
//
// This is the CDP explorer at /sepolia/polaris — the grain is (market, cdpId),
// and `q` names an identity: a holder (address or ENS) or a CDP number. Units
// are native pETH / USDp / GOLDp, and every figure is a Sepolia testnet figure.

import { PolarisListing } from "./polaris-listing";
import { fetchPolarisListingPage } from "@/lib/polaris/listing-fetch";
import { polarisListDimensions, POLARIS_LIST_DEFAULTS } from "@/lib/polaris/list-filter-dimensions";
import { POLARIS_BASE_PATH } from "@/lib/polaris/routes";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { holderListingMetadata, listingMetadata } from "@/lib/shared/page-metadata";
import { parsePolarisSearch } from "@/lib/polaris/search";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

// A wallet search makes this page the HOLDER's page, and it is titled and
// unfurled as one: the wallet's own card (rendered by
// /api/share/polaris-wallet, which reads the same rows this page does) and a
// canonical of `?q=<holder>` alone — the one param that names the view. Any
// other search is the directory: a CDP number is one position, an ENS that
// resolves to nothing is no holder, and free text is browsing — all of them
// keep the explorer's own title and its static roster card.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const directory = listingMetadata({ title: "Explore Polaris CDPs", canonicalPath: POLARIS_BASE_PATH });
  const { ownerAddress, ownerEns } = parsePolarisSearch(toURLSearchParams(await searchParams).get("q") ?? "");
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
    session: "polaris",
    subject: ownerEns ?? holder,
    canonicalPath: `${POLARIS_BASE_PATH}?q=${q}`,
    imagePath: `/api/share/polaris-wallet?q=${q}`,
  });
}

export default async function PolarisListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = polarisListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, POLARIS_LIST_DEFAULTS);

  const initial = await ssrInitial({
    dims,
    defaults: POLARIS_LIST_DEFAULTS,
    filters,
    page,
    label: "Polaris",
    fetchPage: (baseUrl, signal, headers) => fetchPolarisListingPage(filters, page, baseUrl, signal, headers),
  });

  return <PolarisListing {...initial} initialSearch={sp.toString()} />;
}
