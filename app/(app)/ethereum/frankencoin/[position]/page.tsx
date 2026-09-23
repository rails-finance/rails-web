import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { normalizePositionAddress } from "@/lib/frankencoin/asset-catalog";
import { loadFrankencoinPositionTail } from "@/lib/frankencoin/position-page-data";
import FrankencoinPositionView from "./position-view";

interface Props {
  params: Promise<{ position: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { position } = await params;
  // This route carries its own opengraph-image.tsx, rendering this position's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "frankencoin",
    subject: position,
    canonicalPath: `/ethereum/frankencoin/${position}`,
    image: "dynamic",
  });
}

export default async function FrankencoinPositionPage({ params }: Props) {
  const { position: raw } = await params;
  // A Frankencoin position IS its own contract, so the address is the identity
  // rather than a key into a roster. One the index has not captured is a
  // legitimate empty answer for this page to render; a string that is not an
  // address names no contract at all.
  const position = normalizePositionAddress(raw ?? "");
  if (!position) notFound();

  // The index lane only. The chain lane — the position's own slots at head, and
  // this page's primary truth — stays in the client half; see the loader.
  const tail = await loadFrankencoinPositionTail(position);

  return (
    <FrankencoinPositionView
      // Keyed on the contract so a client-side navigation to another position
      // remounts with that position's server tail as its initial state.
      key={position}
      position={position}
      initialSummary={tail.position}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
