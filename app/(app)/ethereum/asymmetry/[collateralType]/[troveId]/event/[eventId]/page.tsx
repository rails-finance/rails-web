import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { liquityForkEventHeading, liquityForkEventPageDescription } from "@/lib/liquity-fork/explorer";
import { shortId } from "@/lib/asymmetry/asset-catalog";
import { loadAsymmetryTroveTail } from "@/lib/asymmetry/trove-page-data";
import AsymmetryTrovePage from "../../page";

interface Props {
  params: Promise<{ collateralType: string; troveId: string; eventId: string }>;
  /** The parent trove page reads `?folders=` off this to choose which
   *  timeline read its tail makes, so this segment carries it through. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the parent
// route renders per request, so this segment does too.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadAsymmetryTroveTail` is the same `cache()`-wrapped read the parent page
// and its own opengraph-image already call, so finding the event here costs
// no second backend round trip within one request.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { collateralType, troveId, eventId } = await params;
  const decoded = decodeEventId(eventId);
  // The same test the page decides on, so both reach one `cache()` entry. A
  // grouped answer names only the ungrouped events, so an event inside a
  // folder falls back to the generic metadata.
  const grouped = servedFoldersFromParam((await searchParams).folders);
  const tail = await loadAsymmetryTroveTail(collateralType, troveId, grouped);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "asymmetry",
    subject: shortId(troveId),
    // Matches the page's own `generateMetadata` exactly — the branch symbol
    // alone, not paired with the debt symbol.
    market: collateralType,
    canonicalPath: `/ethereum/asymmetry/${collateralType}/${troveId}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: liquityForkEventHeading(event, "asymmetry"), timestamp: event.timestamp } : null,
    description: event
      ? liquityForkEventPageDescription({
          deployment: "asymmetry",
          collateralType,
          troveId,
          owner: tail.trove?.owner ?? null,
          lastOwner: tail.trove?.lastOwner ?? null,
          ownerEns: tail.trove?.ownerEns ?? null,
          timestamp: event.timestamp,
        })
      : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent trove page's server
// half, same params; its client half (`AsymmetryTroveDetail`) reads `eventId`
// from the route and draws the sub-nav and the event's card in page mode with
// the shared column (`ChainTruthTimeline`'s `eventPage`).
export default async function AsymmetryEventPage({ params, searchParams }: Props) {
  return AsymmetryTrovePage({ params, searchParams });
}
