import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { resolveSpokeSegment } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4CardPrices, loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
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
// The SPOKE segment is not gated: a segment that names a known spoke in a legacy
// shape (`Ethena%20Ecosystem`, `global-dollar`) is 308'd to its slug below, and
// a spoke this build has not heard of resolves to its own decoded name rather
// than to nothing.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

const SPOKE_BASE_PATH = "/ethereum/aave-v4/spoke";

/** The segment's display name and the path it canonicalises to. A display-name
 *  segment (the pre-slug URL shape) resolves through the slug map the same way
 *  the page body does, so the title and canonical never carry `%20`. */
function resolveSpoke(rawSpoke: string, wallet: string) {
  const { slug, name } = resolveSpokeSegment(rawSpoke);
  return { slug, name, canonicalPath: `${SPOKE_BASE_PATH}/${slug ?? rawSpoke}/${wallet}` };
}

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged — the spoke's
// display name ("Main", "Lombard BTC") names the market segment, resolved from
// the static slug↔name map with the decoded segment as the fallback.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { spoke, wallet } = await params;
  const { name, canonicalPath } = resolveSpoke(spoke, wallet);
  // This route carries its own opengraph-image.tsx, rendering this account's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "aave-v4",
    subject: wallet,
    market: name,
    canonicalPath,
    image: "dynamic",
  });
}

export default async function AaveV4SpokePage({ params }: Props) {
  const { spoke: rawSpoke, wallet: rawWallet } = await params;
  if (!ADDRESS.test(rawWallet)) notFound();
  const wallet = rawWallet.toLowerCase();
  const { slug, name: spokeName, canonicalPath } = resolveSpoke(rawSpoke, rawWallet);
  // A known spoke reached by a display name or a legacy slug: one URL per spoke.
  // Here rather than in next.config.ts because its matcher is case-insensitive —
  // a `/spoke/Main/:wallet` source would also catch the canonical `main` and loop.
  if (slug && slug !== rawSpoke) permanentRedirect(canonicalPath);
  const spokeSlug = slug ?? rawSpoke;

  // Beside the tail, not behind it: the price map covers every address the
  // card can resolve, so it needs nothing the tail returns.
  const [tail, prices] = await Promise.all([loadAaveV4SpokeTail(wallet, spokeName), loadAaveV4CardPrices()]);

  return (
    <AaveV4SpokeView
      // Keyed on the pair so a client-side navigation to another spoke or
      // account remounts with that position's server tail as its initial state.
      key={`${spokeSlug}:${wallet}`}
      wallet={wallet}
      spokeName={spokeName}
      spokeSlug={spokeSlug}
      initialPositions={tail.spokePositions}
      initialChain={tail.chain}
      initialEvents={tail.events}
      initialPrices={prices}
    />
  );
}
