import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadFluidPositionTail } from "@/lib/fluid/position-page-data";
import FluidPositionView from "./position-view";

interface Props {
  params: Promise<{ nft: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// A Fluid position is an ERC-721: its id is a decimal integer. An id the vault
// never minted is a legitimate empty answer for this page to render — the token
// could be minted tomorrow — but a string that is not a number names nothing the
// contract could ever answer to.
const NFT_ID = /^\d{1,20}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { nft } = await params;
  // This route carries its own opengraph-image.tsx, rendering this position's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "fluid",
    subject: `#${nft}`,
    canonicalPath: `/ethereum/fluid/${nft}`,
    image: "dynamic",
  });
}

export default async function FluidPositionPage({ params }: Props) {
  const { nft } = await params;
  if (!NFT_ID.test(nft)) notFound();

  const tail = await loadFluidPositionTail(nft);

  return (
    <FluidPositionView
      // Keyed on the id so a client-side navigation to another position
      // remounts with that position's server tail as its initial state.
      key={nft}
      nftId={nft}
      initialPosition={tail.position}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
