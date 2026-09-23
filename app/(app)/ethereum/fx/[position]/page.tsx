import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { parseFxPositionSlug } from "@/lib/fx/asset-catalog";
import { loadFxPositionTail } from "@/lib/fx/position-page-data";
import FxPositionView from "./position-view";

interface Props {
  params: Promise<{ position: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged — the subject
// is the `<pool>-<id>` slug (e.g. "wsteth-416") rather than an address, and the
// helper passes non-address subjects through untouched.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { position } = await params;
  // This route carries its own opengraph-image.tsx, rendering this position's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "fx",
    subject: position,
    canonicalPath: `/ethereum/fx/${position}`,
    image: "dynamic",
  });
}

export default async function FxPositionPage({ params }: Props) {
  const { position: slug } = await params;
  // A slug that does not name a pool and an id names nothing the protocol could
  // answer to. The client half used to render a "unrecognized position" line
  // under a 200; it is a 404, and now says so with the status as well as the
  // words.
  const parsed = parseFxPositionSlug(slug ?? "");
  if (!parsed) notFound();

  const tail = await loadFxPositionTail(parsed.pool, parsed.positionId);

  return (
    <FxPositionView
      // Keyed on the slug so a client-side navigation to another position
      // remounts with that position's server tail as its initial state.
      key={slug}
      slug={slug}
      initialPosition={tail.position}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
