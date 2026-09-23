import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadMorphoPositionTail } from "@/lib/morpho/position-page-data";
import MorphoPositionView from "./position-view";

interface Props {
  params: Promise<{ positionId: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// A Morpho position is keyed (market, user) and the URL carries both in one
// segment: a 32-byte market id, a hyphen, then the account. A pair the singleton
// has never seen is a legitimate empty answer for this page to render; a segment
// that cannot be that pair names nothing.
//
// The market half's `0x` is OPTIONAL, and that is not tidiness: the backend's
// own `positionId` — the string every listing row links to — writes the market
// id bare and the account prefixed
// ("82053fe2…67ce-0xb8f0…a356"). A stricter pattern here would 404 every real
// position on the explorer.
const POSITION_ID = /^(0x)?[a-fA-F0-9]{64}-0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged — the title
// names the user half (the helper truncates the address); the market is not
// named, there being no static marketId → symbol map on the metadata path.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { positionId } = await params;
  const user = positionId.slice(positionId.indexOf("-") + 1);
  return positionMetadata({
    session: "morpho",
    subject: user,
    canonicalPath: `/ethereum/morpho/${positionId}`,
    // This route carries its own opengraph-image.tsx, rendering this
    // position's live card — the static per-explorer PNG stays only its
    // fallback.
    image: "dynamic",
  });
}

export default async function MorphoPositionPage({ params }: Props) {
  const { positionId } = await params;
  if (!POSITION_ID.test(positionId)) notFound();

  const tail = await loadMorphoPositionTail(positionId);

  return (
    <MorphoPositionView
      // Keyed on the pair so a client-side navigation to another position
      // remounts with that position's server tail as its initial state.
      key={positionId}
      positionId={positionId}
      initialPosition={tail.position}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
