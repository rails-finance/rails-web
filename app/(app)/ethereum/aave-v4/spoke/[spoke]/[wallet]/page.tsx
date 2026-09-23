import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { spokeFromSlug } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
import AaveV4SpokeView from "./position-view";

interface Props {
  params: Promise<{ spoke: string; wallet: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// A wallet is not a position id: an address with no position in this spoke is a
// legitimate empty answer for this page to render, not a 404. Only a string that
// cannot be an address is.
//
// The SPOKE segment is not gated: `spokeFromSlug` falls back to URL-decoding the
// raw param so legacy `Spoke%20Name`-shape bookmarks still resolve until the
// 308s catch them, and a spoke this build has not heard of resolves to its own
// name rather than to nothing.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged — the spoke's
// display name ("Main", "Lombard BTC") names the market segment, resolved from
// the static slug↔name map with the raw slug as the fallback.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { spoke, wallet } = await params;
  // This route carries its own opengraph-image.tsx, rendering this account's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "aave-v4",
    subject: wallet,
    market: spokeFromSlug(spoke) ?? spoke,
    canonicalPath: `/ethereum/aave-v4/spoke/${spoke}/${wallet}`,
    image: "dynamic",
  });
}

export default async function AaveV4SpokePage({ params }: Props) {
  const { spoke: rawSpoke, wallet: rawWallet } = await params;
  if (!ADDRESS.test(rawWallet)) notFound();
  const wallet = rawWallet.toLowerCase();
  const spokeName = spokeFromSlug(rawSpoke) ?? decodeURIComponent(rawSpoke);

  const tail = await loadAaveV4SpokeTail(wallet, spokeName);

  return (
    <AaveV4SpokeView
      // Keyed on the pair so a client-side navigation to another spoke or
      // account remounts with that position's server tail as its initial state.
      key={`${rawSpoke}:${wallet}`}
      wallet={wallet}
      spokeName={spokeName}
      spokeSlug={rawSpoke}
      initialPositions={tail.spokePositions}
      initialChain={tail.chain}
      initialEvents={tail.events}
    />
  );
}
